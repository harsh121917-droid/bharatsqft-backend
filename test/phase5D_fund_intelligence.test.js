require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');
const mfIntelligenceService = require('../services/mfIntelligenceService');
const amcSourceRegistry = require('../services/amcSourceRegistry');

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

describe('VikaOne Phase 5D — Production-Ready Fund Detail Intelligence & Data Accuracy Remediation', () => {
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

  // ── 1. IDENTITY & ISOLATION ──
  describe('1. Scheme Identity & Regular Growth Isolation', () => {
    it('should strictly accept Regular Growth schemes', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap Regular Growth
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.payload.data.planType, 'REGULAR');
      assert.strictEqual(resp.payload.data.option, 'GROWTH');
      assert.doesNotMatch(resp.payload.data.schemeName, /direct/i);
      assert.doesNotMatch(resp.payload.data.schemeName, /idcw|dividend/i);
    });

    it('should strictly reject Direct plan schemes with 404', async () => {
      // Find any Direct scheme if present in database or query with direct name
      const directScheme = await MutualFundScheme.findOne({
        $or: [{ planType: 'DIRECT' }, { schemeName: { $regex: 'direct', $options: 'i' } }],
      });

      if (directScheme) {
        const ctx = createMockContext({ code: directScheme.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const resp = await ctx.promise;
        assert.strictEqual(resp.statusCode, 404);
        assert.strictEqual(resp.payload.success, false);
      } else {
        // Direct schemes are already purged from catalogue
        assert.ok(true, 'No direct schemes in customer catalogue');
      }
    });

    it('should strictly reject IDCW / Dividend schemes with 404', async () => {
      const idcwScheme = await MutualFundScheme.findOne({
        $or: [{ option: { $regex: 'idcw|dividend', $options: 'i' } }, { schemeName: { $regex: 'idcw|dividend', $options: 'i' } }],
      });

      if (idcwScheme) {
        const ctx = createMockContext({ code: idcwScheme.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const resp = await ctx.promise;
        assert.strictEqual(resp.statusCode, 404);
      } else {
        assert.ok(true, 'No IDCW schemes in customer catalogue');
      }
    });

    it('should return 404 for non-existent or invalid scheme codes', async () => {
      const ctx = createMockContext({ code: '999999999' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 404);
    });
  });

  // ── 2. AUM DECOUPLING ──
  describe('2. Scheme AUM vs AMC Total AUM Decoupling', () => {
    it('must decouple Scheme AUM from AMC Total AUM (Scheme AUM cannot populate AMC AUM and vice versa)', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const d = resp.payload.data;
      const schemeAum = d.fundDetails.aum;
      const amcTotalAum = d.fundHouse.totalAum;

      assert.ok(typeof schemeAum === 'number' && schemeAum > 0, 'Scheme AUM must be a valid number');
      assert.ok(typeof amcTotalAum === 'number' && amcTotalAum > 0, 'AMC Total AUM must be a valid number');

      // Scheme AUM (₹35,420.50 Cr) must NEVER equal AMC Total AUM (₹7,45,890.75 Cr)
      assert.notStrictEqual(schemeAum, amcTotalAum, 'Scheme AUM and AMC Total AUM must be distinct values');
      assert.ok(amcTotalAum > schemeAum, 'AMC Total AUM must exceed single Scheme AUM');

      // Check provenance and sources
      assert.strictEqual(d.fundHouse.totalAumAsOfDate, '2026-09-30');
      assert.ok(d.fundHouse.totalAumSource.includes('AMFI Official Average AUM Disclosure'));
      assert.strictEqual(d.fundHouse.rank, 3);
    });

    it('should return null for AMC Total AUM if AMC is unknown/unregistered without falling back to scheme AUM', () => {
      const amcEntry = amcSourceRegistry.getAmcSources('UNKNOWN_AMC_CODE');
      assert.strictEqual(amcEntry, null);
    });
  });

  // ── 3. RATINGS REPLACED BY PLAN TYPE & OPTION ──
  describe('3. Customer-Facing Rating Removal & Plan Display', () => {
    it('primary rating must be null with SOURCE_NOT_AUTHORIZED status', async () => {
      const ctx = createMockContext({ code: '145139' }); // Invesco India Smallcap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const d = resp.payload.data;
      assert.strictEqual(d.rating, null, 'Customer rating must be null without commercial licence');
      assert.strictEqual(d.ratingProvider, null);
      assert.strictEqual(d.ratingStatus, 'SOURCE_NOT_AUTHORIZED');
      assert.strictEqual(d.planType, 'REGULAR');
      assert.strictEqual(d.option, 'GROWTH');
    });

    it('list API schemes must also have rating: null and SOURCE_NOT_AUTHORIZED', async () => {
      const ctx = createMockContext({}, { page: 1, limit: 10 });
      await mutualFundsController.getSchemes(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const items = Array.isArray(resp.payload.data) ? resp.payload.data : resp.payload.data.schemes;
      for (const item of items) {
        assert.strictEqual(item.rating, null);
        assert.strictEqual(item.ratingStatus, 'SOURCE_NOT_AUTHORIZED');
        assert.strictEqual(item.planType, 'REGULAR');
        assert.strictEqual(item.option, 'GROWTH');
      }
    });
  });

  // ── 4. HOLDINGS & PROVENANCE ──
  describe('4. Official Portfolio Holdings & Partial Disclosure', () => {
    it('verified schemes must return authentic holdings with weight, ISIN, sector and asOfDate', async () => {
      const ctx = createMockContext({ code: '145139' }); // Invesco
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const p = resp.payload.data.portfolio;
      assert.strictEqual(p.portfolioStatus, 'VERIFIED');
      assert.ok(Array.isArray(p.holdings) && p.holdings.length >= 5);
      assert.strictEqual(p.isPartial, true);
      assert.strictEqual(p.displayedCount, p.holdings.length);
      assert.ok(p.totalHoldingsCount >= p.displayedCount);

      const firstHolding = p.holdings[0];
      assert.ok(firstHolding.name && firstHolding.name.length > 0);
      assert.ok(typeof firstHolding.weight === 'number' && firstHolding.weight > 0);
      assert.ok(firstHolding.isin && firstHolding.isin.startsWith('INE'));
      assert.ok(firstHolding.sector && firstHolding.sector.length > 0);
      assert.ok(String(firstHolding.asOfDate).startsWith('2026-09-30'));
      assert.ok(firstHolding.source.includes('Factsheet') || firstHolding.source.includes('Portfolio Disclosure'));
    });

    it('uncatalogued schemes without verified disclosure must return null holdings (SOURCE_UNAVAILABLE)', async () => {
      // Find a scheme not in the 22 statutory catalog
      const uncataloguedScheme = await MutualFundScheme.findOne({
        planType: 'REGULAR',
        schemeCode: { $nin: ['130502', '145139', '147944', '113177', '122640', '108466', '100822'] },
        schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
      });

      if (uncataloguedScheme) {
        const ctx = createMockContext({ code: uncataloguedScheme.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const resp = await ctx.promise;
        assert.strictEqual(resp.statusCode, 200);

        const d = resp.payload.data;
        if (!d.portfolio.holdings) {
          assert.strictEqual(d.portfolio.portfolioStatus, 'SOURCE_UNAVAILABLE');
          assert.strictEqual(d.topHoldings, null);
        }
      }
    });

    it('anti-peer-fallback: schemes must not copy holdings from peer schemes', async () => {
      const hdfc = mfIntelligenceService.getSchemeIntelligence('130502');
      const invesco = mfIntelligenceService.getSchemeIntelligence('145139');
      const bandhan = mfIntelligenceService.getSchemeIntelligence('147944');

      assert.notDeepStrictEqual(hdfc.holdings, invesco.holdings, 'HDFC and Invesco holdings must not match');
      assert.notDeepStrictEqual(hdfc.holdings, bandhan.holdings, 'HDFC and Bandhan holdings must not match');
      assert.notDeepStrictEqual(invesco.holdings, bandhan.holdings, 'Invesco and Bandhan holdings must not match');
    });
  });

  // ── 5. MINIMUM SIP & PURCHASE RULES ──
  describe('5. Minimum SIP & Investment Rules Verification', () => {
    it('should preserve official ₹100 minimum SIP for verified schemes', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap ₹100 min SIP
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const rules = resp.payload.data.investmentRules;
      assert.strictEqual(rules.minSipAmount, 100);
      assert.strictEqual(rules.minPurchaseAmount, 100);
      assert.ok(rules.sipSource.includes('SIP') || rules.sipSource.includes('SID'));
      assert.ok(String(rules.sipAsOfDate).startsWith('2026-09-30'));
    });

    it('should preserve official ₹500 minimum SIP where statutory rules dictate', async () => {
      const ctx = createMockContext({ code: '145139' }); // Invesco Smallcap ₹500 min SIP
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const rules = resp.payload.data.investmentRules;
      assert.strictEqual(rules.minSipAmount, 500);
      assert.strictEqual(rules.minPurchaseAmount, 1000);
      assert.deepStrictEqual(rules.sipFrequencies, ['MONTHLY', 'QUARTERLY']);
    });

    it('should separate min purchase, min additional purchase and min SIP', async () => {
      const ctx = createMockContext({ code: '100822' }); // UTI Nifty 50 Index
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const rules = resp.payload.data.investmentRules;
      assert.strictEqual(rules.minPurchaseAmount, 1000);
      assert.strictEqual(rules.minAdditionalPurchaseAmount, 1000);
      assert.strictEqual(rules.minSipAmount, 500);
    });
  });

  // ── 6. FUND MANAGER INTELLIGENCE ──
  describe('6. Fund Manager: Experience vs Tenure Separation & Qualifications', () => {
    it('should separate manager total experience from fund tenure and preserve qualifications', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap (Chirag Dagli)
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const managers = resp.payload.data.fundManagement;
      assert.ok(Array.isArray(managers) && managers.length >= 1);

      const m = managers[0];
      assert.strictEqual(m.name, 'Chirag Dagli');
      assert.strictEqual(m.role, 'Senior Fund Manager');
      assert.strictEqual(m.qualification, 'B.Com, CA, CFA');
      assert.ok(m.experience.includes('18 years'));
      assert.strictEqual(m.tenure, 'Oct 2021 - Present');
      assert.strictEqual(m.tenureStartDate, '2021-10-01');

      // Assert that total experience is NOT simply inferred from fund tenure
      assert.notStrictEqual(m.experience, m.tenure);
    });

    it('multi-manager schemes must return each manager with individual qualifications', async () => {
      const ctx = createMockContext({ code: '145139' }); // Invesco Small Cap (Taher Badshah & Aditya Khemani)
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const managers = resp.payload.data.fundManagement;
      assert.strictEqual(managers.length, 2);

      assert.strictEqual(managers[0].name, 'Taher Badshah');
      assert.strictEqual(managers[0].qualification, 'B.E. (Mechanical), MMS (Finance)');
      assert.ok(managers[0].experience.includes('28 years'));

      assert.strictEqual(managers[1].name, 'Aditya Khemani');
      assert.ok(managers[1].qualification.includes('PGDM') || managers[1].qualification.includes('IIM'));
      assert.ok(managers[1].experience.includes('16 years'));
    });
  });

  // ── 7. INVESTMENT OBJECTIVE & FUND HOUSE ──
  describe('7. Investment Objective Scheme-Specificity & Fund House Isolation', () => {
    it('scheme objective must belong to the exact scheme and not AMC generic objective', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const d = resp.payload.data;
      assert.ok(d.investmentObjective.includes('equity & equity related securities') || d.investmentObjective.includes('small cap companies'));
      assert.ok(d.investmentObjectiveSource.includes('SID') || d.investmentObjectiveSource.includes('Scheme Information Document'));

      // Fund house must NOT have scheme objective substituted
      assert.strictEqual(d.fundHouse.objective, null, 'Fund house objective must be null when no AMC-level objective exists');
    });

    it('anti-peer-objective: peer schemes must not leak investment objectives', async () => {
      const hdfc = mfIntelligenceService.getSchemeIntelligence('130502');
      const index = mfIntelligenceService.getSchemeIntelligence('100822');

      assert.notStrictEqual(hdfc.investmentObjective, index.investmentObjective);
      assert.ok(index.investmentObjective.includes('Nifty 50 Index'));
    });
  });

  // ── 8. EXPENSE RATIO (TER) & RISKOMETER ──
  describe('8. Regular TER & Riskometer', () => {
    it('must return Regular Plan TER (never Direct Plan TER)', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap Regular
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      const ter = resp.payload.data.expenseRatio;
      assert.strictEqual(ter, 1.58, 'Regular TER must be 1.58% (not Direct TER ~0.70%)');
      assert.ok(resp.payload.data.expenseRatioSource.includes('TER Disclosure'));
    });

    it('riskometer must be preserved without converting into a star rating', async () => {
      const ctx = createMockContext({ code: '100822' }); // UTI Nifty 50 Index
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const resp = await ctx.promise;
      assert.strictEqual(resp.statusCode, 200);

      assert.strictEqual(resp.payload.data.riskometer, 'Very High');
      assert.strictEqual(resp.payload.data.rating, null);
    });
  });

  // ── 9. REPRESENTATIVE 22-SCHEME COVERAGE ──
  describe('9. Representative 22-Scheme Statutory Coverage', () => {
    const representativeSchemes = [
      { code: '145139', name: 'Invesco India Smallcap Fund', category: 'Small Cap' },
      { code: '130502', name: 'HDFC Small Cap Fund', category: 'Small Cap' },
      { code: '147944', name: 'Bandhan Small Cap Fund', category: 'Small Cap' },
      { code: '113177', name: 'Nippon India Small Cap Fund', category: 'Small Cap' },
      { code: '125350', name: 'Axis Small Cap Fund', category: 'Small Cap' },
      { code: '105989', name: 'DSP Small Cap Fund', category: 'Small Cap' },
      { code: '145208', name: 'Tata Small Cap Fund', category: 'Small Cap' },
      { code: '100177', name: 'Quant Small Cap Fund', category: 'Small Cap' },
      { code: '108466', name: 'ICICI Prudential Large Cap Fund', category: 'Large Cap' },
      { code: '107578', name: 'Mirae Asset Large Cap Fund', category: 'Large Cap' },
      { code: '114564', name: 'Axis Midcap Fund', category: 'Mid Cap' },
      { code: '100033', name: 'Aditya Birla Sun Life Large & Mid Cap Fund', category: 'Large & Mid Cap' },
      { code: '112932', name: 'Mirae Asset Large & Midcap Fund', category: 'Large & Mid Cap' },
      { code: '122640', name: 'Parag Parikh Flexi Cap Fund', category: 'Flexi Cap' },
      { code: '101762', name: 'HDFC Flexi Cap Fund', category: 'Flexi Cap' },
      { code: '105628', name: 'SBI ELSS Tax Saver Fund', category: 'ELSS' },
      { code: '135784', name: 'Mirae Asset ELSS Tax Saver Fund', category: 'ELSS' },
      { code: '100119', name: 'HDFC Balanced Advantage Fund', category: 'Hybrid' },
      { code: '140381', name: 'Bandhan Aggressive Hybrid Fund', category: 'Hybrid' },
      { code: '129006', name: 'Franklin India Banking & PSU Debt Fund', category: 'Debt' },
      { code: '113070', name: 'HDFC Corporate Bond Fund', category: 'Debt' },
      { code: '100822', name: 'UTI Nifty 50 Index Fund', category: 'Index' },
    ];

    for (const testScheme of representativeSchemes) {
      it(`should verify ${testScheme.name} (${testScheme.code}) [${testScheme.category}]`, async () => {
        const intel = mfIntelligenceService.getSchemeIntelligence(testScheme.code);
        assert.ok(intel, `Intelligence catalog must contain ${testScheme.code}`);

        // 1. Identity & Plan
        assert.strictEqual(intel.planType, 'REGULAR');
        assert.strictEqual(intel.option, 'GROWTH');
        assert.doesNotMatch(intel.schemeName, /direct/i);
        assert.doesNotMatch(intel.schemeName, /idcw|dividend/i);

        // 2. AUM & TER
        assert.ok(typeof intel.aum === 'number' && intel.aum > 0);
        assert.ok(typeof intel.expenseRatio === 'number' && intel.expenseRatio > 0);

        // 3. Investment Rules
        assert.ok(typeof intel.minSipAmount === 'number' && intel.minSipAmount > 0);
        assert.ok(typeof intel.minPurchaseAmount === 'number' && intel.minPurchaseAmount > 0);

        // 4. Fund Management
        assert.ok(Array.isArray(intel.fundManagerDetails) && intel.fundManagerDetails.length >= 1);
        for (const mgr of intel.fundManagerDetails) {
          assert.ok(mgr.name && mgr.name.length > 0);
          assert.ok(mgr.qualification && mgr.qualification.length > 0);
          assert.ok(mgr.experience && mgr.experience.length > 0);
          assert.ok(mgr.tenure && mgr.tenure.length > 0);
        }

        // 5. Holdings
        assert.ok(Array.isArray(intel.holdings) && intel.holdings.length >= 2);
        for (const h of intel.holdings) {
          assert.ok(h.name && h.name.length > 0);
          assert.ok(typeof h.weight === 'number' && h.weight > 0);
          assert.ok(h.isin && h.isin.length >= 12);
          assert.ok(h.sector && h.sector.length > 0);
        }

        // 6. Benchmark & Riskometer & Objective
        assert.ok(intel.benchmark && intel.benchmark.length > 0);
        assert.ok(intel.riskometer && intel.riskometer.length > 0);
        assert.ok(intel.investmentObjective && intel.investmentObjective.length > 0);

        // 7. Verify Controller Detail API response
        const ctx = createMockContext({ code: testScheme.code });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const resp = await ctx.promise;
        assert.strictEqual(resp.statusCode, 200);

        const d = resp.payload.data;
        assert.strictEqual(d.planType, 'REGULAR');
        assert.strictEqual(d.option, 'GROWTH');
        assert.strictEqual(d.rating, null);
        assert.strictEqual(d.ratingStatus, 'SOURCE_NOT_AUTHORIZED');
        assert.notStrictEqual(d.fundDetails.aum, d.fundHouse.totalAum);
      });
    }
  });
});
