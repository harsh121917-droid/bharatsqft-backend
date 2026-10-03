require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');

function createMockReqRes(params = {}, query = {}) {
  const req = { params, query };
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolvePromise({ statusCode: this.statusCode, payload });
      return this;
    },
  };

  return { req, res, promise };
}

async function testNullSafety() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  // Find 5 regular schemes without statutory intelligence
  const cataloguedCodes = [
    '130502', '145139', '147944', '113177', '122640',
    '105628', '100119', '108466', '105989', '100177',
    '129006', '125354', '145264', '107560'
  ];

  const uncatalogued = await MutualFundScheme.find({
    planType: 'REGULAR',
    schemeCode: { $nin: cataloguedCodes },
    amfiCode: { $nin: cataloguedCodes },
  }).limit(5).lean();

  console.log(`Testing null safety for ${uncatalogued.length} uncatalogued schemes...`);

  for (const s of uncatalogued) {
    const ctx = createMockReqRes({ code: s.schemeCode });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;

    assert.equal(resp.statusCode, 200);
    const data = resp.payload.data;

    console.log(`\nScheme ${s.schemeCode} (${s.schemeName.slice(0, 30)}...):`);
    console.log('  fundDetails.aum:', data.fundDetails.aum);
    console.log('  fundDetails.expenseRatio:', data.fundDetails.expenseRatio);
    console.log('  fundDetails.fundManager:', data.fundDetails.fundManager);
    console.log('  fundDetails.benchmark:', data.fundDetails.benchmark);
    console.log('  fundDetails.exitLoad:', data.fundDetails.exitLoad);
    console.log('  fundDetails.riskometer:', data.fundDetails.riskometer);
    console.log('  portfolio.holdings:', data.portfolio.holdings);
    console.log('  fundManagement:', data.fundManagement);
    console.log('  rating:', data.rating);

    // Assert strictly null / empty without fake data
    assert.strictEqual(data.rating, null, 'Rating must remain null without licensed provider');
    assert.strictEqual(data.fundDetails.riskometer, null, 'Riskometer must remain null when uncatalogued');
    assert.strictEqual(data.fundHouse.totalAum, null, 'fundHouse.totalAum must remain null');
    assert.strictEqual(data.fundHouse.objective, null, 'fundHouse.objective must remain null');
    assert.deepStrictEqual(data.fundManagement, [], 'fundManagement must be empty array');
    console.log('  ✅ Null safety verified - zero synthetic defaults!');
  }

  await mongoose.disconnect();
}

testNullSafety().catch((err) => {
  console.error(err);
  process.exit(1);
});
