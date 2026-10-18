const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const mutualFundsController = require('../controllers/mutualFundsController');

function mockReqRes(query = {}) {
  const req = { query, params: {}, body: {} };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(data) {
        resolve({ statusCode: this.statusCode, body: data });
      },
    };
    mutualFundsController.getSchemes(req, res);
  });
}

describe('Mutual Funds Collections Live Database Verification', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  test('1. Collection: high_return returns real funds sorted by highest CAGR', async () => {
    const res = await mockReqRes({ collection: 'high_return', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return high return funds');

    // Verify all returned funds have positive returns and are sorted descending
    for (let i = 0; i < res.body.data.length; i++) {
      const fund = res.body.data[i];
      assert.equal(fund.planType, 'REGULAR');
      assert.equal(fund.option, 'GROWTH');
      assert(!/direct/i.test(fund.schemeName), 'Direct schemes forbidden');
      assert(fund.cagr3Y > 0 || fund.cagr1Y > 0, `Fund ${fund.schemeName} must have positive returns`);
      if (i > 0 && res.body.data[i - 1].cagr3Y && fund.cagr3Y) {
        assert(res.body.data[i - 1].cagr3Y >= fund.cagr3Y, 'Must be sorted descending by cagr3Y');
      }
    }
  });

  test('2. Collection: sip_100 returns real funds with minSipAmount <= 100', async () => {
    const res = await mockReqRes({ collection: 'sip_100', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return ₹100 SIP funds');

    for (const fund of res.body.data) {
      assert.equal(fund.planType, 'REGULAR');
      assert(fund.minSipAmount !== null && fund.minSipAmount <= 100, `minSipAmount should be <= 100, got ${fund.minSipAmount}`);
    }
  });

  test('3. Collection: gold_silver returns real Gold & Silver commodity funds', async () => {
    const res = await mockReqRes({ collection: 'gold_silver', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return Gold and Silver funds');

    for (const fund of res.body.data) {
      assert.equal(fund.planType, 'REGULAR');
      const text = `${fund.schemeName} ${fund.category} ${fund.subCategory}`.toLowerCase();
      assert(
        text.includes('gold') || text.includes('silver') || text.includes('commodity'),
        `Fund ${fund.schemeName} must be Gold or Silver`
      );
    }
  });

  test('4. Collection: large_cap returns real Large Cap funds', async () => {
    const res = await mockReqRes({ collection: 'large_cap', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return Large Cap funds');

    for (const fund of res.body.data) {
      assert.equal(fund.planType, 'REGULAR');
      assert(/large/i.test(fund.subCategory), `subCategory must be Large Cap, got ${fund.subCategory}`);
    }
  });

  test('5. Collection: mid_cap returns real Mid Cap funds', async () => {
    const res = await mockReqRes({ collection: 'mid_cap', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return Mid Cap funds');

    for (const fund of res.body.data) {
      assert.equal(fund.planType, 'REGULAR');
      assert(/mid/i.test(fund.subCategory), `subCategory must be Mid Cap, got ${fund.subCategory}`);
    }
  });

  test('6. Collection: small_cap returns real Small Cap funds', async () => {
    const res = await mockReqRes({ collection: 'small_cap', limit: '20' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0, 'Should return Small Cap funds');

    for (const fund of res.body.data) {
      assert.equal(fund.planType, 'REGULAR');
      assert(/small/i.test(fund.subCategory), `subCategory must be Small Cap, got ${fund.subCategory}`);
    }
  });
});
