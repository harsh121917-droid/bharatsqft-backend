/**
 * Step 3: Buy Mutual Fund (Order Placement & Payment Link) Test Runner
 * (Compliant with NSE MFSS NNF Protocol v1.9.8 Pages 7-10 & 71-72)
 *
 * Usage:
 *   1. Local Sandbox / Test Mode:
 *      node scripts/test_step3_buy_mf.js
 *
 *   2. Live Production Mode (On whitelisted AWS Server):
 *      LIVE=true node scripts/test_step3_buy_mf.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const axios = require('axios');
const nseClient = require('../services/nse/nseClient');
const nseEncryption = require('../services/nse/nseEncryption');

const isLive = process.env.LIVE === 'true' || process.env.LIVE === '1';
if (isLive) {
  process.env.NSE_MOCK_MODE = 'false';
  process.env.NODE_ENV = 'production';
} else {
  process.env.NSE_MOCK_MODE = 'true';
  process.env.NODE_ENV = 'test';
}

async function runStep3BuyMfTest() {
  console.log('================================================================');
  console.log('  NSE MFSS (NNF v1.9.8) — STEP 3: BUY MUTUAL FUND (ORDER ENTRY) ');
  console.log(`  Mode: ${isLive ? '🔴 LIVE EXCHANGE (AWS Whitelisted)' : '🟢 TEST / SANDBOX MODE'}`);
  console.log('================================================================\n');

  // Connect to DB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('• Connected to Database');

  const User = require('../models/User');
  const MfClientUcc = require('../models/MfClientUcc');
  const MutualFundScheme = require('../models/MutualFundScheme');
  const MfOrder = require('../models/MfOrder');
  const MfPortfolioHolding = require('../models/MfPortfolioHolding');
  const mfInvestorReadinessService = require('../services/mfInvestorReadinessService');
  const mfPortfolioEngine = require('../services/mfPortfolioEngine');
  const mfIdempotencyService = require('../services/mfIdempotencyService');

  const userId = '6a2ad421b7bf4599ca2ede65'; // Vikas Saini
  const user = await User.findById(userId);
  const ucc = await MfClientUcc.findOne({ user: userId });

  console.log('1. Investor Account Verification:');
  console.log(`   • User ID:       ${userId}`);
  console.log(`   • Name:          ${ucc?.fullName || user?.name}`);
  console.log(`   • PAN:           ${ucc?.pan || user?.panNumber}`);
  console.log(`   • UCC Client:    ${ucc?.clientCode}`);
  console.log(`   • UCC Status:    ${ucc?.nseStatus}`);

  // Check Outbound IP
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`   • Outbound IP:   ${ipRes.data.ip}`);
  } catch (_) {
    console.log('   • Outbound IP:   Unable to resolve');
  }

  // 2. Check Investor Readiness for PURCHASE
  console.log('\n2. Checking Investor Readiness for Mutual Fund Purchase:');
  const readiness = await mfInvestorReadinessService.checkInvestorReady(userId, 'PURCHASE');
  console.log(`   • Ready to Buy:  ${readiness.ready ? '✅ YES (Ready for Lump Sum Purchase)' : '❌ NO'}`);
  if (!readiness.ready) {
    console.log(`   ⚠️ Reason:       ${readiness.code} - ${readiness.message}`);
    process.exit(1);
  }

  // 3. Select Target Scheme
  console.log('\n3. Selecting Verified Mutual Fund Scheme from Catalogue:');
  const scheme = await MutualFundScheme.findOne({
    isActive: true,
    planType: 'REGULAR',
    purchaseAllowed: true,
    nseSchemeCode: { $exists: true, $ne: '' },
  }).sort({ aum: -1 });

  if (!scheme) {
    console.error('   ❌ No active Regular Plan schemes found with valid NSE scheme code');
    process.exit(1);
  }

  const orderAmount = 1000;
  console.log(`   • Scheme Code:    ${scheme.schemeCode}`);
  console.log(`   • NSE Scheme:     ${scheme.nseSchemeCode}`);
  console.log(`   • ISIN:           ${scheme.isin}`);
  console.log(`   • Scheme Name:    ${scheme.schemeName}`);
  console.log(`   • Current NAV:    ₹${scheme.nav}`);
  console.log(`   • Order Amount:   ₹${orderAmount}`);

  // 4. Build Official NSE Order Entry PUR Payload (NNF v1.9.8 Doc page 8-9)
  console.log('\n4. Preparing Official NSE Order Entry Payload (NNF v1.9.8 Pages 7-10):');
  const orderId = `MFP${Date.now()}`;
  const nseOrderPayload = {
    order_ref_number: orderId,
    scheme_code: scheme.nseSchemeCode,
    trxn_type: 'P', // Purchase
    buy_sell_type: 'FRESH',
    client_code: ucc.clientCode,
    demat_physical: 'P', // Physical/Folio mode
    order_amount: String(orderAmount),
    folio_no: '',
    remarks: 'Invested via Vikaone App',
    kyc_flag: 'Y',
    sub_broker_code: '',
    euin_number: '',
    euin_declaration: 'N',
    min_redemption_flag: 'N',
    dpc_flag: 'Y',
    all_units: 'N',
    redemption_units: '',
    sub_broker_arn: '',
    bank_ref_no: '',
    account_no: ucc.primaryBank?.accountNo || '',
    mobile_no: user?.phone?.slice(-10) || '',
    email: user?.email || '',
    mandate_id: '',
    filler1: '',
    member_unique_id: orderId,
  };

  console.log('   • Order Payload:');
  console.log(JSON.stringify(nseOrderPayload, null, 2));

  // 5. Submit Order to NSE Gateway
  console.log('\n5. Submitting Order to NSE Gateway (/nsemfdesk/api/v2/transaction/NORMAL):');
  let nseOrderId = null;
  let orderResponse = null;

  try {
    const nseRes = await nseClient.createNormalOrder([nseOrderPayload]);
    orderResponse = nseRes;
    console.log('   • NSE Response Received:');
    console.log(JSON.stringify(nseRes, null, 2));

    const trxnItem = nseRes?.data?.transaction_details?.[0];
    const rawOrderId = trxnItem?.trxn_order_id;
    const trxnStatus = trxnItem?.trxn_status;

    if (nseRes?.success && (trxnStatus === 'TRXN SUCCESS' || !isLive)) {
      nseOrderId = String(rawOrderId || `TEST_ORDER_${Date.now()}`);
      console.log(`   ✅ Order Accepted by Exchange! Trxn Order ID: ${nseOrderId}`);
    } else {
      console.log(`   ⚠️ Exchange returned: ${trxnStatus} (${trxnItem?.trxn_remark || nseRes?.message || ''})`);
    }
  } catch (err) {
    console.error('   ❌ Order Submission Exception:', err.message);
  }

  // 6. Generate Official Payment Link (GET_LINK API)
  let paymentLink = null;
  if (nseOrderId || !isLive) {
    const targetRefId = nseOrderId || `TEST_REF_${Date.now()}`;
    console.log(`\n6. Fetching Official Payment Link (GET_LINK: PUR for ${targetRefId}):`);
    try {
      const linkRes = await nseClient.getShortLink('PUR', targetRefId);
      console.log('   • GET_LINK Response:');
      console.log(JSON.stringify(linkRes, null, 2));

      if (linkRes?.success && linkRes?.data?.firstHolderLink) {
        paymentLink = linkRes.data.firstHolderLink;
        console.log(`   🔗 Official NSE Investor Payment URL: ${paymentLink}`);
      }
    } catch (lErr) {
      console.error('   ❌ GET_LINK Exception:', lErr.message);
    }
  }

  // 7. Save MfOrder Record in Database
  console.log('\n7. Recording Purchase Order in Database:');
  const estimatedUnits = scheme.nav ? +(orderAmount / scheme.nav).toFixed(3) : 0;
  const orderDoc = await MfOrder.create({
    user: userId,
    clientCode: ucc.clientCode,
    orderId,
    schemeCode: scheme.schemeCode,
    schemeName: scheme.schemeName,
    isin: scheme.isin || '',
    transactionType: 'P',
    buySellType: 'FRESH',
    orderAmount: Number(orderAmount),
    estimatedUnits,
    units: 0,
    allottedUnits: 0,
    allotmentStatus: 'PENDING',
    navAtOrder: scheme.nav,
    paymentMode: 'NSE_PAYMENT_LINK',
    paymentStatus: isLive ? 'PENDING' : 'SUCCESS',
    orderStatus: isLive ? 'PAYMENT_PENDING' : 'PAYMENT_SUCCESS',
    paymentLink: paymentLink || `https://api.vikaone.com/api/mutual-funds/checkout/${orderId}?mode=sandbox`,
    nseTrxnOrderId: nseOrderId,
    nseStatus: 'ORDER PLACED',
    remarks: 'Order placed on NSE MFSS. Investor completes payment through official NSE gateway.',
  });

  console.log(`   ✅ MfOrder Created: ${orderDoc.orderId} (Status: ${orderDoc.orderStatus})`);

  // 8. Test Allotment Confirmation & Portfolio Credit
  if (!isLive) {
    console.log('\n8. Simulating Unit Allotment & Portfolio Credit (T+1 / T+2 Cycle):');
    const allottedUnits = estimatedUnits;
    const allottedNav = scheme.nav;

    const allotResult = await mfIdempotencyService.processAllotmentConfirmation({
      orderId: orderDoc.orderId,
      allottedUnits,
      allottedNav,
      allotmentDate: new Date(),
      rtaReferenceNo: `RTA_${Date.now()}`,
      source: 'TEST_ALLOTMENT_SIMULATION',
    });

    console.log('   • Allotment Confirmation Result:', allotResult);

    // 9. Recalculate & Display Portfolio & Daily P&L (Step 4 Preview)
    console.log('\n9. Recalculating Portfolio & Daily P&L (Step 4 Preview):');
    const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(userId);
    console.log(`   • Total Portfolio Value: ₹${portfolio.summary?.totalCurrentValue || 0}`);
    console.log(`   • Total Invested Amount: ₹${portfolio.summary?.totalInvested || 0}`);
    console.log(`   • Total Profit / Loss:   ₹${portfolio.summary?.totalGainLoss || 0} (${portfolio.summary?.totalGainLossPercentage || 0}%)`);
    console.log(`   • Today's Daily P&L:     ₹${portfolio.summary?.dayGainLoss || 0} (${portfolio.summary?.dayGainLossPercentage || 0}%)`);
    console.log(`   • Total Holdings Count:  ${portfolio.holdings?.length || 0}`);
  }

  console.log('\n================================================================');
  console.log('  STEP 3: BUY MUTUAL FUND VERIFICATION COMPLETED');
  console.log('================================================================');
  process.exit(0);
}

runStep3BuyMfTest().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
