require('dotenv').config();
const mongoose = require('mongoose');

async function remediateData() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is missing in environment');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;

  // 1. Remediate MutualFundScheme collection
  console.log('Cleaning synthetic metrics in mutualfundschemes...');
  const mfResult = await db.collection('mutualfundschemes').updateMany(
    {},
    {
      $set: {
        cagr1Y: null,
        cagr3Y: null,
        cagr5Y: null,
        aum: null,
        rating: null,
        expenseRatio: null,
        fundManager: null,
      },
    }
  );
  console.log(`Updated ${mfResult.modifiedCount} mutual fund scheme documents (set synthetic metrics to null).`);

  // 2. Remediate MfOrder collection
  console.log('Remediating MfOrder unit separation...');
  const orders = await db.collection('mforders').find({ transactionType: 'P' }).toArray();
  let updatedOrders = 0;
  for (const ord of orders) {
    const updates = {};
    if (ord.estimatedUnits === undefined) {
      updates.estimatedUnits = ord.units || null;
    }
    if (ord.allottedUnits === undefined) {
      if (ord.allotmentStatus === 'CONFIRMED' || ord.nseStatus === 'ALLOTTED') {
        updates.allottedUnits = ord.units || 0;
        updates.allotmentStatus = 'CONFIRMED';
      } else {
        updates.allottedUnits = 0;
        updates.units = 0;
        updates.allotmentStatus = 'PENDING';
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.collection('mforders').updateOne({ _id: ord._id }, { $set: updates });
      updatedOrders++;
    }
  }
  console.log(`Remediated ${updatedOrders} mutual fund purchase orders (separated estimatedUnits from allottedUnits).`);

  await mongoose.disconnect();
  console.log('Database remediation completed successfully.');
}

remediateData().catch((err) => {
  console.error('Remediation error:', err);
  process.exit(1);
});
