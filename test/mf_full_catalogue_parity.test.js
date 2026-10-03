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

describe('VikaOne Production — Full Catalogue List/Detail Parity Tests', () => {
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

  it('1. List API and Detail API exhibit 100% Return Parity across eligible schemes', async () => {
    const eligibleSchemes = await MutualFundScheme.find({
      planType: 'REGULAR',
      cagr3Y: { $ne: null },
    }).select('schemeCode schemeName cagr1Y cagr3Y cagr5Y return1M return3M return6M').limit(20).lean();

    assert.ok(eligibleSchemes.length > 0, 'Must have eligible schemes with 3Y returns in database');

    for (const s of eligibleSchemes) {
      const code = s.schemeCode;

      // Detail API
      const detailCtx = createMockContext({ code });
      await mutualFundsController.getSchemeDetail(detailCtx.req, detailCtx.res);
      const detailResp = await detailCtx.promise;
      assert.strictEqual(detailResp.statusCode, 200, `Detail fetch must succeed for ${code}`);
      const d = detailResp.payload.data;

      // List API
      const listCtx = createMockContext({}, { search: code, page: 1, limit: 10 });
      await mutualFundsController.getSchemes(listCtx.req, listCtx.res);
      const listResp = await listCtx.promise;
      assert.strictEqual(listResp.statusCode, 200, `List fetch must succeed for ${code}`);
      const listItems = Array.isArray(listResp.payload.data) ? listResp.payload.data : (listResp.payload.data?.schemes || []);
      const l = listItems.find((item) => String(item.schemeCode) === String(code));

      assert.ok(l, `Scheme ${code} must be present in search result`);
      assert.strictEqual(l.cagr3Y, d.cagr3Y, `3Y mismatch for scheme ${code}: List(${l.cagr3Y}) vs Detail(${d.cagr3Y})`);
      assert.strictEqual(l.cagr1Y, d.cagr1Y, `1Y mismatch for scheme ${code}`);
      assert.strictEqual(l.cagr5Y, d.cagr5Y, `5Y mismatch for scheme ${code}`);
      assert.strictEqual(l.return1M, d.return1M, `1M mismatch for scheme ${code}`);
      assert.strictEqual(l.return3M, d.return3M, `3M mismatch for scheme ${code}`);
      assert.strictEqual(l.return6M, d.return6M, `6M mismatch for scheme ${code}`);
    }
  });

  it('2. API Sorting sort=returns3y strictly excludes nulls and orders descending', async () => {
    const listCtx = createMockContext({}, { sort: 'returns3y', page: 1, limit: 20 });
    await mutualFundsController.getSchemes(listCtx.req, listCtx.res);
    const listResp = await listCtx.promise;
    assert.strictEqual(listResp.statusCode, 200);

    const items = listResp.payload.data;
    assert.ok(items.length > 0);

    for (let i = 0; i < items.length; i++) {
      assert.notStrictEqual(items[i].cagr3Y, null, 'Items must not have null cagr3Y');
      assert.notStrictEqual(items[i].cagr3Y, undefined);
      if (i > 0) {
        assert.ok(items[i - 1].cagr3Y >= items[i].cagr3Y, `Order must be descending: ${items[i - 1].cagr3Y} >= ${items[i].cagr3Y}`);
      }
    }
  });

  it('3. Similar funds data cannot leak into or mutate primary fund fields', async () => {
    const ctx = createMockContext({ code: '145139' }); // Invesco Small Cap
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);
    const d = resp.payload.data;

    assert.strictEqual(d.schemeCode, '145139');
    assert.strictEqual(d.fundDetails.aum, 14475.25);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.84);

    assert.ok(Array.isArray(d.similarFunds), 'similarFunds must be an array');
    for (const peer of d.similarFunds) {
      assert.notStrictEqual(peer.schemeCode, '145139', 'Primary fund cannot appear in its own similarFunds');
      assert.notStrictEqual(peer.aum, d.fundDetails.aum, 'Peer AUM cannot overwrite primary fund AUM');
    }
  });
});
