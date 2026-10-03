/**
 * VikaOne Mutual Fund — Phase 5B Fund Intelligence & Statutory Facts Ingestion
 * 
 * Ingests authoritative statutory disclosures (Tier 2 official AMC factsheets/SIDs)
 * into MongoDB MutualFundScheme collection.
 * 
 * Features:
 * - Safe idempotent upsert
 * - Dry-run mode (--dry-run)
 * - Apply mode (--apply)
 * - Preserves existing valid data (no destructive null overwrite)
 * - Field-level provenance logging
 * - Verification status tracking
 * 
 * Usage:
 *   node scripts/phase5B_fund_intelligence_ingest.js --dry-run
 *   node scripts/phase5B_fund_intelligence_ingest.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const { getAllCataloguedSchemes, getSchemeIntelligence } = require('../services/mfIntelligenceService');

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

async function run() {
  console.log('='.repeat(70));
  console.log(`VIKAONE MF PHASE 5B: STATUTORY INTELLIGENCE INGESTION`);
  console.log(`MODE: ${isDryRun ? 'DRY-RUN (No DB modifications)' : 'APPLY (Writing to DB)'}`);
  console.log('='.repeat(70));

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/bharatsqft';
  await mongoose.connect(mongoUri);
  console.log('[DB] Connected to MongoDB');

  const catalog = getAllCataloguedSchemes();
  console.log(`[CATALOG] Found ${catalog.length} verified statutory scheme records to process.`);

  let matched = 0;
  let updated = 0;
  let missingInDb = 0;
  const results = [];

  for (const item of catalog) {
    // Locate scheme strictly as Regular Plan
    const query = {
      planType: 'REGULAR',
      $or: [
        { schemeCode: item.schemeCode },
        { amfiCode: item.amfiCode },
        { isin: item.isin },
      ],
    };

    const existing = await MutualFundScheme.findOne(query);

    if (!existing) {
      console.warn(`[WARN] Scheme ${item.schemeCode} (${item.schemeName}) not found in DB!`);
      missingInDb++;
      results.push({
        schemeCode: item.schemeCode,
        schemeName: item.schemeName,
        status: 'MISSING_IN_DB',
      });
      continue;
    }

    matched++;

    // Prepare update payload with field-level non-null protection
    const updateFields = {};

    if (item.fundManager) {
      updateFields.fundManager = item.fundManager;
      updateFields.fundManagerRole = item.fundManagerRole || null;
      updateFields.fundManagerDetails = item.fundManagerDetails || [];
      updateFields.fundManagerAsOfDate = item.fundManagerAsOfDate || null;
    }

    if (item.benchmark) {
      updateFields.benchmark = item.benchmark;
      updateFields.benchmarkName = item.benchmarkName || item.benchmark;
      updateFields.benchmarkSource = item.benchmarkSource || null;
    }

    if (item.aum !== undefined && item.aum !== null) {
      updateFields.aum = item.aum;
      updateFields.aumAsOfDate = item.aumAsOfDate || null;
      updateFields.aumSource = item.aumSource || null;
    }

    if (item.expenseRatio !== undefined && item.expenseRatio !== null) {
      updateFields.expenseRatio = item.expenseRatio;
      updateFields.expenseRatioAsOfDate = item.expenseRatioAsOfDate || null;
      updateFields.expenseRatioSource = item.expenseRatioSource || null;
    }

    if (item.exitLoad) {
      updateFields.exitLoad = item.exitLoad;
      updateFields.exitLoadFlag = item.exitLoadFlag || 'Y';
      updateFields.exitLoadSource = item.exitLoadSource || null;
    }

    if (item.riskometer) {
      updateFields.riskometer = item.riskometer;
      updateFields.riskometerAsOfDate = item.riskometerAsOfDate || null;
    }

    if (item.inceptionDate) {
      updateFields.inceptionDate = item.inceptionDate;
    }

    if (item.minPurchaseAmount) {
      updateFields.minPurchaseAmount = item.minPurchaseAmount;
      updateFields.minPurchaseSource = item.minPurchaseSource || null;
    }

    if (item.minSipAmount) {
      updateFields.minSipAmount = item.minSipAmount;
      updateFields.minSipSource = item.minSipSource || null;
    }

    if (Array.isArray(item.holdings) && item.holdings.length > 0) {
      updateFields.holdings = item.holdings;
      updateFields.holdingsAsOfDate = item.holdingsAsOfDate || null;
      updateFields.holdingsSource = item.holdingsSource || null;
    }

    if (item.dataProvenance) {
      updateFields.dataProvenance = item.dataProvenance;
    }

    // Always record intelligence update timestamp
    updateFields.intelligenceUpdatedAt = new Date();

    if (!isDryRun) {
      await MutualFundScheme.updateOne({ _id: existing._id }, { $set: updateFields });
      updated++;
    }

    results.push({
      schemeCode: item.schemeCode,
      schemeName: existing.schemeName,
      isin: existing.isin,
      status: isDryRun ? 'DRY_RUN_VALIDATED' : 'UPDATED',
      fieldsUpdated: Object.keys(updateFields),
      fundManager: updateFields.fundManager,
      aum: updateFields.aum,
      ter: updateFields.expenseRatio,
      benchmark: updateFields.benchmark,
      riskometer: updateFields.riskometer,
      holdingsCount: updateFields.holdings ? updateFields.holdings.length : 0,
    });
  }

  console.log('\n--- INGESTION SUMMARY ---');
  console.log(`Total In Catalog:   ${catalog.length}`);
  console.log(`Matched In DB:      ${matched}`);
  console.log(`Updated In DB:      ${isDryRun ? 0 : updated} (Dry-run: ${isDryRun})`);
  console.log(`Missing In DB:      ${missingInDb}`);
  console.log('\nDetailed Scheme Status:');
  console.table(results.map(r => ({
    Code: r.schemeCode,
    Name: (r.schemeName || '').substring(0, 30),
    Status: r.status,
    Manager: (r.fundManager || '').substring(0, 20),
    AUM: r.aum,
    TER: r.ter,
    Benchmark: (r.benchmark || '').substring(0, 18),
    Risk: r.riskometer,
  })));

  await mongoose.disconnect();
  console.log('\n[DB] Disconnected.');
}

run().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
