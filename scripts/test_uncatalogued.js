const mongoose = require('mongoose');
require('dotenv').config();
const controller = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const intel = require('../services/mfIntelligenceService');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const cataloguedCodes = Object.keys(intel.VERIFIED_FACTSHEET_CATALOG);
  const uncatalogued = await MutualFundScheme.findOne({
    planType: 'REGULAR',
    schemeName: { $not: /direct|idcw|dividend/i },
    schemeCode: { $nin: cataloguedCodes }
  });

  console.log('Uncatalogued Scheme:', uncatalogued.schemeCode, uncatalogued.schemeName);
  const res = mockRes();
  await controller.getSchemeDetail({ params: { code: uncatalogued.schemeCode } }, res);
  const d = res.body?.data;
  console.log('Holdings:', d.portfolio?.holdings);
  console.log('Portfolio status:', d.portfolio?.portfolioStatus);
  console.log('Rating:', d.rating, 'RatingStatus:', d.ratingStatus);
  console.log('Plan:', d.planType, 'Option:', d.option);
  console.log('Min SIP:', d.investmentRules?.minSipAmount);
  console.log('SIP Frequencies:', d.investmentRules?.sipFrequencies);
  await mongoose.disconnect();
}
test().catch(console.error);
