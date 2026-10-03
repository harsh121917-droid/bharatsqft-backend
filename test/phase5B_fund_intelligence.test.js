/**
 * VikaOne Phase 5B — Complete Fund Intelligence, Authoritative Data Integration & API Completion Tests
 * 
 * Validates:
 * 1. Phase 5A Discrepancy Investigation & Object Key Bug Verification
 * 2. Canary Scheme (145139 - Invesco India Small Cap Fund) Complete Intelligence
 * 3. Multi-Scheme Representative Set (Large, Mid, Small, Flexi, ELSS, Hybrid, Debt)
 * 4. Regular-Only Strict Isolation & Zero-Direct Contamination
 * 5. Anti-Fabrication & Strict Null Propagation for Uncatalogued Schemes
 * 6. Field-Level Provenance & Audit Trail
 * 7. Section 22 API Contract & Backward Compatibility
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
require('dotenv').config();

const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');
const mfIntelligenceService = require('../services/mfIntelligenceService');

function createMockRes() {
  let statusCode = 200;
  let responseData = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('VikaOne Phase 5B — Complete Fund Intelligence & Authoritative Data Integration', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/bharatsqft';
      await mongoose.connect(uri);
    }
  });

  after(async () => {
    // Keep connection if other tests need it, or disconnect gracefully
  });

  // ─────────────────────────────────────────────────────────────
  // 1. INVESTIGATION: THE PHASE 5A AUDIT DISCREPANCY
  // ─────────────────────────────────────────────────────────────

  test('1. Discrepancy Investigation: Proves the duplicate object key bug { $ne: null, $ne: "" }', () => {
    // In JavaScript, { $ne: null, $ne: '' } collapses to { $ne: '' }
    const faultyQuery = { fundManager: { $ne: null, $ne: '' } };
    const keys = Object.keys(faultyQuery.fundManager);
    assert.strictEqual(keys.length, 1, 'Duplicate $ne key is lost in JS object literals');
    assert.strictEqual(faultyQuery.fundManager.$ne, '', 'The remaining key was $ne: "" which matched null BSON values');

    // The corrected non-null query is { $nin: [null, ''] }
    const correctQuery = { fundManager: { $nin: [null, ''] } };
    assert.deepStrictEqual(correctQuery.fundManager.$nin, [null, '']);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CANARY SCHEME END-TO-END VERIFICATION (145139)
  // ─────────────────────────────────────────────────────────────

  test('2. Canary Scheme (145139): Identity is strictly Regular Plan and Growth Option', async () => {
    const scheme = await MutualFundScheme.findOne({ schemeCode: '145139' });
    assert.ok(scheme, 'Canary scheme 145139 must exist in database');
    assert.strictEqual(scheme.planType, 'REGULAR');
    assert.strictEqual(scheme.option, 'GROWTH');
    assert.ok(!scheme.schemeName.toLowerCase().includes('direct'), 'Scheme name must not contain Direct');
  });

  test('3. Canary Scheme (145139): Statutory Fund Managers & Details populated from AMC SID', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    assert.strictEqual(res.getStatus(), 200);

    const d = res.getData()?.data;
    assert.ok(d, 'Data must be returned');
    assert.ok(d.fundManager.includes('Taher Badshah'), 'Fund manager must include Taher Badshah');
    assert.ok(d.fundManager.includes('Aditya Khemani'), 'Fund manager must include Aditya Khemani');
    assert.ok(Array.isArray(d.fundManagement) && d.fundManagement.length >= 2, 'Fund management details must have at least 2 managers');
    assert.strictEqual(d.fundManagement[0].name, 'Taher Badshah');
    assert.ok(d.fundManagement[0].experience.includes('28 years'));
  });

  test('4. Canary Scheme (145139): Benchmark, Exit Load, AUM & Regular TER verified from AMC disclosures', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    const d = res.getData()?.data;

    assert.strictEqual(d.benchmark, 'BSE 250 SmallCap TRI');
    assert.ok(d.exitLoad.includes('1% if redeemed/switched out within 1 year'));
    assert.strictEqual(d.aum, 14475.25);
    assert.strictEqual(d.expenseRatio, 1.84, 'Must be Regular TER (1.84%), never Direct TER');
    assert.strictEqual(d.riskometer, 'Very High');
    assert.strictEqual(new Date(d.inceptionDate).toISOString().split('T')[0], '2018-10-30');
  });

  test('5. Canary Scheme (145139): Authentic Top Holdings with exact weights (no synthetic data)', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    const d = res.getData()?.data;

    assert.ok(Array.isArray(d.holdings), 'Holdings must be an array');
    assert.strictEqual(d.holdings.length, 8, 'Canary scheme must have 8 authoritative holdings');

    // Verify holding weights and sectors from Invesco Monthly Factsheet
    const topHolding = d.holdings[0];
    assert.strictEqual(topHolding.name, 'KEl Industries Ltd');
    assert.strictEqual(topHolding.weight, 4.15);
    assert.strictEqual(topHolding.sector, 'Capital Goods');
    assert.strictEqual(d.holdingsSource, 'Invesco Mutual Fund Monthly Portfolio Disclosure (SEBI Mandated)');
  });

  test('6. Canary Scheme (145139): Data Provenance & Verification Metadata', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.dataProvenance, 'Data provenance must exist');
    assert.strictEqual(d.dataProvenance.source, 'AMC_OFFICIAL_FACTSHEET');
    assert.strictEqual(d.dataProvenance.status, 'VERIFIED');
    assert.strictEqual(d.dataProvenance.sourceDoc, 'Invesco_India_Smallcap_Fund_Factsheet_Sep_2026.pdf');
    assert.strictEqual(d.dataProvenance.asOfDate, '2026-09-30');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. MULTI-SCHEME REPRESENTATIVE SET VERIFICATION
  // ─────────────────────────────────────────────────────────────

  test('7. Multi-Scheme: Parag Parikh Flexi Cap (122640) - Rajeev Thakkar & 2Y Exit Load', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '122640' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.fundManager.includes('Rajeev Thakkar'));
    assert.strictEqual(d.benchmark, 'NIFTY 500 TRI');
    assert.strictEqual(d.aum, 147405.00);
    assert.strictEqual(d.expenseRatio, 1.31);
    assert.ok(d.exitLoad.includes('2.00% if redeemed within 365 days'));
    assert.strictEqual(d.planType, 'REGULAR');
  });

  test('8. Multi-Scheme: Nippon India Small Cap (113177) - Samir Rachh & Nifty Smallcap 250', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '113177' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.fundManager.includes('Samir Rachh'));
    assert.strictEqual(d.benchmark, 'Nifty Smallcap 250 TRI');
    assert.strictEqual(d.aum, 82580.00);
    assert.strictEqual(d.expenseRatio, 1.41);
  });

  test('9. Multi-Scheme: SBI ELSS Tax Saver (105628) - Nil Exit Load, 3Y Lock-in', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '105628' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.fundManager.includes('Milind Agrawal'));
    assert.strictEqual(d.benchmark, 'S&P BSE 500 TRI');
    assert.strictEqual(d.expenseRatio, 1.83);
    assert.ok(d.exitLoad.includes('3-Year Lock-in'));
  });

  test('10. Multi-Scheme: HDFC Balanced Advantage (100119) - Hybrid Fund Category', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '100119' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.fundManager.includes('Anil Bamboli'));
    assert.ok(d.benchmark.includes('NIFTY 50 Hybrid'));
    assert.strictEqual(d.aum, 107296.00);
    assert.strictEqual(d.expenseRatio, 1.29);
  });

  test('11. Multi-Scheme: Franklin India Banking & PSU Debt (129006) - Debt Category & Moderate Risk', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '129006' } }, res);
    const d = res.getData()?.data;

    assert.ok(d.fundManager.includes('Sachin Padwal-Desai'));
    assert.strictEqual(d.benchmark, 'NIFTY Banking & PSU Debt Index');
    assert.strictEqual(d.riskometer, 'Moderate');
    assert.strictEqual(d.expenseRatio, 0.65);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. ANTI-FABRICATION & STRICT NULL SAFETY
  // ─────────────────────────────────────────────────────────────

  test('12. Anti-Fabrication: Uncatalogued scheme preserves null (never injects fake numbers or ratings)', async () => {
    const catalogCodes = ['145139', '122640', '113177', '105628', '100119', '108466', '105989', '100177', '129006'];
    const uncatalogued = await MutualFundScheme.findOne({
      planType: 'REGULAR',
      schemeCode: { $nin: catalogCodes },
    }).lean();

    assert.ok(uncatalogued, 'Must have at least one uncatalogued Regular scheme');

    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: uncatalogued.schemeCode } }, res);
    const d = res.getData()?.data;

    // Uncatalogued fields must strictly be null, never fake placeholders
    if (!uncatalogued.fundManager) assert.strictEqual(d.fundManager, null);
    if (!uncatalogued.aum) assert.strictEqual(d.aum, null);
    if (!uncatalogued.expenseRatio) assert.strictEqual(d.expenseRatio, null);
    if (!uncatalogued.holdings || uncatalogued.holdings.length === 0) {
      assert.strictEqual(d.holdings, null);
      assert.strictEqual(d.topHoldings, null);
    }
  });

  test('13. Anti-Fabrication: Rating remains strictly null without licensed rating provider', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    const d = res.getData()?.data;

    // We do not have a contracted CRISIL/Morningstar rating license yet
    assert.strictEqual(d.rating, null, 'Rating must be null without licensed provider');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. REGULAR PLAN ONLY ENFORCEMENT
  // ─────────────────────────────────────────────────────────────

  test('14. Regular-Only: Direct Plan cannot be accessed via customer getSchemeDetail route (returns 404)', async () => {
    // Attempting to query with a Direct scheme code should return 404
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145140' } }, res); // hypothetical direct code
    assert.strictEqual(res.getStatus(), 404);
    assert.ok(res.getData()?.message.includes('Only Regular Plan mutual funds are available'));
  });

  // ─────────────────────────────────────────────────────────────
  // 6. SECTION 22 API CONTRACT & BACKWARD COMPATIBILITY
  // ─────────────────────────────────────────────────────────────

  test('15. Section 22 API Contract: Structured sub-objects fundDetails, investmentRules, portfolio, dataQuality', async () => {
    const res = createMockRes();
    await mutualFundsController.getSchemeDetail({ params: { code: '145139' } }, res);
    const d = res.getData()?.data;

    // 1. fundDetails structure
    assert.ok(d.fundDetails, 'fundDetails object must be present');
    assert.strictEqual(d.fundDetails.aum, 14475.25);
    assert.strictEqual(d.fundDetails.expenseRatio, 1.84);
    assert.ok(d.fundDetails.fundManager.includes('Taher Badshah'));
    assert.strictEqual(d.fundDetails.benchmark, 'BSE 250 SmallCap TRI');
    assert.strictEqual(d.fundDetails.riskometer, 'Very High');

    // 2. investmentRules structure
    assert.ok(d.investmentRules, 'investmentRules object must be present');
    assert.strictEqual(d.investmentRules.minPurchaseAmount, 1000);
    assert.strictEqual(d.investmentRules.minSipAmount, 500);
    assert.ok(Array.isArray(d.investmentRules.sipFrequencies));
    assert.ok(Array.isArray(d.investmentRules.sipDates));

    // 3. portfolio structure
    assert.ok(d.portfolio, 'portfolio object must be present');
    assert.ok(Array.isArray(d.portfolio.holdings) && d.portfolio.holdings.length === 8);
    assert.ok(new Date(d.portfolio.holdingsAsOf).toISOString().startsWith('2026-09-30'));

    // 4. dataQuality structure
    assert.ok(d.dataQuality, 'dataQuality object must be present');
    assert.strictEqual(d.dataQuality.status, 'VERIFIED');
    assert.strictEqual(d.dataQuality.source, 'AMC_OFFICIAL_FACTSHEET');

    // 5. Backward compatibility top-level fields
    assert.strictEqual(d.schemeCode, '145139');
    assert.strictEqual(d.planType, 'REGULAR');
    assert.strictEqual(d.fundManager, d.fundDetails.fundManager);
    assert.strictEqual(d.benchmark, d.fundDetails.benchmark);
    assert.strictEqual(d.aum, d.fundDetails.aum);
    assert.strictEqual(d.expenseRatio, d.fundDetails.expenseRatio);
  });
});
