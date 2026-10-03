const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  subtractMonths,
  subtractYears,
  findTradingDayNav,
  calculateFundReturns,
} = require('../services/mfReturnEngine');

describe('VikaOne Phase 5C — Return Date Engine Edge Cases & Calendar Tests', () => {
  it('1. Month-End Date: March 31 minus 1 month lands on February 28/29 (no month-end overflow to March)', () => {
    // Non-leap year 2023
    const mar31_2023 = new Date('2023-03-31T00:00:00.000Z');
    const feb2023 = subtractMonths(mar31_2023, 1);
    assert.strictEqual(feb2023.toISOString().split('T')[0], '2023-02-28');

    // Leap year 2024
    const mar31_2024 = new Date('2024-03-31T00:00:00.000Z');
    const feb2024 = subtractMonths(mar31_2024, 1);
    assert.strictEqual(feb2024.toISOString().split('T')[0], '2024-02-29');

    // August 31 minus 3 months lands on May 31
    const aug31 = new Date('2026-08-31T00:00:00.000Z');
    const may31 = subtractMonths(aug31, 3);
    assert.strictEqual(may31.toISOString().split('T')[0], '2026-05-31');
  });

  it('2. February Edge Case: May 31 minus 3 months correctly adjusts to February month-end', () => {
    const may31_2025 = new Date('2025-05-31T00:00:00.000Z');
    const febResult = subtractMonths(may31_2025, 3);
    assert.strictEqual(febResult.toISOString().split('T')[0], '2025-02-28');
  });

  it('3. Leap Year: February 29 minus 1 year adjusts safely to February 28', () => {
    const leapDay = new Date('2024-02-29T00:00:00.000Z');
    const prevYear = subtractYears(leapDay, 1);
    assert.strictEqual(prevYear.toISOString().split('T')[0], '2023-02-28');

    const next3Years = subtractYears(leapDay, 4);
    assert.strictEqual(next3Years.toISOString().split('T')[0], '2020-02-29');
  });

  it('4. Weekend: Target date falling on Sunday/Saturday selects immediately preceding Friday NAV', () => {
    const series = [
      { date: '2026-09-18', nav: 100.0 }, // Friday
      { date: '2026-09-21', nav: 101.5 }, // Monday
    ];

    // Target is Sunday 2026-09-20
    const sunday = new Date('2026-09-20T00:00:00.000Z');
    const match = findTradingDayNav(sunday, series);
    assert.ok(match, 'Must find a trading day NAV');
    assert.strictEqual(match.date, '2026-09-18', 'Must select preceding Friday 2026-09-18');
    assert.strictEqual(match.matchType, 'PRECEDING_TRADING_DAY');
    assert.strictEqual(match.nav, 100.0);
  });

  it('5. Market Holiday: Mid-week holiday selects preceding business day NAV', () => {
    // Oct 2 (Gandhi Jayanti) is Friday holiday; preceding business day is Oct 1 Thursday
    const series = [
      { date: '2026-10-01', nav: 150.0 }, // Thursday
      { date: '2026-10-05', nav: 152.0 }, // Monday
    ];

    const holiday = new Date('2026-10-02T00:00:00.000Z');
    const match = findTradingDayNav(holiday, series);
    assert.ok(match);
    assert.strictEqual(match.date, '2026-10-01', 'Must select preceding Thursday');
    assert.strictEqual(match.matchType, 'PRECEDING_TRADING_DAY');
  });

  it('6. Missing NAV Date: Missing date in timeseries falls back to preceding trading day within window', () => {
    const series = [
      { date: '2026-05-10', nav: 200.0 },
      { date: '2026-05-14', nav: 204.0 },
    ];

    // Target is 2026-05-12 (missing)
    const target = new Date('2026-05-12T00:00:00.000Z');
    const match = findTradingDayNav(target, series);
    assert.ok(match);
    assert.strictEqual(match.date, '2026-05-10');
    assert.strictEqual(match.matchType, 'PRECEDING_TRADING_DAY');
  });

  it('7. First Available NAV: If target date precedes timeseries, subsequent day is used if within lookback', () => {
    const series = [
      { date: '2026-01-05', nav: 50.0 }, // First point in series
      { date: '2026-01-06', nav: 50.5 },
    ];

    // Target is 2026-01-02 (3 days before series start)
    const target = new Date('2026-01-02T00:00:00.000Z');
    const match = findTradingDayNav(target, series);
    assert.ok(match);
    assert.strictEqual(match.date, '2026-01-05', 'Must select first available trading day in forward window');
    assert.strictEqual(match.matchType, 'SUBSEQUENT_TRADING_DAY');
  });

  it('8. Insufficient History: Series with 0 or 1 point returns clean nulls without throw', () => {
    const zeroPoints = calculateFundReturns([], { schemeCode: 'TEST01' });
    assert.strictEqual(zeroPoints.returns['1M'], null);
    assert.strictEqual(zeroPoints.returns['3Y'], null);
    assert.strictEqual(zeroPoints.returns['All'], null);
    assert.strictEqual(zeroPoints.allReturnMethodology, 'INSUFFICIENT_DATA');

    const onePoint = calculateFundReturns([{ date: '2026-10-01', nav: 100.0 }], { schemeCode: 'TEST01' });
    assert.strictEqual(onePoint.returns['1M'], null);
    assert.strictEqual(onePoint.returns['3Y'], null);
    assert.strictEqual(onePoint.returns['All'], null);
  });
});
