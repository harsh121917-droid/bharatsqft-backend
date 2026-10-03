require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const { AMC_REGISTRY } = require('../services/amcSourceRegistry');

async function auditIntelligenceCoverage() {
  console.log('='.repeat(95));
  console.log('VIKAONE MUTUAL FUND — AMC INTELLIGENCE & STATUTORY COVERAGE MATRIX');
  console.log('='.repeat(95));
  console.log(`Execution Time: ${new Date().toISOString()}\n`);

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[DB] Connected to MongoDB.\n');

  // Group by AMC
  const amcAgg = await MutualFundScheme.aggregate([
    { $match: { planType: 'REGULAR', schemeName: { $not: { $regex: 'direct', $options: 'i' } } } },
    {
      $group: {
        _id: '$amcCode',
        amcName: { $first: '$amcName' },
        totalSchemes: { $sum: 1 },
        navCount: { $sum: { $cond: [{ $gt: ['$nav', 0] }, 1, 0] } },
        returnCount: { $sum: { $cond: [{ $ne: ['$cagr3Y', null] }, 1, 0] } },
        aumCount: { $sum: { $cond: [{ $gt: ['$aum', 0] }, 1, 0] } },
        terCount: { $sum: { $cond: [{ $gt: ['$expenseRatio', 0] }, 1, 0] } },
        managerCount: { $sum: { $cond: [{ $ne: ['$fundManager', null] }, 1, 0] } },
        benchmarkCount: { $sum: { $cond: [{ $ne: ['$benchmark', null] }, 1, 0] } },
        exitLoadCount: { $sum: { $cond: [{ $ne: ['$exitLoad', null] }, 1, 0] } },
        riskometerCount: { $sum: { $cond: [{ $ne: ['$riskometer', null] }, 1, 0] } },
        minSipCount: { $sum: { $cond: [{ $gt: ['$minSipAmount', 0] }, 1, 0] } },
        holdingsCount: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$holdings', []] } }, 0] }, 1, 0] } },
      },
    },
    { $sort: { totalSchemes: -1 } },
  ]);

  console.log(
    'AMC Code'.padEnd(20) +
    'Total'.padEnd(8) +
    'NAV'.padEnd(8) +
    '3Y Ret'.padEnd(8) +
    'AUM'.padEnd(6) +
    'TER'.padEnd(6) +
    'Mgr'.padEnd(6) +
    'BM'.padEnd(6) +
    'Exit'.padEnd(6) +
    'Risk'.padEnd(6) +
    'SIP'.padEnd(6) +
    'Hold'.padEnd(6)
  );
  console.log('-'.repeat(95));

  for (const a of amcAgg) {
    const code = (a._id || 'UNKNOWN').substring(0, 19);
    console.log(
      code.padEnd(20) +
      String(a.totalSchemes).padEnd(8) +
      String(a.navCount).padEnd(8) +
      String(a.returnCount).padEnd(8) +
      String(a.aumCount).padEnd(6) +
      String(a.terCount).padEnd(6) +
      String(a.managerCount).padEnd(6) +
      String(a.benchmarkCount).padEnd(6) +
      String(a.exitLoadCount).padEnd(6) +
      String(a.riskometerCount).padEnd(6) +
      String(a.minSipCount).padEnd(6) +
      String(a.holdingsCount).padEnd(6)
    );
  }

  console.log('-'.repeat(95));
  console.log(`Total AMCs Represented in DB: ${amcAgg.length}`);
  console.log('='.repeat(95));

  await mongoose.disconnect();
}

if (require.main === module) {
  auditIntelligenceCoverage().catch((err) => {
    console.error('Audit error:', err);
    process.exit(1);
  });
}

module.exports = { auditIntelligenceCoverage };
