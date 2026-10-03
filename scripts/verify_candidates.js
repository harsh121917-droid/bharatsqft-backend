const mongoose = require('mongoose');
require('dotenv').config();
const MutualFundScheme = require('../models/MutualFundScheme');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const testCodes = [
    '145139', '130502', '147944', '113177', '122640', '105628',
    '100119', '129006', '108466', '112932', '125350', '105989',
    '145208', '100177', '100822', '101762', '107578', '135784',
    '114564', '100033', '113070', '140381'
  ];
  for (const code of testCodes) {
    const s = await MutualFundScheme.findOne({
      $or: [{ schemeCode: code }, { amfiCode: code }]
    }).select('schemeCode amfiCode isin schemeName amcCode planType option subCategory category nav navDate');
    if (s) {
      console.log('FOUND:', code, '|', s.isin, '|', s.planType, '|', s.option, '|', s.schemeName);
    } else {
      console.log('MISSING:', code);
    }
  }
  await mongoose.disconnect();
}
main().catch(console.error);
