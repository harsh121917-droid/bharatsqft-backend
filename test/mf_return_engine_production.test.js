const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateFundReturns,
  findTradingDayNav,
  subtractMonths,
  subtractYears,
} = require('../services/mfReturnEngine');

describe('VikaOne Production — Authoritative Return Engine Tests', () => {
  const baseEndNav = 150.0;
  const endDateStr = '2026-10-01'; // Thursday

  // Generate synthetic timeseries for mathematical determinism
  const mockSeries = [
    { date: '2021-10-01', nav: 75.0 },   // 5Y target
    { date: '2023-09-29', nav: 100.0 },  // 3Y target (Oct 1 2023 was Sunday -> Fri Sep 29)
    { date: '2025-10-01', nav: 125.0 },  // 1Y target
    { date: '2026-04-01', nav: 135.0 },  // 6M target
    { date: '2026-07-01', nav: 140.0 },  // 3M target
    { date: '2026-09-01', nav: 145.0 },  // 1M target
    { date: '2026-10-01', nav: baseEndNav }, // End
  ];

  it('1. Exact calendar lookback for 1M, 3M, 6M (no 91/182 day approximations)', () => {
    const end = new Date('2026-10-01');
    const d1M = subtractMonths(end, 1);
    const d3M = subtractMonths(end, 3);
    const d6M = subtractMonths(end, 6);

    assert.strictEqual(d1M.toISOString().split('T')[0], '2026-09-01');
    assert.strictEqual(d3M.toISOString().split('T')[0], '2026-07-01');
    assert.strictEqual(d6M.toISOString().split('T')[0], '2026-04-01');
  });

  it('2. Weekend target date selects immediately preceding business day NAV', () => {
    // 2023-10-01 was a Sunday. Preceding Friday was 2023-09-29
    const targetDate = new Date('2023-10-01');
    const match = findTradingDayNav(targetDate, mockSeries);
    assert.ok(match, 'Trading day match must be found');
    assert.strictEqual(match.date, '2023-09-29');
    assert.strictEqual(match.matchType, 'PRECEDING_TRADING_DAY');
    assert.strictEqual(match.nav, 100.0);
  });

  it('3. Month-end date subtraction handles differing month lengths safely', () => {
    // March 31 minus 1 month must safely clip to last day of February
    const march31 = new Date('2026-03-31T00:00:00.000Z');
    const febEnd = subtractMonths(march31, 1);
    assert.strictEqual(febEnd.getMonth(), 1, 'Must be February (index 1)');
    assert.strictEqual(febEnd.getDate(), 28, 'Must be Feb 28 in 2026 (non-leap year)');

    // May 31 minus 3 months -> Feb 28
    const may31 = new Date('2026-05-31T00:00:00.000Z');
    const febFromMay = subtractMonths(may31, 3);
    assert.strictEqual(febFromMay.getMonth(), 1);
    assert.strictEqual(febFromMay.getDate(), 28);
  });

  it('4. Leap-year subtraction handles Feb 29 safely without month spillover', () => {
    const leapDate = new Date('2024-02-29T00:00:00.000Z');
    const prevYear = subtractYears(leapDate, 1);
    assert.strictEqual(prevYear.toISOString().split('T')[0], '2023-02-28');
  });

  it('5. Point-to-point simple absolute return for <= 1 Year', () => {
    const series1Y = [
      { date: '2025-10-01', nav: 100.0 },
      { date: '2026-10-01', nav: 120.0 }, // +20.00%
    ];
    const ret = calculateFundReturns(series1Y);
    assert.strictEqual(ret.returns['1Y'], 20.0);
    assert.strictEqual(ret.provenance['1Y'].formula, '((endNav - startNav) / startNav) * 100');
  });

  it('6. Multi-year CAGR formula for 3Y and 5Y', () => {
    // NAV went from 100 to 150 over 3 years: CAGR = (150/100)^(1/3) - 1 = 14.47%
    const res = calculateFundReturns(mockSeries, { schemeCode: '130502' });
    assert.strictEqual(res.returns['3Y'], 14.47);
    assert.strictEqual(res.provenance['3Y'].formula, '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100');
    assert.strictEqual(res.provenance['3Y'].targetDate, '2023-10-01');
    assert.strictEqual(res.provenance['3Y'].selectedNavDate, '2023-09-29');
    assert.strictEqual(res.provenance['3Y'].startNAV, 100.0);
    assert.strictEqual(res.provenance['3Y'].endNAV, 150.0);
  });

  it('7. All return methodology labels CAGR_SINCE_INCEPTION only when matching inception date', () => {
    // Inception matching earliest date
    const incMatch = calculateFundReturns(mockSeries, { inceptionDate: '2021-10-01' });
    assert.strictEqual(incMatch.allReturnMethodology, 'CAGR_SINCE_INCEPTION');

    // Inception earlier than available series start
    const seriesStart = calculateFundReturns(mockSeries, { inceptionDate: '2010-01-01' });
    assert.strictEqual(seriesStart.allReturnMethodology, 'CAGR_SINCE_AVAILABLE_SERIES_START');
    assert.strictEqual(seriesStart.allStartDate, '2021-10-01');
    assert.strictEqual(seriesStart.allStartNav, 75.0);
    assert.strictEqual(seriesStart.allEndDate, '2026-10-01');
    assert.strictEqual(seriesStart.allEndNav, 150.0);
    assert.ok(seriesStart.allElapsedYears > 0);
  });

  it('8. Insufficient history returns clean nulls without throw or synthetic manufacture', () => {
    const shortSeries = [
      { date: '2026-09-25', nav: 100.0 },
      { date: '2026-10-01', nav: 101.5 },
    ];
    const ret = calculateFundReturns(shortSeries);
    assert.strictEqual(ret.returns['1M'], null);
    assert.strictEqual(ret.returns['3M'], null);
    assert.strictEqual(ret.returns['1Y'], null);
    assert.strictEqual(ret.returns['3Y'], null);
    assert.strictEqual(ret.returns['5Y'], null);
  });
});
