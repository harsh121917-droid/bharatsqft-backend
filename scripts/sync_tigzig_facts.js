/**
 * scripts/sync_tigzig_facts.js
 * 
 * Synchronizes mutual fund schemes with TigZig AMFI open master for:
 * 1. Scheme Details (Min Purchase Amount, Min SIP, Benchmark, Exit Load, Riskometer)
 * 2. TER (Expense Ratio - Regular Plan)
 * 3. Fund Managers (Full names, roles, tenure)
 * 4. AUM (Total Fund AUM in Crores)
 * 
 * Usage:
 *   node scripts/sync_tigzig_facts.js
 *   node scripts/sync_tigzig_facts.js --limit=50
 *   node scripts/sync_tigzig_facts.js --all
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { syncSchemesWithTigzig } = require('../services/mfMarketSyncService');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is not defined in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let limit = null;
  let onlyMissing = true;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--all') {
      onlyMissing = false;
    }
  }

  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to MongoDB.');

  console.log(`📡 Starting TigZig statutory facts sync (limit: ${limit || 'ALL'}, onlyMissing: ${onlyMissing})...`);
  const startTime = Date.now();

  const report = await syncSchemesWithTigzig({ batchSize: 50, limit, onlyMissing });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Sync finished in ${durationSec}s!`);
  console.log(`   Processed: ${report.processed}`);
  console.log(`   Modified : ${report.modified}`);

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
