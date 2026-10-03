const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const MutualFundScheme = require('../models/MutualFundScheme');
  const total = await MutualFundScheme.countDocuments();
  const withIsin = await MutualFundScheme.countDocuments({ isin: { $ne: null } });
  const withAmfi = await MutualFundScheme.countDocuments({ amfiCode: { $ne: null } });
  const sample = await MutualFundScheme.findOne({ planType: 'REGULAR' }).lean();
  console.log('Total schemes:', total);
  console.log('With ISIN:', withIsin);
  console.log('With AMFI Code:', withAmfi);
  console.log('Sample scheme:', {
    schemeCode: sample.schemeCode,
    schemeName: sample.schemeName,
    isin: sample.isin,
    amfiCode: sample.amfiCode,
    nav: sample.nav,
    navDate: sample.navDate,
    planType: sample.planType,
    minPurchaseAmount: sample.minPurchaseAmount,
    minSipAmount: sample.minSipAmount,
    exitLoad: sample.exitLoad,
  });
  await mongoose.disconnect();
}
run().catch(console.error);
