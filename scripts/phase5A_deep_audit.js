const mongoose = require('mongoose');
require('dotenv').config();
const MutualFundScheme = require('../models/MutualFundScheme');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await MutualFundScheme.countDocuments();
  const withGrowthInName = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'growth', $options: 'i' } });
  const withIdcwInName = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'idcw|dividend', $options: 'i' } });
  const withDirectInName = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'direct', $options: 'i' } });
  const withRegularInName = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'regular', $options: 'i' } });

  console.log('--- DEEP IDENTITY AUDIT ---');
  console.log({
    total,
    withGrowthInName,
    withIdcwInName,
    withDirectInName,
    withRegularInName,
  });

  await mongoose.disconnect();
}
test().catch(console.error);
