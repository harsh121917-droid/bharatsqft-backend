/**
 * services/tigzigService.js
 * 
 * Bharat SQFT / VikaOne — TigZig AMFI Mutual Fund Master & Intelligence Connector
 * 
 * Capabilities:
 * 1. Scheme Details: Benchmark, Exit Load, Minimum Application Amount, SIP Terms, Objective.
 * 2. TER (Total Expense Ratio): Statutory TER for Regular & Direct plans from AMFI.
 * 3. Fund Manager: Full names, roles, tenure start dates from AMFI SSD filings.
 * 4. AUM: Official AMFI daily/weekly fund-level AUM in Crores.
 * 5. Batch details querying: Up to 50 schemes in a single HTTP request.
 */

const https = require('https');

const BASE_URL = 'https://api.tigzig.com/mf/v1';
const REQUEST_TIMEOUT_MS = 3000;
const tigzigCache = new Map();
const TIGZIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch JSON from HTTPS endpoint
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'BharatSqft-Backend/2.0 (MutualFunds Engine)',
        'Accept': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
      family: 4,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`TigZig API HTTP ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse TigZig JSON from ${url}: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Parses minimum application amount string (e.g. "Rs. 100", "New Investor - Rs.100/-", "5000")
 */
function parseAmount(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.replace(/,/g, '');
  // 1. Regular Plan-Growth specifically if multi-line
  const regMatch = clean.match(/Regular Plan[^0-9]*Rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (regMatch) return parseFloat(regMatch[1]);
  // 2. Generic Rs. or numbers
  const m = clean.match(/(?:Rs\.?|INR|\b)\s*(\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);
  return null;
}

/**
 * Parses minimum SIP amount from terms_sip string
 */
function parseSipAmount(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.replace(/,/g, '');
  // 1. Monthly SIP
  const monthlyMatch = clean.match(/(?:Monthly|MSIP)[^;|\n\r0-9]*Rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (monthlyMatch) return parseFloat(monthlyMatch[1]);
  // 2. Minimum amount section
  const minMatch = clean.match(/Minimum amount:[^;|\n\r0-9]*Rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (minMatch) return parseFloat(minMatch[1]);
  // 3. Generic SIP Rs.
  const sipMatch = clean.match(/SIP[^;|\n\r0-9]*Rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (sipMatch) return parseFloat(sipMatch[1]);
  return null;
}

/**
 * Normalizes raw TigZig scheme detail record into canonical schema shape
 */
function normalizeTigzigRecord(item) {
  if (!item || !item.scheme_code) return null;

  const rawAum = item.amfi_daily?.fund_aum_cr_all_plans;
  const aum = rawAum != null && !isNaN(rawAum) ? Number(rawAum) : null;
  const aumAsOfDate = item.amfi_daily?.aum_date ? new Date(item.amfi_daily.aum_date) : null;

  const rawTer = item.ter?.regular;
  const expenseRatio = rawTer != null && !isNaN(rawTer) ? Number(rawTer) : null;
  const expenseRatioAsOfDate = item.ter?.date ? new Date(item.ter.date) : null;

  const managersList = Array.isArray(item.ssd?.fund_managers) ? item.ssd.fund_managers : [];
  const fundManager = managersList.length > 0 ? managersList.map(m => m.name).filter(Boolean).join(', ') : null;
  const fundManagerRole = managersList.length > 0 ? managersList[0]?.role || null : null;
  const fundManagerAsOfDate = managersList.length > 0 && managersList[0]?.since ? new Date(managersList[0].since) : null;

  const minPurchaseAmount = parseAmount(item.ssd?.min_application_amount);
  const minAdditionalPurchaseAmount = parseAmount(item.ssd?.min_additional_amount);
  const minSipAmount = parseSipAmount(item.ssd?.terms_sip);

  const benchmark = item.ssd?.benchmark_tier1_std || item.amfi_daily?.benchmark || item.ssd?.benchmark_tier1_filed || null;
  const exitLoad = item.ssd?.exit_load || null;
  const riskometer = item.ssd?.riskometer_level || item.amfi_daily?.riskometer || null;
  const investmentObjective = item.ssd?.objective || null;

  return {
    schemeCode: String(item.scheme_code),
    isin: item.isin || null,
    schemeName: item.scheme_name || null,
    amcName: item.amc || null,
    category: item.category_group_clean || null,
    subCategory: item.category_sub || null,

    // 1. AUM
    aum,
    aumAsOfDate,
    aumSource: 'AMFI Official Daily/Weekly Disclosure (TigZig/AMFI)',
    aumStatus: aum != null ? 'VERIFIED' : 'SOURCE_UNAVAILABLE',
    aumSourceType: 'OFFICIAL_AMC',
    aumDefinition: 'SCHEME_AUM',
    aumUnit: 'CRORE',

    // 2. TER
    expenseRatio,
    expenseRatioAsOfDate,
    expenseRatioSource: 'AMFI Statutory TER Disclosure (TigZig)',

    // 3. Fund Managers
    fundManager,
    fundManagerRole,
    fundManagerAsOfDate,
    fundManagerDetails: managersList,

    // 4. Scheme Details & Investment Rules
    benchmark,
    benchmarkName: benchmark,
    benchmarkSource: 'AMFI Statutory Scheme Information Document (SID)',
    exitLoad,
    exitLoadFlag: exitLoad ? 'Y' : 'N',
    exitLoadSource: 'AMFI Statutory Scheme Information Document (SID)',
    minPurchaseAmount,
    minAdditionalPurchaseAmount,
    minSipAmount,
    riskometer,
    investmentObjective,
    dataProvenance: {
      source: 'TIGZIG_AMFI_OPEN_DATA',
      asOfDate: item.amfi_daily?.aum_date || item.ter?.date || null,
      verifiedAt: new Date(),
      status: 'VERIFIED',
    },
  };
}

/**
 * Fetch scheme details for a single scheme by AMFI code or ISIN
 */
async function fetchSchemeDetails(codeOrIsin) {
  if (!codeOrIsin) return null;
  const key = String(codeOrIsin).trim();
  const cached = tigzigCache.get(key);
  if (cached && Date.now() - cached.timestamp < TIGZIG_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const url = `${BASE_URL}/schemes/${encodeURIComponent(key)}/details`;
    const json = await fetchJson(url);
    if (json && json.data) {
      const record = normalizeTigzigRecord(json.data);
      tigzigCache.set(key, { data: record, timestamp: Date.now() });
      return record;
    }
    return null;
  } catch (error) {
    console.warn(`[TigZig] fetchSchemeDetails(${codeOrIsin}) warning:`, error.message);
    return null;
  }
}

/**
 * Fetch scheme details for multiple schemes (up to 50 per batch)
 */
async function fetchBatchDetails(codesOrIsins = []) {
  if (!codesOrIsins || codesOrIsins.length === 0) return [];
  const cleanList = codesOrIsins.map(c => String(c).trim()).filter(Boolean);
  if (cleanList.length === 0) return [];

  // TigZig max 50 per request
  const chunks = [];
  for (let i = 0; i < cleanList.length; i += 50) {
    chunks.push(cleanList.slice(i, i + 50));
  }

  const results = [];
  for (const chunk of chunks) {
    try {
      const url = `${BASE_URL}/details?schemes=${encodeURIComponent(chunk.join(','))}`;
      const json = await fetchJson(url);
      if (json && Array.isArray(json.data)) {
        for (const item of json.data) {
          const norm = normalizeTigzigRecord(item);
          if (norm) results.push(norm);
        }
      }
    } catch (error) {
      console.warn(`[TigZig] fetchBatchDetails chunk (${chunk.length} schemes) warning:`, error.message);
    }
  }

  return results;
}

module.exports = {
  fetchJson,
  parseAmount,
  parseSipAmount,
  normalizeTigzigRecord,
  fetchSchemeDetails,
  fetchBatchDetails,
};
