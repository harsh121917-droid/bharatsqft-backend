require('dotenv').config();
const mongoose = require('mongoose');

async function audit() {
  await mongoose.connect(process.env.MONGO_URI);
  const MutualFundScheme = require('../models/MutualFundScheme');
  const MfOrder = require('../models/MfOrder');
  const MfTransaction = require('../models/MfTransaction');
  const MfPortfolioHolding = require('../models/MfPortfolioHolding');
  const MfSip = require('../models/MfSip');
  const MfMandate = require('../models/MfMandate');
  const MfCapitalGain = require('../models/MfCapitalGain');

  const report = {};

  // 1. Direct schemes = 0
  report.directSchemes = await MutualFundScheme.countDocuments({ planType: 'DIRECT' });

  // 2. Unknown schemes = 0
  report.unknownSchemes = await MutualFundScheme.countDocuments({ planType: { $nin: ['REGULAR', 'DIRECT'] } });

  // 3. Direct orders = 0
  report.directOrders = await MfOrder.countDocuments({ planType: 'DIRECT' });

  // 4. Direct SIPs = 0
  report.directSips = await MfSip.countDocuments({ planType: 'DIRECT' });

  // 5. Direct holdings = 0
  report.directHoldings = await MfPortfolioHolding.countDocuments({ planType: 'DIRECT' });

  // 6. Orphan orders = 0
  report.orphanOrders = await MfOrder.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }, { schemeCode: { $exists: false } }],
  });

  // 7. Orphan transactions = 0
  report.orphanTransactions = await MfTransaction.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }, { order: { $exists: false } }, { order: null }],
  });

  // 8. Orphan holdings = 0
  report.orphanHoldings = await MfPortfolioHolding.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }, { schemeCode: { $exists: false } }],
  });

  // 9. Orphan SIPs = 0
  report.orphanSips = await MfSip.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }, { schemeCode: { $exists: false } }],
  });

  // 10. Orphan mandates = 0
  report.orphanMandates = await MfMandate.countDocuments({
    $or: [{ user: { $exists: false } }, { user: null }],
  });

  // 11. Duplicate transactions = 0
  const duplicateTx = await MfTransaction.aggregate([
    { $group: { _id: { order: '$order', transactionType: '$transactionType' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  report.duplicateTransactions = duplicateTx.length;

  // 12. Negative holdings = 0
  report.negativeHoldings = await MfPortfolioHolding.countDocuments({
    $or: [{ totalUnits: { $lt: 0 } }, { units: { $lt: 0 } }],
  });

  // 13. Holdings without confirmed allotment = 0
  const activeHoldings = await MfPortfolioHolding.find({
    $or: [{ totalUnits: { $gt: 0 } }, { units: { $gt: 0 } }],
  }).lean();
  let holdingsWithoutAllotment = 0;
  for (const h of activeHoldings) {
    const allottedOrders = await MfOrder.countDocuments({
      user: h.user,
      schemeCode: h.schemeCode,
      allotmentStatus: 'ALLOTTED',
      allottedUnits: { $gt: 0 },
    });
    if (allottedOrders === 0) holdingsWithoutAllotment++;
  }
  report.holdingsWithoutConfirmedAllotment = holdingsWithoutAllotment;

  // 14. Transactions without valid source lineage = 0
  report.transactionsWithoutValidSourceLineage = await MfTransaction.countDocuments({
    $or: [
      { externalReference: null },
      { externalReference: '' },
      { nav: null },
      { nav: { $lte: 0 } },
      { units: null },
      { units: 0 },
    ],
  });

  // 15. Synthetic financial IDs = 0
  report.syntheticFinancialIds = await MfOrder.countDocuments({
    $or: [
      { orderId: /dummy/i },
      { orderId: /fake/i },
      { orderId: /sample/i },
      { nseTrxnOrderId: /dummy/i },
      { nseTrxnOrderId: /fake/i },
    ],
  });

  // 16. Fake/mock portfolio data = 0
  report.fakeMockPortfolioData = await MfPortfolioHolding.countDocuments({
    $or: [
      { schemeName: /dummy/i },
      { schemeName: /sample/i },
      { schemeName: /demo/i },
    ],
  });

  console.log('DATABASE_AUDIT_REPORT_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('DATABASE_AUDIT_REPORT_END');

  await mongoose.disconnect();
}

audit().catch(console.error);
