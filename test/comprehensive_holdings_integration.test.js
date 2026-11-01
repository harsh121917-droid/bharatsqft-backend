const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

describe('Comprehensive Mutual Fund Holdings Integration Tests', () => {
  let mfPortfolioService;
  let mfController;

  before(async () => {
    await mongoose.connect(uri);
    mfPortfolioService = require('../services/mfPortfolioService');
    mfController = require('../controllers/mutualFundsController');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  test('1. TigZig flagship fund returns complete holdings (HDFC Flexi Cap 101762)', async () => {
    const portfolio = await mfPortfolioService.getSchemePortfolio('101762');
    assert.strictEqual(portfolio.holdingsAvailable, true);
    assert.strictEqual(portfolio.totalHoldingsCount, 86);
    assert.ok(portfolio.holdings.length >= 80);
    assert.strictEqual(portfolio.holdings[0].name, 'ICICI Bank Ltd.');
  });

  test('2. Enriched database fund returns top authentic holdings (Quant Small Cap 100177)', async () => {
    const portfolio = await mfPortfolioService.getSchemePortfolio('100177');
    assert.strictEqual(portfolio.holdingsAvailable, true);
    assert.strictEqual(portfolio.totalHoldingsCount, 68);
    assert.strictEqual(portfolio.holdings.length, 12);
    assert.strictEqual(portfolio.holdings[0].name, 'Reliance Industries Ltd.');
    assert.strictEqual(portfolio.holdings[0].weightPercent, 8.42);
  });

  test('3. Enriched database fund returns top authentic holdings (Edelweiss Small Cap 146193)', async () => {
    const portfolio = await mfPortfolioService.getSchemePortfolio('146193');
    assert.strictEqual(portfolio.holdingsAvailable, true);
    assert.strictEqual(portfolio.totalHoldingsCount, 72);
    assert.strictEqual(portfolio.holdings.length, 11);
  });

  test('4. Gold ETF returns physical gold and TREPS cash backing (HDFC Gold ETF 113049)', async () => {
    const portfolio = await mfPortfolioService.getSchemePortfolio('113049');
    assert.strictEqual(portfolio.holdingsAvailable, true);
    assert.strictEqual(portfolio.totalHoldingsCount, 2);
    assert.strictEqual(portfolio.holdings[0].name, 'Physical Gold (99.5% Purity LBMA Bars)');
    assert.strictEqual(portfolio.holdings[0].weightPercent, 98.90);
    assert.strictEqual(portfolio.holdings[1].name, 'Tri-party Repo (TREPS) / Cash Margin');
  });

  test('5. Detail endpoint GET /api/mutual-funds/schemes/:code exposes topHoldings for mobile UI', async () => {
    const codes = ['100177', '101762', '146193', '105628', '113049'];
    for (const code of codes) {
      const req = { params: { code } };
      let responseData = null;
      let statusCode = 200;
      const res = {
        status: (s) => {
          statusCode = s;
          return { json: (d) => { responseData = d; } };
        },
        json: (d) => { responseData = d; },
      };

      await mfController.getSchemeDetail(req, res);
      assert.strictEqual(statusCode, 200);
      assert.strictEqual(responseData.success, true);
      assert.strictEqual(responseData.data.holdingsAvailable, true, `holdingsAvailable should be true for ${code}`);
      assert.ok(Array.isArray(responseData.data.topHoldings), `topHoldings should be array for ${code}`);
      assert.ok(responseData.data.topHoldings.length > 0, `topHoldings should not be empty for ${code}`);
      assert.ok(responseData.data.totalHoldingsCount > 0, `totalHoldingsCount should be > 0 for ${code}`);
    }
  });

  test('6. Dedicated API GET /api/mutual-funds/schemes/:code/holdings returns paginated results', async () => {
    const req = { params: { code: '100177' }, query: { page: 1, limit: 5 } };
    let responseData = null;
    let statusCode = 200;
    const res = {
      status: (s) => {
        statusCode = s;
        return { json: (d) => { responseData = d; } };
      },
      json: (d) => { responseData = d; },
    };

    await mfController.getSchemeHoldings(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.data.total, 12);
    assert.strictEqual(responseData.data.items.length, 5);
    assert.strictEqual(responseData.data.hasMore, true);
  });
});
