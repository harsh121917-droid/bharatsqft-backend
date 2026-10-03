const mongoose = require('mongoose');
const MfOrder = require('../models/MfOrder');
const MfTransaction = require('../models/MfTransaction');
const MfAuditLog = require('../models/MfAuditLog');
const { recalculateUserPortfolio } = require('./mfPortfolioEngine');
const { processRedemptionCapitalGains } = require('./mfCapitalGainsEngine');

/**
 * Record an immutable audit log entry for any financial event.
 */
async function recordAuditLog({
  event,
  entityType,
  entityId,
  user = null,
  previousState = null,
  newState = null,
  source = 'SYSTEM',
  externalReference = null,
  actor = 'SYSTEM',
  reason = '',
  idempotencyKey = null,
}) {
  try {
    return await MfAuditLog.create({
      event,
      entityType,
      entityId: String(entityId),
      user,
      previousState,
      newState,
      source,
      externalReference,
      actor,
      reason,
      idempotencyKey,
    });
  } catch (err) {
    console.error('[recordAuditLog Error]:', err.message);
    return null;
  }
}

/**
 * Idempotently process allotment confirmation from Exchange / RTA.
 * Guarantees that duplicate callbacks do NOT duplicate units, transactions, or portfolio holdings.
 */
async function processAllotmentConfirmation({
  orderId,
  allottedUnits,
  allotmentUnits,
  units,
  allottedNav,
  allotmentNav,
  nav,
  allotmentDate = new Date(),
  rtaReferenceNo = null,
  idempotencyKey = null,
  source = 'EXCHANGE_ALLOTMENT_FEED',
}) {
  const order = mongoose.isValidObjectId(orderId)
    ? await MfOrder.findOne({ $or: [{ _id: orderId }, { orderId: String(orderId) }] })
    : await MfOrder.findOne({ orderId: String(orderId) });
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Idempotency check 1: already allotted
  if (order.allotmentStatus === 'ALLOTTED') {
    console.log(`[Idempotency] Order ${orderId} is already ALLOTTED. Skipping duplicate allotment.`);
    return {
      success: true,
      order,
      alreadyProcessed: true,
      isDuplicate: true,
      message: 'Allotment already processed previously (Idempotent)',
    };
  }

  // Idempotency check 2: check if idempotencyKey was already consumed
  if (idempotencyKey) {
    const existingLog = await MfAuditLog.findOne({ idempotencyKey });
    if (existingLog) {
      console.log(`[Idempotency] Idempotency key ${idempotencyKey} already consumed. Skipping.`);
      return {
        success: true,
        order,
        alreadyProcessed: true,
        isDuplicate: true,
        message: 'Duplicate event discarded via idempotencyKey',
      };
    }
  }

  const prevOrderState = {
    allotmentStatus: order.allotmentStatus,
    allottedUnits: order.allottedUnits,
    allottedNav: order.allottedNav,
    orderStatus: order.orderStatus,
  };

  const rawUnits = allottedUnits !== undefined ? allottedUnits : (allotmentUnits !== undefined ? allotmentUnits : (units !== undefined ? units : order.allottedUnits));
  const rawNav = allottedNav !== undefined ? allottedNav : (allotmentNav !== undefined ? allotmentNav : (nav !== undefined ? nav : (order.allottedNav || order.navAtOrder)));

  const parsedUnits = parseFloat(rawUnits);
  const parsedNav = parseFloat(rawNav);

  if (isNaN(parsedUnits) || parsedUnits <= 0) {
    throw new Error(`Invalid allotted units: ${rawUnits}`);
  }
  if (isNaN(parsedNav) || parsedNav <= 0) {
    throw new Error(`Invalid allotted NAV: ${rawNav}`);
  }

  // 1. Update Order
  order.allotmentStatus = 'ALLOTTED';
  order.orderStatus = 'ALLOTTED';
  order.allottedUnits = parsedUnits;
  order.allottedNav = parsedNav;
  order.units = parsedUnits;
  order.allotmentDate = new Date(allotmentDate);
  if (rtaReferenceNo) order.rtaReferenceNo = rtaReferenceNo;
  await order.save();

  // 2. Create Ledger Transaction (with unique index guard on { order, transactionType })
  let txn = await MfTransaction.findOne({ order: order._id, transactionType: 'PURCHASE' });
  if (!txn) {
    txn = await MfTransaction.create({
      user: order.user,
      order: order._id,
      clientCode: order.clientCode,
      schemeCode: order.schemeCode,
      schemeName: order.schemeName,
      planType: 'REGULAR',
      transactionType: 'PURCHASE',
      transactionDate: order.allotmentDate,
      orderAmount: order.orderAmount,
      units: parsedUnits,
      nav: parsedNav,
      navDate: order.allotmentDate,
      status: 'CONFIRMED',
      externalReference: rtaReferenceNo || order.nseTrxnOrderId,
      fifoRemainingUnits: parsedUnits,
      remarks: `Allotment confirmed: ${parsedUnits} units @ ₹${parsedNav}`,
    });
  }

  // 3. Recalculate Portfolio atomically
  await recalculateUserPortfolio(order.user);

  // 4. Record Audit Log
  await recordAuditLog({
    event: 'ALLOTMENT_CONFIRMED',
    entityType: 'ORDER',
    entityId: order._id,
    user: order.user,
    previousState: prevOrderState,
    newState: {
      allotmentStatus: order.allotmentStatus,
      allottedUnits: order.allottedUnits,
      allottedNav: order.allottedNav,
      orderStatus: order.orderStatus,
    },
    source,
    externalReference: rtaReferenceNo || order.orderId,
    idempotencyKey,
    reason: `Allotment of ${parsedUnits} units confirmed at NAV ${parsedNav}`,
  });

  return {
    success: true,
    order,
    transaction: txn,
    alreadyProcessed: false,
    message: 'Allotment confirmed and portfolio updated successfully',
  };
}

/**
 * Idempotently process redemption settlement from Exchange / AMC.
 */
async function processRedemptionSettlement({
  orderId,
  finalSettledAmount,
  settledAmount,
  allottedNav,
  settlementNav,
  settlementDate = new Date(),
  rtaReferenceNo = null,
  idempotencyKey = null,
  source = 'EXCHANGE_SETTLEMENT_FEED',
}) {
  const order = mongoose.isValidObjectId(orderId)
    ? await MfOrder.findOne({ $or: [{ _id: orderId }, { orderId: String(orderId) }] })
    : await MfOrder.findOne({ orderId: String(orderId) });
  if (!order) {
    throw new Error(`Redemption order ${orderId} not found`);
  }

  // Idempotency check: already settled
  if (order.payoutStatus === 'PROCESSED' || order.orderStatus === 'ALLOTTED') {
    return {
      success: true,
      order,
      alreadyProcessed: true,
      isDuplicate: true,
      message: 'Redemption already settled previously (Idempotent)',
    };
  }

  const prevOrderState = {
    payoutStatus: order.payoutStatus,
    orderStatus: order.orderStatus,
    finalSettledAmount: order.finalSettledAmount,
  };

  const effectiveNav = parseFloat(allottedNav || settlementNav || order.allottedNav || order.navAtOrder || 0);
  const effectiveUnits = Math.abs(order.redemptionUnits || order.units || 0);
  const calculatedAmount = effectiveUnits * (effectiveNav || 0);
  const amountToUse = finalSettledAmount !== undefined ? finalSettledAmount : (settledAmount !== undefined ? settledAmount : (calculatedAmount || order.orderAmount));
  const parsedAmount = parseFloat(amountToUse);
  const parsedNav = parseFloat(effectiveNav);

  // 1. Update Order
  order.payoutStatus = 'PROCESSED';
  order.orderStatus = 'ALLOTTED';
  order.allotmentStatus = 'ALLOTTED';
  order.paymentStatus = 'SUCCESS';
  order.finalSettledAmount = !isNaN(parsedAmount) ? parsedAmount : order.orderAmount;
  if (!isNaN(parsedNav) && parsedNav > 0) order.allottedNav = parsedNav;
  order.settlementDate = new Date(settlementDate);
  if (rtaReferenceNo) order.rtaReferenceNo = rtaReferenceNo;
  await order.save();

  // 2. Create Ledger Transaction
  let txn = await MfTransaction.findOne({ order: order._id, transactionType: 'REDEMPTION' });
  if (!txn) {
    txn = await MfTransaction.create({
      user: order.user,
      order: order._id,
      clientCode: order.clientCode,
      schemeCode: order.schemeCode,
      schemeName: order.schemeName,
      planType: 'REGULAR',
      transactionType: 'REDEMPTION',
      transactionDate: order.settlementDate,
      orderAmount: order.finalSettledAmount,
      units: -Math.abs(order.redemptionUnits || order.units),
      nav: order.allottedNav || order.navAtOrder,
      navDate: order.settlementDate,
      status: 'SETTLED',
      externalReference: rtaReferenceNo || order.nseTrxnOrderId,
      remarks: `Redemption settled: ₹${order.finalSettledAmount} for ${order.redemptionUnits || order.units} units`,
    });
  }

  // 3. Process FIFO realized capital gains
  const gains = await processRedemptionCapitalGains(order);

  // 4. Recalculate Portfolio
  await recalculateUserPortfolio(order.user);

  // 5. Audit Log
  await recordAuditLog({
    event: 'REDEMPTION_SETTLED',
    entityType: 'ORDER',
    entityId: order._id,
    user: order.user,
    previousState: prevOrderState,
    newState: {
      payoutStatus: order.payoutStatus,
      orderStatus: order.orderStatus,
      finalSettledAmount: order.finalSettledAmount,
    },
    source,
    externalReference: rtaReferenceNo || order.orderId,
    idempotencyKey,
    reason: `Settlement of ₹${order.finalSettledAmount} processed`,
  });

  return {
    success: true,
    order,
    transaction: txn,
    capitalGains: gains,
    alreadyProcessed: false,
    message: 'Redemption settled and capital gains computed successfully',
  };
}

module.exports = {
  recordAuditLog,
  processAllotmentConfirmation,
  processRedemptionSettlement,
};
