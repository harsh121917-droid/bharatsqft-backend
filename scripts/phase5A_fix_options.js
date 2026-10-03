require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');

async function fixOptions({ dryRun = true } = {}) {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`🔗 Connected to MongoDB. DryRun: ${dryRun}`);

  const beforeGrowth = await MutualFundScheme.countDocuments({ option: 'GROWTH' });
  const beforeIdcw = await MutualFundScheme.countDocuments({ option: 'IDCW' });
  console.log(`Before: GROWTH=${beforeGrowth}, IDCW=${beforeIdcw}`);

  // Find schemes with 'growth' in name and option != 'GROWTH'
  const filter = {
    schemeName: { $regex: 'growth', $options: 'i' },
    option: { $ne: 'GROWTH' },
  };

  const countToFix = await MutualFundScheme.countDocuments(filter);
  console.log(`Found ${countToFix} schemes with Growth in name misclassified as IDCW.`);

  if (!dryRun && countToFix > 0) {
    const updateResult = await MutualFundScheme.updateMany(filter, {
      $set: { option: 'GROWTH' },
    });
    console.log(`Updated ${updateResult.modifiedCount} schemes to option: 'GROWTH'`);
  }

  const afterGrowth = await MutualFundScheme.countDocuments({ option: 'GROWTH' });
  const afterIdcw = await MutualFundScheme.countDocuments({ option: 'IDCW' });
  console.log(`After: GROWTH=${afterGrowth}, IDCW=${afterIdcw}`);

  await mongoose.disconnect();
}

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
fixOptions({ dryRun: isDryRun }).catch(console.error);
