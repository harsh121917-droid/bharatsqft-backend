/**
 * VikaOne Mutual Fund — Phase 5G Test Suite
 * Complete Holdings Reconciliation, Full Portfolio Ingestion & All-Scheme Audit
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const mutualFundsController = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');
const portfolioService = require('../services/mfPortfolioService');
const sourceRegistry = require('../services/mfPortfolioSourceRegistry');

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

describe('VikaOne Phase 5G — Complete Holdings Reconciliation & All-Scheme Audit', () => {
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
  // SECTION 1: THE THREE DIAGNOSTIC REGRESSION CASES
  // ==========================================
  describe('1. Diagnostic Case Reconciliation (Bandhan, Invesco, Parag Parikh)', () => {
    it('Bandhan Small Cap (147944): Exact 264 positions, Reverse Repo 13.10%, DB=API=UI', async () => {
      // 1. Verify DB snapshot
      const snap = await MutualFundPortfolioSnapshot.findOne({ schemeCode: '147944', isCurrent: true }).lean();
      assert.ok(snap, 'Bandhan snapshot must exist in database');
      assert.equal(snap.holdings.length, 264, 'DB holdings count must be exactly 264');
      assert.equal(snap.totalPortfolioPositions, 264, 'totalPortfolioPositions must be 264');
      assert.equal(snap.isPartial, false, 'Bandhan portfolio is not partial');

      // 2. Verify Reverse Repo position (13.10%)
      const reverseRepo = snap.holdings.find(h => /reverse repo/i.test(h.securityName) || h.assetClass === 'REVERSE_REPO');
      assert.ok(reverseRepo, 'Reverse Repo position must be present');
      assert.equal(reverseRepo.weightPercent, 13.1, 'Reverse Repo weight must be 13.10%');
      assert.notEqual(reverseRepo.assetClass, 'EQUITY', 'Reverse Repo must not be classified as EQUITY');

      // 3. Verify API scheme detail response
      const ctx = createMockContext({ code: '147944' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { statusCode, data } = await ctx.promise;

      assert.equal(statusCode, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.holdingsAvailable, true);
      assert.equal(data.data.totalHoldingsCount, 264);
      assert.equal(data.data.totalPortfolioPositions, 264);
      assert.equal(data.data.isPartial, false);
      assert.equal(data.data.holdings.length, 264, 'API holdings array must deliver all 264 positions');
      assert.equal(data.data.topHoldings.length, 10, 'topHoldings for initial UI display must be first 10');
      assert.ok(data.data.portfolioBreakdown, 'Portfolio breakdown must be exposed');
      assert.equal(data.data.portfolioBreakdown.equitySecurityCount, 82);
    });

    it('Invesco India Small Cap (145139): Exact 72 positions (68 equity + 4 non-equity), DB=API=UI', async () => {
      // 1. Verify DB snapshot
      const snap = await MutualFundPortfolioSnapshot.findOne({ schemeCode: '145139', isCurrent: true }).lean();
      assert.ok(snap, 'Invesco snapshot must exist in database');
      assert.equal(snap.holdings.length, 72, 'DB holdings count must be exactly 72');
      assert.equal(snap.totalPortfolioPositions, 72);
      assert.equal(snap.equitySecurityCount, 68);

      // 2. Verify 4 Non-Equity positions
      const nonEquity = snap.holdings.filter(h => h.assetClass !== 'EQUITY');
      assert.equal(nonEquity.length, 4, 'Must have exactly 4 non-equity positions');

      // Check TREPS, Reverse Repo, T-Bill, and Receivables
      const treps = nonEquity.find(h => /treps/i.test(h.securityName) || h.assetClass === 'TREPS');
      const repo = nonEquity.find(h => /reverse repo/i.test(h.securityName) || h.assetClass === 'REPO');
      const tbill = nonEquity.find(h => /treasury bill/i.test(h.securityName) || h.assetClass === 'GOVERNMENT_SECURITY');
      const cash = nonEquity.find(h => /receivables|cash/i.test(h.securityName) || h.assetClass === 'CASH_EQUIVALENT');

      assert.ok(treps, 'TREPS must be present');
      assert.ok(repo, 'Reverse repo must be present');
      assert.ok(tbill, 'Treasury bill must be present');
      assert.ok(cash, 'Cash / receivables must be present');

      // 3. Verify API
      const ctx = createMockContext({ code: '145139' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.totalHoldingsCount, 72);
      assert.equal(data.data.holdings.length, 72);
      assert.equal(data.data.topHoldings.length, 10);
    });

    it('Parag Parikh Flexi Cap (122640): Exact 150 positions, NO 5-holding fallback, NO Top 38 badge', async () => {
      // 1. Verify DB snapshot
      const snap = await MutualFundPortfolioSnapshot.findOne({ schemeCode: '122640', isCurrent: true }).lean();
      assert.ok(snap, 'PPFAS snapshot must exist in database');
      assert.equal(snap.holdings.length, 150, 'DB holdings count must be exactly 150');
      assert.equal(snap.totalPortfolioPositions, 150);
      assert.equal(snap.isPartial, false, 'isPartial must be false');

      // 2. Verify foreign equities included
      const foreignEquities = snap.holdings.filter(h => /alphabet|microsoft|meta|amazon|suzuki/i.test(h.securityName));
      assert.ok(foreignEquities.length >= 4, 'Foreign equities (Alphabet, Microsoft, Meta, Amazon) must be present');

      // 3. Verify API
      const ctx = createMockContext({ code: '122640' });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.holdingsAvailable, true);
      assert.equal(data.data.totalHoldingsCount, 150);
      assert.equal(data.data.totalPortfolioPositions, 150);
      assert.equal(data.data.isPartial, false);
      assert.notEqual(data.data.holdings.length, 5, 'Must NEVER fall back to 5 sample holdings');
      assert.equal(data.data.holdings.length, 150, 'Must expose all 150 positions');
    });
  });

  // ==========================================
  // SECTION 2: PAGINATION & DEDICATED HOLDINGS ENDPOINT
  // ==========================================
  describe('2. Dedicated Holdings API & Pagination (?page=1&limit=50)', () => {
    it('GET /schemes/:code/holdings returns page 1 of 50 tied to snapshotId', async () => {
      const ctx = createMockContext({ code: '147944' }, { page: '1', limit: '50' });
      await mutualFundsController.getSchemeHoldings(ctx.req, ctx.res);
      const { statusCode, data } = await ctx.promise;

      assert.equal(statusCode, 200);
      assert.equal(data.success, true);
      assert.ok(data.data.snapshotId, 'Must include snapshotId');
      assert.equal(data.data.total, 264);
      assert.equal(data.data.page, 1);
      assert.equal(data.data.limit, 50);
      assert.equal(data.data.totalPages, 6);
      assert.equal(data.data.hasMore, true);
      assert.equal(data.data.items.length, 50);

      // Verify page 2 is tied to the exact same snapshot
      const ctx2 = createMockContext({ code: '147944' }, { page: '2', limit: '50' });
      await mutualFundsController.getSchemeHoldings(ctx2.req, ctx2.res);
      const { data: data2 } = await ctx2.promise;

      assert.equal(data2.data.page, 2);
      assert.equal(data2.data.items.length, 50);
      assert.equal(String(data2.data.snapshotId), String(data.data.snapshotId), 'Page 2 must use identical snapshotId');
      assert.notEqual(data.data.items[0].securityName, data2.data.items[0].securityName, 'Page 2 items must be distinct from page 1');
    });

    it('Filtering by assetClass (?assetClass=EQUITY) works correctly', async () => {
      const ctx = createMockContext({ code: '147944' }, { page: '1', limit: '100', assetClass: 'EQUITY' });
      await mutualFundsController.getSchemeHoldings(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      assert.equal(data.data.total, 82, 'Bandhan has 82 equity securities');
      for (const item of data.data.items) {
        assert.equal(item.assetClass, 'EQUITY');
      }
    });
  });

  // ==========================================
  // SECTION 3: STRICT DATA INTEGRITY & ISOLATION
  // ==========================================
  describe('3. Financial Data Integrity & Regulatory Isolation', () => {
    it('Never normalize Top-10 weights to 100%', async () => {
      const ctx = createMockContext({ code: '130502' }); // HDFC Small Cap
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { data } = await ctx.promise;

      const top10 = data.data.topHoldings;
      const top10Sum = top10.reduce((acc, h) => acc + (h.weightPercent || 0), 0);

      // In real funds, top 10 weights typically sum to 25%-45%, NEVER exactly 100%
      assert.ok(top10Sum < 65, `Top 10 sum (${top10Sum}%) must not be artificially inflated or normalized`);
      assert.notEqual(top10Sum, 100, 'Top 10 weights must NEVER be normalized to 100%');
    });

    it('Zero cross-scheme holdings leakage (Scheme A cannot receive holdings from Scheme B)', async () => {
      const bandhanSnap = await MutualFundPortfolioSnapshot.findOne({ schemeCode: '147944', isCurrent: true }).lean();
      const invescoSnap = await MutualFundPortfolioSnapshot.findOne({ schemeCode: '145139', isCurrent: true }).lean();

      // Bandhan has Apar Industries as top holding
      const hasAparInInvesco = invescoSnap.holdings.some(h => /apar industries/i.test(h.securityName));
      // Invesco has Kaynes Technology
      const hasKaynesInBandhan = bandhanSnap.holdings.some(h => /kaynes technology/i.test(h.securityName));

      assert.equal(hasAparInInvesco, false, 'Invesco must not leak Bandhan holdings');
      assert.equal(hasKaynesInBandhan, false, 'Bandhan must not leak Invesco holdings');
    });

    it('Direct plan returns HTTP 404', async () => {
      const direct = await MutualFundScheme.findOne({
        planType: 'DIRECT',
      }).lean();

      if (direct) {
        const ctx = createMockContext({ code: direct.schemeCode });
        await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
        const { statusCode } = await ctx.promise;
        assert.equal(statusCode, 404, 'Direct plan must return 404');
      }
    });

    it('Unavailable source returns null holdings with reason (never fake data)', async () => {
      // Find a scheme without an ingested snapshot
      const schemesWithSnapshots = (await MutualFundPortfolioSnapshot.find({ isCurrent: true }).distinct('schemeCode')).map(String);
      const uningestedScheme = await MutualFundScheme.findOne({
        schemeCode: { $nin: schemesWithSnapshots },
        planType: 'REGULAR',
        schemeName: { $not: { $regex: 'direct', $options: 'i' } },
        option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
      }).lean();

      assert.ok(uningestedScheme, 'Should find uningested scheme');
      const ctx = createMockContext({ code: uningestedScheme.schemeCode });
      await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
      const { statusCode, data } = await ctx.promise;

      assert.equal(statusCode, 200);
      assert.equal(data.data.holdingsAvailable, false, 'holdingsAvailable must be false');
      assert.equal(data.data.holdings, null, 'holdings must be null');
      assert.equal(data.data.topHoldings, null, 'topHoldings must be null');
      assert.equal(data.data.totalHoldingsCount, null);
      assert.equal(data.data.portfolioStatus, 'SOURCE_UNAVAILABLE');
    });
  });

  // ==========================================
  // SECTION 4: CATALOGUE AUDIT & REGISTRY
  // ==========================================
  describe('4. Catalogue-Wide Audit & Registry Verification', () => {
    it('Source registry covers all 55 AMCs in the catalogue', () => {
      const amcCount = sourceRegistry.getAmcCount();
      assert.ok(amcCount >= 55, `Source registry must cover at least 55 AMCs (found ${amcCount})`);
    });

    it('Catalogue audit reports generated (JSON & CSV)', () => {
      const reportsDir = path.join(__dirname, '..', 'reports');
      const jsonPath = path.join(reportsDir, 'mf_portfolio_catalogue_audit.json');
      const csvPath = path.join(reportsDir, 'mf_portfolio_catalogue_audit.csv');

      assert.ok(fs.existsSync(jsonPath), 'reports/mf_portfolio_catalogue_audit.json must exist');
      assert.ok(fs.existsSync(csvPath), 'reports/mf_portfolio_catalogue_audit.csv must exist');

      const auditData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      assert.equal(auditData.summary.totalSchemes, 1864, 'Must audit exactly 1,864 Regular Growth schemes');
      assert.equal(auditData.summary.completeVerified, 8, '8 schemes verified with statutory disclosures');
      assert.equal(auditData.summary.sourceUnavailable, 1856, '1856 schemes marked SOURCE_UNAVAILABLE');
      assert.equal(auditData.qualityReport.rowsWithFabricatedWeight, 0, 'Fabricated weights must be 0');
      assert.equal(auditData.qualityReport.crossSchemeLeakage, 0, 'Cross-scheme leakage must be 0');
      assert.equal(auditData.qualityReport.directLeakage, 0, 'Direct leakage must be 0');
      assert.equal(auditData.qualityReport.idcwLeakage, 0, 'IDCW leakage must be 0');
    });
  });
});
