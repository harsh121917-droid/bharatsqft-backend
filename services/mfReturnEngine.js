/**
 * VikaOne Mutual Fund — Unified Authoritative Return Calculation Engine
 * 
 * Rules:
 * 1. Calendar-aware date lookback (not fixed rough day counts).
 * 2. Preceding business day convention for weekends / market holidays.
 * 3. Exact point-to-point simple absolute return for <= 1 Year:
 *    ((endNav - startNav) / startNav) * 100
 * 4. Compound Annual Growth Rate (CAGR) for > 1 Year:
 *    ((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100
 * 5. Full field-level provenance and reproducibility metadata.
 * 6. Single source of truth shared by List API, Detail API, Sorting, and Crons.
 */

/**
 * Subtract calendar months from a date, handling month-end overflow safely
 */
function subtractMonths(date, months) {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() - months;
  const originalDay = d.getDate();
  d.setMonth(targetMonth);
  // Handle overflow (e.g. 31st March - 1 month shouldn't become March 3rd)
  if (d.getDate() !== originalDay) {
    d.setDate(0); // Set to last day of previous month
  }
  return d;
}

/**
 * Subtract calendar years from a date, handling leap-year overflow safely
 */
function subtractYears(date, years) {
  const d = new Date(date.getTime());
  const originalMonth = d.getMonth();
  d.setFullYear(d.getFullYear() - years);
  // Handle leap-year overflow (e.g. Feb 29 - 1 year shouldn't become March 1st)
  if (d.getMonth() !== originalMonth) {
    d.setDate(0); // Set to last day of February
  }
  return d;
}

/**
 * Find the most appropriate trading day NAV for a target date.
 * 
 * Convention (SEBI / AMFI Standard):
 * - If target date has a NAV, use it.
 * - If target date is a weekend/holiday, use the immediately PRECEDING trading day NAV
 *   (up to maxLookbackDays = 10 days).
 * - If no preceding NAV exists within lookback, use the closest subsequent trading day (up to 7 days).
 */
function findTradingDayNav(targetDate, chronologicalSeries, maxLookbackDays = 10) {
  if (!Array.isArray(chronologicalSeries) || chronologicalSeries.length === 0) return null;

  const targetIso = targetDate.toISOString().split('T')[0];
  const targetMs = new Date(targetIso).getTime();

  // 1. Exact match
  const exact = chronologicalSeries.find((p) => p.date === targetIso);
  if (exact && exact.nav > 0) {
    return { ...exact, matchType: 'EXACT' };
  }

  // 2. Preceding business day (closest date <= targetDate within maxLookbackDays)
  let bestPreceding = null;
  const lookbackMs = maxLookbackDays * 86400000;
  for (let i = chronologicalSeries.length - 1; i >= 0; i--) {
    const p = chronologicalSeries[i];
    const pMs = new Date(p.date).getTime();
    if (pMs <= targetMs && targetMs - pMs <= lookbackMs) {
      bestPreceding = { ...p, matchType: 'PRECEDING_TRADING_DAY' };
      break;
    }
  }
  if (bestPreceding && bestPreceding.nav > 0) return bestPreceding;

  // 3. Fallback: Earliest subsequent trading day (within 7 days)
  let bestSubsequent = null;
  const forwardMs = 7 * 86400000;
  for (let i = 0; i < chronologicalSeries.length; i++) {
    const p = chronologicalSeries[i];
    const pMs = new Date(p.date).getTime();
    if (pMs >= targetMs && pMs - targetMs <= forwardMs) {
      bestSubsequent = { ...p, matchType: 'SUBSEQUENT_TRADING_DAY' };
      break;
    }
  }
  if (bestSubsequent && bestSubsequent.nav > 0) return bestSubsequent;

  return null;
}

/**
 * Calculate comprehensive returns snapshot with complete reproducibility
 */
function calculateFundReturns(chronologicalSeries, options = {}) {
  const { schemeCode = '', planType = 'REGULAR', option = 'GROWTH' } = options;

  if (!Array.isArray(chronologicalSeries) || chronologicalSeries.length < 2) {
    return {
      return1M: null,
      return3M: null,
      return6M: null,
      return1Y: null,
      return3Y: null,
      return5Y: null,
      cagr1Y: null,
      cagr3Y: null,
      cagr5Y: null,
      returns: {
        '1M': null,
        '3M': null,
        '6M': null,
        '1Y': null,
        '3Y': null,
        '5Y': null,
        'All': null,
      },
      provenance: {},
      allReturnMethodology: 'INSUFFICIENT_DATA',
      allStartDate: null,
      allStartNav: null,
      allEndDate: null,
      allEndNav: null,
      allSource: 'AMFI_DAILY_NAV_TIMESERIES',
      returnsCalculatedAt: new Date().toISOString(),
      returnsMethodology: 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y',
      methodology: 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y',
      returnsSource: 'AMFI_DAILY_NAV_TIMESERIES',
      source: 'AMFI_DAILY_NAV_TIMESERIES',
    };
  }

  const latestItem = chronologicalSeries[chronologicalSeries.length - 1];
  const endNav = latestItem.nav;
  const endDateStr = latestItem.date;
  const endDate = new Date(endDateStr);

  const periodsConfig = [
    { key: '1M', type: 'MONTH', value: 1, isCagr: false },
    { key: '3M', type: 'MONTH', value: 3, isCagr: false },
    { key: '6M', type: 'MONTH', value: 6, isCagr: false },
    { key: '1Y', type: 'YEAR', value: 1, isCagr: false },
    { key: '3Y', type: 'YEAR', value: 3, isCagr: true },
    { key: '5Y', type: 'YEAR', value: 5, isCagr: true },
  ];

  const results = {};
  const provenance = {};

  for (const p of periodsConfig) {
    let targetStartDate;
    if (p.type === 'MONTH') {
      targetStartDate = subtractMonths(endDate, p.value);
    } else {
      targetStartDate = subtractYears(endDate, p.value);
    }

    const startPoint = findTradingDayNav(targetStartDate, chronologicalSeries);

    if (!startPoint || !startPoint.nav || startPoint.nav <= 0 || endNav <= 0) {
      results[p.key] = null;
      provenance[p.key] = {
        period: p.key,
        targetStartDate: targetStartDate.toISOString().split('T')[0],
        selectedStartDate: null,
        selectedStartNav: null,
        endDate: endDateStr,
        endNav,
        elapsedDays: 0,
        elapsedYears: 0,
        formula: p.isCagr ? '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100' : '((endNav - startNav) / startNav) * 100',
        calculatedReturn: null,
        status: 'INSUFFICIENT_HISTORY',
        source: 'AMFI_DAILY_NAV_TIMESERIES',
        sourceSchemeCode: schemeCode,
        planType,
        option,
      };
      continue;
    }

    const startDate = new Date(startPoint.date);
    const elapsedDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    const isStandardPeriod = p.isCagr && Math.abs(elapsedDays - (p.value * 365.25)) <= 10;
    const elapsedYears = isStandardPeriod ? p.value : +(elapsedDays / 365.25).toFixed(4);

    let calculatedReturn = null;
    let formulaStr = '';

    if (!p.isCagr) {
      // Point-to-point simple absolute return for <= 1 Year
      const ret = ((endNav - startPoint.nav) / startPoint.nav) * 100;
      calculatedReturn = isFinite(ret) ? +ret.toFixed(2) : null;
      formulaStr = '((endNav - startNav) / startNav) * 100';
    } else {
      // Annualized Compound Annual Growth Rate (CAGR) for > 1 Year
      // Standard SEBI/AMFI convention uses integer years for standard trailing intervals
      const cagr = (Math.pow(endNav / startPoint.nav, 1 / elapsedYears) - 1) * 100;
      calculatedReturn = isFinite(cagr) ? +cagr.toFixed(2) : null;
      formulaStr = '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100';
    }

    results[p.key] = calculatedReturn;
    provenance[p.key] = {
      period: p.key,
      targetStartDate: targetStartDate.toISOString().split('T')[0],
      selectedStartDate: startPoint.date,
      selectedStartNav: startPoint.nav,
      endDate: endDateStr,
      endNav,
      elapsedDays,
      elapsedYears,
      formula: formulaStr,
      calculatedReturn,
      matchType: startPoint.matchType,
      status: 'VERIFIED',
      source: 'AMFI_DAILY_NAV_TIMESERIES',
      sourceSchemeCode: schemeCode,
      planType,
      option,
    };
  }

  // Calculate 'All' (Timeseries Inception Return)
  const earliestItem = chronologicalSeries[0];
  const allStartDate = new Date(earliestItem.date);
  const allElapsedDays = Math.round((endDate.getTime() - allStartDate.getTime()) / 86400000);
  const allElapsedYears = +(allElapsedDays / 365.25).toFixed(4);

  // Check if series start matches official inception date (within 10 days)
  let isInceptionMatch = false;
  if (options.inceptionDate) {
    const incDate = new Date(options.inceptionDate);
    if (!isNaN(incDate.getTime())) {
      const diffDays = Math.abs((allStartDate.getTime() - incDate.getTime()) / 86400000);
      isInceptionMatch = diffDays <= 10;
    }
  }

  let allReturn = null;
  let allMethodology = isInceptionMatch ? 'CAGR_SINCE_INCEPTION' : 'CAGR_SINCE_SERIES_START';
  if (earliestItem.nav > 0 && endNav > 0 && allElapsedYears >= 1.0) {
    const cagrAll = (Math.pow(endNav / earliestItem.nav, 1 / allElapsedYears) - 1) * 100;
    allReturn = isFinite(cagrAll) ? +cagrAll.toFixed(2) : null;
    allMethodology = isInceptionMatch ? 'CAGR_SINCE_INCEPTION' : 'CAGR_SINCE_SERIES_START';
  } else if (earliestItem.nav > 0 && endNav > 0) {
    const simpleAll = ((endNav - earliestItem.nav) / earliestItem.nav) * 100;
    allReturn = isFinite(simpleAll) ? +simpleAll.toFixed(2) : null;
    allMethodology = isInceptionMatch ? 'SIMPLE_ABSOLUTE_SINCE_INCEPTION' : 'SIMPLE_ABSOLUTE_SINCE_SERIES_START';
  }

  results['All'] = allReturn;
  provenance['All'] = {
    period: 'All',
    targetStartDate: earliestItem.date,
    selectedStartDate: earliestItem.date,
    selectedStartNav: earliestItem.nav,
    endDate: endDateStr,
    endNav,
    elapsedDays: allElapsedDays,
    elapsedYears: allElapsedYears,
    formula: allMethodology.startsWith('CAGR') ? '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100' : '((endNav - startNav) / startNav) * 100',
    calculatedReturn: allReturn,
    status: 'VERIFIED',
    source: 'AMFI_DAILY_NAV_TIMESERIES',
    sourceSchemeCode: schemeCode,
    planType,
    option,
  };

  return {
    return1M: results['1M'],
    return3M: results['3M'],
    return6M: results['6M'],
    return1Y: results['1Y'],
    return3Y: results['3Y'],
    return5Y: results['5Y'],
    cagr1Y: results['1Y'],
    cagr3Y: results['3Y'],
    cagr5Y: results['5Y'],
    returns: results,
    provenance,
    allReturnMethodology: allMethodology,
    allStartDate: earliestItem.date,
    allStartNav: earliestItem.nav,
    allEndDate: endDateStr,
    allEndNav: endNav,
    allSource: 'AMFI_DAILY_NAV_TIMESERIES',
    returnsCalculatedAt: new Date().toISOString(),
    returnsMethodology: 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y',
    methodology: 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y',
    returnsSource: 'AMFI_DAILY_NAV_TIMESERIES',
    source: 'AMFI_DAILY_NAV_TIMESERIES',
  };
}

module.exports = {
  calculateFundReturns,
  findTradingDayNav,
  subtractMonths,
  subtractYears,
};
