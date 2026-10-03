const mongoose = require('mongoose');
require('dotenv').config();

const MutualFundScheme = require('../models/MutualFundScheme');

async function audit() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const total = await MutualFundScheme.countDocuments();
  const regular = await MutualFundScheme.countDocuments({ planType: 'REGULAR' });
  const direct = await MutualFundScheme.countDocuments({ planType: 'DIRECT' });
  const unknown = await MutualFundScheme.countDocuments({ planType: { $nin: ['REGULAR', 'DIRECT'] } });

  const nav = await MutualFundScheme.countDocuments({ nav: { $ne: null, $gt: 0 } });
  const navDate = await MutualFundScheme.countDocuments({ navDate: { $ne: null } });

  const ret1M = await MutualFundScheme.countDocuments({ return1M: { $ne: null } });
  const ret3M = await MutualFundScheme.countDocuments({ return3M: { $ne: null } });
  const ret6M = await MutualFundScheme.countDocuments({ return6M: { $ne: null } });
  const cagr1Y = await MutualFundScheme.countDocuments({ cagr1Y: { $ne: null } });
  const cagr3Y = await MutualFundScheme.countDocuments({ cagr3Y: { $ne: null } });
  const cagr5Y = await MutualFundScheme.countDocuments({ cagr5Y: { $ne: null } });

  const aum = await MutualFundScheme.countDocuments({ aum: { $ne: null, $gt: 0 } });
  const minSip = await MutualFundScheme.countDocuments({ minSipAmount: { $ne: null, $gt: 0 } });
  const minPurchase = await MutualFundScheme.countDocuments({ minPurchaseAmount: { $ne: null, $gt: 0 } });
  const expenseRatio = await MutualFundScheme.countDocuments({ expenseRatio: { $ne: null, $gt: 0 } });
  const rating = await MutualFundScheme.countDocuments({ rating: { $ne: null } });
  const fundManager = await MutualFundScheme.countDocuments({ fundManager: { $ne: null, $ne: '' } });
  const benchmark = await MutualFundScheme.countDocuments({ benchmark: { $ne: null, $ne: '' } });
  const exitLoad = await MutualFundScheme.countDocuments({ exitLoad: { $ne: null, $ne: '' } });
  const holdings = await MutualFundScheme.countDocuments({ 'holdings.0': { $exists: true } });
  const sourceLineage = await MutualFundScheme.countDocuments({ navSource: { $ne: null, $ne: '' } });

  console.log('--- PHASE 5A DATABASE AUDIT ---');
  console.log(JSON.stringify({
    totalSchemes: total,
    REGULAR: regular,
    DIRECT: direct,
    UNKNOWN_or_null: unknown,
    navPresent: nav,
    navDatePresent: navDate,
    return1MPresent: ret1M,
    return3MPresent: ret3M,
    return6MPresent: ret6M,
    cagr1YPresent: cagr1Y,
    cagr3YPresent: cagr3Y,
    cagr5YPresent: cagr5Y,
    aumPresent: aum,
    minSipPresent: minSip,
    minPurchasePresent: minPurchase,
    expenseRatioPresent: expenseRatio,
    ratingPresent: rating,
    fundManagerPresent: fundManager,
    benchmarkPresent: benchmark,
    exitLoadPresent: exitLoad,
    holdingsPresent: holdings,
    sourceLineagePresent: sourceLineage,
  }, null, 2));

  // Check some sample schemes
  const sampleSchemes = await MutualFundScheme.find({ planType: 'REGULAR' }).limit(5).lean();
  console.log('\n--- SAMPLE REGULAR SCHEMES ---');
  for (const s of sampleSchemes) {
    console.log({
      schemeCode: s.schemeCode,
      schemeName: s.schemeName,
      amcCode: s.amcCode,
      category: s.category,
      nav: s.nav,
      navDate: s.navDate,
      cagr1Y: s.cagr1Y,
      cagr3Y: s.cagr3Y,
      cagr5Y: s.cagr5Y,
      return1M: s.return1M,
      return3M: s.return3M,
      return6M: s.return6M,
      minPurchaseAmount: s.minPurchaseAmount,
      minSipAmount: s.minSipAmount,
      aum: s.aum,
      expenseRatio: s.expenseRatio,
      rating: s.rating,
      fundManager: s.fundManager,
      historicalNavCount: s.historicalNav?.length || 0,
    });
  }

  const byPlan = await MutualFundScheme.aggregate([{ $group: { _id: '$planType', count: { $sum: 1 } } }]);
  const byOption = await MutualFundScheme.aggregate([{ $group: { _id: '$option', count: { $sum: 1 } } }]);
  const byCategory = await MutualFundScheme.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
  const byAmc = await MutualFundScheme.aggregate([{ $group: { _id: '$amcName', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]);
  const bySource = await MutualFundScheme.aggregate([{ $group: { _id: '$navSource', count: { $sum: 1 } } }]);

  // Check staleness (NAV older than 7 calendar days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const freshNav = await MutualFundScheme.countDocuments({ navDate: { $gte: sevenDaysAgo } });
  const staleNav = await MutualFundScheme.countDocuments({ navDate: { $lt: sevenDaysAgo } });

  console.log('\n--- BREAKDOWNS ---');
  console.log('BY PLAN:', JSON.stringify(byPlan, null, 2));
  console.log('BY OPTION:', JSON.stringify(byOption, null, 2));
  console.log('BY CATEGORY:', JSON.stringify(byCategory, null, 2));
  console.log('TOP 15 AMCS:', JSON.stringify(byAmc, null, 2));
  console.log('BY NAV SOURCE:', JSON.stringify(bySource, null, 2));
  console.log('NAV FRESHNESS (<=7d vs >7d):', { freshNav, staleNav });

  await mongoose.disconnect();
}

audit().catch(console.error);
