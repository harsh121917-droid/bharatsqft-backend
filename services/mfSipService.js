const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const nseClient = require('./nse/nseClient');

/**
 * Counts genuine confirmed / completed installments for an SIP.
 * Strictly excludes pending/unallotted mandate-scheduled orders.
 */
async function countConfirmedInstallments(sip) {
  const userId = sip.user?._id || sip.user;
  if (!userId || !sip.schemeCode) return 0;

  const count = await MfOrder.countDocuments({
    user: userId,
    schemeCode: sip.schemeCode,
    transactionType: 'P',
    $or: [
      { allotmentStatus: 'ALLOTTED' },
      { allottedUnits: { $gt: 0 } },
      {
        paymentStatus: 'SUCCESS',
        paymentMode: { $nin: ['MANDATE'] },
        orderStatus: { $nin: ['INVALID', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] },
        allotmentStatus: { $ne: 'REJECTED' },
      },
    ],
  });

  return count;
}

/**
 * Resolves upcoming installment date and AutoPay (eNACH) details for an SIP.
 */
async function resolveSipAutoPayDetails(sip, confirmedCount = 0) {
  const installmentAmount = Number(sip.installmentAmount || 0);
  const frequency = String(sip.frequency || 'MONTHLY').toUpperCase();
  const now = new Date();

  let nextDate = null;

  if (confirmedCount === 0) {
    nextDate = sip.startDate ? new Date(sip.startDate) : (sip.nextDueDate ? new Date(sip.nextDueDate) : new Date());
    if (nextDate < now) {
      while (nextDate <= now) {
        if (frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
        else if (frequency === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
        else if (frequency === 'QUARTERLY') nextDate.setMonth(nextDate.getMonth() + 3);
        else nextDate.setMonth(nextDate.getMonth() + 1);
      }
    }
  } else {
    let baseDate = sip.startDate ? new Date(sip.startDate) : (sip.nextDueDate ? new Date(sip.nextDueDate) : new Date());
    nextDate = new Date(baseDate);
    if (frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + (confirmedCount * 7));
    else if (frequency === 'DAILY') nextDate.setDate(nextDate.getDate() + confirmedCount);
    else if (frequency === 'QUARTERLY') nextDate.setMonth(nextDate.getMonth() + (confirmedCount * 3));
    else nextDate.setMonth(nextDate.getMonth() + confirmedCount);

    while (nextDate <= now) {
      if (frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
      else if (frequency === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
      else if (frequency === 'QUARTERLY') nextDate.setMonth(nextDate.getMonth() + 3);
      else nextDate.setMonth(nextDate.getMonth() + 1);
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(nextDate.getDate()).padStart(2, '0');
  const m = monthNames[nextDate.getMonth()];
  const y = nextDate.getFullYear();
  const nextDebitDateFormatted = `${d} ${m} ${y}`;
  const nextDebitDateIso = nextDate.toISOString().split('T')[0];

  const diffMs = nextDate.getTime() - now.getTime();
  const daysUntilNextDebit = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  let mandate = sip.mandateRef;
  if (!mandate && sip.mandateId) {
    mandate = await MfMandate.findOne({ mandateId: sip.mandateId });
  }
  if (!mandate && sip.user) {
    mandate = await MfMandate.findOne({
      user: sip.user?._id || sip.user,
      status: { $in: ['APPROVED', 'ACTIVE'] },
    }).sort({ createdAt: -1 });
  }

  const isMandateApproved = mandate && ['APPROVED', 'ACTIVE', 'REG_SUCCESS'].includes(mandate.status);
  const bankName = mandate?.bankName || 'Registered Bank';
  const rawAcc = String(mandate?.accountNo || '');
  const maskedAcc = rawAcc.length >= 4 ? `•••• ${rawAcc.slice(-4)}` : rawAcc;

  let paymentMethodLabel = 'AutoPay (e-NACH Mandate)';
  let autoPayMessage = '';

  if (isMandateApproved) {
    autoPayMessage = `Next AutoPay of ₹${installmentAmount.toLocaleString('en-IN')} scheduled on ${nextDebitDateFormatted} via ${bankName} (${maskedAcc})`;
  } else if (sip.paymentLink) {
    paymentMethodLabel = 'Online Payment Link';
    autoPayMessage = `Awaiting payment authorization. Complete payment via official NSE payment link.`;
  } else {
    autoPayMessage = `Next debit scheduled on ${nextDebitDateFormatted} via AutoPay (Bank Mandate verification in progress).`;
  }

  return {
    nextDueDate: nextDate,
    nextDebitDate: nextDebitDateIso,
    nextDebitDateFormatted,
    daysUntilNextDebit,
    nextInstallmentNumber: confirmedCount + 1,
    nextInstallmentAmount: installmentAmount,
    paymentMethod: isMandateApproved ? 'AUTOPAY' : (sip.paymentLink ? 'PAYMENT_LINK' : 'MANDATE'),
    paymentMethodLabel,
    autoPayBank: bankName,
    autoPayAccountNo: rawAcc,
    autoPayAccountMasked: maskedAcc,
    autoPayStatus: isMandateApproved ? 'APPROVED' : (mandate?.status || 'PENDING'),
    isAutoPayActive: Boolean(isMandateApproved),
    autoPayMessage,
    mandateDetails: mandate ? {
      mandateId: mandate.mandateId,
      umrn: mandate.umrn || '',
      bankName: mandate.bankName || '',
      accountNo: maskedAcc,
      status: mandate.status,
      limit: mandate.amount || 50000,
    } : null,
  };
}

/**
 * Enriches an SIP document for API responses.
 * Sets installmentsPaid and totalAmountPaid dynamically and injects Next AutoPay info.
 */
async function enrichSipObject(sipDoc) {
  if (!sipDoc) return null;
  const raw = sipDoc.toObject ? sipDoc.toObject() : { ...sipDoc };
  const confirmedCount = await countConfirmedInstallments(raw);

  raw.installmentsPaid = confirmedCount;
  raw.totalAmountPaid = confirmedCount * Number(raw.installmentAmount || 0);

  const autoPayDetails = await resolveSipAutoPayDetails(raw, confirmedCount);
  return {
    ...raw,
    ...autoPayDetails,
  };
}

/**
 * Live Sync of SIP with NSE MFSS Exchange Transaction Detail Report.
 */
async function syncSipWithNseExchange(sipDoc) {
  if (!sipDoc) throw new Error('SIP document is required');

  let exchangeConfirmedCount = 0;
  const clientCode = sipDoc.clientCode;
  const sipRegNo = sipDoc.sipRegNo;

  try {
    const txRes = await nseClient.getTransactionDetailReport({
      clientCode,
      orderId: sipRegNo,
      productId: sipRegNo,
      trxnNo: sipRegNo,
    });
    const txList = txRes?.data?.report_data || txRes?.data?.orders || txRes?.data?.transaction_details;
    if (Array.isArray(txList) && txList.length > 0) {
      for (const item of txList) {
        const pType = String(item.product_type || '').toUpperCase();
        const sReg = String(item.sip_registration_no || item.sip_reg_no || item.reg_id || '');
        const sCode = String(item.scheme_code || item.schemecode || '');
        if (pType.includes('SIP') || sReg === String(sipRegNo) || sCode === String(sipDoc.schemeCode)) {
          const oStatus = String(item.order_status || item.validflag || '').toUpperCase();
          const pStatus = String(item.payment_status || '').toUpperCase();
          const remark = String(item.order_remark || '').toUpperCase();
          const units = parseFloat(item.allotted_units || item.allotted_unit || '0') || 0;
          if ((oStatus === 'VALID' && (pStatus === 'APPROVED' || remark.includes('ALLOTMENT'))) || units > 0) {
            exchangeConfirmedCount++;
          }
        }
      }
    }
  } catch (txErr) {
    console.warn(`[syncSipWithNseExchange] NSE Transaction report query warning for ${sipRegNo}:`, txErr.message);
  }

  const localConfirmedCount = await countConfirmedInstallments(sipDoc);
  const confirmedCount = Math.max(exchangeConfirmedCount, localConfirmedCount);

  // Sync document in MongoDB
  sipDoc.installmentsPaid = confirmedCount;
  sipDoc.totalAmountPaid = confirmedCount * Number(sipDoc.installmentAmount || 0);

  const autoPayDetails = await resolveSipAutoPayDetails(sipDoc, confirmedCount);
  sipDoc.nextDueDate = autoPayDetails.nextDueDate;
  await sipDoc.save();

  return {
    success: true,
    message: `SIP synced with NSE MFSS (${confirmedCount} installments verified, Next AutoPay: ${autoPayDetails.nextDebitDateFormatted})`,
    data: {
      ...sipDoc.toObject(),
      ...autoPayDetails,
    },
  };
}

module.exports = {
  countConfirmedInstallments,
  resolveSipAutoPayDetails,
  enrichSipObject,
  syncSipWithNseExchange,
};
