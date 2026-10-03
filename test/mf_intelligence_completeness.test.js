require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');

function createMockContext(params = {}, query = {}) {
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

describe('VikaOne Production — Fund Intelligence Completeness Tests', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Section 8 & 22 API Contract: Full structured sub-objects in getSchemeDetail', async () => {
    const ctx = createMockContext({ code: '145139' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);
    const d = resp.payload.data;

    // 1. Identity
    assert.strictEqual(d.schemeCode, '145139');
    assert.strictEqual(d.planType, 'REGULAR');
    assert.strictEqual(d.option, 'GROWTH');
    assert.strictEqual(d.isin, 'INF205K011T7');

    // 2. fundDetails
    assert.ok(d.fundDetails, 'fundDetails sub-object required');
    assert.strictEqual(d.fundDetails.aum, 14475.25);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.84);
    assert.strictEqual(d.fundDetails.benchmark, 'BSE 250 SmallCap TRI');
    assert.strictEqual(d.fundDetails.riskometer, 'Very High');

    // 3. investmentRules
    assert.ok(d.investmentRules, 'investmentRules sub-object required');
    assert.strictEqual(d.investmentRules.minPurchaseAmount, 1000);
    assert.strictEqual(d.investmentRules.minSipAmount, 500);

    // 4. portfolio & holdings
    assert.ok(d.portfolio, 'portfolio sub-object required');
    assert.strictEqual(d.portfolio.portfolioStatus, 'VERIFIED');
    assert.ok(Array.isArray(d.portfolio.holdings) && d.portfolio.holdings.length > 0);

    // 5. fundManagement (multi-manager)
    assert.ok(Array.isArray(d.fundManagement) && d.fundManagement.length >= 2);
    assert.strictEqual(d.fundManagement[0].name, 'Taher Badshah');
    assert.strictEqual(d.fundManagement[1].name, 'Aditya Khemani');

    // 6. dataQuality & dataProvenance
    assert.ok(d.dataQuality);
    assert.strictEqual(d.dataQuality.status, 'VERIFIED');
    assert.ok(d.dataProvenance);

    // 7. rating is strictly null
    assert.strictEqual(d.rating, null);
    assert.strictEqual(d.ratingStatus, 'SOURCE_NOT_AUTHORIZED');
  });

  it('2. Section 11: Fund House fields derive from AMC identity and never duplicate scheme AUM/objective', async () => {
    const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);
    const d = resp.payload.data;

    assert.ok(d.fundHouse, 'fundHouse sub-object required');
    assert.strictEqual(d.fundHouse.name, 'HDFC Mutual Fund');
    assert.strictEqual(d.fundHouse.code, 'HDFC_MF');

    // fundHouse.totalAum must NEVER be equal to individual scheme AUM
    assert.strictEqual(d.fundHouse.totalAum, null);
    assert.notStrictEqual(d.fundHouse.totalAum, d.fundDetails.aum);

    // fundHouse.objective must NEVER be equal to scheme investmentObjective
    assert.strictEqual(d.fundHouse.objective, null);
    assert.notStrictEqual(d.fundHouse.objective, d.fundDetails.investmentObjective);
  });

  it('3. Section 12 & 34: Uncatalogued scheme preserves nulls without synthetic injection', async () => {
    const uncat = await MutualFundScheme.findOne({
      planType: 'REGULAR',
      schemeCode: { $nin: ['130502', '145139', '147944', '113177', '122640', '105628', '100119', '129006'] },
    }).lean();

    assert.ok(uncat, 'Must find an uncatalogued scheme');

    const ctx = createMockContext({ code: uncat.schemeCode });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);
    const d = resp.payload.data;

    assert.strictEqual(d.fundDetails.aum, null, 'Uncatalogued AUM must be null');
    assert.strictEqual(d.fundDetails.expenseRatio, null, 'Uncatalogued TER must be null');
    assert.strictEqual(d.portfolio.holdings, null, 'Uncatalogued holdings must be null');
    assert.strictEqual(d.portfolio.portfolioStatus, 'SOURCE_UNAVAILABLE');
    assert.strictEqual(d.rating, null, 'Uncatalogued rating must be null');
  });

  it('4. Section 1: Customer APIs strictly reject Direct Plans (returns 404)', async () => {
    const ctx = createMockContext({ code: '145140' }); // hypothetical direct code
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 404);
    assert.ok(resp.payload.message.includes('Regular Plan'));
  });
});
