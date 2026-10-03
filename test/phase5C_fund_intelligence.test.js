require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');

// Helper to mock Express req and res
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

describe('VikaOne Phase 5C — Production-Grade Fund Intelligence & List/Detail Parity Tests', () => {
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

  it('1. Section 0AB: List API and Detail API have 100% Return Parity across 1M, 3M, 6M, 1Y, 3Y, 5Y', async () => {
    const canaryCodes = ['130502', '145139', '147944', '113177', '122640'];

    for (const code of canaryCodes) {
      // Fetch Detail
      const detailCtx = createMockContext({ code });
      await mutualFundsController.getSchemeDetail(detailCtx.req, detailCtx.res);
      const detailResp = await detailCtx.promise;
      assert.strictEqual(detailResp.statusCode, 200, `Detail fetch failed for ${code}`);
      const detail = detailResp.payload.data;

      // Fetch List
      const listCtx = createMockContext({}, { search: code, page: 1, limit: 10 });
      await mutualFundsController.getSchemes(listCtx.req, listCtx.res);
      const listResp = await listCtx.promise;
      assert.strictEqual(listResp.statusCode, 200, `List fetch failed for ${code}`);
      const listItems = Array.isArray(listResp.payload.data) ? listResp.payload.data : (listResp.payload.data?.schemes || []);
      const listItem = listItems.find((s) => String(s.schemeCode) === String(code) || String(s.amfiCode) === String(code));
      assert.ok(listItem, `Scheme ${code} must be present in getSchemes list`);

      // Assert complete equality between List and Detail
      assert.strictEqual(listItem.return1M, detail.return1M, `1M mismatch for ${code}: list=${listItem.return1M} detail=${detail.return1M}`);
      assert.strictEqual(listItem.return3M, detail.return3M, `3M mismatch for ${code}: list=${listItem.return3M} detail=${detail.return3M}`);
      assert.strictEqual(listItem.return6M, detail.return6M, `6M mismatch for ${code}: list=${listItem.return6M} detail=${detail.return6M}`);
      assert.strictEqual(listItem.cagr1Y, detail.cagr1Y, `1Y mismatch for ${code}: list=${listItem.cagr1Y} detail=${detail.cagr1Y}`);
      assert.strictEqual(listItem.cagr3Y, detail.cagr3Y, `3Y mismatch for ${code}: list=${listItem.cagr3Y} detail=${detail.cagr3Y}`);
      assert.strictEqual(listItem.cagr5Y, detail.cagr5Y, `5Y mismatch for ${code}: list=${listItem.cagr5Y} detail=${detail.cagr5Y}`);
    }
  });

  it('2. Section 0O: HDFC Small Cap (130502) Detail Completeness from Authoritative Factsheet/SID', async () => {
    const ctx = createMockContext({ code: '130502' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);

    const d = resp.payload.data;
    assert.strictEqual(d.schemeCode, '130502');
    assert.strictEqual(d.planType, 'REGULAR');
    assert.strictEqual(d.option, 'GROWTH');
    assert.strictEqual(d.fundManager, 'Chirag Dagli');
    assert.strictEqual(d.fundDetails.aum, 35420.5);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.58);
    assert.strictEqual(d.fundDetails.benchmark, 'S&P BSE 250 SmallCap TRI');
    assert.strictEqual(d.fundDetails.riskometer, 'Very High');
    assert.ok(d.fundDetails.investmentObjective.includes('equity & equity related securities'));
    assert.strictEqual(d.investmentRules.minPurchaseAmount, 100);
    assert.strictEqual(d.investmentRules.minSipAmount, 100);
    assert.ok(Array.isArray(d.portfolio.holdings) && d.portfolio.holdings.length >= 5);
    assert.ok(Array.isArray(d.fundManagement) && d.fundManagement.length >= 1);
    assert.strictEqual(d.fundManagement[0].name, 'Chirag Dagli');
  });

  it('3. Section 0N: Bandhan Small Cap (147944) Detail Completeness', async () => {
    const ctx = createMockContext({ code: '147944' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);

    const d = resp.payload.data;
    assert.strictEqual(d.fundManager, 'Manish Gunwani, Kirthi Jain');
    assert.strictEqual(d.fundDetails.aum, 5840.2);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.78);
    assert.strictEqual(d.fundDetails.benchmark, 'S&P BSE 250 SmallCap TRI');
    assert.strictEqual(d.fundDetails.riskometer, 'Very High');
    assert.strictEqual(d.investmentRules.minPurchaseAmount, 1000);
    assert.strictEqual(d.investmentRules.minSipAmount, 100);
    assert.ok(Array.isArray(d.portfolio.holdings) && d.portfolio.holdings.length >= 4);
  });

  it('4. Section 6: Mandatory Canary Invesco Small Cap (145139) Lineage & Authenticity', async () => {
    const ctx = createMockContext({ code: '145139' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);

    const d = resp.payload.data;
    assert.strictEqual(d.schemeCode, '145139');
    assert.strictEqual(d.isin, 'INF205K011T7');
    assert.strictEqual(d.fundManager, 'Taher Badshah, Aditya Khemani');
    assert.strictEqual(d.fundDetails.aum, 14475.25);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.84);
    assert.strictEqual(d.fundDetails.benchmark, 'BSE 250 SmallCap TRI');
    assert.strictEqual(d.investmentRules.minSipAmount, 500);
    assert.strictEqual(d.dataProvenance.status, 'VERIFIED');
    assert.strictEqual(d.dataProvenance.sourceDoc, 'Invesco_India_Smallcap_Fund_Factsheet_Sep_2026.pdf');
  });

  it('5. Section 0W: Similar Funds data CANNOT mutate primary fund data', async () => {
    const ctx = createMockContext({ code: '130502' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);

    const d = resp.payload.data;
    assert.ok(d.similarFunds && d.similarFunds.length > 0, 'Similar funds must be present');

    // Verify HDFC values are its own, not borrowed from Nippon or Quant in similar funds
    assert.strictEqual(d.fundDetails.aum, 35420.5); // NOT Nippon's 82580
    assert.strictEqual(d.fundDetails.expenseRatio, 1.58); // NOT Nippon's 1.41
    assert.strictEqual(d.fundDetails.benchmark, 'S&P BSE 250 SmallCap TRI'); // NOT Nippon's Nifty Smallcap 250
    assert.strictEqual(d.fundManager, 'Chirag Dagli'); // NOT Nippon's Samir Rachh
  });

  it('6. Section 0R & 0T: fundHouse.totalAum is NEVER populated with Scheme AUM', async () => {
    const ctx = createMockContext({ code: '130502' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    const d = resp.payload.data;

    assert.strictEqual(d.fundHouse.name, 'HDFC Mutual Fund');
    assert.strictEqual(d.fundHouse.code, 'HDFC_MF');
    assert.strictEqual(d.fundHouse.totalAum, null, 'fundHouse.totalAum must be null (not scheme AUM)');
    assert.strictEqual(d.fundHouse.objective, null, 'fundHouse.objective must be null');
  });

  it('7. Multi-Scheme Coverage: Verified Tier 2 Intelligence across 14 Schemes and 10 AMCs', async () => {
    const testCodes = [
      '100119', // HDFC
      '100177', // Quant
      '105628', // SBI
      '105989', // DSP
      '108466', // ICICI Pru
      '112932', // Mirae Asset
      '113177', // Nippon
      '122640', // PPFAS
      '125350', // Axis
      '129006', // Franklin
      '130502', // HDFC
      '145139', // Invesco
      '145208', // Tata
      '147944', // Bandhan
    ];

    for (const code of testCodes) {
      const ctx = createMockContext({ code });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200, `Failed for scheme ${code}`);

      const d = resp.payload.data;
      assert.ok(d.fundManager, `Scheme ${code} must have fundManager`);
      assert.ok(d.fundDetails.aum > 0, `Scheme ${code} must have aum > 0`);
      assert.ok(d.fundDetails.expenseRatio > 0, `Scheme ${code} must have expenseRatio > 0`);
      assert.ok(d.fundDetails.benchmark, `Scheme ${code} must have benchmark`);
      assert.ok(d.fundDetails.riskometer, `Scheme ${code} must have riskometer`);
    }
  });

  it('8. Section 34: Null Safety on Uncatalogued Schemes (never injects synthetic defaults)', async () => {
    // Uncatalogued regular scheme
    const ctx = createMockContext({ code: '100033' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    assert.strictEqual(resp.statusCode, 200);

    const d = resp.payload.data;
    assert.strictEqual(d.fundDetails.aum, null);
    assert.strictEqual(d.fundDetails.expenseRatio, null);
    assert.strictEqual(d.fundDetails.fundManager, null);
    assert.strictEqual(d.fundDetails.benchmark, null);
    assert.strictEqual(d.fundDetails.exitLoad, null);
    assert.strictEqual(d.fundDetails.riskometer, null);
    assert.strictEqual(d.portfolio.holdings, null);
    assert.deepStrictEqual(d.fundManagement, []);
    assert.strictEqual(d.rating, null);
  });

  it('9. Section 0Q: Rating remains strictly null without contracted licensed provider', async () => {
    const ctx = createMockContext({ code: '130502' });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    const d = resp.payload.data;

    assert.strictEqual(d.rating, null, 'Rating must remain strictly null');
    assert.strictEqual(d.ratingProvider, null, 'Rating provider must be null');
  });

  it('10. Rule 1: Customer APIs strictly reject Direct Plans (returns 404)', async () => {
    const directScheme = await MutualFundScheme.findOne({ planType: 'DIRECT' }).lean();
    if (directScheme) {
      const ctx = createMockContext({ code: directScheme.schemeCode });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 404, 'Direct plan must return 404 to customer');
    }
  });
});
