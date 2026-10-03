require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await MutualFundScheme.countDocuments();
  const regularCount = await MutualFundScheme.countDocuments({ planType: 'REGULAR' });
  const directCount = await MutualFundScheme.countDocuments({ planType: 'DIRECT' });
  const unknownCount = await MutualFundScheme.countDocuments({ planType: 'UNKNOWN' });
  const namesWithDirect = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'direct', $options: 'i' } });

  const withNav = await MutualFundScheme.countDocuments({ nav: { $gt: 0 } });
  const negativeNav = await MutualFundScheme.countDocuments({ nav: { $lt: 0 } });
  const nullNav = await MutualFundScheme.countDocuments({ nav: null });

  const with1Y = await MutualFundScheme.countDocuments({ cagr1Y: { $ne: null } });
  const with3Y = await MutualFundScheme.countDocuments({ cagr3Y: { $ne: null } });
  const with5Y = await MutualFundScheme.countDocuments({ cagr5Y: { $ne: null } });

  const withMinSip = await MutualFundScheme.countDocuments({ minSipAmount: { $ne: null } });
  const withMinPurchase = await MutualFundScheme.countDocuments({ minPurchaseAmount: { $ne: null } });
  const withExpenseRatio = await MutualFundScheme.countDocuments({ expenseRatio: { $ne: null } });
  const withRating = await MutualFundScheme.countDocuments({ rating: { $ne: null } });
  const withAum = await MutualFundScheme.countDocuments({ aum: { $ne: null } });
  const withExitLoad = await MutualFundScheme.countDocuments({ exitLoad: { $ne: null } });
  const withBenchmark = await MutualFundScheme.countDocuments({ $or: [{ benchmark: { $ne: null } }, { benchmarkName: { $ne: null } }] });

  const auditReport = {
    totalSchemes: total,
    regularCount,
    directCount,
    unknownCount,
    namesWithDirect,
    navMetrics: {
      withNav,
      negativeNav,
      nullNav,
    },
    returnMetrics: {
      with1Y,
      with3Y,
      with5Y,
    },
    enrichmentMetrics: {
      withMinSip,
      withMinPurchase,
      withExpenseRatio,
      withRating,
      withAum,
      withExitLoad,
      withBenchmark,
    },
  };

  console.log(JSON.stringify(auditReport, null, 2));
  await mongoose.disconnect();
})();
