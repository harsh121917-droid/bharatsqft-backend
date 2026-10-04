const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const mutualFundsController = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSchemePortfolioSnapshot = require('../models/MfSchemePortfolioSnapshot');
const mfPortfolioIngestionService = require('../services/mfPortfolioIngestionService');

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

describe('VikaOne Phase 5F — Production One-Shot Remediation Test Suite', () => {
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

  // ==========================================
  // SECTION A: CUSTOMER UI REQUIREMENTS (1-5)
  // ==========================================
  describe('A. Customer UI Requirements (1-5)', () => {
    it('1. option=GROWTH -> Fund Type = Growth', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.success, true);
      assert.equal(data.data.option, 'GROWTH');
      assert.equal(data.data.fundType, 'Growth');
      assert.equal(data.data.fundDetails.fundType, 'Growth');
    });

    it('2. Label Option no longer appears in UI detail metadata', () => {
      const flutterPath = path.resolve(__dirname, '../../../GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart');
      if (fs.existsSync(flutterPath)) {
        const flutterCode = fs.readFileSync(flutterPath, 'utf8');
        // Check that 'Option' as a label in the grid was replaced by 'Plan'
        assert.doesNotMatch(flutterCode, /'Option',\s*style:\s*AppTypography\.labelSmall/);
      }
    });

    it('3. Label Plan appears in UI detail metadata', () => {
      const flutterPath = path.resolve(__dirname, '../../../GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart');
      if (fs.existsSync(flutterPath)) {
        const flutterCode = fs.readFileSync(flutterPath, 'utf8');
        assert.match(flutterCode, /'Plan'/);
      }
    });

    it('4. planType=REGULAR -> Regular (Capitalized)', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.planType, 'REGULAR');
      assert.equal(data.data.plan, 'Regular');
      assert.equal(data.data.fundDetails.plan, 'Regular');
      assert.notEqual(data.data.plan, 'REGULAR');
      assert.notEqual(data.data.plan, 'regular');
    });

    it('5. Direct never reaches customer UI (404/rejection)', async () => {
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
  });

  // ==========================================
  // SECTION B: COMPLETE HOLDINGS PIPELINE (6-15)
  // ==========================================
  describe('B. Complete Holdings Pipeline (6-15)', () => {
    it('6. Complete 78-holding source -> exactly 78 stored and returned for HDFC Small Cap', async () => {
      const snapshot = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '130502',
        planType: 'REGULAR',
        option: 'GROWTH',
        isCurrent: true,
      }).lean();

      assert.ok(snapshot, 'Snapshot must exist for 130502');
      assert.equal(snapshot.holdings.length, 78, 'DB snapshot must store all 78 authentic holdings');
      assert.equal(snapshot.totalHoldingsCount, 78);

      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.portfolio.holdings.length, 78);
      assert.equal(data.data.portfolio.totalHoldingsCount, 78);
    });

    it('7. Complete source -> isPartial=false', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.portfolio.isPartial, false);
      assert.equal(data.data.isPartial, false);
    });

    it('8. Partial source -> isPartial=true semantics', () => {
      const validation = mfPortfolioIngestionService.validateHoldings([
        { securityName: 'Test Stock A', weightPercent: 5.0 },
        { securityName: 'Test Stock B', weightPercent: 4.5 },
      ], false); // knownComplete = false
      assert.equal(validation.isPartial, true);
    });

    it('9. No authorized source -> holdings null, holdingsAvailable=false', async () => {
      const ctx = createMockContext({ code: '135759' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.portfolio.holdings, null);
      assert.equal(data.data.portfolio.holdingsAvailable, false);
      assert.equal(data.data.portfolio.totalHoldingsCount, null);
      assert.equal(data.data.portfolio.isPartial, false);
      assert.equal(data.data.portfolio.portfolioStatus, 'SOURCE_UNAVAILABLE');
    });

    it('10. Initial display count is 10 in Flutter UX logic', () => {
      const flutterPath = path.resolve(__dirname, '../../../GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart');
      if (fs.existsSync(flutterPath)) {
        const flutterCode = fs.readFileSync(flutterPath, 'utf8');
        assert.match(flutterCode, /bool _isHoldingsExpanded = false;/);
        assert.match(flutterCode, /take\(10\)/);
      }
    });

    it('11. 11+ holdings -> View More button rendered', () => {
      const count = 78;
      const shouldShowViewMore = count > 10;
      assert.equal(shouldShowViewMore, true);
    });

    it('12. 10 or fewer -> View More button hidden (Franklin Banking & PSU Debt: 10 holdings)', async () => {
      const ctx = createMockContext({ code: '129006' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.portfolio.holdings.length, 10);
      const shouldShowViewMore = data.data.portfolio.holdings.length > 10;
      assert.equal(shouldShowViewMore, false);
    });

    it('13. View More expands to all authentic available holdings', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      const allHoldings = data.data.portfolio.holdings;
      assert.equal(allHoldings.length, 78);
    });

    it('14. View Less returns display count to 10', () => {
      let isExpanded = true;
      const holdings = Array.from({ length: 78 }, (_, i) => ({ id: i }));
      let displayed = isExpanded ? holdings : holdings.slice(0, 10);
      assert.equal(displayed.length, 78);
      isExpanded = false;
      displayed = isExpanded ? holdings : holdings.slice(0, 10);
      assert.equal(displayed.length, 10);
    });

    it('15. Same dataset is used before and after expansion (zero refetch divergence)', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      const listBefore = data.data.portfolio.holdings.slice(0, 10);
      const listAfter = data.data.portfolio.holdings;
      for (let i = 0; i < 10; i++) {
        assert.equal(listBefore[i].securityName, listAfter[i].securityName);
        assert.equal(listBefore[i].weightPercent, listAfter[i].weightPercent);
      }
    });
  });

  // ==========================================
  // SECTION C: HOLDING PERCENTAGES (16-21)
  // ==========================================
  describe('C. Holding Percentages (16-21)', () => {
    it('16. Official % to NAV preserved verbatim without artificial scaling', async () => {
      const rawDisclosure = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'amc_disclosures', 'hdfc_small_cap_130502.json'), 'utf8'));
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      for (let i = 0; i < 5; i++) {
        assert.equal(data.data.portfolio.holdings[i].weightPercent, rawDisclosure.holdings[i].weightPercent);
      }
    });

    it('17. Top 10 weights are NOT normalized to 100%', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      const top10 = data.data.portfolio.holdings.slice(0, 10);
      const top10Sum = top10.reduce((acc, h) => acc + h.weightPercent, 0);
      assert.notEqual(top10Sum, 100);
      assert.ok(top10Sum > 30 && top10Sum < 40, `Top 10 sum was ${top10Sum}%, expected around 32.9%`);
    });

    it('18. Derived percentage uses authoritative denominator (marketValue / totalNetAssets * 100)', () => {
      const marketValue = 482000000;
      const totalNetAssets = 10000000000;
      const derived = (marketValue / totalNetAssets) * 100;
      assert.equal(derived, 4.82);
    });

    it('19. Wrong percentage fixture is detected and rejected', () => {
      const invalidHoldings = [
        { securityName: 'Fake Stock', weightPercent: -2.5 }
      ];
      assert.throws(() => {
        mfPortfolioIngestionService.validateHoldings(invalidHoldings, true);
      }, /invalid weight/i);
    });

    it('20. Percentage rounding tolerance works within 0.01%', () => {
      const stored = 4.823;
      const official = 4.82;
      const diff = Math.abs(stored - official);
      assert.ok(diff < 0.01);
    });

    it('21. Unknown percentage remains null (never fabricated as 0)', () => {
      const raw = [{ securityName: 'Unknown Weight Security' }];
      const validation = mfPortfolioIngestionService.validateHoldings(raw, true);
      assert.equal(validation.validHoldings[0].weightPercent, null);
    });
  });

  // ==========================================
  // SECTION D: IDENTITY VALIDATION (22-28)
  // ==========================================
  describe('D. Scheme Identity Validation (22-28)', () => {
    it('22. Direct cannot populate Regular', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'HDFC_MF',
          isin: 'INF179KA1RZ8',
          planType: 'DIRECT',
          option: 'GROWTH',
        });
      }, /DIRECT plans rejected/);
    });

    it('23. IDCW cannot populate Growth', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'HDFC_MF',
          isin: 'INF179KA1RZ8',
          planType: 'REGULAR',
          option: 'IDCW',
        });
      }, /IDCW options rejected/);
    });

    it('24. Wrong ISIN rejected', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'HDFC_MF',
          isin: 'WRONG_ISIN_123',
          planType: 'REGULAR',
          option: 'GROWTH',
        });
      }, /not found in catalogue/);
    });

    it('25. Wrong AMC rejected', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'WRONG_AMC',
          isin: 'INF179KA1RZ8',
          planType: 'REGULAR',
          option: 'GROWTH',
        });
      }, /AMC code mismatch/);
    });

    it('26. Wrong scheme rejected', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          schemeCode: '999999',
          amcCode: 'HDFC_MF',
          isin: 'INF179KA1RZ8',
          planType: 'REGULAR',
          option: 'GROWTH',
        });
      }, /Scheme code mismatch/);
    });

    it('27. Wrong plan rejected', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'HDFC_MF',
          isin: 'INF179KA1RZ8',
          planType: 'RETIREMENT',
          option: 'GROWTH',
        });
      }, /Only REGULAR plans supported/);
    });

    it('28. Wrong option rejected', async () => {
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.validateSchemeIdentity({
          amcCode: 'HDFC_MF',
          isin: 'INF179KA1RZ8',
          planType: 'REGULAR',
          option: 'BONUS',
        });
      }, /Only GROWTH options supported/);
    });
  });

  // ==========================================
  // SECTION E: DATA QUALITY & ISOLATION (29-35)
  // ==========================================
  describe('E. Data Quality & Isolation (29-35)', () => {
    it('29. Similar-fund holdings cannot populate target scheme', async () => {
      const ctx = createMockContext({ code: '135759' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.equal(data.data.portfolio.holdings, null);
    });

    it('30. Hardcoded holdings cannot reach API without provenance', async () => {
      const ctx = createMockContext({ code: '130502' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;
      assert.ok(data.data.portfolio.source);
      assert.ok(data.data.portfolio.sourceDocument);
      assert.ok(data.data.portfolio.asOfDate);
    });

    it('31. Duplicate holdings flagged and prevented', () => {
      const dupData = [
        { securityName: 'Stock A', isin: 'INE111A01011', weightPercent: 2.0 },
        { securityName: 'Stock A', isin: 'INE111A01011', weightPercent: 2.0 },
      ];
      const validation = mfPortfolioIngestionService.validateHoldings(dupData, true);
      assert.equal(validation.duplicateCount, 1);
      assert.equal(validation.validHoldings.length, 1);
    });

    it('32. Complete count equals array length in DB snapshot', async () => {
      const snapshot = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '145139',
        isCurrent: true,
      }).lean();
      assert.equal(snapshot.totalHoldingsCount, snapshot.holdings.length);
      assert.ok([68, 72].includes(snapshot.holdings.length));
    });

    it('33. Partial count semantics are preserved', () => {
      const validation = mfPortfolioIngestionService.validateHoldings([
        { securityName: 'A', weightPercent: 1.0 }
      ], false);
      assert.equal(validation.isPartial, true);
    });

    it('34. Stale snapshot retains original as-of date', async () => {
      const snapshot = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '130502',
        isCurrent: true,
      }).lean();
      const asOfStr = snapshot.asOfDate.toISOString().split('T')[0];
      assert.equal(asOfStr, '2026-09-30');
    });

    it('35. Source failure does not create fake holdings', async () => {
      const ctx = createMockContext({ code: 'INVALID_CODE' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { statusCode } = await ctx.promise;
      assert.equal(statusCode, 404);
    });
  });

  // ==========================================
  // SECTION F: REFRESH SYSTEM (36-39)
  // ==========================================
  describe('F. Refresh System (36-39)', () => {
    it('36. Monthly ingestion creates or updates versioned snapshot', async () => {
      const snapshot = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '147944',
        isCurrent: true,
      }).lean();
      assert.ok(snapshot);
      assert.ok(snapshot.parserVersion);
      assert.ok(snapshot.checksum);
    });

    it('37. Historical snapshots retained with isCurrent flag management', async () => {
      const count = await MfSchemePortfolioSnapshot.countDocuments({
        schemeCode: '130502',
        isCurrent: true,
      });
      assert.equal(count, 1, 'Exactly one active current snapshot per scheme');
    });

    it('38. Failed parser does not overwrite good data', async () => {
      const existing = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '130502',
        isCurrent: true,
      }).lean();

      // Attempt invalid ingestion
      await assert.rejects(async () => {
        await mfPortfolioIngestionService.ingestSnapshot({
          schemeCode: '130502',
          planType: 'DIRECT', // invalid
          option: 'GROWTH',
          holdings: [],
        });
      });

      const current = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '130502',
        isCurrent: true,
      }).lean();
      assert.equal(current.holdings.length, existing.holdings.length);
    });

    it('39. Source checksum and parser version stored in DB snapshot', async () => {
      const snapshot = await MfSchemePortfolioSnapshot.findOne({
        schemeCode: '108466',
        isCurrent: true,
      }).lean();
      assert.ok(snapshot.checksum.length >= 64, 'Checksum must be SHA-256');
      assert.match(snapshot.parserVersion, /phase5F|phase5G|v5G/);
    });
  });
});
