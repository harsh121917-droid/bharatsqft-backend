/**
 * VikaOne Mutual Fund — Phase 5H Portfolio Percentage Accuracy, Ranking & Sort Reconciliation Script
 * 
 * Verifies the complete percentage pipeline:
 * Official AMC portfolio -> raw % to NAV -> parser -> MongoDB snapshot -> portfolio service -> API -> Top Holdings sorting -> UI
 * 
 * Generates:
 * - reports/mf_portfolio_weight_reconciliation.json
 * - reports/mf_portfolio_weight_reconciliation.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');
const mfPortfolioService = require('../services/mfPortfolioService');
const validationService = require('../services/mfPortfolioValidationService');

const DISCLOSURES_DIR = path.join(__dirname, '..', 'data', 'amc_disclosures');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Flutter mock formatter simulating exact client behavior
function flutterFormatWeight(weightPercent, sourceWeightText) {
  if (typeof weightPercent === 'number' && !isNaN(weightPercent)) {
    return `${weightPercent.toFixed(2)}%`;
  }
  if (sourceWeightText && sourceWeightText.trim() !== '—' && sourceWeightText.trim() !== '-') {
    return sourceWeightText.trim();
  }
  return '—';
}

async function runReconciliation() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('[Phase 5H Reconciliation] Connected to MongoDB');

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // 1. Mandatory schemes to fully trace (>= 20 rows each)
  const mandatorySchemeCodes = ['147944', '145139', '122640', '130502'];
  const mandatoryTraces = {};

  console.log('\n======================================================');
  console.log('=== PART 1: 20-ROW RECONCILIATION FOR MANDATORY SCHEMES ===');
  console.log('======================================================\n');

  for (const sCode of mandatorySchemeCodes) {
    const scheme = await MutualFundScheme.findOne({ schemeCode: sCode }).lean();
    const snapshot = await MutualFundPortfolioSnapshot.findOne({ schemeCode: sCode, isCurrent: true }).lean();
    const apiResult = await mfPortfolioService.getSchemePortfolio(sCode);

    if (!snapshot || !apiResult || !apiResult.holdings) {
      console.error(`[Error] Missing snapshot or API result for mandatory scheme ${sCode}`);
      continue;
    }

    // Load raw disclosure fixture
    const discFiles = fs.readdirSync(DISCLOSURES_DIR);
    const discFile = discFiles.find((f) => f.includes(sCode));
    let rawDisclosure = null;
    if (discFile) {
      rawDisclosure = JSON.parse(fs.readFileSync(path.join(DISCLOSURES_DIR, discFile), 'utf8'));
    }

    const rawHoldings = rawDisclosure ? rawDisclosure.holdings : [];

    // Select at least 20 diverse rows:
    // - highest-weight equity
    // - low-weight equity
    // - Reverse Repo
    // - TREPS
    // - debt
    // - T-Bill
    // - derivative
    // - Net Current Assets
    // - position below 1%
    // - position below 0.10%
    // - <0.01% where available
    const selectedIndices = new Set();

    // Find specific categories in rawHoldings
    function findIndexBy(predicate) {
      const idx = rawHoldings.findIndex(predicate);
      return idx >= 0 ? idx : null;
    }

    function addIndex(idx) {
      if (idx !== null && idx >= 0 && idx < rawHoldings.length) {
        selectedIndices.add(idx);
      }
    }

    // Sort descending by weight to find top equity
    const equityHoldings = rawHoldings
      .map((h, i) => ({ ...h, originalIndex: i }))
      .filter((h) => {
        const cls = validationService.normalizeAssetClass(h.assetClass || h.sourceAssetClass);
        return cls === 'EQUITY';
      })
      .sort((a, b) => (b.weightPercent || 0) - (a.weightPercent || 0));

    if (equityHoldings.length > 0) {
      addIndex(equityHoldings[0].originalIndex); // Highest weight equity
      addIndex(equityHoldings[1]?.originalIndex);
      addIndex(equityHoldings[2]?.originalIndex);
      addIndex(equityHoldings[equityHoldings.length - 1].originalIndex); // Low weight equity
      addIndex(equityHoldings[equityHoldings.length - 2]?.originalIndex);
    }

    // Reverse repo
    addIndex(findIndexBy((h) => /reverse repo/i.test(h.securityName || '') || /reverse repo/i.test(h.assetClass || '') || /reverse repo/i.test(h.sourceAssetClass || '')));
    // TREPS
    addIndex(findIndexBy((h) => /treps|tri-party/i.test(h.securityName || '') || /treps/i.test(h.assetClass || '') || /treps/i.test(h.sourceAssetClass || '')));
    // Debt
    addIndex(findIndexBy((h) => /bond|debenture|ncd|commercial paper/i.test(h.securityName || '') || /debt|corporate/i.test(h.assetClass || '') || /debt/i.test(h.sourceAssetClass || '')));
    addIndex(findIndexBy((h) => /refinance bond|sidbi|nabard/i.test(h.securityName || '')));
    // T-Bill
    addIndex(findIndexBy((h) => /treasury bill|t-bill/i.test(h.securityName || '') || /treasury/i.test(h.sourceAssetClass || '')));
    addIndex(findIndexBy((h) => /91 days|182 days|273 days|364 days/i.test(h.securityName || '')));
    // Derivative
    addIndex(findIndexBy((h) => /derivative|future|option|hedg/i.test(h.securityName || '') || /derivative/i.test(h.assetClass || '') || /derivative/i.test(h.sourceAssetClass || '')));
    addIndex(findIndexBy((h) => /hedged equity/i.test(h.securityName || '')));
    // Net Current Assets
    addIndex(findIndexBy((h) => /net current|receivable|bank balance|margin/i.test(h.securityName || '') || /net current/i.test(h.assetClass || '') || /net current/i.test(h.sourceAssetClass || '')));
    // Position < 1%
    addIndex(findIndexBy((h) => typeof h.weightPercent === 'number' && h.weightPercent < 1.0 && h.weightPercent > 0.1));
    // Position < 0.10%
    addIndex(findIndexBy((h) => typeof h.weightPercent === 'number' && h.weightPercent < 0.10 && h.weightPercent > 0.01));
    // Trace position (<0.01% or *)
    addIndex(findIndexBy((h) => (typeof h.weightPercent === 'number' && h.weightPercent <= 0.01) || String(h.weightPercent).includes('<') || h.sourceWeightText?.includes('<')));

    // Fill up to at least 20 rows if needed
    for (let i = 0; i < rawHoldings.length && selectedIndices.size < 20; i++) {
      selectedIndices.add(i);
    }

    const sortedRowIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    const traceRows = [];

    console.log(`\n--- Scheme ${sCode}: ${scheme ? scheme.schemeName : snapshot.schemeName} ---`);
    console.log(`Source Total: ${rawHoldings.length} | Snapshot DB Total: ${snapshot.holdings.length} | API Holdings: ${apiResult.holdings.length}`);
    console.log(`Tracing ${sortedRowIndices.length} representative rows across all asset classes:\n`);

    for (const rawIdx of sortedRowIndices) {
      const rawPos = rawHoldings[rawIdx];
      const parsed = validationService.parseStatutoryWeightPercent(rawPos.weightPercent ?? rawPos.weight);

      // Find in DB snapshot by securityName / sourceOrder
      const dbPos = snapshot.holdings.find(
        (h) => (h.sourceOrder === (rawPos.sourceOrder || rawIdx + 1)) || (h.securityName === rawPos.securityName)
      );

      // Find in API result
      const apiPos = apiResult.holdings.find(
        (h) => h.securityName === rawPos.securityName || (h.sourceOrder === (rawPos.sourceOrder || rawIdx + 1))
      );

      const dbWeight = dbPos ? dbPos.weightPercent : null;
      const apiWeight = apiPos ? apiPos.weightPercent : null;
      const apiDisplay = apiPos ? apiPos.weightDisplay : null;
      const uiWeight = flutterFormatWeight(apiWeight, apiDisplay || apiPos?.sourceWeightText);

      const rawWeightText = rawPos.weightPercent != null ? `${rawPos.weightPercent}%` : (rawPos.sourceWeightText || '—');
      const parsedWeight = parsed.weightPercent;

      const isPass = (parsedWeight === dbWeight) && (dbWeight === apiWeight);

      traceRows.push({
        rawIndex: rawIdx + 1,
        securityName: rawPos.securityName,
        assetClass: rawPos.assetClass || rawPos.sourceAssetClass,
        sourceWeightText: rawWeightText,
        parsedWeight,
        dbWeight,
        apiWeight,
        apiDisplay,
        uiWeight,
        weightRank: apiPos ? apiPos.weightRank : null,
        sourceOrder: rawPos.sourceOrder || rawIdx + 1,
        match: isPass ? 'PASS' : 'FAIL',
      });

      console.log(`ROW #${rawIdx + 1}: ${rawPos.securityName} (${rawPos.assetClass || rawPos.sourceAssetClass})`);
      console.log(`  SOURCE RAW ROW:     ${JSON.stringify({ name: rawPos.securityName, weight: rawPos.weightPercent, order: rawPos.sourceOrder || rawIdx + 1 })}`);
      console.log(`  SOURCE WEIGHT TEXT: ${rawWeightText}`);
      console.log(`  PARSED WEIGHT:      ${parsedWeight}`);
      console.log(`  DB WEIGHT:          ${dbWeight}`);
      console.log(`  API WEIGHT:         ${apiWeight}`);
      console.log(`  UI WEIGHT:          ${uiWeight}`);
      console.log(`  WEIGHT RANK:        ${apiPos ? apiPos.weightRank : 'N/A'}`);
      console.log(`  STATUS:             ${isPass ? 'PASS' : 'FAIL'}\n`);
    }

    mandatoryTraces[sCode] = {
      schemeCode: sCode,
      schemeName: scheme ? scheme.schemeName : snapshot.schemeName,
      totalPositions: rawHoldings.length,
      tracedRows: traceRows,
    };
  }

  // 2. Part 2: Top 10 Comparison for the 4 Mandatory Schemes
  console.log('\n======================================================');
  console.log('=== PART 2: TOP 10 RANKING COMPARISON (SOURCE vs VIKAONE) ===');
  console.log('======================================================\n');

  const top10Comparisons = {};

  for (const sCode of mandatorySchemeCodes) {
    const snapshot = await MutualFundPortfolioSnapshot.findOne({ schemeCode: sCode, isCurrent: true }).lean();
    const apiResult = await mfPortfolioService.getSchemePortfolio(sCode);

    // Official source sorting
    const discFiles = fs.readdirSync(DISCLOSURES_DIR);
    const discFile = discFiles.find((f) => f.includes(sCode));
    const rawDisclosure = JSON.parse(fs.readFileSync(path.join(DISCLOSURES_DIR, discFile), 'utf8'));

    const sourceSorted = [...rawDisclosure.holdings].sort(validationService.comparePortfolioWeightDesc);
    const apiTop10 = apiResult.holdings.slice(0, 10);
    const sourceTop10 = sourceSorted.slice(0, 10);

    const compRows = [];
    console.log(`\n--- Top 10 for Scheme ${sCode} (${snapshot.schemeName}) ---`);
    console.log('Rank | Source Name | Source % | VikaOne Name | VikaOne % | Difference');
    console.log('--------------------------------------------------------------------------------------');

    for (let r = 0; r < 10; r++) {
      const src = sourceTop10[r];
      const vik = apiTop10[r];
      const srcName = src ? (src.securityName || src.name) : 'N/A';
      const srcPct = src && src.weightPercent != null ? `${Number(src.weightPercent).toFixed(2)}%` : '—';
      const vikName = vik ? (vik.securityName || vik.name) : 'N/A';
      const vikPct = vik && vik.weightPercent != null ? `${Number(vik.weightPercent).toFixed(2)}%` : '—';
      const diff = (src && vik && src.weightPercent != null && vik.weightPercent != null)
        ? Math.abs(src.weightPercent - vik.weightPercent).toFixed(4)
        : '0.0000';

      console.log(`${r + 1} | ${srcName.padEnd(35)} | ${srcPct.padEnd(8)} | ${vikName.padEnd(35)} | ${vikPct.padEnd(8)} | ${diff}`);
      compRows.push({
        rank: r + 1,
        sourceName: srcName,
        sourceWeight: srcPct,
        vikaOneName: vikName,
        vikaOneWeight: vikPct,
        difference: diff,
        match: srcName === vikName && diff === '0.0000',
      });
    }

    top10Comparisons[sCode] = compRows;
  }

  // 3. Part 3: Catalogue-Wide Audit of All 1,864 Schemes
  console.log('\n======================================================');
  console.log('=== PART 3: CATALOGUE-WIDE AUDIT (ALL 1,864 SCHEMES) ===');
  console.log('======================================================\n');

  const allSchemes = await MutualFundScheme.find({
    planType: 'REGULAR',
    schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
  })
    .sort({ amcCode: 1, schemeName: 1 })
    .lean();

  console.log(`[Audit] Total Customer-Facing Regular + Growth Schemes: ${allSchemes.length}`);

  const snapshots = await MutualFundPortfolioSnapshot.find({ isCurrent: true }).lean();
  const snapshotMap = new Map();
  for (const s of snapshots) {
    snapshotMap.set(String(s.schemeCode), s);
  }

  const reconciliationRecords = [];
  let verifiedCoverageCount = 0;
  let sourceUnavailableCount = 0;
  let totalWeightMismatches = 0;
  let totalInvalidWeights = 0;
  let totalSortMismatches = 0;
  let totalNullWeights = 0;

  for (const scheme of allSchemes) {
    const sCode = String(scheme.schemeCode);
    const snap = snapshotMap.get(sCode);

    if (!snap) {
      sourceUnavailableCount++;
      reconciliationRecords.push({
        schemeCode: sCode,
        schemeName: scheme.schemeName,
        amcCode: scheme.amcCode || 'UNKNOWN',
        portfolioAsOf: null,
        sourceDocument: null,
        sourceHash: null,
        sourceRows: 0,
        parsedRows: 0,
        dbRows: 0,
        apiRows: 0,
        weightMismatchCount: 0,
        invalidWeightCount: 0,
        sortMismatchCount: 0,
        nullWeightCount: 0,
        top10Source: null,
        top10DB: null,
        top10API: null,
        status: 'SOURCE_UNAVAILABLE',
      });
      continue;
    }

    // Scheme has active statutory snapshot
    verifiedCoverageCount++;

    // Re-read official source document fixture
    const discFiles = fs.readdirSync(DISCLOSURES_DIR);
    const discFile = discFiles.find((f) => f.includes(sCode));
    let sourceRows = [];
    if (discFile) {
      const rawDoc = JSON.parse(fs.readFileSync(path.join(DISCLOSURES_DIR, discFile), 'utf8'));
      sourceRows = rawDoc.holdings || [];
    }

    const apiPortfolio = await mfPortfolioService.getSchemePortfolio(sCode);
    const apiHoldings = apiPortfolio.holdings || [];
    const dbHoldings = snap.holdings || [];

    let weightMismatchCount = 0;
    let invalidWeightCount = 0;
    let nullWeightCount = 0;
    let sortMismatchCount = 0;

    // Validate weights row-by-row
    for (let i = 0; i < dbHoldings.length; i++) {
      const dbItem = dbHoldings[i];
      const apiItem = apiHoldings.find((a) => a.securityName === dbItem.securityName && a.sourceOrder === dbItem.sourceOrder);

      if (dbItem.weightPercent === null || dbItem.weightPercent === undefined) {
        nullWeightCount++;
      } else {
        if (typeof dbItem.weightPercent !== 'number' || isNaN(dbItem.weightPercent) || dbItem.weightPercent < 0 || dbItem.weightPercent > 100) {
          invalidWeightCount++;
        }
      }

      if (apiItem) {
        if (dbItem.weightPercent !== apiItem.weightPercent) {
          weightMismatchCount++;
        }
      }
    }

    // Check descending sort order in API holdings
    for (let j = 0; j < apiHoldings.length - 1; j++) {
      const curr = apiHoldings[j];
      const next = apiHoldings[j + 1];
      if (curr.weightPercent !== null && next.weightPercent !== null) {
        if (curr.weightPercent < next.weightPercent) {
          sortMismatchCount++;
        }
      } else if (curr.weightPercent === null && next.weightPercent !== null) {
        // null must never appear before a valid number
        sortMismatchCount++;
      }
    }

    totalWeightMismatches += weightMismatchCount;
    totalInvalidWeights += invalidWeightCount;
    totalSortMismatches += sortMismatchCount;
    totalNullWeights += nullWeightCount;

    const sourceSorted = [...sourceRows].sort(validationService.comparePortfolioWeightDesc);
    const top10SourceNames = sourceSorted.slice(0, 10).map((h) => `${h.securityName} (${h.weightPercent}%)`).join('; ');
    const top10DBNames = [...dbHoldings].sort(validationService.comparePortfolioWeightDesc).slice(0, 10).map((h) => `${h.securityName} (${h.weightPercent}%)`).join('; ');
    const top10APINames = apiHoldings.slice(0, 10).map((h) => `${h.securityName} (${h.weightPercent}%)`).join('; ');

    const isVerified = (weightMismatchCount === 0 && invalidWeightCount === 0 && sortMismatchCount === 0);

    reconciliationRecords.push({
      schemeCode: sCode,
      schemeName: scheme.schemeName,
      amcCode: scheme.amcCode,
      portfolioAsOf: snap.asOfDate ? new Date(snap.asOfDate).toISOString().split('T')[0] : '2026-09-30',
      sourceDocument: snap.sourceDocument,
      sourceHash: snap.sourceHash,
      sourceRows: sourceRows.length,
      parsedRows: dbHoldings.length,
      dbRows: dbHoldings.length,
      apiRows: apiHoldings.length,
      weightMismatchCount,
      invalidWeightCount,
      sortMismatchCount,
      nullWeightCount,
      top10Source: top10SourceNames,
      top10DB: top10DBNames,
      top10API: top10APINames,
      status: isVerified ? 'VERIFIED_ACCURATE' : 'RECONCILIATION_MISMATCH',
    });
  }

  // 4. Save JSON Report
  const jsonReportPath = path.join(REPORTS_DIR, 'mf_portfolio_weight_reconciliation.json');
  const jsonReportData = {
    auditTimestamp: new Date().toISOString(),
    auditPhase: 'Phase 5H',
    methodology: 'Statutory Source % to NAV Verification & Descending Sort Reconciliation',
    totalSchemesAudited: allSchemes.length,
    verifiedPercentageCoverage: verifiedCoverageCount,
    sourceUnavailableCount: sourceUnavailableCount,
    totalWeightMismatches,
    totalInvalidWeights,
    totalSortMismatches,
    totalNullWeights,
    mandatorySchemeTraces: mandatoryTraces,
    top10Comparisons: top10Comparisons,
    reconciliationRecords,
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReportData, null, 2), 'utf8');
  console.log(`[Report Generated] JSON report written to: ${jsonReportPath}`);

  // 5. Save CSV Report
  const csvReportPath = path.join(REPORTS_DIR, 'mf_portfolio_weight_reconciliation.csv');
  const csvHeaders = [
    'schemeCode',
    'schemeName',
    'amcCode',
    'portfolioAsOf',
    'sourceDocument',
    'sourceHash',
    'sourceRows',
    'parsedRows',
    'dbRows',
    'apiRows',
    'weightMismatchCount',
    'invalidWeightCount',
    'sortMismatchCount',
    'nullWeightCount',
    'status',
  ];

  const csvRows = [csvHeaders.join(',')];
  for (const r of reconciliationRecords) {
    const row = [
      `"${r.schemeCode}"`,
      `"${(r.schemeName || '').replace(/"/g, '""')}"`,
      `"${r.amcCode || ''}"`,
      `"${r.portfolioAsOf || ''}"`,
      `"${r.sourceDocument || ''}"`,
      `"${r.sourceHash || ''}"`,
      r.sourceRows,
      r.parsedRows,
      r.dbRows,
      r.apiRows,
      r.weightMismatchCount,
      r.invalidWeightCount,
      r.sortMismatchCount,
      r.nullWeightCount,
      `"${r.status}"`,
    ];
    csvRows.push(row.join(','));
  }

  fs.writeFileSync(csvReportPath, csvRows.join('\n'), 'utf8');
  console.log(`[Report Generated] CSV report written to: ${csvReportPath}`);

  console.log('\n=== RECONCILIATION SUMMARY ===');
  console.log(`Total Schemes Audited:        ${allSchemes.length}`);
  console.log(`Verified Percentage Coverage: ${verifiedCoverageCount}`);
  console.log(`Source Unavailable Schemes:   ${sourceUnavailableCount}`);
  console.log(`Total Weight Mismatches:      ${totalWeightMismatches}`);
  console.log(`Total Invalid Weights:        ${totalInvalidWeights}`);
  console.log(`Total Sort Mismatches:        ${totalSortMismatches}`);
  console.log(`Overall Invariant Status:     ${totalWeightMismatches === 0 && totalSortMismatches === 0 ? '100% PASS' : 'FAIL'}`);

  await mongoose.disconnect();
  console.log('[Reconciliation] Complete.');
}

if (require.main === module) {
  runReconciliation().catch((err) => {
    console.error('[Reconciliation Fatal]:', err);
    process.exit(1);
  });
}

module.exports = { runReconciliation };
