const mongoose = require('mongoose');
require('dotenv').config();
const MutualFundScheme = require('../models/MutualFundScheme');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const total = await MutualFundScheme.countDocuments();
  const fmNull = await MutualFundScheme.countDocuments({ fundManager: null });
  const fmReal = await MutualFundScheme.countDocuments({ fundManager: { $nin: [null, ''] } });
  
  const bmNull = await MutualFundScheme.countDocuments({ benchmark: null });
  const bmReal = await MutualFundScheme.countDocuments({ benchmark: { $nin: [null, ''] } });
  
  const elNull = await MutualFundScheme.countDocuments({ exitLoad: null });
  const elReal = await MutualFundScheme.countDocuments({ exitLoad: { $nin: [null, ''] } });

  console.log('--- PHASE 5B AUDIT PROBE WITH $NIN ---');
  console.log({
    total,
    fmNull,
    fmReal,
    bmNull,
    bmReal,
    elNull,
    elReal,
  });

  // Check what scripts/phase5A_db_audit.js actually ran:
  const queryFromPhase5A_fm = { fundManager: { $ne: null, $ne: '' } };
  const countPhase5A_fm = await MutualFundScheme.countDocuments(queryFromPhase5A_fm);
  console.log('count with { fundManager: { $ne: null, $ne: "" } }:', countPhase5A_fm);

  await mongoose.disconnect();
}

check().catch(console.error);
