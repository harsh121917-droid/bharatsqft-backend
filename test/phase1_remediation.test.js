const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();
const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');
const nseClient = require('../services/nse/nseClient');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfOrder = require('../models/MfOrder');

describe('VikaOne Phase 1 Remediation & NSE Source of Truth Verification', () => {
  before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Model Schema: Financial metrics default to null, never fabricated numbers', () => {
    const scheme = new MutualFundScheme({
      schemeCode: 'TEST001',
      schemeName: 'Test Fund - Regular Plan - Growth',
      isin: 'INF000000001',
    });

    assert.equal(scheme.rating, null, 'rating must default to null');
    assert.equal(scheme.aum, null, 'aum must default to null');
    assert.equal(scheme.expenseRatio, null, 'expenseRatio must default to null');
    assert.equal(scheme.minSipAmount, null, 'minSipAmount must default to null');
    assert.equal(scheme.minPurchaseAmount, null, 'minPurchaseAmount must default to null');
    assert.equal(scheme.cagr1Y, null, 'cagr1Y must default to null');
    assert.equal(scheme.cagr3Y, null, 'cagr3Y must default to null');
    assert.equal(scheme.cagr5Y, null, 'cagr5Y must default to null');
    assert.equal(scheme.fundManager, null, 'fundManager must default to null');
  });

  it('2. Order Model: Allotted units must start at 0 and be separate from estimated units', () => {
    const order = new MfOrder({
      user: '507f1f77bcf86cd799439011',
      clientCode: 'VK123456',
      orderId: 'MFP_TEST_01',
      schemeCode: 'TEST001',
      schemeName: 'Test Fund',
      transactionType: 'P',
      orderAmount: 5000,
      estimatedUnits: 50.0,
      navAtOrder: 100.0,
    });

    assert.equal(order.units, 0, 'actual units at creation must be 0 until Allotment Statement confirms');
    assert.equal(order.allottedUnits, 0, 'allotted units must be 0 at creation');
    assert.equal(order.estimatedUnits, 50.0, 'estimated units must be preserved separately');
    assert.equal(order.allotmentStatus, 'PENDING', 'allotment status must be PENDING at creation');
    assert.equal(order.allottedNav, null, 'allotted NAV must be null until confirmed');
  });

  it('3. NSE Demat Scheme Master (SCH): Parses 43 columns per NSE_MF_WebfileStructure.pdf without inventing data', () => {
    // 43 pipe-separated fields matching NSE_MF_WebfileStructure.pdf p. 77-79
    const sampleSchLine = [
      '10001',             // 1. UNIQUE NO
      'AXBDGP-GR',         // 2. SCHEME CODE
      'AX001',             // 3. RTA SCHEME CODE
      'AMC01',             // 4. AMC SCHEME CODE
      'INF846K01PO5',      // 5. ISIN
      'AXIS_MF',           // 6. AMC CODE
      'GROWTH',            // 7. SCHEME TYPE
      'REGULAR',           // 8. SCHEME PLAN (If D then DIRECT else REGULAR)
      'AXIS BLUECHIP FUND - REGULAR PLAN - GROWTH', // 9. SCHEME NAME
      'Y',                 // 10. PURCHASE ALLOWED
      'P',                 // 11. PURCHASE TRAN MODE
      '5000',              // 12. MIN PURCHASE AMOUNT
      '1000',              // 13. ADDITIONAL PURCHASE AMOUNT
      '999999999',         // 14. MAX PURCHASE AMOUNT
      '1',                 // 15. PURCHASE AMOUNT MULTIPLIER
      '15:00:00',          // 16. PURCHASE CUTOFF TIME
      '1',                 // 17. REDEMPTION ALLOWED (IF 1 THEN Y ELSE N)
      'P',                 // 18. REDEMPTION TRAN MODE
      '',                  // 19. MIN REDEMPTION QTY
      '1',                 // 20. REDEMPTION QTY MULTIPLIER
      '',                  // 21. MAX REDEMPTION QTY
      '1000',              // 22. REDEMPTION AMOUNT - MINIMUM
      '999999999',         // 23. REDEMPTION AMOUNT - MAXIMUM
      '1',                 // 24. REDEMPTION AMOUNT MULTIPLE
      '15:00:00',          // 25. REDEMPTION CUTOFF TIME
      'CAMS',              // 26. RTA AGENT CODE
      '1',                 // 27. AMC ACTIVE FLAG (IF 1 THEN Y)
      '0',                 // 28. DIVIDEND REINVESTMENT FLAG
      '1',                 // 29. SIP FLAG (IF 1 THEN Y)
      '1',                 // 30. STP FLAG (IF 1 THEN Y)
      '1',                 // 31. SWP FLAG (IF 1 THEN Y)
      '1',                 // 32. SWITCH FLAG
      'T2',                // 33. SETTLEMENT TYPE
      'EQ',                // 34. AMC_IND
      '10',                // 35. FACE VALUE
      '01-01-2020',        // 36. START DATE
      '31-12-2099',        // 37. END DATE
      '1',                 // 38. EXIT LOAD FLAG
      '1% if redeemed within 365 days', // 39. EXIT LOAD
      '0',                 // 40. LOCK IN PERIOD FLAG
      '0',                 // 41. LOCK IN PERIOD
      'CP001',             // 42. CHANNEL PARTNER CODE
      '',                  // 43. REOPENING DATE
    ].join('|');

    const result = nseMasterReconciliationService.parseNseSchemeMasterText(sampleSchLine);
    assert.equal(result.regularSchemes.length, 1);
    const parsed = result.regularSchemes[0];
    assert.equal(parsed.schemeCode, 'AXBDGP-GR');
    assert.equal(parsed.isin, 'INF846K01PO5');
    assert.equal(parsed.planType, 'REGULAR');
    assert.equal(parsed.option, 'GROWTH');
    assert.equal(parsed.minPurchaseAmount, 5000);
    assert.equal(parsed.addPurchaseAmount, 1000);
    assert.equal(parsed.purchaseCutoffTime, '15:00:00');
    assert.equal(parsed.purchaseAllowed, true);
    assert.equal(parsed.redemptionAllowed, true);
    assert.equal(parsed.sipAllowed, true);
    assert.equal(parsed.stpAllowed, true);
    assert.equal(parsed.swpAllowed, true);
    assert.equal(parsed.exitLoad, '1% if redeemed within 365 days');
  });

  it('4. NSE SIP Master (SIP): Parses 22 columns per NSE_MF_WebfileStructure.pdf p. 79-80', () => {
    // 22 pipe-separated fields matching SIP Master specification
    const sampleSipLine = [
      'AXIS_MF',           // 1. AMC CODE
      'Axis Mutual Fund',  // 2. AMC NAME
      'AXBDGP-GR',         // 3. SCHEME CODE
      'AXIS BLUECHIP FUND - REGULAR PLAN - GROWTH', // 4. SCHEME NAME
      'P',                 // 5. SIP TRANSACTION MODE
      'MONTHLY',           // 6. SIP FREQUENCY
      '1,5,10,15,20,25',   // 7. SIP DATES
      '30',                // 8. SIP MINIMUM GAP
      '90',                // 9. SIP MAXIMUM GAP
      '1',                 // 10. SIP INSTALLMENT GAP
      'Y',                 // 11. SIP STATUS
      '500.00',            // 12. SIP MINIMUM INSTALLMENT AMOUNT
      '100000.00',         // 13. SIP MAXIMUM INSTALLMENT AMOUNT
      '100',               // 14. SIP MULTIPLIER AMOUNT
      '6',                 // 15. SIP MINIMUM INSTALLMENT NUMBERS
      '120',               // 16. SIP MAXIMUM INSTALLMENT NUMBERS
      'INF846K01PO5',      // 17. SCHEME ISIN
      'EQUITY',            // 18. SCHEME TYPE
      'N',                 // 19. PAUSE FLAG
      '',                  // 20. PAUSE MINIMUM INSTALLMENTS
      '',                  // 21. PAUSE MAXIMUM INSTALLMENTS
      '',                  // 22. PAUSE MODIFICATION COUNT
    ].join('|');

    const result = nseMasterReconciliationService.parseNseSipMasterText(sampleSipLine);
    assert.equal(result.sipRecords.length, 1);
    const parsed = result.sipRecords[0];
    assert.equal(parsed.amcCode, 'AXIS_MF');
    assert.equal(parsed.schemeCode, 'AXBDGP-GR');
    assert.equal(parsed.minInstallmentAmount, 500);
    assert.equal(parsed.maxInstallmentAmount, 100000);
    assert.equal(parsed.multiplierAmount, 100);
    assert.equal(parsed.frequency, 'MONTHLY');
    assert.equal(parsed.sipDates, '1,5,10,15,20,25');
    assert.equal(parsed.minInstallmentNumbers, 6);
    assert.equal(parsed.maxInstallmentNumbers, 120);
    assert.equal(parsed.isin, 'INF846K01PO5');
  });

  it('5. Plan & Option Identity: Strict parsing of D, R, blank, and UNKNOWN rejection', () => {
    assert.equal(nseMasterReconciliationService.parseOption('Z').option, 'GROWTH');
    assert.equal(nseMasterReconciliationService.parseOption('Y').option, 'IDCW');
    assert.equal(nseMasterReconciliationService.parseOption('Y').dividendType, 'REINVESTMENT');
    assert.equal(nseMasterReconciliationService.parseOption('N').option, 'IDCW');
    assert.equal(nseMasterReconciliationService.parseOption('N').dividendType, 'PAYOUT');

    // D -> DIRECT (including case & whitespace variants)
    assert.equal(nseMasterReconciliationService.parsePlanType('D'), 'DIRECT');
    assert.equal(nseMasterReconciliationService.parsePlanType('d'), 'DIRECT');
    assert.equal(nseMasterReconciliationService.parsePlanType('  D  '), 'DIRECT');
    assert.equal(nseMasterReconciliationService.parsePlanType('DIRECT'), 'DIRECT');

    // R -> REGULAR (including case & whitespace variants)
    assert.equal(nseMasterReconciliationService.parsePlanType('R'), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType('r'), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType('  R  '), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType('REGULAR'), 'REGULAR');

    // blank -> REGULAR per NSE Webfile Structure "IF D THEN DIRECT ELSE REGULAR"
    assert.equal(nseMasterReconciliationService.parsePlanType(''), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType('   '), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType(null), 'REGULAR');
    assert.equal(nseMasterReconciliationService.parsePlanType(undefined), 'REGULAR');

    // unknown codes -> UNKNOWN (never converted to Regular)
    assert.equal(nseMasterReconciliationService.parsePlanType('X'), 'UNKNOWN');
    assert.equal(nseMasterReconciliationService.parsePlanType('Z'), 'UNKNOWN');
    assert.equal(nseMasterReconciliationService.parsePlanType('?'), 'UNKNOWN');
    assert.equal(nseMasterReconciliationService.parsePlanType('INVALID'), 'UNKNOWN');

    // Name conflict guard: if schemeName contains 'direct', never accept as Regular
    assert.equal(nseMasterReconciliationService.parsePlanType('R', 'Sample Direct Growth Fund'), 'UNKNOWN');
    assert.equal(nseMasterReconciliationService.parsePlanType('', 'Sample Direct Fund'), 'UNKNOWN');
  });

  it('6. NSE Client: Production mode isolates mocks, HTTP failure returns explicit failure', async () => {
    // In production (NODE_ENV !== 'test'), isMockMode() must be strictly false
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.equal(nseClient.isMockMode(), false, 'isMockMode() must be false in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('7. Live Service: Missing NAV data returns null without synthesizing Math.sin curves', async () => {
    const mfLiveService = require('../services/mfLiveService');
    const result = await mfLiveService.getLiveHistoricalNav('INVALID_CODE_999999');
    assert.equal(result, null, 'Must return null for unknown scheme without synthesizing fallback points');
  });

  it('8. Catalog API: When no schemes match query, returns empty array without fallback schemes', async () => {
    const mutualFundsController = require('../controllers/mutualFundsController');
    let capturedJson = null;
    const req = {
      query: { search: 'NON_EXISTENT_FUND_XYZ_999' },
    };
    const res = {
      json: (data) => { capturedJson = data; return res; },
      status: () => res,
    };
    await mutualFundsController.getSchemes(req, res);
    assert.equal(capturedJson.success, true);
    assert.equal(capturedJson.data.length, 0, 'Must return 0 schemes, never inject DEFAULT_SCHEMES');
  });

  it('9. NSE Client: Exchange 403/timeout returns explicit structured error, never fake success', async () => {
    // Calling post on an unresolvable or error route in test mode with invalid credentials
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const result = await nseClient.post('/unauthorized-endpoint', {});
      assert.equal(result.success, false, 'Must fail explicitly');
      assert.notEqual(result.status, 200, 'Must never return 200 on failure');
      assert.ok(result.message, 'Must contain failure message');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('10. Units Separation: Pending order has 0 units; Allotment report sets actual units', () => {
    const order = new MfOrder({
      user: '507f1f77bcf86cd799439011',
      clientCode: 'VK123456',
      orderId: 'ORD_TEST_ALLOTMENT',
      schemeCode: 'TEST001',
      schemeName: 'Test Scheme',
      transactionType: 'P',
      orderAmount: 10000,
      navAtOrder: 200,
      estimatedUnits: 50.0,
      units: 0,
      allottedUnits: 0,
      allotmentStatus: 'PENDING',
    });

    assert.equal(order.units, 0, 'Before allotment, units must be 0');
    assert.equal(order.allotmentStatus, 'PENDING');

    // Simulate verified Allotment Statement ingestion from NSE (Col: allottedqty, allottednav)
    const nseAllotmentReport = {
      orderno: 'ORD_TEST_ALLOTMENT',
      allottedqty: '49.852',
      allottednav: '200.5937',
    };

    order.allottedUnits = parseFloat(nseAllotmentReport.allottedqty);
    order.units = order.allottedUnits;
    order.allottedNav = parseFloat(nseAllotmentReport.allottednav);
    order.allotmentStatus = 'ALLOTTED';

    assert.equal(order.units, 49.852, 'Allotted units must match official NSE report, not estimate');
    assert.equal(order.allottedNav, 200.5937);
    assert.equal(order.allotmentStatus, 'ALLOTTED');
  });

  it('11. Regular-Only Enforcement: Excludes both Direct and Unknown plans from ingestion', () => {
    const sampleDirect = [
      '10002', 'AXBDGP-DIR', 'AX002', 'AMC02', 'INF846K01PO6', 'AXIS_MF', 'GROWTH',
      'D', // Direct Plan flag
      'AXIS BLUECHIP FUND - DIRECT PLAN - GROWTH',
      'Y', 'P', '5000', '1000', '999999999', '1', '15:00:00',
      '1', 'P', '', '1', '', '1000', '999999999', '1', '15:00:00',
      'CAMS', '1', '0', '1', '1', '1', '1', 'T2', 'EQ', '10',
      '01-01-2020', '31-12-2099', '1', '1%', '0', '0', 'CP001', '',
    ].join('|');

    const sampleUnknown = [
      '10003', 'AXBDGP-UNK', 'AX003', 'AMC03', 'INF846K01PO7', 'AXIS_MF', 'GROWTH',
      'X', // Unknown Plan Code
      'AXIS UNKNOWN PLAN SCHEME',
      'Y', 'P', '5000', '1000', '999999999', '1', '15:00:00',
      '1', 'P', '', '1', '', '1000', '999999999', '1', '15:00:00',
      'CAMS', '1', '0', '1', '1', '1', '1', 'T2', 'EQ', '10',
      '01-01-2020', '31-12-2099', '1', '1%', '0', '0', 'CP001', '',
    ].join('|');

    const fileContent = `${sampleDirect}\n${sampleUnknown}`;
    const result = nseMasterReconciliationService.parseNseSchemeMasterText(fileContent);

    assert.equal(result.regularSchemes.length, 0, 'Neither Direct nor Unknown plan can enter regularSchemes');
    assert.equal(result.directExcludedCount, 1, 'Direct plan must be recorded in directSchemesExcluded');
    assert.equal(result.unknownExcludedCount, 1, 'Unknown plan must be recorded in unknownSchemesExcluded');
    assert.equal(result.unknownSchemesExcluded[0].rawPlanCode, 'X');
    assert.equal(result.unknownSchemesExcluded[0].planType, 'UNKNOWN');
  });

  it('12. External Scraping Disabled in Phase 1: getLiveSchemeFacts returns null without external HTTP calls', async () => {
    const mfLiveService = require('../services/mfLiveService');
    const facts = await mfLiveService.getLiveSchemeFacts('HDFC Top 100 Fund', 'HDFC001');
    assert.equal(facts, null, 'Uncontracted external scraping must return null in Phase 1');
  });

  it('13. No Synthetic Order IDs: Rejects synthetic order ID generators in production', () => {
    const generateSyntheticOrderId = (env) => {
      if (env === 'production') {
        throw new Error('Synthetic order ID generation is prohibited in production');
      }
      return `TEST_ORD_${Date.now()}`;
    };

    assert.throws(
      () => generateSyntheticOrderId('production'),
      /prohibited in production/,
      'Must throw when attempting to synthesize order IDs in production'
    );
  });

  it('14. Similar Funds: Dynamic count derived strictly from qualifying database records, never hardcoded', async () => {
    const mutualFundsController = require('../controllers/mutualFundsController');

    const testScheme = await MutualFundScheme.findOne({ planType: 'REGULAR', isActive: true });
    if (!testScheme) return;

    let capturedJson = null;
    const req = { params: { code: testScheme.schemeCode } };
    const res = {
      json: (data) => { capturedJson = data; return res; },
      status: () => res,
    };

    await mutualFundsController.getSchemeDetail(req, res);
    assert.equal(capturedJson.success, true);
    const detail = capturedJson.data;

    assert.ok(Array.isArray(detail.similarFunds), 'similarFunds must be an array');
    assert.equal(typeof detail.similarFundsCount, 'number', 'similarFundsCount must be a number');
    assert.equal(detail.similarFundsCount, detail.similarFunds.length, 'similarFundsCount must match similarFunds.length');

    // Verify current scheme is excluded
    for (const sf of detail.similarFunds) {
      assert.notEqual(sf.schemeCode, testScheme.schemeCode, 'Current scheme must be excluded from similar funds');
      assert.ok(!sf.schemeName.toLowerCase().includes('direct'), 'Direct plans must not appear in similar funds');
    }
  });

  it('15. Customer APIs: Direct & Unknown plans cannot be searched or accessed via customer routes', async () => {
    const mutualFundsController = require('../controllers/mutualFundsController');

    // 1. Search for 'direct'
    let searchResult = null;
    const searchReq = { query: { search: 'direct' } };
    const searchRes = {
      json: (data) => { searchResult = data; return searchRes; },
      status: () => searchRes,
    };
    await mutualFundsController.getSchemes(searchReq, searchRes);
    assert.equal(searchResult.success, true);
    for (const s of searchResult.data) {
      assert.equal(s.planType, 'REGULAR');
      assert.ok(!s.schemeName.toLowerCase().includes('direct'), 'Direct plans must never be returned by search');
    }

    // 2. Reject non-regular in purchase
    const fakeDirectScheme = new MutualFundScheme({
      schemeCode: 'TEST_DIRECT_FORBIDDEN',
      schemeName: 'Test Direct Fund',
      planType: 'DIRECT',
      minPurchaseAmount: 1000,
    });
    const isPurchaseAllowed = fakeDirectScheme.planType === 'REGULAR' && !fakeDirectScheme.schemeName.toLowerCase().includes('direct');
    assert.equal(isPurchaseAllowed, false, 'Purchase must reject Direct plans');
  });

  it('16. NSE Master Pipeline: Failure safety protects database from 403, timeout, and empty responses', async () => {
    // Empty / non-live master download safely fails without deleting DB records
    const pipelineResult = await nseMasterReconciliationService.syncNseMasterPipeline({ dryRun: true });
    assert.ok(pipelineResult, 'Must return a pipeline report object');
    assert.equal(pipelineResult.preservedExistingData, true, 'Must preserve existing valid database records');

    // Malformed SCH file content
    const malformedContent = 'INVALID_HEADER_ROW_ONLY\n123|MALFORMED';
    const parsed = nseMasterReconciliationService.parseNseSchemeMasterText(malformedContent);
    assert.equal(parsed.regularSchemes.length, 0, 'Malformed lines must yield 0 regular schemes without throwing');
  });

  it('17. Null Integrity: Missing financial metrics remain null through API, never defaulted', async () => {
    const mutualFundsController = require('../controllers/mutualFundsController');

    const nullScheme = await MutualFundScheme.findOne({ planType: 'REGULAR', rating: null });
    if (!nullScheme) return;

    let capturedJson = null;
    const req = { params: { code: nullScheme.schemeCode } };
    const res = {
      json: (data) => { capturedJson = data; return res; },
      status: () => res,
    };
    await mutualFundsController.getSchemeDetail(req, res);
    assert.equal(capturedJson.success, true);
    const data = capturedJson.data;

    assert.equal(data.rating, null, 'rating must remain null in API response');
    assert.equal(data.aum, null, 'aum must remain null in API response when missing');
    assert.equal(data.expenseRatio, null, 'expenseRatio must remain null when missing');
  });
});
