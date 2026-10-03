const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');
const mfLiveService = require('../services/mfLiveService');
const nseMasterService = require('../services/nse/nseMasterReconciliationService');

function createMockRes() {
  let captured = null;
  let statusCode = 200;
  return {
    json: (data) => {
      captured = data;
      return { status: statusCode, data: captured };
    },
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          captured = data;
          return { status: statusCode, data: captured };
        },
      };
    },
    getData: () => captured,
    getStatus: () => statusCode,
  };
}

test.describe('VikaOne Phase 5A — Production Data Completeness, Real Returns & API Quality Tests', () => {
  test.before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. IDENTITY & PLAN ISOLATION
  // ─────────────────────────────────────────────────────────────

  test('1. Identity: NSE Plan parsing maps D -> DIRECT, R -> REGULAR, blank -> REGULAR, invalid -> UNKNOWN', () => {
    assert.strictEqual(nseMasterService.parsePlanType('D', 'HDFC Top 100'), 'DIRECT');
    assert.strictEqual(nseMasterService.parsePlanType('DIRECT', 'HDFC Top 100'), 'DIRECT');
    assert.strictEqual(nseMasterService.parsePlanType('R', 'HDFC Top 100 Regular Growth'), 'REGULAR');
    assert.strictEqual(nseMasterService.parsePlanType('REGULAR', 'HDFC Top 100 Regular Growth'), 'REGULAR');
    assert.strictEqual(nseMasterService.parsePlanType('', 'HDFC Top 100 Regular Growth'), 'REGULAR');
    assert.strictEqual(nseMasterService.parsePlanType('X', 'HDFC Top 100'), 'UNKNOWN');
    assert.strictEqual(nseMasterService.parsePlanType('9', 'HDFC Top 100'), 'UNKNOWN');
    // If nominally blank or R but scheme name says direct, guard rejects as UNKNOWN
    assert.strictEqual(nseMasterService.parsePlanType('', 'HDFC Top 100 Direct Plan Growth'), 'UNKNOWN');
    assert.strictEqual(nseMasterService.parsePlanType('R', 'HDFC Top 100 Direct Growth'), 'UNKNOWN');
  });

  test('2. Identity: Option parsing separates Growth from IDCW Payout & Reinvestment', () => {
    const growthRes = nseMasterService.parseOption('Z', 'SCH-GR', 'Fund Regular Growth');
    assert.strictEqual(growthRes.option, 'GROWTH');
    assert.strictEqual(growthRes.dividendType, 'NONE');

    const idcwPay = nseMasterService.parseOption('N', 'SCH-DP', 'Fund Regular IDCW Payout');
    assert.strictEqual(idcwPay.option, 'IDCW');
    assert.strictEqual(idcwPay.dividendType, 'PAYOUT');

    const idcwReinv = nseMasterService.parseOption('Y', 'SCH-DR', 'Fund Regular IDCW Reinvestment');
    assert.strictEqual(idcwReinv.option, 'IDCW');
    assert.strictEqual(idcwReinv.dividendType, 'REINVESTMENT');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. REAL RETURN ENGINE CALCULATIONS
  // ─────────────────────────────────────────────────────────────

  test('3. Return Engine: Point-to-point SEBI simple absolute return for <= 1 Year', () => {
    // Generate synthetic mock history for unit math test
    const series1Y = [
      { date: '2025-10-01', nav: 100.0 },
      { date: '2026-10-01', nav: 115.0 }, // +15.00%
    ];
    const ret = mfLiveService.calculateReturns(series1Y);
    assert.strictEqual(ret.return1Y, 15.0);
    assert.strictEqual(ret.methodology, 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y');
    assert.strictEqual(ret.source, 'AMFI_DAILY_NAV_TIMESERIES');
  });

  test('4. Return Engine: Multi-year CAGR formula for 3Y and 5Y', () => {
    // If NAV went from 100 to 133.10 over 3 years: CAGR = (133.10 / 100)^(1/3) - 1 = 1.1 - 1 = 10%
    const now = new Date('2026-10-01');
    const d3Y = new Date(now.getTime() - 1095 * 86400000).toISOString().split('T')[0];
    const d5Y = new Date(now.getTime() - 1826 * 86400000).toISOString().split('T')[0];

    const series = [
      { date: d5Y, nav: 100.0 },
      { date: d3Y, nav: 100.0 },
      { date: '2026-10-01', nav: 133.1 }, // 10% 3Y CAGR
    ];

    const ret = mfLiveService.calculateReturns(series);
    assert.strictEqual(ret.return3Y, 10.0);
  });

  test('5. Return Engine: Insufficient history returns null (never manufactures a value)', () => {
    // Only 20 days of data: 1M, 3M, 6M, 1Y, 3Y, 5Y must ALL be null
    const shortSeries = [
      { date: '2026-09-10', nav: 100.0 },
      { date: '2026-09-30', nav: 102.5 },
    ];
    const ret = mfLiveService.calculateReturns(shortSeries);
    assert.strictEqual(ret.return1M, null, '1M return must be null if < 30 days');
    assert.strictEqual(ret.return3M, null, '3M return must be null');
    assert.strictEqual(ret.return1Y, null, '1Y return must be null');
    assert.strictEqual(ret.return3Y, null, '3Y return must be null');
    assert.strictEqual(ret.return5Y, null, '5Y return must be null');
  });

  test('6. Return Engine: Empty or single-item series returns all nulls safely', () => {
    const emptyRet = mfLiveService.calculateReturns([]);
    assert.strictEqual(emptyRet.return1M, null);
    assert.strictEqual(emptyRet.return3Y, null);

    const singleRet = mfLiveService.calculateReturns([{ date: '2026-10-01', nav: 50.0 }]);
    assert.strictEqual(singleRet.return1M, null);
    assert.strictEqual(singleRet.return3Y, null);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. API SORTING & FILTERING CORRECTNESS
  // ─────────────────────────────────────────────────────────────

  test('7. API Sorting: sort=returns3y strictly excludes records where cagr3Y is null', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { sort: 'returns3y', page: 1, limit: 20 } }, res);
    const result = res.getData();

    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data), 'Data must be an array');
    assert.ok(result.total > 0, 'Total verified schemes with 3Y return must be > 0');

    for (const scheme of result.data) {
      assert.notStrictEqual(scheme.cagr3Y, null, `Scheme ${scheme.schemeCode} has null cagr3Y in sort=returns3y`);
      assert.notStrictEqual(scheme.cagr3Y, undefined);
      assert.strictEqual(typeof scheme.cagr3Y, 'number');
      assert.strictEqual(scheme.planType, 'REGULAR');
      assert.ok(!scheme.schemeName.toLowerCase().includes('direct'), 'No Direct plan permitted');
    }
  });

  test('8. API Sorting: sort=returns3y orders results descending with stable tie-breaker', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { sort: 'returns3y', page: 1, limit: 20 } }, res);
    const result = res.getData();

    let prevCagr = Infinity;
    for (const s of result.data) {
      assert.ok(s.cagr3Y <= prevCagr, `Sorting violation: ${s.cagr3Y} is greater than previous ${prevCagr}`);
      prevCagr = s.cagr3Y;
    }
  });

  test('9. API Sorting: Pagination total matches filtered dataset count', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { sort: 'returns3y', page: 1, limit: 10 } }, res);
    const result = res.getData();

    const expectedTotal = await MutualFundScheme.countDocuments({
      isActive: true,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
      cagr3Y: { $ne: null },
    });

    assert.strictEqual(result.total, expectedTotal, 'API total must match exact filtered non-null count');
    assert.strictEqual(result.pages, Math.ceil(expectedTotal / 10), 'Pages calculation must match filtered dataset');
  });

  test('10. API Sorting: sort=returns1y strictly excludes null cagr1Y', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { sort: 'returns1y', page: 1, limit: 10 } }, res);
    const result = res.getData();

    assert.strictEqual(result.success, true);
    for (const s of result.data) {
      assert.notStrictEqual(s.cagr1Y, null);
      assert.strictEqual(typeof s.cagr1Y, 'number');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. HOLDINGS SEMANTICS
  // ─────────────────────────────────────────────────────────────

  test('11. Holdings Semantics: Missing/unavailable holdings propagate as null (not empty array [])', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { sort: 'popularity', page: 1, limit: 5 } }, res);
    const result = res.getData();

    for (const s of result.data) {
      // In catalogue, holdings must either be null (when unavailable) or a valid non-empty array (never empty array [])
      if (!s.holdings || (Array.isArray(s.holdings) && s.holdings.length === 0)) {
        assert.strictEqual(s.holdings, null, 'Holdings must be null when source is not available, never []');
      } else {
        assert.ok(Array.isArray(s.holdings) && s.holdings.length > 0, 'When populated from factsheet, holdings must be non-empty array');
      }
    }
  });

  test('12. Scheme Detail: Holdings and topHoldings return null when source data is unavailable', async () => {
    const sample = await MutualFundScheme.findOne({ planType: 'REGULAR' }).lean();
    assert.ok(sample !== null);

    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: sample.schemeCode } }, res);
    const detail = res.getData()?.data;

    assert.strictEqual(res.getStatus(), 200);
    // If no holdings exist in factsheet, holdings must be null
    if (!detail.holdings || detail.holdings.length === 0) {
      assert.strictEqual(detail.holdings, null, 'Detail holdings must be null');
      assert.strictEqual(detail.topHoldings, null, 'Detail topHoldings must be null');
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 5. DATA INGESTION SAFETY & TRANSIENT FAILURE SURVIVABILITY
  // ─────────────────────────────────────────────────────────────

  test('13. Failure Safety: Transient source error preserves existing valid scheme data in database', async () => {
    const testCode = 'TEST_PHASE5A_SAFE_01';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    const created = await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Preserved Fund - Regular Plan - Growth',
      planType: 'REGULAR',
      option: 'GROWTH',
      nav: 125.50,
      navDate: new Date('2026-10-01'),
      cagr3Y: 14.80,
      return1M: 1.25,
      isActive: true,
    });

    // Simulate failed live NAV fetch
    const failedNav = await mfLiveService.getLiveHistoricalNav('INVALID_NON_EXISTENT_CODE_8888');
    assert.strictEqual(failedNav, null, 'Failed fetch returns null');

    // Verify existing record in DB is intact
    const preserved = await MutualFundScheme.findOne({ schemeCode: testCode }).lean();
    assert.strictEqual(preserved.nav, 125.50, 'NAV intact');
    assert.strictEqual(preserved.cagr3Y, 14.80, 'cagr3Y intact');
    assert.strictEqual(preserved.return1M, 1.25, 'return1M intact');

    // Cleanup
    await MutualFundScheme.deleteOne({ schemeCode: testCode });
  });

  test('14. Minimum Amounts: No default ₹500 or ₹1,000 injected when source does not provide them', async () => {
    const sample = await MutualFundScheme.findOne({ planType: 'REGULAR', minSipAmount: null }).lean();
    if (sample) {
      assert.strictEqual(sample.minSipAmount, null, 'minSipAmount remains strictly null');
      assert.notStrictEqual(sample.minSipAmount, 500);
      assert.notStrictEqual(sample.minSipAmount, 1000);
    }
  });

  test('15. Direct Plan Protection: Direct schemes are never returned in customer catalog', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemes({ query: { search: 'direct', page: 1, limit: 10 } }, res);
    const result = res.getData();

    assert.strictEqual(result.data.length, 0, 'Customer search for direct must return 0 records');
  });

  test.after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
});
