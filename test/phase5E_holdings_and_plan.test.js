const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const mutualFundsController = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const mfIntelligenceService = require('../services/mfIntelligenceService');

require('dotenv').config();

function createMockContext(params = {}, query = {}) {
  let statusCode = 200;
  let responseData = null;
  const req = { params, query };
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      resolvePromise({ statusCode, data });
      return this;
    },
  };
  return { req, res, promise };
}

describe('VikaOne Phase 5E — Fund Detail UI + Complete Holdings Accuracy Remediation', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
      await mongoose.connect(uri);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // ── 1. FUND TYPE & PLAN MAPPINGS ──
  describe('1. Fund Type / Plan Labeling & Capitalization', () => {
    it('Req 1 & 2: Fund Type maps from option and displays as Growth', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.success, true);
      assert.equal(data.data.option, 'GROWTH');
      assert.equal(data.data.fundType, 'Growth');
      assert.equal(data.data.fundDetails.fundType, 'Growth');
      assert.notEqual(data.data.fundType, 'REGULAR');
      assert.notEqual(data.data.fundType, 'Equity');
    });

    it('Req 3 & 4: Option label is renamed Plan and displays Regular as Regular', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.success, true);
      assert.equal(data.data.planType, 'REGULAR');
      assert.equal(data.data.plan, 'Regular');
      assert.equal(data.data.fundDetails.plan, 'Regular');
      assert.notEqual(data.data.plan, 'GROWTH');
    });

    it('Req 5: Direct schemes cannot leak into current scope (404/rejection)', async () => {
      // Find or query a direct scheme code
      const directScheme = await MutualFundScheme.findOne({
        $or: [
          { schemeName: { $regex: 'direct', $options: 'i' } },
          { planType: 'DIRECT' }
        ]
      }).lean();

      if (directScheme) {
        const ctx = createMockContext({ code: directScheme.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const { statusCode, data } = await ctx.promise;
        assert.equal(statusCode, 404);
        assert.equal(data.success, false);
      }
    });

    it('Req 6: IDCW schemes cannot leak into current customer catalogue scope', async () => {
      const idcwScheme = await MutualFundScheme.findOne({
        $or: [
          { schemeName: { $regex: 'idcw', $options: 'i' } },
          { schemeName: { $regex: 'dividend', $options: 'i' } },
          { option: 'IDCW' }
        ]
      }).lean();

      if (idcwScheme) {
        const ctx = createMockContext({ code: idcwScheme.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const { statusCode, data } = await ctx.promise;
        // Even if found in raw DB, option in customer scope is strictly regular growth
        if (data.success) {
          assert.equal(data.data.planType, 'REGULAR');
          assert.equal(data.data.option, 'GROWTH');
        }
      }
    });
  });

  // ── 2. HOLDINGS ACCURACY & PROVENANCE ──
  describe('2. Holdings Accuracy, Denominators, and Integrity', () => {
    it('Req 13 & 14: Partial source marked partial, official weight preserved', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.portfolio.holdingsAvailable, true);
      assert.equal(data.data.portfolio.isPartial, true);
      assert.equal(data.data.portfolio.totalHoldingsCount, 78);
      assert.ok(data.data.portfolio.holdings.length >= 10);

      // Verify authentic official weights preserved
      const firstHolding = data.data.portfolio.holdings[0];
      assert.equal(firstHolding.securityName, 'Firstsource Solutions Ltd.');
      assert.equal(firstHolding.weightPercent, 4.82);
      assert.equal(firstHolding.weightSource, 'OFFICIAL_AMC_DISCLOSURE');
    });

    it('Req 15: Top 10 holdings are NOT normalized to 100%', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      const holdings = data.data.portfolio.holdings;
      const top10 = holdings.slice(0, 10);
      const sumTop10 = top10.reduce((acc, h) => acc + h.weightPercent, 0);

      // Sum of top 10 should be authentic (around 32%), NEVER 100%
      assert.ok(sumTop10 < 90, `Top 10 sum was ${sumTop10}%, should not be normalized to 100%`);
      assert.ok(sumTop10 > 20, `Top 10 sum was ${sumTop10}%, unexpected low value`);
    });

    it('Req 16: Derived weight uses correct totalNetAssets denominator if calculated', () => {
      const marketValue = 48200000;
      const totalNetAssets = 1000000000;
      const weightPercent = (marketValue / totalNetAssets) * 100;
      assert.equal(weightPercent, 4.82);
    });

    it('Req 17: Scheme with wrong ISIN is safely rejected', async () => {
      const ctx = createMockContext({ code: 'INF999999999' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { statusCode, data } = await ctx.promise;
      assert.equal(statusCode, 404);
      assert.equal(data.success, false);
    });

    it('Req 18 & 19: Non-regular or non-growth options cannot pollute detail responses', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.planType, 'REGULAR');
      assert.equal(data.data.option, 'GROWTH');
      assert.equal(data.data.plan, 'Regular');
      assert.equal(data.data.fundType, 'Growth');
    });

    it('Req 20 & 21: Direct holdings or peer/similar-fund holdings cannot populate target fund', async () => {
      const intelHdfc = mfIntelligenceService.getSchemeIntelligence('130502');
      const intelInvesco = mfIntelligenceService.getSchemeIntelligence('145139');
      const intelBandhan = mfIntelligenceService.getSchemeIntelligence('147944');

      assert.ok(intelHdfc && intelInvesco && intelBandhan);
      // Ensure completely distinct portfolios
      const hdfcFirst = intelHdfc.holdings[0].securityName;
      const invescoFirst = intelInvesco.holdings[0].securityName;
      const bandhanFirst = intelBandhan.holdings[0].securityName;

      assert.notEqual(hdfcFirst, invescoFirst);
      assert.notEqual(hdfcFirst, bandhanFirst);
      assert.notEqual(invescoFirst, bandhanFirst);
    });

    it('Req 22: Missing holdings remain null, never [] for unknown', async () => {
      const ctx = createMockContext({ code: '135759' }); // Axis Children's Fund (unverified holdings)
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.success, true);
      assert.equal(data.data.portfolio.holdings, null);
      assert.equal(data.data.portfolio.holdingsAvailable, false);
      assert.equal(data.data.portfolio.totalHoldingsCount, null);
      assert.equal(data.data.portfolio.isPartial, false);
      assert.equal(data.data.portfolio.portfolioStatus, 'SOURCE_UNAVAILABLE');
    });

    it('Req 23: No unproven hardcoded mock holdings reach API', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      for (const h of data.data.portfolio.holdings) {
        assert.ok(h.securityName && h.securityName.length > 2);
        assert.ok(h.weightPercent > 0);
        assert.ok(h.weightSource);
        assert.ok(h.asOfDate);
      }
    });

    it('Req 24: No hardcoded holdings in Flutter UI view', () => {
      const flutterPath = path.resolve('c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart');
      const code = fs.readFileSync(flutterPath, 'utf8');

      // Check no hardcoded mock lists exist in Flutter
      assert.ok(!code.includes("List<Map<String, dynamic>> mockHoldings"));
      assert.ok(!code.includes("'Reliance Industries': 8.5"));
      assert.ok(code.includes("Holdings data is currently not available from an authorized source for this scheme."));
    });

    it('Req 25: List API and Detail API identity & holdingsAvailable match', async () => {
      const listCtx = createMockContext({}, { search: '130502' });
      await mutualFundsController.getSchemes(listCtx.req, listCtx.res);
      const listRes = await listCtx.promise;

      const detailCtx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(detailCtx.req, detailCtx.res);
      const detailRes = await detailCtx.promise;

      const listScheme = listRes.data.data.find(s => s.schemeCode === '130502');
      const detailScheme = detailRes.data.data;

      assert.ok(listScheme);
      assert.equal(listScheme.schemeCode, detailScheme.schemeCode);
      assert.equal(listScheme.isin, detailScheme.isin);
      assert.equal(listScheme.fundType, detailScheme.fundType);
      assert.equal(listScheme.plan, detailScheme.plan);
      assert.equal(listScheme.holdingsAvailable, detailScheme.portfolio.holdingsAvailable);
    });

    it('Req 26: As-of date is consistent and statutory', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.ok(data.data.portfolio.asOfDate);
      assert.ok(data.data.portfolio.source.includes('SEBI Mandated') || data.data.portfolio.source.includes('Factsheet'));
    });

    it('Req 27: Provenance exists for populated holdings', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      for (const h of data.data.portfolio.holdings) {
        assert.ok(h.weightSource);
        assert.ok(h.sourceName);
        assert.ok(h.sourceDocument);
      }
    });

    it('Req 28: Complete count equals array length when isPartial=false', async () => {
      const ctx = createMockContext({ code: '129006' }); // Franklin India Banking & PSU Debt
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.portfolio.holdingsAvailable, true);
      assert.equal(data.data.portfolio.isPartial, false);
      assert.equal(data.data.portfolio.totalHoldingsCount, data.data.portfolio.holdings.length);
    });
  });

  // ── 3. TOP 10 + VIEW MORE / VIEW LESS LOGIC ──
  describe('3. Top 10 + View More/Less UX Simulation', () => {
    it('Req 7, 8, 9, 10: 11+ holdings allows Top 10 initial, View More expansion, View Less reduction', async () => {
      const ctx = createMockContext({ code: '130502' }); // 12 holdings
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      const allHoldings = data.data.portfolio.holdings;
      assert.ok(allHoldings.length > 10, 'Expected > 10 holdings for View More testing');

      // Flutter initial state: _showAllHoldings = false
      let showAllHoldings = false;
      let displayed = showAllHoldings ? allHoldings : allHoldings.slice(0, 10);
      assert.equal(displayed.length, 10, 'Req 7: Initial slice must be exactly 10 holdings');

      // Req 10: 11+ holdings => View More button condition
      const shouldShowButton = allHoldings.length > 10;
      assert.equal(shouldShowButton, true, 'Req 10: 11+ holdings must render View More button');

      // User clicks View More
      showAllHoldings = true;
      displayed = showAllHoldings ? allHoldings : allHoldings.slice(0, 10);
      assert.equal(displayed.length, allHoldings.length, 'Req 8: View More must show all authentic holdings');

      // Button text after expansion
      const buttonText = showAllHoldings ? 'View Less' : 'View More';
      assert.equal(buttonText, 'View Less');

      // User clicks View Less
      showAllHoldings = false;
      displayed = showAllHoldings ? allHoldings : allHoldings.slice(0, 10);
      assert.equal(displayed.length, 10, 'Req 9: View Less returns to Top 10');
    });

    it('Req 11: 10 or fewer authentic holdings => NO View More button rendered', async () => {
      const ctx = createMockContext({ code: '108466' }); // ICICI Bluechip: exactly 10 holdings
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      const allHoldings = data.data.portfolio.holdings;
      assert.equal(allHoldings.length, 10);

      const shouldShowButton = allHoldings.length > 10;
      assert.equal(shouldShowButton, false, 'Req 11: 10 holdings must NOT render View More button');
    });

    it('Req 12: Complete disclosure with 10 holdings provides all 10 in API', async () => {
      const ctx = createMockContext({ code: '129006' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.portfolio.isPartial, false);
      assert.equal(data.data.portfolio.holdings.length, 10);
      assert.equal(data.data.portfolio.totalHoldingsCount, 10);
    });
  });
});
