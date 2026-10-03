const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const MutualFundScheme = require('../models/MutualFundScheme');
  const MfOrder = require('../models/MfOrder');

  const total = await MutualFundScheme.countDocuments();
  const regular = await MutualFundScheme.countDocuments({ planType: 'REGULAR' });
  const direct = await MutualFundScheme.countDocuments({ planType: 'DIRECT' });
  const unknown = await MutualFundScheme.countDocuments({ planType: { $nin: ['REGULAR', 'DIRECT'] } });
  const nameDirect = await MutualFundScheme.countDocuments({ schemeName: { $regex: 'direct', $options: 'i' } });

  const rating5 = await MutualFundScheme.countDocuments({ rating: 5 });
  const rating48 = await MutualFundScheme.countDocuments({ rating: 4.8 });
  const rating45 = await MutualFundScheme.countDocuments({ rating: 4.5 });
  const aum5000 = await MutualFundScheme.countDocuments({ aum: 5000 });
  const er085 = await MutualFundScheme.countDocuments({ expenseRatio: 0.85 });
  const sip500 = await MutualFundScheme.countDocuments({ minSipAmount: 500 });
  const pur1000 = await MutualFundScheme.countDocuments({ minPurchaseAmount: 1000 });

  // Order collection audit
  const totalOrders = await MfOrder.countDocuments();
  const pendingOrdersWithNonZeroUnits = await MfOrder.countDocuments({
    allotmentStatus: 'PENDING',
    units: { $gt: 0 },
  });
  const syntheticOrderIds = await MfOrder.countDocuments({
    orderId: { $regex: /^(NSE_|XSIP_|MND_)\d{13}/ },
  });

  const auditResult = {
    totalSchemes: total,
    regularCount: regular,
    directCount: direct,
    unknownCount: unknown,
    schemeNamesContainingDirect: nameDirect,
    suspiciousDefaults: {
      rating5,
      rating48,
      rating45,
      aum5000,
      expenseRatio085: er085,
      minSipAmount500: sip500,
      minPurchaseAmount1000: pur1000,
    },
    orders: {
      totalOrders,
      pendingOrdersWithNonZeroUnits,
      syntheticOrderIds,
    },
  };

  console.log(JSON.stringify(auditResult, null, 2));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
