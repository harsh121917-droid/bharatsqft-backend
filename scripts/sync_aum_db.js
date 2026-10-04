/**
 * scripts/sync_aum_db.js
 * 
 * Synchronizes MongoDB MutualFundScheme documents with canonical Phase 5I AUM provenance:
 * - 22 Verified Factsheet Schemes: updated with verified factsheet AUM and full provenance metadata.
 * - All remaining Regular Growth schemes: updated with aum: null, status: 'SOURCE_UNAVAILABLE', preserving provenance invariants.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/MutualFundScheme');
const mfAumService = require('../services/mfAumService');
const mfIntelligenceService = require('../services/mfIntelligenceService');

async function syncAumDb() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  const filter = {
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  };

  const schemes = await Scheme.find(filter).lean();
  console.log(`Auditing and synchronizing ${schemes.length} customer-visible Regular + Growth schemes...`);

  const verifiedCodes = new Set(mfIntelligenceService.getVerifiedSchemeCodes());
  let verifiedCount = 0;
  let unavailableCount = 0;
  const ops = [];

  for (const doc of schemes) {
    const sCode = doc.schemeCode;
    const hasStaticIntel = verifiedCodes.has(sCode);

    if (hasStaticIntel) {
      const aumInfo = mfAumService.resolveSchemeAum(doc);
      if (aumInfo.status === 'VERIFIED') {
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                aum: aumInfo.value,
                aumAsOfDate: aumInfo.asOfDate,
                aumSource: aumInfo.sourceName,
                aumStatus: 'VERIFIED',
                aumSourceType: aumInfo.sourceType,
                aumSourceDocument: aumInfo.sourceDocument,
                aumSourceHash: aumInfo.sourceHash,
                aumDefinition: 'SCHEME_AUM',
                aumUnit: 'CRORE',
              },
            },
          },
        });
        verifiedCount++;
        continue;
      }
    }

    // Unverified / statutory factsheet unavailable: null out any naked or stale numbers
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            aum: null,
            aumAsOfDate: null,
            aumSource: null,
            aumStatus: 'SOURCE_UNAVAILABLE',
            aumSourceType: null,
            aumSourceDocument: null,
            aumSourceHash: null,
            aumDefinition: 'SCHEME_AUM',
            aumUnit: 'CRORE',
          },
        },
      },
    });
    unavailableCount++;
  }

  console.log(`Executing ${ops.length} bulk operations...`);
  const result = await Scheme.bulkWrite(ops, { ordered: false });
  console.log(`Bulk write complete: matched ${result.matchedCount}, modified ${result.modifiedCount}`);

  console.log(`\nSynchronization Summary:`);
  console.log(`  Total schemes processed:      ${schemes.length}`);
  console.log(`  Verified Scheme AUM in DB:    ${verifiedCount}`);
  console.log(`  Unavailable Scheme AUM in DB: ${unavailableCount}`);
  console.log(`  Sum:                          ${verifiedCount + unavailableCount}`);

  await mongoose.disconnect();
}

syncAumDb().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
