require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/MutualFundScheme');
const amcSourceRegistry = require('../services/amcSourceRegistry');

async function checkMissingAmcs() {
  await mongoose.connect(process.env.MONGO_URI);

  const filter = {
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  };

  const schemes = await Scheme.find(filter).lean();
  const missingAmcCodes = new Map();

  for (const s of schemes) {
    const amcCode = s.amcCode;
    const amc = amcSourceRegistry.getAmcSources(amcCode);
    if (!amc || amc.totalAum === null || amc.totalAum === undefined) {
      if (!missingAmcCodes.has(amcCode)) {
        missingAmcCodes.set(amcCode, {
          amcCode,
          amcName: s.amcName,
          count: 0,
        });
      }
      missingAmcCodes.get(amcCode).count++;
    }
  }

  console.log(`Total missing/unregistered AMC codes: ${missingAmcCodes.size}`);
  console.log(Array.from(missingAmcCodes.values()));

  await mongoose.disconnect();
}

checkMissingAmcs().catch(console.error);
