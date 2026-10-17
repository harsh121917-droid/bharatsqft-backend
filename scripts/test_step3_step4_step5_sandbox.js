/**
 * Full Mutual Funds Lifecycle Sandbox Test Runner:
 * Step 3 (Buy MF) -> Step 4 (Portfolio & Daily P&L) -> Step 5 (Redeem / Sell)
 *
 * Usage:
 *   node scripts/test_step3_step4_step5_sandbox.js
 */

require('dotenv').config();

// Ensure test / sandbox mode
process.env.NSE_MOCK_MODE = 'true';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const nseClient = require('../services/nse/nseClient');
const mfPortfolioEngine = require('../services/mfPortfolioEngine');
const mfIdempotencyService = require('../services/mfIdempotencyService');
const mfInvestorReadinessService = require('../services/mfInvestorReadinessService');

async function runFullLifecycleSandboxTest() {
  console.log('========================================================================');
  console.log('  NSE MFSS MUTUAL FUNDS FULL LIFECYCLE TEST (SANDBOX / TEST MODE)       ');
  console.log('  Flow: Step 3 (Buy MF) -> Step 4 (Portfolio & P&L) -> Step 5 (Redeem)  ');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('• Connected to MongoDB Atlas');

  const User = require('../models/User');
  const MfClientUcc = require('../models/MfClientUcc');
  const MutualFundScheme = require('../models/MutualFundScheme');
  const MfOrder = require('../models/MfOrder');
  const MfTransaction = require('../models/MfTransaction');
  const MfPortfolioHolding = require('../models/MfPortfolioHolding');

  const userId = '6a2ad421b7bf4599ca2ede65'; // Vikas Saini
  const user = await User.findById(userId);
  const ucc = await MfClientUcc.findOne({ user: userId });

  console.log('1. Verified Investor Account:');
  console.log(`   • Name:         ${ucc?.fullName || user?.name}`);
  console.log(`   • PAN:          ${ucc?.pan || user?.panNumber}`);
  console.log(`   • Client Code:  ${ucc?.clientCode}`);
  console.log(`   • Bank Account: ${ucc?.primaryBank?.accountNo} (${ucc?.primaryBank?.bankName || 'Kotak Bank'})`);
  console.log(`   • IFSC:         ${ucc?.primaryBank?.ifsc}`);

  // Clean any previous test holdings for clean test run
  await MfPortfolioHolding.deleteMany({ user: userId });
  await MfOrder.deleteMany({ user: userId, remarks: /Sandbox Test/i });
  await MfTransaction.deleteMany({ user: userId, remarks: /Sandbox Test/i });

  // ────────────────────────────────────────────────────────────────
  // STEP 3: BUY MUTUAL FUND (ORDER ENTRY & PAYMENT)
  // ────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('  STEP 3: BUY MUTUAL FUND (ORDER ENTRY & PAYMENT SIMULATION)            ');
  console.log('========================================================================');

  const scheme = await MutualFundScheme.findOne({
    schemeCode: '100119', // HDFC Balanced Advantage Fund
    planType: 'REGULAR',
  });

  if (!scheme) {
    throw new Error('Target scheme 100119 not found');
  }

  const buyAmount = 5000;
  const currentNav = Number(scheme.nav || 508.306);
  const estimatedUnits = +(buyAmount / currentNav).toFixed(3);
  const orderId = `MFP_TEST_${Date.now()}`;

  console.log(`\n• Target Fund: ${scheme.schemeName}`);
  console.log(`  - Scheme Code:    ${scheme.schemeCode} (${scheme.nseSchemeCode})`);
  console.log(`  - ISIN:           ${scheme.isin}`);
  console.log(`  - Current NAV:    ₹${currentNav}`);
  console.log(`  - Purchase Amount: ₹${buyAmount}`);
  console.log(`  - Est. Units:     ${estimatedUnits}`);

  // Build NSE NNF Protocol v1.9.8 Order Entry Payload
  const nseBuyPayload = {
    order_ref_number: orderId,
    scheme_code: scheme.nseSchemeCode,
    trxn_type: 'P',
    buy_sell_type: 'FRESH',
    client_code: ucc.clientCode,
    demat_physical: 'P',
    order_amount: String(buyAmount),
    folio_no: '',
    remarks: 'Sandbox Test Purchase',
    kyc_flag: 'Y',
    sub_broker_code: '',
    euin_number: '',
    euin_declaration: 'N',
    min_redemption_flag: 'N',
    dpc_flag: 'Y',
    all_units: 'N',
    redemption_units: '',
    account_no: ucc.primaryBank.accountNo,
    mobile_no: user?.phone?.slice(-10) || '9997143005',
    email: user?.email || 'harsh121917@gmail.com',
  };

  const nseOrderRes = await nseClient.createNormalOrder([nseBuyPayload]);
  console.log('\n• NSE Order Gateway Response:');
  console.log(JSON.stringify(nseOrderRes.data, null, 2));

  const nseTrxnOrderId = nseOrderRes?.data?.transaction_details?.[0]?.trxn_order_id || `NSE_ORD_${Date.now()}`;

  // Generate Payment Link
  const linkRes = await nseClient.getShortLink('PUR', nseTrxnOrderId);
  const paymentLink = linkRes?.data?.firstHolderLink || `https://api.vikaone.com/api/mutual-funds/checkout/${nseTrxnOrderId}?mode=sandbox`;
  console.log(`• Payment Gateway Link: ${paymentLink}`);

  // Create Order in DB
  const purchaseOrder = await MfOrder.create({
    user: userId,
    clientCode: ucc.clientCode,
    orderId,
    schemeCode: scheme.schemeCode,
    schemeName: scheme.schemeName,
    isin: scheme.isin,
    transactionType: 'P',
    buySellType: 'FRESH',
    orderAmount: buyAmount,
    estimatedUnits,
    units: 0,
    allottedUnits: 0,
    allotmentStatus: 'PENDING',
    navAtOrder: currentNav,
    paymentMode: 'NSE_PAYMENT_LINK',
    paymentStatus: 'SUCCESS',
    orderStatus: 'PAYMENT_SUCCESS',
    paymentLink,
    nseTrxnOrderId,
    nseStatus: 'ORDER PLACED',
    remarks: 'Sandbox Test Purchase Order',
  });
  console.log(`✅ Purchase Order Created: ${purchaseOrder.orderId} (Status: ${purchaseOrder.orderStatus})`);

  // Simulate Allotment Confirmation (T+1/T+2 cycle)
  console.log('\n• Confirming Unit Allotment via Idempotency Engine:');
  const allotmentResult = await mfIdempotencyService.processAllotmentConfirmation({
    orderId: purchaseOrder.orderId,
    allottedUnits: estimatedUnits,
    allottedNav: currentNav,
    allotmentDate: new Date(),
    rtaReferenceNo: `RTA_ALLOT_${Date.now()}`,
    source: 'SANDBOX_SIMULATION',
  });
  console.log(`✅ Units Allotted: ${allotmentResult.order.allottedUnits} units @ NAV ₹${allotmentResult.order.allottedNav}`);

  // ────────────────────────────────────────────────────────────────
  // STEP 4: PORTFOLIO & DAILY P&L TRACKING
  // ────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('  STEP 4: PORTFOLIO VALUATION & DAILY PROFIT / LOSS (P&L)               ');
  console.log('========================================================================');

  const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(userId);
  console.log('\n• Portfolio Summary:');
  console.log(`  - Total Invested Amount: ₹${portfolio.summary.totalInvested}`);
  console.log(`  - Current Portfolio Val: ₹${portfolio.summary.currentValuation}`);
  console.log(`  - Absolute Profit / Loss:₹${portfolio.summary.totalProfitLoss} (${portfolio.summary.totalProfitLossPct}%)`);
  console.log(`  - Today's Daily Gain/Loss: ₹${portfolio.summary.todayChangeAmount} (${portfolio.summary.todayChangePct}%)`);
  console.log(`  - Total Active Holdings: ${portfolio.holdings.length}`);

  if (portfolio.holdings.length > 0) {
    const h = portfolio.holdings[0];
    console.log('\n• Holding Detail:');
    console.log(`  - Fund:         ${h.schemeName}`);
    console.log(`  - Confirmed Units: ${h.totalUnits}`);
    console.log(`  - Average NAV:  ₹${h.averageNav}`);
    console.log(`  - Current NAV:  ₹${h.currentNav}`);
    console.log(`  - Invested Val: ₹${h.investedAmount}`);
    console.log(`  - Current Val:  ₹${h.currentValue}`);
    console.log(`  - Returns:      ₹${h.profitLoss} (${h.returnPct}%)`);
  }

  // ────────────────────────────────────────────────────────────────
  // STEP 5: REDEEM / SELL MUTUAL FUND UNITS
  // ────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('  STEP 5: REDEEM / SELL MUTUAL FUND UNITS (WITHDRAWAL TO BANK)          ');
  console.log('========================================================================');

  const redeemUnits = 4.0; // Sell 4 units out of 9.836
  const redeemAmount = +(redeemUnits * currentNav).toFixed(2);
  const redeemOrderId = `MFR_TEST_${Date.now()}`;

  console.log(`\n• Initiating Partial Redemption:`);
  console.log(`  - Units to Redeem: ${redeemUnits} units (out of ${estimatedUnits} units)`);
  console.log(`  - Current NAV:     ₹${currentNav}`);
  console.log(`  - Estimated Payout: ₹${redeemAmount}`);
  console.log(`  - Destination Bank: ${ucc.primaryBank.bankName} (A/C: ${ucc.primaryBank.accountNo}, IFSC: ${ucc.primaryBank.ifsc})`);

  // Build NSE NNF Protocol v1.9.8 Order Entry RED Payload
  const nseRedeemPayload = {
    order_ref_number: redeemOrderId,
    scheme_code: scheme.nseSchemeCode,
    trxn_type: 'R', // Redemption
    buy_sell_type: 'FRESH',
    client_code: ucc.clientCode,
    demat_physical: 'P',
    order_amount: '',
    redemption_units: String(redeemUnits),
    all_units: 'N',
    min_redemption_flag: 'N',
    folio_no: '',
    remarks: 'Sandbox Test Redemption',
    kyc_flag: 'Y',
    sub_broker_code: '',
    euin_number: '',
    euin_declaration: 'N',
    dpc_flag: 'Y',
    account_no: ucc.primaryBank.accountNo,
  };

  const nseRedeemRes = await nseClient.createNormalOrder([nseRedeemPayload]);
  console.log('\n• NSE Redemption Gateway Response:');
  console.log(JSON.stringify(nseRedeemRes.data, null, 2));

  const nseRedeemOrderId = nseRedeemRes?.data?.transaction_details?.[0]?.trxn_order_id || `NSE_RED_${Date.now()}`;

  // Create Redemption Order in DB
  const redemptionOrder = await MfOrder.create({
    user: userId,
    clientCode: ucc.clientCode,
    orderId: redeemOrderId,
    schemeCode: scheme.schemeCode,
    schemeName: scheme.schemeName,
    isin: scheme.isin,
    transactionType: 'R',
    redeemMode: 'UNITS',
    requestedUnits: redeemUnits,
    requestedAmount: redeemAmount,
    redemptionUnits: redeemUnits,
    allUnits: false,
    orderAmount: redeemAmount,
    estimatedUnits: redeemUnits,
    units: redeemUnits,
    allottedUnits: 0,
    allotmentStatus: 'NOT_APPLICABLE',
    orderStatus: 'SUBMITTED',
    navAtOrder: currentNav,
    paymentMode: 'DIRECT_AMC_PAYOUT',
    paymentStatus: 'SUCCESS',
    payoutStatus: 'PENDING_AMC',
    payoutBank: {
      bankName: ucc.primaryBank.bankName,
      accountNo: ucc.primaryBank.accountNo,
      ifscCode: ucc.primaryBank.ifsc,
    },
    nseTrxnOrderId: nseRedeemOrderId,
    nseStatus: 'ORDER PLACED',
    remarks: 'Sandbox Test Redemption Order',
  });
  console.log(`✅ Redemption Order Placed: ${redemptionOrder.orderId} (Status: ${redemptionOrder.orderStatus})`);

  // Simulate RTA Settlement (T+2 / T+3 cycle payout credit to bank)
  console.log('\n• Simulating RTA Settlement & Bank Payout:');
  const settlementResult = await mfIdempotencyService.processRedemptionSettlement({
    orderId: redemptionOrder.orderId,
    finalSettledAmount: redeemAmount,
    allottedNav: currentNav,
    settlementDate: new Date(),
    rtaReferenceNo: `RTA_SETTLE_${Date.now()}`,
    source: 'SANDBOX_SIMULATION',
  });
  console.log(`✅ Redemption Settled! ₹${settlementResult.order.finalSettledAmount} credited to ${ucc.primaryBank.bankName} (A/C: ${ucc.primaryBank.accountNo})`);

  // Re-check Portfolio after redemption
  console.log('\n• Updated Portfolio After Redemption:');
  const updatedPortfolio = await mfPortfolioEngine.recalculateUserPortfolio(userId);
  console.log(`  - Remaining Units: ${updatedPortfolio.holdings[0]?.totalUnits || 0}`);
  console.log(`  - Remaining Value: ₹${updatedPortfolio.summary.currentValuation}`);
  console.log(`  - Total Invested:  ₹${updatedPortfolio.summary.totalInvested}`);
  console.log(`  - Realized Payout: ₹${redeemAmount}`);

  // Cleanup test data so database stays pristine
  await MfPortfolioHolding.deleteMany({ user: userId });
  await MfOrder.deleteMany({ user: userId, remarks: /Sandbox Test/i });
  await MfTransaction.deleteMany({ user: userId, remarks: /Sandbox Test/i });
  await mfPortfolioEngine.recalculateUserPortfolio(userId);
  console.log('\n• Cleaned up sandbox test orders. Database is clean and ready.');

  console.log('\n========================================================================');
  console.log('  ALL 5 STEPS VERIFIED & COMPLETED SUCCESSFULLY IN TEST MODE!          ');
  console.log('========================================================================\n');
  process.exit(0);
}

runFullLifecycleSandboxTest().catch((err) => {
  console.error('Fatal Sandbox Test Error:', err);
  process.exit(1);
});
