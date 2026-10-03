/**
 * VikaOne Mutual Fund — Phase 5C Intelligence Sync
 * Automated synchronization script for verified AMC statutory intelligence.
 * Supports --dry-run and --apply modes.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const { getAllCataloguedSchemes } = require('../services/mfIntelligenceService');

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

async function syncIntelligence() {
  console.log('='.repeat(75));
  console.log('VIKAONE MF PHASE 5C: INTELLIGENCE SYNCHRONIZATION');
  console.log(`MODE: ${isDryRun ? 'DRY-RUN (No Database Mutation)' : 'APPLY (Writing to Database)'}`);
  console.log('='.repeat(75));

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[DB] Connected to MongoDB.');

  const catalog = getAllCataloguedSchemes();
  console.log(`[CATALOG] Ingesting ${catalog.length} statutory scheme records...\n`);

  let updated = 0;
  for (const item of catalog) {
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
      console.warn(`[SKIP] Scheme ${item.schemeCode} (${item.schemeName}) not found in DB.`);
      continue;
    }

    const updateFields = {
      fundManager: item.fundManager,
      fundManagerRole: item.fundManagerRole || null,
      fundManagerDetails: item.fundManagerDetails || [],
      benchmark: item.benchmark,
      benchmarkName: item.benchmarkName || item.benchmark,
      aum: item.aum,
      aumAsOfDate: item.aumAsOfDate || null,
      aumSource: item.aumSource || null,
      expenseRatio: item.expenseRatio,
      expenseRatioAsOfDate: item.expenseRatioAsOfDate || null,
      expenseRatioSource: item.expenseRatioSource || null,
      exitLoad: item.exitLoad,
      exitLoadFlag: item.exitLoadFlag || 'Y',
      riskometer: item.riskometer,
      riskometerAsOfDate: item.riskometerAsOfDate || null,
      inceptionDate: item.inceptionDate,
      investmentObjective: item.investmentObjective || null,
      investmentObjectiveSource: item.investmentObjectiveSource || null,
      minPurchaseAmount: item.minPurchaseAmount || null,
      minSipAmount: item.minSipAmount || null,
      sipDates: Array.isArray(item.sipDates) ? item.sipDates.join(',') : (item.sipDates || null),
      holdings: item.holdings || [],
      holdingsAsOfDate: item.holdingsAsOfDate || null,
      holdingsSource: item.holdingsSource || null,
      dataProvenance: item.dataProvenance,
      intelligenceUpdatedAt: new Date(),
    };

    if (!isDryRun) {
      await MutualFundScheme.updateOne({ _id: existing._id }, { $set: updateFields });
    }
    updated++;
    console.log(`[SYNC] Scheme ${item.schemeCode} (${item.schemeName.slice(0, 35)}...): Ingested`);
  }

  console.log(`\n✅ Finished sync. Schemes processed: ${updated} (Dry run: ${isDryRun})`);
  await mongoose.disconnect();
}

syncIntelligence().catch(console.error);
