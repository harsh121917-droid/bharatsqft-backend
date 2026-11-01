const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const tigzigHoldingsService = require('../services/tigzigHoldingsService');
const mfPortfolioService = require('../services/mfPortfolioService');
const mutualFundsController = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');

function createMockContext(params = {}, query = {}) {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  const req = { params, query };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { resolve({ statusCode: this.statusCode, data }); },
  };
  return { req, res, promise };
}

describe('TigZig Mutual Fund Portfolio Holdings Integration Tests', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('1. TigZig dataset parses and indexes flagship equity schemes', async () => {
    const cache = await tigzigHoldingsService.loadParsedHoldings();
    assert.ok(cache.size >= 24, `Expected at least 24 funds, got ${cache.size}`);
    assert.ok(cache.has('HDFCFLEXICAP'), 'Expected HDFCFLEXICAP in TigZig cache');
    assert.ok(cache.has('SBICONTRA'), 'Expected SBICONTRA in TigZig cache');
    assert.ok(cache.has('PPFASFLEXICAP'), 'Expected PPFASFLEXICAP in TigZig cache');
  });

  test('2. getSchemeHoldingsDirect returns live structured holdings with exact weights', async () => {
    // 101762: HDFC Flexi Cap Fund
    const result = await tigzigHoldingsService.getSchemeHoldingsDirect('101762');
    assert.ok(result, 'Expected result from getSchemeHoldingsDirect');
    assert.equal(result.holdingsAvailable, true);
    assert.ok(result.totalHoldingsCount >= 80, `Expected >= 80 holdings, got ${result.totalHoldingsCount}`);
    assert.equal(result.portfolioStatus, 'COMPLETE_VERIFIED');
    assert.ok(result.holdings && result.holdings.length > 0);

    // Verify descending sort by weight
    const top1 = result.holdings[0];
    const top2 = result.holdings[1];
    assert.ok(top1.weightPercent >= top2.weightPercent, 'Holdings must be sorted in descending weight order');
    assert.ok(typeof top1.securityName === 'string' && top1.securityName.length > 0);
  });

  test('3. mfPortfolioService.getSchemePortfolio returns TigZig holdings for flagship schemes', async () => {
    // 125494: SBI Small Cap Fund
    const res = await mfPortfolioService.getSchemePortfolio('125494');
    assert.equal(res.holdingsAvailable, true);
    assert.ok(res.totalHoldingsCount >= 60, `Expected >= 60 holdings for SBI Small Cap, got ${res.totalHoldingsCount}`);
    assert.ok(res.holdings && res.holdings.length >= 60);
    assert.equal(res.source, 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)');
  });

  test('4. Dedicated API GET /api/mutual-funds/schemes/:code/holdings returns paginated results', async () => {
    // 108466: ICICI Prudential Large Cap Fund
    const ctx = createMockContext({ code: '108466' }, { page: '1', limit: '10' });
    await mutualFundsController.getSchemeHoldings(ctx.req, ctx.res);
    const { statusCode, data } = await ctx.promise;

    assert.equal(statusCode, 200);
    assert.equal(data.success, true);
    assert.ok(data.data.total >= 90, `Expected total >= 90, got ${data.data.total}`);
    assert.equal(data.data.items.length, 10);
    assert.equal(data.data.page, 1);
    assert.equal(data.data.limit, 10);
    assert.equal(data.data.hasMore, true);
  });

  test('5. Detail endpoint GET /api/mutual-funds/schemes/:code exposes topHoldings for mobile UI', async () => {
    // 102414: SBI Contra Fund
    const ctx = createMockContext({ code: '102414' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const { statusCode, data } = await ctx.promise;

    assert.equal(statusCode, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.holdingsAvailable, true);
    assert.ok(data.data.totalHoldingsCount >= 90);
    assert.equal(data.data.topHoldings.length, 10, 'topHoldings must have exactly 10 items for mobile cards');
    assert.equal(data.data.topHoldings[0].weightRank, 1);
  });
});
