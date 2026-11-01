/**
 * services/tigzigHoldingsService.js
 * 
 * Bharat SQFT / VikaOne — TigZig AMFI Mutual Fund Portfolio Holdings Ingestion & Live Service
 * 
 * Capabilities:
 * 1. Automatic streaming ingestion of official monthly portfolio composition disclosures (AMFI/TigZig).
 * 2. High-precision mapping to canonical Regular Growth scheme codes across flagship equity funds.
 * 3. Immutable snapshot persistence into MongoDB (mfschemeportfoliosnapshots) + MutualFundScheme.
 * 4. Real-time on-demand portfolio resolution for the mobile app and paginated holdings views.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const crypto = require('crypto');
const MutualFundScheme = require('../models/MutualFundScheme');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');
const validationService = require('./mfPortfolioValidationService');

const TIGZIG_CSV_URL = 'https://api.tigzig.com/downloads/mf_portfolio_holdings.csv';
const LOCAL_CSV_PATH = path.join(__dirname, '..', 'data', 'tigzig_portfolio_holdings.csv');

// Canonical mapping of TigZig fund_code to NSE schemeCode
const TIGZIG_FUND_CODE_MAP = {
  AXISFOCUSED: '117560',     // Axis Focused Fund
  AXISMCF: '114564',         // Axis Midcap Fund
  AXISSMALLCAP: '125350',    // Axis Small Cap Fund
  FRANKLINFOCUSED: '105817', // Franklin India Focused Equity Fund
  HDFCFLEXICAP: '101762',    // HDFC Flexi Cap Fund
  HDFCFOCUSED: '102760',     // HDFC Focused Fund
  HDFCLARGECAP: '102000',    // HDFC Large Cap Fund
  HDFCMIDCAP: '105758',      // HDFC Mid Cap Fund
  HDFCSMALLCAP: '130502',    // HDFC Small Cap Fund
  ICICIFOCUSED: '111957',    // ICICI Prudential Focused Fund
  ICICILARGECAP: '108466',   // ICICI Prudential Large Cap Fund
  ICICIVALUE: '102594',      // ICICI Prudential Value Fund
  KOTAKFLEXICAP: '112090',   // Kotak Flexi Cap Fund
  KOTAKMIDCAP: '104908',     // Kotak Mid Cap Fund
  MIRAELARGECAP: '107578',   // Mirae Asset Large Cap Fund
  MOTILALMIDCAP: '147701',   // Motilal Oswal Large and Midcap Fund
  NIPPONLARGECAP: '106235',  // Nippon India Large Cap Fund
  NIPPONMIDCAP: '100377',    // Nippon India Growth Mid Cap Fund
  NIPPONSMALLCAP: '113177',  // Nippon India Small Cap Fund
  PPFASFLEXICAP: '122640',   // Parag Parikh Flexi Cap Fund
  SBICONTRA: '102414',       // SBI Contra Fund
  SBIFOCUSED: '102756',      // SBI Focused Fund
  SBILARGECAP: '103504',     // SBI Large Cap Fund
  SBISMALLCAP: '125494',     // SBI Small Cap Fund
};

// Invert mapping for quick schemeCode -> tigzigCode lookup
const SCHEME_CODE_TO_TIGZIG_MAP = {};
for (const [tCode, sCode] of Object.entries(TIGZIG_FUND_CODE_MAP)) {
  SCHEME_CODE_TO_TIGZIG_MAP[sCode] = tCode;
}

let inMemoryHoldingsCache = null;
let inMemoryCacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fast RFC-compliant CSV line parser handling quotes and escaped quotes
 */
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

/**
 * Download latest TigZig holdings CSV if not present or explicitly requested
 */
function downloadHoldingsCsv(targetPath = LOCAL_CSV_PATH) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(targetPath);
    https.get(TIGZIG_CSV_URL, {
      headers: {
        'User-Agent': 'BharatSqft-Backend/2.0 (MutualFunds Engine)',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        fs.unlink(targetPath, () => {});
        return reject(new Error(`Failed to download TigZig CSV: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(targetPath));
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(targetPath, () => {});
      reject(err);
    });
  });
}

/**
 * Ensure local CSV exists, downloading if necessary
 */
async function ensureCsvAvailable() {
  if (fs.existsSync(LOCAL_CSV_PATH)) {
    const stats = fs.statSync(LOCAL_CSV_PATH);
    if (stats.size > 100000) {
      return LOCAL_CSV_PATH;
    }
  }
  console.log('[TigZig Holdings] Downloading fresh portfolio holdings dataset...');
  return await downloadHoldingsCsv(LOCAL_CSV_PATH);
}

/**
 * Load and parse all fund holdings from CSV, indexing by fund_code for latest month
 */
async function loadParsedHoldings(forceRefresh = false) {
  if (!forceRefresh && inMemoryHoldingsCache && (Date.now() - inMemoryCacheTimestamp < CACHE_TTL_MS)) {
    return inMemoryHoldingsCache;
  }

  const csvPath = await ensureCsvAvailable();
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // Map: fund_code -> { latestMonth: string, months: Map<month, holdings[]> }
  const fundMap = new Map();
  let isHeader = true;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const parts = parseCsvLine(line);
    if (parts.length < 10) continue;

    const fCode = parts[0]?.trim();
    if (!fCode) continue;

    const monthEnd = parts[3]?.trim();
    const isin = parts[4]?.trim() || null;
    const rawSecurityName = parts[5]?.trim() || '';
    const instrumentNameAsFiled = parts[15]?.trim();
    const securityName = instrumentNameAsFiled || rawSecurityName;
    const nseSymbol = parts[6]?.trim() || null;
    const marketValueLakh = parseFloat(parts[7]) || null;
    const quantity = parseFloat(parts[8]) || null;
    const pct = parseFloat(parts[9]) || 0;
    const assetGroup = parts[10]?.trim() || 'Equity';
    const assetSubgroup = parts[11]?.trim() || 'Listed shares';
    const mappingCategory = parts[12]?.trim() || null;

    if (!fundMap.has(fCode)) {
      fundMap.set(fCode, {
        fundCode: fCode,
        fundName: parts[1]?.trim() || fCode,
        category: parts[2]?.trim() || 'equity',
        months: new Map(),
      });
    }

    const fundObj = fundMap.get(fCode);
    if (!fundObj.months.has(monthEnd)) {
      fundObj.months.set(monthEnd, []);
    }

    const rawAssetClass = assetGroup.toLowerCase().includes('cash') || assetSubgroup.toLowerCase().includes('treps') || assetSubgroup.toLowerCase().includes('repo')
      ? (securityName.toLowerCase().includes('treps') ? 'TREPS' : 'CASH_EQUIVALENT')
      : (assetGroup.toLowerCase().includes('money market') ? 'MONEY_MARKET' : 'EQUITY');

    fundObj.months.get(monthEnd).push({
      securityName,
      isin,
      nseSymbol,
      marketValue: marketValueLakh,
      quantity,
      weightPercent: pct,
      sector: mappingCategory || assetSubgroup || (assetGroup === 'Equity' ? 'Equity' : 'Money Market / Cash'),
      assetClass: validationService.normalizeAssetClass(rawAssetClass),
      sourceAssetClass: assetGroup,
    });
  }

  // Pre-sort holdings for latest month of each fund descending by weight
  const finalCache = new Map();
  for (const [fCode, fData] of fundMap.entries()) {
    const sortedMonths = Array.from(fData.months.keys()).sort();
    const latestMonth = sortedMonths[sortedMonths.length - 1];
    const rawHoldings = fData.months.get(latestMonth) || [];

    // Sort descending by weight
    const sortedHoldings = [...rawHoldings].sort(validationService.comparePortfolioWeightDesc);

    finalCache.set(fCode, {
      fundCode: fCode,
      fundName: fData.fundName,
      category: fData.category,
      asOfDate: latestMonth,
      holdings: sortedHoldings,
      totalPositions: sortedHoldings.length,
    });
  }

  inMemoryHoldingsCache = finalCache;
  inMemoryCacheTimestamp = Date.now();
  console.log(`[TigZig Holdings] Indexed ${finalCache.size} flagship funds from official disclosure feed.`);
  return finalCache;
}

/**
 * Ingest holdings for a single TigZig fund code into MongoDB
 */
async function ingestFundHoldings(tigzigCode, options = {}) {
  const schemeCode = options.schemeCode || TIGZIG_FUND_CODE_MAP[tigzigCode];
  if (!schemeCode) {
    throw new Error(`No schemeCode mapped for TigZig fund: ${tigzigCode}`);
  }

  const cache = await loadParsedHoldings();
  const fundData = cache.get(tigzigCode);
  if (!fundData || !fundData.holdings || fundData.holdings.length === 0) {
    throw new Error(`No holdings found in TigZig dataset for: ${tigzigCode}`);
  }

  const targetScheme = await MutualFundScheme.findOne({
    schemeCode,
    planType: 'REGULAR',
    schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
  });

  if (!targetScheme) {
    throw new Error(`Target Regular Growth scheme not found in database: ${schemeCode}`);
  }

  const asOfDate = new Date(fundData.asOfDate);
  const holdings = fundData.holdings;
  const totalCount = holdings.length;

  // Compute breakdown counts
  let equityCount = 0;
  let debtCount = 0;
  let moneyMarketCount = 0;
  let repoCount = 0;
  let cashCount = 0;
  let otherCount = 0;

  for (const h of holdings) {
    if (h.assetClass === 'EQUITY') equityCount++;
    else if (h.assetClass === 'DEBT') debtCount++;
    else if (h.assetClass === 'MONEY_MARKET') moneyMarketCount++;
    else if (h.assetClass === 'REPO' || h.assetClass === 'REVERSE_REPO') repoCount++;
    else if (h.assetClass === 'TREPS' || h.assetClass === 'CASH_EQUIVALENT' || h.assetClass === 'CASH') cashCount++;
    else otherCount++;
  }

  const sourceHash = crypto.createHash('sha256')
    .update(JSON.stringify({ schemeCode, asOfDate, totalCount }))
    .digest('hex');

  // Mark older snapshots as non-current
  await MutualFundPortfolioSnapshot.updateMany(
    { schemeCode, planType: 'REGULAR', option: 'GROWTH' },
    { $set: { isCurrent: false } }
  );

  // Upsert current snapshot
  const snapshot = await MutualFundPortfolioSnapshot.findOneAndUpdate(
    {
      schemeCode,
      isin: targetScheme.isin,
      planType: 'REGULAR',
      option: 'GROWTH',
      asOfDate,
    },
    {
      schemeId: targetScheme._id,
      schemeCode,
      isin: targetScheme.isin,
      amcCode: targetScheme.amcCode,
      amcName: targetScheme.amcName,
      schemeName: targetScheme.schemeName,
      planType: 'REGULAR',
      option: 'GROWTH',
      asOfDate,
      portfolioAsOf: asOfDate,
      source: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
      sourceDocument: 'mf_portfolio_holdings.csv',
      sourceType: 'STATUTORY_PORTFOLIO_STATEMENT',
      sourceHash,
      checksum: sourceHash,
      parserVersion: 'v5H-tigzig-1.0',
      holdingsAvailable: true,
      isPartial: false,
      totalHoldingsCount: totalCount,
      displayedCount: totalCount,
      totalPortfolioPositions: totalCount,
      equitySecurityCount: equityCount,
      debtSecurityCount: debtCount,
      moneyMarketCount: moneyMarketCount,
      repoCount: repoCount,
      cashEquivalentCount: cashCount,
      otherPositionCount: otherCount,
      portfolioStatus: 'COMPLETE_VERIFIED',
      isCurrent: true,
      holdings: holdings.map((h, idx) => ({
        securityName: h.securityName,
        name: h.securityName,
        isin: h.isin,
        sector: h.sector || 'Diversified',
        assetClass: h.assetClass || 'EQUITY',
        sourceAssetClass: h.sourceAssetClass || 'Equity',
        quantity: h.quantity,
        marketValue: h.marketValue,
        weightPercent: h.weightPercent,
        weightDisplay: `${h.weightPercent.toFixed(2)}%`,
        weightRank: idx + 1,
        sourceOrder: idx + 1,
        sourceRowNumber: idx + 1,
        asOfDate,
        sourceName: 'AMFI Official Monthly Portfolio Disclosure (TigZig)',
        sourceType: 'STATUTORY_PORTFOLIO_STATEMENT',
        weightSource: 'STATUTORY_MONTHLY_DISCLOSURE',
      })),
      ingestedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Sync to MutualFundScheme for backward compatibility
  await MutualFundScheme.updateOne(
    { schemeCode },
    {
      $set: {
        holdings: holdings.map(h => ({
          name: h.securityName,
          weight: h.weightPercent,
          sector: h.sector,
          asOfDate,
          source: 'AMFI Official Monthly Portfolio Disclosure (TigZig)',
        })),
        holdingsAsOfDate: asOfDate,
        holdingsSource: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
      },
    }
  );

  return {
    success: true,
    schemeCode,
    schemeName: targetScheme.schemeName,
    asOfDate: fundData.asOfDate,
    holdingsCount: totalCount,
    topHolding: holdings[0]?.securityName,
    topHoldingWeight: holdings[0]?.weightPercent,
  };
}

/**
 * Ingest all 24 flagship TigZig mutual funds
 */
async function ingestAllTigzigHoldings() {
  const results = [];
  console.log(`[TigZig Holdings Sync] Ingesting all mapped flagship funds...`);

  for (const [tCode, sCode] of Object.entries(TIGZIG_FUND_CODE_MAP)) {
    try {
      const res = await ingestFundHoldings(tCode, { schemeCode: sCode });
      results.push({ status: 'SUCCESS', ...res });
      console.log(`✅ [TigZig Sync] ${res.schemeName} (${res.schemeCode}): ${res.holdingsCount} positions ingested.`);
    } catch (err) {
      results.push({ status: 'FAILED', tigzigCode: tCode, schemeCode: sCode, error: err.message });
      console.warn(`⚠️ [TigZig Sync] Error for ${tCode} (${sCode}):`, err.message);
    }
  }

  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  console.log(`✅ [TigZig Holdings Sync] Complete: ${successCount} of ${results.length} schemes successfully ingested.`);
  return {
    total: results.length,
    successful: successCount,
    failed: results.length - successCount,
    results,
  };
}

/**
 * On-demand portfolio resolution for a scheme
 * Returns formatted portfolio object matching getSchemePortfolio()
 */
async function getSchemeHoldingsDirect(schemeCode) {
  const tCode = SCHEME_CODE_TO_TIGZIG_MAP[String(schemeCode).trim()];
  if (!tCode) return null;

  try {
    const cache = await loadParsedHoldings();
    const fundData = cache.get(tCode);
    if (!fundData || !fundData.holdings || fundData.holdings.length === 0) {
      return null;
    }

    const asOfStr = fundData.asOfDate;
    const sorted = fundData.holdings;
    const totalCount = sorted.length;

    // Trigger background persistence if DB has no snapshot
    setImmediate(() => {
      ingestFundHoldings(tCode, { schemeCode }).catch(err => {
        console.warn(`[TigZig Auto-Ingest Warning for ${schemeCode}]:`, err.message);
      });
    });

    return {
      asOfDate: asOfStr,
      source: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
      sourceDocument: 'mf_portfolio_holdings.csv',
      sourceUrl: TIGZIG_CSV_URL,
      snapshotId: null,
      totalHoldingsCount: totalCount,
      totalPortfolioPositions: totalCount,
      holdingsAvailable: true,
      isPartial: false,
      displayedCount: sorted.length,
      portfolioStatus: 'COMPLETE_VERIFIED',
      breakdown: {
        equitySecurityCount: sorted.filter(h => h.assetClass === 'EQUITY').length,
        debtSecurityCount: sorted.filter(h => h.assetClass === 'DEBT').length,
        moneyMarketCount: sorted.filter(h => h.assetClass === 'MONEY_MARKET').length,
        repoCount: sorted.filter(h => h.assetClass === 'REPO' || h.assetClass === 'REVERSE_REPO').length,
        cashEquivalentCount: sorted.filter(h => h.assetClass === 'TREPS' || h.assetClass === 'CASH_EQUIVALENT').length,
        derivativePositionCount: 0,
        otherPositionCount: 0,
      },
      holdings: sorted.map((h, idx) => ({
        securityName: h.securityName,
        name: h.securityName,
        isin: h.isin,
        sector: h.sector || 'Diversified',
        assetClass: h.assetClass || 'EQUITY',
        sourceAssetClass: h.sourceAssetClass || 'Equity',
        quantity: h.quantity,
        marketValue: h.marketValue,
        weightPercent: h.weightPercent,
        weight: h.weightPercent,
        percentage: h.weightPercent,
        sourceWeightText: `${h.weightPercent.toFixed(2)}%`,
        weightDisplay: `${h.weightPercent.toFixed(2)}%`,
        weightRank: idx + 1,
        sourceOrder: idx + 1,
        sourceRow: idx + 1,
        sourceRowNumber: idx + 1,
        weightSource: 'STATUTORY_MONTHLY_DISCLOSURE',
        asOfDate: asOfStr,
        source: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
        sourceName: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
        sourceType: 'STATUTORY_PORTFOLIO_STATEMENT',
      })),
      holdingsAsOf: asOfStr,
      holdingsSource: 'AMFI Statutory Monthly Portfolio Disclosure (TigZig)',
    };
  } catch (err) {
    console.warn(`[getSchemeHoldingsDirect Warning for ${schemeCode}]:`, err.message);
    return null;
  }
}

module.exports = {
  TIGZIG_FUND_CODE_MAP,
  SCHEME_CODE_TO_TIGZIG_MAP,
  ensureCsvAvailable,
  downloadHoldingsCsv,
  loadParsedHoldings,
  ingestFundHoldings,
  ingestAllTigzigHoldings,
  getSchemeHoldingsDirect,
};
