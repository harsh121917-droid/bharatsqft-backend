const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateFundReturns } = require('../services/mfReturnEngine');

describe('VikaOne Phase 5C — Field-Level Data Provenance & Return Accuracy Tests', () => {
  // Mock timeseries for testing exact calendar calculations
  const mockSeries = [
    { date: '2014-06-30', nav: 21.121 },
    { date: '2021-10-01', nav: 73.778 },
    { date: '2023-09-29', nav: 104.940 }, // Preceding trading day for 2023-10-01 (Sunday)
    { date: '2023-10-03', nav: 105.819 }, // Following trading day (Gandhi Jayanti Oct 2)
    { date: '2025-10-01', nav: 140.225 },
    { date: '2026-04-01', nav: 121.825 },
    { date: '2026-04-02', nav: 122.197 },
    { date: '2026-07-01', nav: 136.957 },
    { date: '2026-07-02', nav: 138.512 },
    { date: '2026-09-01', nav: 140.263 },
    { date: '2026-10-01', nav: 134.978 },
  ];

  it('1. Generates exhaustive Section 0D audit metadata for every calculated period', () => {
    const result = calculateFundReturns(mockSeries, {
      schemeCode: '130502',
      planType: 'REGULAR',
      option: 'GROWTH',
    });

    assert.ok(result.provenance, 'Provenance object must be present');

    const periods = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'];
    for (const p of periods) {
      const meta = result.provenance[p];
      assert.ok(meta, `Provenance metadata for ${p} must exist`);
      assert.strictEqual(meta.period, p);
      assert.ok(meta.targetStartDate, `${p} targetStartDate must exist`);
      assert.ok(meta.selectedStartDate, `${p} selectedStartDate must exist`);
      assert.ok(meta.selectedStartNav > 0, `${p} selectedStartNav must be > 0`);
      assert.ok(meta.endDate, `${p} endDate must exist`);
      assert.ok(meta.endNav > 0, `${p} endNav must be > 0`);
      assert.strictEqual(typeof meta.elapsedDays, 'number');
      assert.strictEqual(typeof meta.elapsedYears, 'number');
      assert.ok(meta.formula, `${p} formula string must exist`);
      assert.strictEqual(typeof meta.calculatedReturn, 'number');
      assert.strictEqual(meta.planType, 'REGULAR');
      assert.strictEqual(meta.option, 'GROWTH');
      assert.strictEqual(meta.source, 'AMFI_DAILY_NAV_TIMESERIES');
      assert.strictEqual(meta.status, 'VERIFIED');
    }
  });

  it('2. Fixes 3M calendar lookback: selects 2026-07-01 (not 2026-07-02)', () => {
    const result = calculateFundReturns(mockSeries, { schemeCode: '130502' });
    const meta3M = result.provenance['3M'];

    assert.strictEqual(meta3M.targetStartDate, '2026-07-01');
    assert.strictEqual(meta3M.selectedStartDate, '2026-07-01');
    assert.strictEqual(meta3M.selectedStartNav, 136.957);
    assert.strictEqual(meta3M.formula, '((endNav - startNav) / startNav) * 100');
    assert.strictEqual(result.returns['3M'], -1.44);
  });

  it('3. Fixes 6M calendar lookback: selects 2026-04-01 (not 2026-04-02)', () => {
    const result = calculateFundReturns(mockSeries, { schemeCode: '130502' });
    const meta6M = result.provenance['6M'];

    assert.strictEqual(meta6M.targetStartDate, '2026-04-01');
    assert.strictEqual(meta6M.selectedStartDate, '2026-04-01');
    assert.strictEqual(meta6M.selectedStartNav, 121.825);
    assert.strictEqual(result.returns['6M'], 10.8);
  });

  it('4. Fixes 3Y trading-day lookback: selects preceding business day 2023-09-29', () => {
    const result = calculateFundReturns(mockSeries, { schemeCode: '130502' });
    const meta3Y = result.provenance['3Y'];

    assert.strictEqual(meta3Y.targetStartDate, '2023-10-01');
    assert.strictEqual(meta3Y.selectedStartDate, '2023-09-29');
    assert.strictEqual(meta3Y.selectedStartNav, 104.94);
    assert.strictEqual(meta3Y.matchType, 'PRECEDING_TRADING_DAY');
    assert.strictEqual(meta3Y.formula, '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100');
    assert.strictEqual(result.returns['3Y'], 8.75);
  });

  it('5. Section 0F: "All" return is transparently exposed with methodology & start metadata', () => {
    const result = calculateFundReturns(mockSeries, { schemeCode: '130502' });

    assert.strictEqual(result.allReturnMethodology, 'CAGR_SINCE_SERIES_START');
    assert.strictEqual(result.allStartDate, '2014-06-30');
    assert.strictEqual(result.allStartNav, 21.121);
    assert.strictEqual(result.allEndDate, '2026-10-01');
    assert.strictEqual(result.allEndNav, 134.978);
    assert.strictEqual(result.allSource, 'AMFI_DAILY_NAV_TIMESERIES');
    assert.strictEqual(result.returns['All'], 16.34);
  });

  it('6. Empty or single-item series returns clean null provenance without throw', () => {
    const emptyResult = calculateFundReturns([], { schemeCode: '130502' });
    assert.strictEqual(emptyResult.returns['1M'], null);
    assert.strictEqual(emptyResult.returns['3Y'], null);
    assert.strictEqual(emptyResult.returns['All'], null);

    const singleResult = calculateFundReturns([{ date: '2026-10-01', nav: 134.978 }]);
    assert.strictEqual(singleResult.returns['1M'], null);
    assert.strictEqual(singleResult.returns['All'], null);
  });
});
