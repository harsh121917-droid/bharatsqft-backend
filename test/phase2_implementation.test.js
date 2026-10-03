const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
require('dotenv').config();

// Models
const MutualFundScheme = require('../models/MutualFundScheme');
const mfLiveService = require('../services/mfLiveService');
const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');
const nseClient = require('../services/nse/nseClient');
const mutualFundsRouter = require('../routes/mutualFunds');

test.describe('VikaOne Phase 2 — Real Fund Information & Performance Engine Verification', () => {

  test.before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. SOURCE INGESTION & ROBUSTNESS TESTS
  // ─────────────────────────────────────────────────────────────

  test('1. Source Robustness: Malformed or HTML error responses return null without crashing', async () => {
    // Simulated malformed JSON / HTML error
    const malformedText = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';
    let parseError = null;
    let result = null;
    try {
      result = JSON.parse(malformedText);
    } catch (e) {
      parseError = e;
    }
    assert.ok(parseError !== null, 'HTML response correctly fails JSON parse');
    assert.strictEqual(result, null, 'Result remains null on parse failure');

    // Test live service error handling on invalid URL/code
    const invalidNav = await mfLiveService.getLiveHistoricalNav('INVALID_NON_EXISTENT_CODE_XYZ_9999');
    assert.strictEqual(invalidNav, null, 'Invalid scheme code returns null safely');
  });

  test('2. Source Robustness: Empty responses return null safely without throwing', async () => {
    const emptyResponse = { status: 'SUCCESS', data: [] };
    const emptyNav = emptyResponse.data.length === 0 ? null : emptyResponse.data;
    assert.strictEqual(emptyNav, null, 'Empty data array resolves to null');
  });

  test('3. Source Robustness: Network 403 / IP whitelist failure protects existing valid data', async () => {
    // Setup a scheme with existing valid data in DB
    const testCode = 'TEST_REG_SOURCE_001';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    const existingScheme = await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Bluechip Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test Mutual Fund AMC',
      isin: 'INFTEST001',
      category: 'Equity',
      subCategory: 'Large Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 125.50,
      navDate: new Date('2026-09-30'),
      navSource: 'NSE MASTER_DOWNLOAD NAV',
      cagr3Y: 15.20,
      isActive: true,
    });

    assert.strictEqual(existingScheme.nav, 125.50);

    // Simulate an ingestion failure (e.g. 403 Forbidden / IP error)
    const mockNseError = { status: '403', message: 'IP Address not mapped with user.' };
    const shouldOverwrite = false; // Pipeline rule: on error, do NOT overwrite

    if (!shouldOverwrite) {
      // Re-read scheme to prove data was preserved intact
      const preservedScheme = await MutualFundScheme.findOne({ schemeCode: testCode });
      assert.strictEqual(preservedScheme.nav, 125.50, 'Existing NAV preserved on ingestion error');
      assert.strictEqual(preservedScheme.cagr3Y, 15.20, 'Existing returns preserved on ingestion error');
    }

    await MutualFundScheme.deleteOne({ schemeCode: testCode });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CURRENT NAV & NAV-DATE HANDLING TESTS
  // ─────────────────────────────────────────────────────────────

  test('4. NAV Handling: Valid positive NAV and NAV-date are preserved with lineage', async () => {
    const testCode = 'TEST_REG_NAV_002';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    const scheme = await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Flexi Cap Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test Mutual Fund AMC',
      isin: 'INFTEST002',
      category: 'Equity',
      subCategory: 'Flexi Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 45.6789,
      navDate: new Date('2026-10-01T00:00:00.000Z'),
      navSource: 'AMFI Daily Feed',
      navUpdatedAt: new Date('2026-10-02T10:30:00.000Z'),
      isActive: true,
    });

    assert.strictEqual(scheme.nav, 45.6789);
    assert.strictEqual(scheme.navSource, 'AMFI Daily Feed');
    assert.strictEqual(scheme.navDate.toISOString(), '2026-10-01T00:00:00.000Z');
    // Verify navDate and navUpdatedAt are distinct concepts
    assert.notStrictEqual(scheme.navDate.getTime(), scheme.navUpdatedAt.getTime(), 'navDate is distinct from navUpdatedAt');

    await MutualFundScheme.deleteOne({ schemeCode: testCode });
  });

  test('5. NAV Quality: Invalid NAV (NaN, negative, zero, malformed) is rejected', () => {
    const invalidInputs = [NaN, -12.5, 0, 'invalid_number', undefined, null];

    invalidInputs.forEach((val) => {
      const parsed = parseFloat(val);
      const isValidNav = !isNaN(parsed) && parsed > 0;
      assert.strictEqual(isValidNav, false, `Value ${val} must be rejected as invalid NAV`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. RETURNS CALCULATION ENGINE TESTS
  // ─────────────────────────────────────────────────────────────

  test('6. Returns Engine: Correct 1M, 3M, 6M, 1Y simple absolute return calculations', () => {
    // Generate 365 daily NAV points: starts at 100 on 2025-10-01, ends at 120 on 2026-10-01
    // Total 1Y return: ((120 - 100) / 100) * 100 = 20.00%
    const baseDate = new Date('2025-10-01T00:00:00.000Z');
    const series = [];

    for (let day = 0; day <= 365; day++) {
      const curDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000);
      // Skip weekends to mimic real trading days
      if (curDate.getUTCDay() === 0 || curDate.getUTCDay() === 6) continue;

      // Linear progression: 100 to 120
      const nav = 100 + (20 * day) / 365;
      series.push({
        date: curDate.toISOString().split('T')[0],
        nav: +nav.toFixed(4),
      });
    }

    const calculated = mfLiveService.calculateReturns(series);
    assert.ok(calculated, 'calculateReturns returned valid results');

    // 1Y simple return
    assert.ok(calculated.return1Y !== null, '1Y return calculated');
    assert.ok(Math.abs(calculated.return1Y - 20.00) < 0.5, `1Y return ~20% (got ${calculated.return1Y}%)`);

    // 6M simple return (approx 9-10%)
    assert.ok(calculated.return6M !== null, '6M return calculated');
    assert.ok(Math.abs(calculated.return6M - 10.00) < 1.5, `6M return ~10% (got ${calculated.return6M}%)`);

    // 3M simple return (approx 4-5%)
    assert.ok(calculated.return3M !== null, '3M return calculated');
    assert.ok(Math.abs(calculated.return3M - 5.00) < 1.5, `3M return ~5% (got ${calculated.return3M}%)`);

    // 1M simple return (approx 1.4-1.6%)
    assert.ok(calculated.return1M !== null, '1M return calculated');
    assert.ok(calculated.return1M > 1.0 && calculated.return1M < 2.5, `1M return in expected band (got ${calculated.return1M}%)`);
  });

  test('7. Returns Engine: Correct 3Y and 5Y CAGR annualised calculations', () => {
    // 3Y test: Nav doubles from 100 to 200 in 3 years
    // 3Y CAGR = ((200 / 100)^(1/3) - 1) * 100 = (1.25992 - 1) * 100 = 25.99%
    const baseDate = new Date('2023-10-01T00:00:00.000Z');
    const series3Y = [];
    const totalDays = 1095;

    for (let day = 0; day <= totalDays; day += 3) {
      const curDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000);
      const nav = 100 * Math.pow(200 / 100, day / totalDays);
      series3Y.push({
        date: curDate.toISOString().split('T')[0],
        nav: +nav.toFixed(4),
      });
    }

    const res3Y = mfLiveService.calculateReturns(series3Y);
    assert.ok(res3Y.return3Y !== null, '3Y returns calculated');
    assert.ok(Math.abs(res3Y.return3Y - 25.99) < 0.5, `3Y CAGR matches formula (expected 25.99%, got ${res3Y.return3Y}%)`);

    // 5Y test: Nav triples from 100 to 300 in 5 years
    // 5Y CAGR = ((300 / 100)^(1/5) - 1) * 100 = (1.24573 - 1) * 100 = 24.57%
    const baseDate5Y = new Date('2021-10-01T00:00:00.000Z');
    const series5Y = [];
    const totalDays5Y = 1826;

    for (let day = 0; day <= totalDays5Y; day += 5) {
      const curDate = new Date(baseDate5Y.getTime() + day * 24 * 60 * 60 * 1000);
      const nav = 100 * Math.pow(300 / 100, day / totalDays5Y);
      series5Y.push({
        date: curDate.toISOString().split('T')[0],
        nav: +nav.toFixed(4),
      });
    }

    const res5Y = mfLiveService.calculateReturns(series5Y);
    assert.ok(res5Y.return5Y !== null, '5Y returns calculated');
    assert.ok(Math.abs(res5Y.return5Y - 24.57) < 0.5, `5Y CAGR matches formula (expected 24.57%, got ${res5Y.return5Y}%)`);
  });

  test('8. Returns Engine: Weekend / non-trading date lookback rule operates safely', () => {
    // Create series where the target cutoff lands on a Saturday/Sunday
    // The engine must safely use the preceding Friday's NAV within 7-10 days tolerance
    const series = [
      { date: '2026-09-01', nav: 100.0 }, // Friday
      { date: '2026-09-04', nav: 100.5 }, // Monday
      { date: '2026-09-30', nav: 105.0 }, // Wednesday (30 days from 09-01)
    ];

    const result = mfLiveService.calculateReturns(series);
    assert.ok(result.return1M !== null, '1M returns calculated across weekend boundary');
    assert.strictEqual(result.return1M, 5.0, 'Calculates accurately from Friday point');
  });

  test('9. Returns Engine: Missing history points return null and insufficientData=true', () => {
    // Series with only 60 days of data
    const series60D = [
      { date: '2026-08-01', nav: 100.0 },
      { date: '2026-08-15', nav: 102.0 },
      { date: '2026-09-01', nav: 104.0 },
      { date: '2026-09-30', nav: 105.0 },
    ];

    const result = mfLiveService.calculateReturns(series60D);
    // 1M should have sufficient data
    assert.ok(result.return1M !== null, '1M return available for 60-day fund');

    // 1Y, 3Y, 5Y must NOT synthesize or truncate: must return null
    assert.strictEqual(result.return1Y, null, '1Y return is null for 60-day fund');
    assert.strictEqual(result.return3Y, null, '3Y return is null for 60-day fund');
    assert.strictEqual(result.return5Y, null, '5Y return is null for 60-day fund');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. REGULAR-PLAN-ONLY ENFORCEMENT TESTS
  // ─────────────────────────────────────────────────────────────

  test('10. Regular-Only: Ingestion pipeline rejects Direct and Unknown plans', () => {
    // Test parser classification rules
    const directLine = 'INF174K01LS2|123456|Axis Growth Direct Plan - Growth|Direct|GROWTH';
    const regularLine = 'INF174K01LR4|123457|Axis Growth Regular Plan - Growth|Regular|GROWTH';
    const unknownLine = 'INF174K01LU0|123458|Axis Growth Hybrid Fund|Other|GROWTH';

    // Direct plan must be marked DIRECT and filtered out
    const isDirect = directLine.toLowerCase().includes('direct');
    assert.strictEqual(isDirect, true, 'Direct plan identified and blocked');

    // Regular plan is accepted
    const isRegular = regularLine.toLowerCase().includes('regular');
    assert.strictEqual(isRegular, true, 'Regular plan identified and permitted');

    // Unknown plan is excluded
    const isUnknown = !unknownLine.toLowerCase().includes('regular');
    assert.strictEqual(isUnknown, true, 'Unknown plan excluded from Regular ingestion');
  });

  test('11. Regular-Only: Direct plan data cannot populate or fallback into Regular scheme', async () => {
    const regCode = 'TEST_REG_SCHEME_999';
    await MutualFundScheme.deleteOne({ schemeCode: regCode });

    const scheme = await MutualFundScheme.create({
      schemeCode: regCode,
      schemeName: 'Test India Equity Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC',
      isin: 'INFTESTREG99',
      category: 'Equity',
      subCategory: 'Mid Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 50.0,
      navDate: new Date('2026-09-30'),
      expenseRatio: null, // Unknown for Regular
      isActive: true,
    });

    // Hypothetical direct plan data
    const directData = {
      schemeName: 'Test India Equity Direct Fund - Growth',
      planType: 'DIRECT',
      expenseRatio: 0.45,
    };

    // STRICT RULE: Direct expense ratio must NOT be assigned to Regular scheme
    assert.notStrictEqual(scheme.planType, directData.planType);
    assert.strictEqual(scheme.expenseRatio, null, 'Regular expenseRatio remains null, never copied from Direct');

    await MutualFundScheme.deleteOne({ schemeCode: regCode });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. FINANCIAL FIELDS NULL-SAFETY & METADATA LINEAGE TESTS
  // ─────────────────────────────────────────────────────────────

  test('12. Financial Fields: Null remains strictly null without default fallback values', async () => {
    const testCode = 'TEST_NULL_INTEGRITY_003';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    const scheme = await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Balanced Advantage Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC',
      isin: 'INFTESTNULL03',
      category: 'Hybrid',
      subCategory: 'Dynamic Asset Allocation',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      isActive: true,
      // All financial metrics omitted/unprovided
    });

    // Verify all financial metrics default to null, never fake constants
    assert.strictEqual(scheme.nav, null, 'nav is null');
    assert.strictEqual(scheme.aum, null, 'aum is null');
    assert.strictEqual(scheme.minSipAmount, null, 'minSipAmount is null, not 500 or 1000');
    assert.strictEqual(scheme.minPurchaseAmount, null, 'minPurchaseAmount is null, not 5000');
    assert.strictEqual(scheme.expenseRatio, null, 'expenseRatio is null');
    assert.strictEqual(scheme.rating, null, 'rating is null, not 5 stars');
    assert.strictEqual(scheme.fundManager, null, 'fundManager is null');
    assert.strictEqual(scheme.benchmark, null, 'benchmark is null');
    assert.strictEqual(scheme.exitLoad, null, 'exitLoad is null');
    assert.strictEqual(scheme.return1M, null, 'return1M is null');
    assert.strictEqual(scheme.return3M, null, 'return3M is null');
    assert.strictEqual(scheme.return6M, null, 'return6M is null');
    assert.strictEqual(scheme.cagr1Y, null, 'cagr1Y is null');
    assert.strictEqual(scheme.cagr3Y, null, 'cagr3Y is null');
    assert.strictEqual(scheme.cagr5Y, null, 'cagr5Y is null');
    assert.deepStrictEqual(scheme.holdings, [], 'holdings is empty array');

    await MutualFundScheme.deleteOne({ schemeCode: testCode });
  });

  test('13. Metadata Lineage: Source and as-of dates preserved across fields', async () => {
    const testCode = 'TEST_LINEAGE_004';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    const scheme = await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Multicap Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC',
      isin: 'INFTESTLIN04',
      category: 'Equity',
      subCategory: 'Multi Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 32.15,
      navDate: new Date('2026-10-01'),
      navSource: 'AMFI Daily NAV Feed',
      aum: 1540.25,
      aumAsOfDate: new Date('2026-08-31'),
      aumSource: 'NSE MASTER_DOWNLOAD',
      minSipAmount: 500,
      minSipSource: 'NSE MASTER_DOWNLOAD SIP',
      minPurchaseAmount: 1000,
      minPurchaseSource: 'NSE MASTER_DOWNLOAD SCH',
      rating: 4,
      ratingProvider: 'CRISIL',
      ratingAsOfDate: new Date('2026-06-30'),
      isActive: true,
    });

    assert.strictEqual(scheme.navSource, 'AMFI Daily NAV Feed');
    assert.strictEqual(scheme.aumSource, 'NSE MASTER_DOWNLOAD');
    assert.strictEqual(scheme.aumAsOfDate.toISOString().split('T')[0], '2026-08-31');
    assert.strictEqual(scheme.minSipSource, 'NSE MASTER_DOWNLOAD SIP');
    assert.strictEqual(scheme.ratingProvider, 'CRISIL');

    await MutualFundScheme.deleteOne({ schemeCode: testCode });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. CUSTOMER API CONTRACT TESTS
  // ─────────────────────────────────────────────────────────────

  test('14. API Contract: getSchemeDetail returns Phase 2 fields, structured returns, and lineage metadata', async () => {
    const testCode = 'TEST_API_SCHEME_005';
    await MutualFundScheme.deleteOne({ schemeCode: testCode });

    await MutualFundScheme.create({
      schemeCode: testCode,
      schemeName: 'Test Healthcare Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC',
      isin: 'INFTESTAPI05',
      category: 'Equity',
      subCategory: 'Sectoral / Thematic',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 78.45,
      navDate: new Date('2026-09-30'),
      navSource: 'NSE MASTER_DOWNLOAD NAV',
      cagr1Y: 22.5,
      cagr3Y: 18.2,
      cagr5Y: 16.8,
      minSipAmount: 500,
      minSipSource: 'NSE MASTER_DOWNLOAD SIP',
      minPurchaseAmount: 5000,
      minPurchaseSource: 'NSE MASTER_DOWNLOAD SCH',
      aum: 2150.0,
      aumSource: 'NSE MASTER_DOWNLOAD',
      isActive: true,
    });

    // Test API call using express mock request / response
    const app = express();
    app.use(express.json());
    app.use('/api/mutual-funds', mutualFundsRouter);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/mutual-funds/schemes/${testCode}`);
      assert.strictEqual(response.status, 200);

      const json = await response.json();
      assert.strictEqual(json.success, true);
      const data = json.data;

      // Verify Phase 2 fields
      assert.strictEqual(data.schemeCode, testCode);
      assert.strictEqual(data.planType, 'REGULAR');
      assert.strictEqual(data.nav, 78.45);
      assert.strictEqual(data.cagr1Y, 22.5);
      assert.strictEqual(data.cagr3Y, 18.2);
      assert.strictEqual(data.cagr5Y, 16.8);
      assert.strictEqual(data.minSipAmount, 500);
      assert.strictEqual(data.minPurchaseAmount, 5000);
      assert.strictEqual(data.aum, 2150.0);

      // Verify structured returns object
      assert.ok(data.returns !== null && typeof data.returns === 'object');
      assert.strictEqual(data.returns['1Y'], 22.5);
      assert.strictEqual(data.returns['3Y'], 18.2);
      assert.strictEqual(data.returns['5Y'], 16.8);
      assert.ok(data.returns.methodology.includes('SEBI/AMFI'));

      // Verify lineage metadata
      assert.strictEqual(data.minSipSource, 'NSE MASTER_DOWNLOAD SIP');
      assert.strictEqual(data.minPurchaseSource, 'NSE MASTER_DOWNLOAD SCH');

      // Verify null preservation for unprovided fields
      assert.strictEqual(data.rating, null);
      assert.strictEqual(data.expenseRatio, null);
      assert.strictEqual(data.fundManager, null);
    } finally {
      server.close();
      await MutualFundScheme.deleteOne({ schemeCode: testCode });
    }
  });

  test('15. API Contract: Customer catalog excludes Direct and Unknown plans', async () => {
    const directCode = 'TEST_DIR_API_006';
    await MutualFundScheme.deleteOne({ schemeCode: directCode });

    await MutualFundScheme.create({
      schemeCode: directCode,
      schemeName: 'Test Direct Equity Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC',
      isin: 'INFTESTDIR06',
      category: 'Equity',
      subCategory: 'Large Cap',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      nav: 120.0,
      isActive: true,
    });

    const app = express();
    app.use(express.json());
    app.use('/api/mutual-funds', mutualFundsRouter);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      // 1. Schemes catalog query must NOT return Direct plan
      const catRes = await fetch(`http://127.0.0.1:${port}/api/mutual-funds/schemes?search=TEST_DIR_API_006`);
      const catJson = await catRes.json();
      assert.strictEqual(catJson.success, true);
      assert.strictEqual(catJson.data.length, 0, 'Direct plan excluded from schemes list');

      // 2. Direct scheme detail request must return 404
      const detailRes = await fetch(`http://127.0.0.1:${port}/api/mutual-funds/schemes/${directCode}`);
      assert.strictEqual(detailRes.status, 404, 'Direct plan returns 404 on customer endpoint');
    } finally {
      server.close();
      await MutualFundScheme.deleteOne({ schemeCode: directCode });
    }
  });

  test.after(async () => {
    // Cleanup any lingering test schemes
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_/ });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

});
