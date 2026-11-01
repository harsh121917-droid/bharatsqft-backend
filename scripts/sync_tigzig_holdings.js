/**
 * scripts/sync_tigzig_holdings.js
 * 
 * Synchronizes mutual fund portfolio holdings from TigZig AMFI disclosures.
 * Usage:
 *   node scripts/sync_tigzig_holdings.js
 *   node scripts/sync_tigzig_holdings.js --scheme=113177
 */

require('dotenv').config();
const mongoose = require('mongoose');
const tigzigHoldingsService = require('../services/tigzigHoldingsService');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const args = process.argv.slice(2);
  const schemeArg = args.find(a => a.startsWith('--scheme='));
  const targetScheme = schemeArg ? schemeArg.split('=')[1] : null;

  if (targetScheme) {
    const tCode = tigzigHoldingsService.SCHEME_CODE_TO_TIGZIG_MAP[targetScheme];
    if (!tCode) {
      console.error(`Scheme ${targetScheme} is not in the TigZig flagship mapping.`);
      process.exit(1);
    }
    console.log(`📡 Ingesting holdings for scheme ${targetScheme} (${tCode})...`);
    const res = await tigzigHoldingsService.ingestFundHoldings(tCode, { schemeCode: targetScheme });
    console.log('✅ Ingestion complete:', res);
  } else {
    console.log('📡 Starting full TigZig portfolio holdings synchronization...');
    const report = await tigzigHoldingsService.ingestAllTigzigHoldings();
    console.log('\n📊 Summary Report:');
    console.log(`   Total Schemes: ${report.total}`);
    console.log(`   Successful:    ${report.successful}`);
    console.log(`   Failed:        ${report.failed}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

main().catch(err => {
  console.error('Fatal error during holdings sync:', err);
  process.exit(1);
});
