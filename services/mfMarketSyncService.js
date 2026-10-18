/**
 * services/mfMarketSyncService.js
 * 
 * Bharat SQFT / VikaOne — Production Automated Mutual Fund Market Data Sync Engine
 * 
 * Capabilities:
 * 1. AMFI Official Daily NAV Master Sync (downloads and parses official AMFI NAV feed).
 * 2. Automated Scheme AUM (Fund Size), Expense Ratio, and Fund Manager Synchronization.
 * 3. Lazy Enrichment: On-demand auto-persistence for schemes accessed via Scheme Detail API.
 * 4. Scheduled Cadence: Daily at 23:30 IST (NAV & returns) + Monthly on the 10th (AUM & Disclosures).
 */

const https = require('https');
const MutualFundScheme = require('../models/MutualFundScheme');
const mfIntelligenceService = require('./mfIntelligenceService');
const mfAumService = require('./mfAumService');
const amcSourceRegistry = require('./amcSourceRegistry');

const AMFI_NAV_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';

/**
 * Fetch raw text from HTTPS URL with timeout and redirect support
 */
function fetchText(url, timeoutMs = 45000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error(`Too many redirects fetching ${url}`));
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/plain, */*',
      },
      timeout: timeoutMs,
      family: 4,
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsed = new URL(url);
          redirectUrl = new URL(redirectUrl, parsed.origin).href;
        }
        return resolve(fetchText(redirectUrl, timeoutMs, maxRedirects - 1));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Parses official AMFI NAVAll.txt feed
 * Supports 8-column: Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;Plan;Option;NAV;Date
 * Supports 6-column: Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;NAV;Date
 */
function parseAmfiNavFeed(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split('\n');
  const records = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('Scheme Code;') || line.includes('Open Ended Schemes') || line.includes('Close Ended Schemes')) {
      continue;
    }
    const parts = line.split(';');
    if (parts.length >= 6) {
      const schemeCode = parts[0]?.trim();
      const isinGrowth = parts[1]?.trim() === '-' ? null : parts[1]?.trim();
      const isinReinvest = parts[2]?.trim() === '-' ? null : parts[2]?.trim();
      const schemeName = parts[3]?.trim();
      // Handle both 8-column and 6-column layouts:
      const navStr = parts[parts.length - 2]?.trim();
      const dateStr = parts[parts.length - 1]?.trim();

      const navVal = parseFloat(navStr);
      if (schemeCode && !isNaN(navVal) && navVal > 0) {
        records.push({
          schemeCode,
          isin: isinGrowth || isinReinvest || null,
          schemeName,
          nav: navVal,
          navDateStr: dateStr,
        });
      }
    }
  }

  return records;
}

/**
 * Synchronize daily NAVs from official AMFI feed into MongoDB
 */
async function syncAmfiDailyNavs() {
  console.log('[mfMarketSync] Fetching official AMFI NAV feed from:', AMFI_NAV_URL);
  const rawText = await fetchText(AMFI_NAV_URL);
  const records = parseAmfiNavFeed(rawText);
  console.log(`[mfMarketSync] Parsed ${records.length} schemes from AMFI feed.`);

  if (records.length === 0) {
    throw new Error('AMFI feed returned 0 valid records');
  }

  const recordMap = new Map();
  for (const r of records) {
    recordMap.set(String(r.schemeCode).trim(), r);
    if (r.isin) {
      recordMap.set(r.isin.trim().toUpperCase(), r);
    }
  }

  const dbSchemes = await MutualFundScheme.find({
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  }).select('_id schemeCode amfiCode isin nav navDate').lean();

  console.log(`[mfMarketSync] Matching against ${dbSchemes.length} customer catalogue schemes in MongoDB...`);
  const bulkOps = [];
  let matched = 0;

  for (const s of dbSchemes) {
    const code = s.amfiCode || s.schemeCode;
    const match = recordMap.get(String(code)) || (s.isin ? recordMap.get(s.isin.toUpperCase()) : null);
    if (match) {
      matched++;
      // Parse DD-MMM-YYYY (e.g. 16-Oct-2026)
      let parsedDate = new Date();
      if (match.navDateStr) {
        const d = new Date(match.navDateStr);
        if (!isNaN(d.getTime())) parsedDate = d;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: {
            $set: {
              nav: match.nav,
              navDate: parsedDate,
              navSource: 'AMFI Official Daily NAV Master',
              navUpdatedAt: new Date(),
            },
          },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    const res = await MutualFundScheme.bulkWrite(bulkOps, { ordered: false });
    console.log(`✅ [mfMarketSync] NAV sync complete: updated ${res.modifiedCount} schemes (${matched} matched).`);
    return { success: true, totalAmfi: records.length, matched, updated: res.modifiedCount };
  }

  return { success: true, totalAmfi: records.length, matched: 0, updated: 0 };
}

/**
 * Synchronize all verified scheme facts (AUM, Fund Managers, TER, Benchmark)
 * from authoritative statutory catalog into MongoDB.
 */
async function syncAllVerifiedSchemeFacts() {
  const verifiedCodes = mfIntelligenceService.getVerifiedSchemeCodes();
  console.log(`[mfMarketSync] Syncing statutory facts for ${verifiedCodes.length} verified schemes...`);
  const bulkOps = [];

  for (const code of verifiedCodes) {
    const intel = mfIntelligenceService.getSchemeIntelligence(code);
    if (!intel) continue;

    const aum = typeof intel.aum === 'number' ? intel.aum : null;
    const aumAsOfDate = intel.aumAsOfDate ? new Date(intel.aumAsOfDate) : new Date('2026-09-30');
    const aumSource = intel.aumSource || `${intel.amcName || 'AMC'} Official Monthly Factsheet`;

    bulkOps.push({
      updateOne: {
        filter: {
          $or: [
            { schemeCode: String(code) },
            { amfiCode: String(code) },
            intel.isin ? { isin: intel.isin.toUpperCase() } : null,
          ].filter(Boolean),
        },
        update: {
          $set: {
            aum,
            aumAsOfDate,
            aumSource,
            aumStatus: aum ? 'VERIFIED' : 'SOURCE_UNAVAILABLE',
            aumSourceType: 'OFFICIAL_AMC',
            aumDefinition: 'SCHEME_AUM',
            aumUnit: 'CRORE',
            expenseRatio: intel.expenseRatio || null,
            expenseRatioAsOfDate: intel.expenseRatioAsOfDate ? new Date(intel.expenseRatioAsOfDate) : aumAsOfDate,
            expenseRatioSource: intel.expenseRatioSource || null,
            fundManager: intel.fundManager || null,
            fundManagerRole: intel.fundManagerRole || null,
            fundManagerAsOfDate: intel.fundManagerAsOfDate ? new Date(intel.fundManagerAsOfDate) : aumAsOfDate,
            fundManagerDetails: Array.isArray(intel.fundManagerDetails) ? intel.fundManagerDetails : [],
            benchmark: intel.benchmark || null,
            benchmarkName: intel.benchmarkName || intel.benchmark || null,
            exitLoad: intel.exitLoad || null,
            exitLoadFlag: intel.exitLoadFlag || 'Y',
            riskometer: intel.riskometer || null,
            minSipAmount: intel.minSipAmount || null,
            minPurchaseAmount: intel.minPurchaseAmount || null,
            totalHoldingsCount: intel.totalHoldingsCount || (Array.isArray(intel.holdings) ? intel.holdings.length : null),
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    const res = await MutualFundScheme.bulkWrite(bulkOps, { ordered: false });
    console.log(`✅ [mfMarketSync] Scheme facts sync complete: modified ${res.modifiedCount} schemes.`);
    return { success: true, processed: verifiedCodes.length, modified: res.modifiedCount };
  }

  return { success: true, processed: 0, modified: 0 };
}

/**
 * Lazy enrichment helper: Called on scheme detail load.
 * If scheme in MongoDB has missing facts, checks statutory catalog and auto-persists.
 */
async function lazyEnrichScheme(scheme) {
  if (!scheme) return null;
  const sCode = scheme.schemeCode || scheme.amfiCode;
  const intel = mfIntelligenceService.getSchemeIntelligence(sCode);
  if (!intel) return null;

  const needsUpdate = scheme.aum == null ||
    !scheme.fundManagerDetails ||
    scheme.fundManagerDetails.length === 0 ||
    scheme.totalHoldingsCount == null;

  if (needsUpdate) {
    try {
      await MutualFundScheme.updateOne(
        { _id: scheme._id },
        {
          $set: {
            aum: intel.aum || scheme.aum,
            aumStatus: intel.aum ? 'VERIFIED' : scheme.aumStatus,
            aumAsOfDate: intel.aumAsOfDate ? new Date(intel.aumAsOfDate) : scheme.aumAsOfDate,
            aumSource: intel.aumSource || scheme.aumSource,
            fundManager: intel.fundManager || scheme.fundManager,
            fundManagerRole: intel.fundManagerRole || scheme.fundManagerRole,
            fundManagerDetails: intel.fundManagerDetails || scheme.fundManagerDetails,
            totalHoldingsCount: intel.totalHoldingsCount || scheme.totalHoldingsCount,
            benchmark: intel.benchmark || scheme.benchmark,
            expenseRatio: intel.expenseRatio || scheme.expenseRatio,
          },
        }
      );
    } catch (e) {
      console.warn(`[lazyEnrichScheme] Non-fatal auto-persist error for ${sCode}:`, e.message);
    }
  }

  return intel;
}

module.exports = {
  fetchText,
  parseAmfiNavFeed,
  syncAmfiDailyNavs,
  syncAllVerifiedSchemeFacts,
  lazyEnrichScheme,
};
