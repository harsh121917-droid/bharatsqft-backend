require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/MutualFundScheme');
const amcSourceRegistry = require('../services/amcSourceRegistry');

async function listAllAmcs() {
  await mongoose.connect(process.env.MONGO_URI);

  const filter = {
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  };

  const amcs = await Scheme.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$amcCode',
        amcName: { $first: '$amcName' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  console.log(`Total Unique AMC Codes in Customer Catalogue: ${amcs.length}`);
  console.table(amcs.map(a => {
    const src = amcSourceRegistry.getAmcSources(a._id);
    return {
      amcCode: a._id,
      amcName: a.amcName,
      schemesCount: a.count,
      hasAmcRegistry: !!src,
      totalAum: src ? src.totalAum : null,
      totalAumSource: src ? src.totalAumSource : null,
    };
  }));

  await mongoose.disconnect();
}

listAllAmcs().catch(console.error);
