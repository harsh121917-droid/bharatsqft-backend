/**
 * scripts/syncAmfiMarketData.js
 * 
 * Standalone CLI runner to trigger full AMFI & Statutory Factsheet synchronization:
 * 1. AMFI Official Daily NAVs (from NAVAll.txt)
 * 2. Scheme-level AUMs (Fund Sizes), Fund Managers, TER, and Benchmarks
 * 
 * Usage:
 *   node scripts/syncAmfiMarketData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const mfMarketSyncService = require('../services/mfMarketSyncService');

async function main() {
  console.log('=== VikaOne Mutual Fund Dynamic Market Data Sync ===');
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  try {
    // 1. Sync AMFI Daily NAVs
    console.log('[1/2] Initiating AMFI Official Daily NAV Sync...');
    try {
      const navResult = await mfMarketSyncService.syncAmfiDailyNavs();
      console.log(`[1/2] NAV Sync Result: ${navResult.updated} schemes updated.\n`);
    } catch (e) {
      console.warn(`[1/2] NAV Sync Warning (non-fatal):`, e.message, '\n');
    }

    // 2. Sync Statutory Scheme Facts (AUM, Managers, TER, Benchmark)
    console.log('[2/2] Initiating Statutory Scheme Facts (AUM, Managers, TER) Sync...');
    const factsResult = await mfMarketSyncService.syncAllVerifiedSchemeFacts();
    console.log(`[2/2] Scheme Facts Result: ${factsResult.modified} schemes modified.\n`);

    console.log('=== All Market Data Synchronized Successfully ===');
  } catch (err) {
    console.error('❌ Sync failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  }
}

main();
