/**
 * VikaOne Mutual Fund — Phase 5G Portfolio Ingestion Script
 * Ingests all authoritative AMC statutory disclosure files in data/amc_disclosures/
 * into immutable MutualFundPortfolioSnapshot collection using MfPortfolioSnapshotService.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const snapshotService = require('../services/mfPortfolioSnapshotService');

const DISCLOSURES_DIR = path.join(__dirname, '..', 'data', 'amc_disclosures');

async function runIngestion() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('[Ingestion] Connected to MongoDB');

  const files = fs.readdirSync(DISCLOSURES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`[Ingestion] Found ${files.length} statutory disclosure files to ingest.`);

  const results = [];

  for (const file of files) {
    const filePath = path.join(DISCLOSURES_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    try {
      const snap = await snapshotService.saveSnapshot(data);
      console.log(`[Ingestion SUCCESS] Scheme ${data.schemeCode} (${data.schemeName}): ${snap.holdings.length} positions ingested (total: ${snap.totalPortfolioPositions}, isPartial: ${snap.isPartial})`);
      results.push({
        file,
        schemeCode: data.schemeCode,
        status: 'SUCCESS',
        positionsCount: snap.holdings.length,
        totalPortfolioPositions: snap.totalPortfolioPositions,
        isPartial: snap.isPartial,
        asOfDate: snap.asOfDate.toISOString().split('T')[0],
      });
    } catch (err) {
      console.error(`[Ingestion ERROR] Scheme ${data.schemeCode} (${file}):`, err.message);
      results.push({
        file,
        schemeCode: data.schemeCode,
        status: 'ERROR',
        error: err.message,
      });
    }
  }

  console.log('\n=== INGESTION SUMMARY ===');
  console.table(results);

  await mongoose.disconnect();
  console.log('[Ingestion] Complete.');
}

if (require.main === module) {
  runIngestion().catch((err) => {
    console.error('[Ingestion Fatal]:', err);
    process.exit(1);
  });
}

module.exports = { runIngestion };
