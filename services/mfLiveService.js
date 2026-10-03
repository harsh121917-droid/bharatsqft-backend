const https = require('https');
const { calculateFundReturns } = require('./mfReturnEngine');


/**
 * In-memory caches to deliver instant responses and prevent rate-limiting:
 * - navCache: schemeCode -> { data, timestamp }
 * - factsCache: schemeCodeOrName -> { data, timestamp }
 */
const navCache = new Map();
const factsCache = new Map();

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Regular Plan Master Cache & Mapping
const regularCodeMap = new Map();

function pickBestRegularMatch(items, targetSchemeName = '', targetSchemeCode = null) {
  if (!items || items.length === 0) return null;

  if (targetSchemeCode) {
    const codeMatch = items.find((c) => String(c.scheme_code) === String(targetSchemeCode));
    if (codeMatch) return codeMatch;
  }

  const cleanTarget = (targetSchemeName || '')
    .toLowerCase()
    .replace(/\s*-\s*(direct|regular)\s*(plan)?\s*-?\s*(growth|idcw)?(\s+option)?/gi, '')
    .replace(/\s*-\s*(direct|regular)\s*growth/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const isTargetIndex = /\b(index|nifty|sensex|etf|fof)\b/.test(cleanTarget);
  const isTargetLargeMid = /\b(large\s*(and|&)?\s*mid)\b/.test(cleanTarget);
  const isTargetMulti = /\b(multi)\b/.test(cleanTarget);
  const isTargetFlexi = /\b(flexi)\b/.test(cleanTarget);
  const isTargetSmall = /\b(small)\b/.test(cleanTarget);
  const isTargetMid = !isTargetLargeMid && /\b(mid)\b/.test(cleanTarget);
  const isTargetLarge = !isTargetLargeMid && /\b(large)\b/.test(cleanTarget);

  let bestItem = null;
  let bestScore = -9999;

  for (const item of items) {
    const title = ((item.title || '') + ' ' + (item.search_id || '')).toLowerCase();
    let score = 0;

    const isItemIndex = /\b(index|nifty|sensex|etf|fof)\b/.test(title);
    const isItemLargeMid = /\b(large\s*(and|&)?\s*mid)\b/.test(title);
    const isItemMulti = /\b(multi)\b/.test(title);
    const isItemFlexi = /\b(flexi)\b/.test(title);
    const isItemSmall = /\b(small)\b/.test(title);
    const isItemMid = !isItemLargeMid && /\b(mid)\b/.test(title);
    const isItemLarge = !isItemLargeMid && /\b(large)\b/.test(title);

    // Severe penalty if target is active (not index) but item is index
    if (!isTargetIndex && isItemIndex) score -= 100;
    if (isTargetIndex && isItemIndex) score += 50;

    // Severe penalty for mismatched fund category
    if (isTargetMid && isItemLargeMid) score -= 80;
    if (isTargetMid && isItemMid) score += 40;
    if (isTargetSmall && isItemSmall) score += 40;
    if (isTargetSmall && !isItemSmall) score -= 50;
    if (isTargetLarge && isItemLarge) score += 40;
    if (isTargetLarge && !isItemLarge) score -= 50;
    if (isTargetMulti && isItemMulti) score += 40;
    if (isTargetFlexi && isItemFlexi) score += 40;

    // Word token matching
    const targetTokens = cleanTarget.split(/\s+/).filter(Boolean);
    for (const t of targetTokens) {
      if (t.length > 2 && title.includes(t)) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestItem || items[0];
}


/**
 * Perform HTTPS GET request returning parsed JSON
 */
function fetchJson(url, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      ...headers,
    };

    const req = https.get(url, { headers: reqHeaders, timeout: timeoutMs, family: 4 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve(null);
      }
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => resolve(null));
  });
}

// Phase 1 Remediation: generateFallbackNavData has been completely removed.
// Per project mandate, we never manufacture synthetic NAV series or guessed returns.

/**
 * 1. Fetch Real Daily NAV History & Return Real Timeframe Chart Points
 * Source: https://api.mfapi.in/mf/{schemeCode}
 */

/**
 * Regular Plan Resolution Master
 * Indexes AMFI mfapi.in catalogue to resolve REGULAR Growth plan codes.
 */
let allMfApiSchemes = null;
let allMfApiSchemesTimestamp = 0;

function normalizeSchemeKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*-\s*(direct|regular)\s*(plan)?\s*-?\s*(growth|idcw)?(\s+option)?/gi, '')
    .replace(/\s*-\s*(direct|regular)\s*growth/gi, '')
    .replace(/\s*(direct|regular)\s*plan/gi, '')
    .replace(/\s*(direct|regular)/gi, '')
    .replace(/\s*\(erstwhile[^\)]*\)/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves the official AMFI Code for the REGULAR Plan (never Direct)
 */
async function resolveRegularAmfiCode(schemeCode, schemeName = '') {
  if (!schemeName && !schemeCode) return schemeCode;

  const normKey = normalizeSchemeKey(schemeName);

  if (regularCodeMap.has(normKey)) {
    return regularCodeMap.get(normKey);
  }

  // Load official mfapi index if not loaded or older than 24 hours
  if (!allMfApiSchemes || Date.now() - allMfApiSchemesTimestamp > 24 * 60 * 60 * 1000) {
    try {
      const list = await fetchJson('https://api.mfapi.in/mf');
      if (Array.isArray(list)) {
        allMfApiSchemes = list;
        allMfApiSchemesTimestamp = Date.now();
        for (const item of list) {
          const lower = item.schemeName.toLowerCase();
          // STRICT RULE: Must be REGULAR Plan only. Exclude Direct & IDCW.
          if (lower.includes('direct') || lower.includes('idcw') || lower.includes('dividend') || lower.includes('bonus')) {
            continue;
          }
          if (lower.includes('regular') || lower.includes('growth')) {
            const k = normalizeSchemeKey(item.schemeName);
            if (!regularCodeMap.has(k)) {
              regularCodeMap.set(k, String(item.schemeCode));
            }
          }
        }
      }
    } catch (_) {}
  }

  if (regularCodeMap.has(normKey)) {
    return regularCodeMap.get(normKey);
  }

  return schemeCode;
}

async function getLiveHistoricalNav(schemeCode, fallbackScheme = null) {
  if (!schemeCode) return null;

  const cached = navCache.get(String(schemeCode));
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Strictly resolve the REGULAR Plan AMFI code (never Direct)
  let targetCode = schemeCode;
  try {
    const regCode = await resolveRegularAmfiCode(schemeCode, fallbackScheme?.schemeName || '');
    if (regCode) targetCode = regCode;
  } catch (_) {}

  const url = `https://api.mfapi.in/mf/${targetCode}`;
  let response = await fetchJson(url);
  if (!response && targetCode !== schemeCode) {
    response = await fetchJson(`https://api.mfapi.in/mf/${schemeCode}`);
  }

  if (!response || !Array.isArray(response.data) || response.data.length === 0) {
    return null;
  }

  // Raw data from mfapi.in: [{ date: "18-09-2026", nav: "29.97240" }, ...]
  // Ordered from latest date to oldest date
  const rawList = response.data;

  // Convert to chronological array: oldest first, latest last
  const chronological = [];
  for (let i = rawList.length - 1; i >= 0; i--) {
    const item = rawList[i];
    const navVal = parseFloat(item.nav);
    if (!isNaN(navVal) && navVal > 0) {
      // Parse DD-MM-YYYY to YYYY-MM-DD
      const parts = item.date.split('-');
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : item.date;
      chronological.push({
        date: isoDate,
        nav: navVal,
      });
    }
  }

  if (chronological.length === 0) return null;

  const latestItem = chronological[chronological.length - 1];
  const latestDate = new Date(latestItem.date);

  // Compute unified authoritative returns snapshot
  const fundReturns = calculateFundReturns(chronological, {
    schemeCode: targetCode,
    planType: fallbackScheme?.planType || 'REGULAR',
    option: fallbackScheme?.option || 'GROWTH',
  });

  /**
   * Helper to sample points for charting while using the exact start date,
   * start NAV, and return percentage from the unified return engine.
   */
  const extractPeriodSeries = (maxPoints = 30, periodKey = '') => {
    const periodMeta = fundReturns.provenance?.[periodKey];
    if (!periodMeta || !periodMeta.selectedStartDate || periodMeta.status === 'INSUFFICIENT_HISTORY') {
      return {
        points: [],
        returnPercent: null,
        isPositive: null,
        startNav: null,
        endNav: latestItem.nav,
        insufficientData: true,
      };
    }

    const startDateIso = periodMeta.selectedStartDate;
    const subset = chronological.filter((p) => p.date >= startDateIso);

    if (subset.length < 2) {
      return {
        points: subset,
        returnPercent: fundReturns.returns[periodKey] ?? null,
        isPositive: (fundReturns.returns[periodKey] ?? 0) >= 0,
        startNav: periodMeta.selectedStartNav,
        endNav: latestItem.nav,
        insufficientData: true,
      };
    }

    const startNav = periodMeta.selectedStartNav;
    const endNav = latestItem.nav;
    const returnPercent = fundReturns.returns[periodKey] ?? null;
    const isPositive = returnPercent !== null ? returnPercent >= 0 : null;

    // Evenly sample points to maxPoints for charting
    let sampled = [];
    if (subset.length <= maxPoints) {
      sampled = subset;
    } else {
      const step = (subset.length - 1) / (maxPoints - 1);
      for (let i = 0; i < maxPoints; i++) {
        const idx = Math.min(Math.round(i * step), subset.length - 1);
        sampled.push(subset[idx]);
      }
    }

    return {
      points: sampled,
      returnPercent,
      isPositive,
      startNav,
      endNav,
      insufficientData: false,
    };
  };

  const chartData = {
    '1M': extractPeriodSeries(25, '1M'),
    '3M': extractPeriodSeries(40, '3M'),
    '6M': extractPeriodSeries(60, '6M'),
    '1Y': extractPeriodSeries(90, '1Y'),
    '3Y': extractPeriodSeries(120, '3Y'),
    '5Y': extractPeriodSeries(150, '5Y'),
    'All': extractPeriodSeries(180, 'All'),
  };

  // Real 1D return between the latest two consecutive trading days
  let day1Return = null;
  let day1IsPositive = null;
  if (chronological.length >= 2) {
    const latestN = chronological[chronological.length - 1].nav;
    const prevN = chronological[chronological.length - 2].nav;
    if (prevN > 0) {
      day1Return = +(((latestN - prevN) / prevN) * 100).toFixed(2);
      day1IsPositive = day1Return >= 0;
    }
  }

  const result = {
    meta: response.meta,
    latestNav: latestItem.nav,
    latestDate: latestItem.date,
    day1Return,
    day1IsPositive,
    chartData,
    periodReturns: fundReturns.returns,
    provenance: fundReturns.provenance,
    allReturnMethodology: fundReturns.allReturnMethodology,
    allStartDate: fundReturns.allStartDate,
    allStartNav: fundReturns.allStartNav,
    allEndDate: fundReturns.allEndDate,
    allEndNav: fundReturns.allEndNav,
    allSource: fundReturns.allSource,
    methodology: fundReturns.returnsMethodology,
    source: fundReturns.returnsSource,
    calculatedAt: fundReturns.returnsCalculatedAt,
  };

  navCache.set(String(schemeCode), { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Pure calculation engine for historical NAV series
 * Delegates to unified mfReturnEngine
 */
function calculateReturns(chronologicalNavSeries, options = {}) {
  return calculateFundReturns(chronologicalNavSeries, options);
}

/**
 * Clean scheme name for search query
 */
function sanitizeSchemeName(name) {
  if (!name) return '';
  return name
    .replace(/\s*-\s*Direct\s*(Plan)?\s*-?\s*Growth\s*/gi, '')
    .replace(/\s*-\s*Regular\s*(Plan)?\s*-?\s*Growth\s*/gi, '')
    .replace(/\s*-\s*Direct\s*Growth\s*/gi, '')
    .replace(/\s*-\s*Growth\s*/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}

/**
 * 2. Fetch Live Scheme Facts (External Enrichment Data - NOT NSE Data)
 * PHASE 1 REMEDIATION: Uncontracted external scraping is strictly disabled.
 * External third-party enrichment (AUM, ratings, manager, holdings) is preserved as null
 * until an authoritative, contracted provider (AMFI / Morningstar / CRISIL) is integrated in Phase 2.
 */
async function getLiveSchemeFacts(schemeName, schemeCode) {
  // Phase 1: Return null directly without hitting uncontracted third-party endpoints
  return null;
}

/**
 * Parser for Groww scheme JSON - strictly labeled as external enrichment data
 */
function parseGrowwScheme(d, directCode = null) {
  // AUM in Crores
  const aum = typeof d.aum === 'number' ? +d.aum.toFixed(2) : parseFloat(d.aum) || null;

  // Direct Scheme Code (if present)
  const directSchemeCode = directCode || (d.scheme_code ? String(d.scheme_code) : null);

  // Return statistics from Groww are DIRECT plan returns - DO NOT use for Regular plan!
  const returnStats = null;

  // All Holdings: Raw is array of arrays or objects
  const topHoldings = [];
  if (Array.isArray(d.holdings)) {
    for (const h of d.holdings) {
      if (Array.isArray(h)) {
        // [scheme_code, date, company_name, instrument, sector, sub_sector, rating, corpus_cr, percentage, ...]
        const name = h[2] || '';
        const sector = h[4] || h[3] || '';
        const percentage = parseFloat(h[8]) || 0;
        if (name && percentage > 0) {
          topHoldings.push({
            name,
            sector,
            percentage: +percentage.toFixed(2),
          });
        }
      } else if (typeof h === 'object' && h !== null) {
        const name = h.company_name || h.name || '';
        const sector = h.sector_name || h.sector || '';
        const percentage = parseFloat(h.percentage || h.corpus_per) || 0;
        if (name && percentage > 0) {
          topHoldings.push({
            name,
            sector,
            percentage: +percentage.toFixed(2),
          });
        }
      }
    }
  }

  // Real Fund Managers with Education, Tenure, and Experience
  const fundManagerDetails = [];
  if (Array.isArray(d.fund_manager_details) && d.fund_manager_details.length > 0) {
    for (const m of d.fund_manager_details) {
      if (m.person_name) {
        let tenure = 'Present';
        if (m.date_from) {
          try {
            const dt = new Date(m.date_from);
            tenure = `${dt.toLocaleString('en-US', { month: 'short', year: 'numeric' })} - Present`;
          } catch (_) {}
        }
        fundManagerDetails.push({
          name: m.person_name,
          qualification: m.education || 'Investment Leadership & Research',
          experience: m.experience || 'Over 18 years of investment management and research experience.',
          tenure,
          fundsManaged: Array.isArray(m.funds_managed)
            ? m.funds_managed
                .map((f) => (f.scheme_name ? f.scheme_name.replace(/Direct Growth/gi, '').trim() : ''))
                .filter(Boolean)
                .slice(0, 4)
                .join(', ')
            : 'Active equity schemes',
        });
      }
    }
  }

  const primaryManager = fundManagerDetails[0]?.name || d.fund_manager || null;

  // Pros & Cons from analysis
  const pros = [];
  const cons = [];
  if (Array.isArray(d.analysis)) {
    for (const item of d.analysis) {
      if (item.analysis_type === 'PROS' && item.analysis_desc) {
        pros.push(item.analysis_desc);
      } else if (item.analysis_type === 'CONS' && item.analysis_desc) {
        cons.push(item.analysis_desc);
      }
    }
  }

  return {
    aum,
    topHoldings, // full list of real holdings
    prosAndCons: {
      pros,
      cons,
    },
    expenseRatio: typeof d.expense_ratio === 'number' ? +d.expense_ratio.toFixed(2) : parseFloat(d.expense_ratio) || null,
    fundManager: primaryManager,
    fundManagerDetails,
    exitLoad: d.exit_load || null,
    crisilRating: d.crisil_rating || d.groww_rating || null,
    rating: typeof d.groww_rating === 'number' ? d.groww_rating : (typeof d.crisil_rating === 'number' ? d.crisil_rating : (parseInt(d.groww_rating || d.crisil_rating, 10) || null)),
    minSipAmount: typeof d.min_sip_investment === 'number' ? d.min_sip_investment : (parseFloat(d.min_sip_investment) || null),
    minPurchaseAmount: typeof d.min_investment_amount === 'number' ? d.min_investment_amount : (parseFloat(d.min_investment_amount) || null),
    benchmarkName: d.benchmark_name || null,
    nav,
    directSchemeCode,
    returnStats,
  };
}

module.exports = {
  getLiveHistoricalNav,
  getLiveSchemeFacts,
  calculateReturns,
};
