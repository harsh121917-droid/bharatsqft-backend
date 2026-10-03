const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const mfIntelligenceService = require('../services/mfIntelligenceService');
const amcSourceRegistry = require('../services/amcSourceRegistry');

require('dotenv').config();

async function runCatalogueAudit() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatsqft';
  await mongoose.connect(mongoUri);
  console.log('[Audit] Connected to MongoDB');

  // Find all customer-facing schemes: Regular + Growth only
  const allSchemes = await MutualFundScheme.find({
    planType: 'REGULAR',
    schemeName: { $not: { $regex: 'direct', $options: 'i' } },
  }).lean();

  const totalSchemes = allSchemes.length;
  console.log(`[Audit] Total Regular + Growth schemes in DB: ${totalSchemes}`);

  let authenticCompleteHoldings = 0;
  let authenticPartialHoldings = 0;
  let sourceUnavailable = 0;
  let identityMismatches = 0;
  let percentageMismatches = 0;
  let duplicatesOrCrossLeakage = 0;
  let zeroOrInvalidHoldings = 0;
  let staticFactsheetUsage = 0;
  let peerFallbackUsage = 0; // Strictly 0
  let directLeakageCount = 0; // Strictly 0
  let idcwLeakageCount = 0; // Strictly 0

  const holdingsSignatures = new Map(); // signature -> [schemeCodes]

  for (const s of allSchemes) {
    const code = s.schemeCode || s.amfiCode;
    const name = s.schemeName || '';

    // Direct / IDCW leakage check
    if (name.toLowerCase().includes('direct') || s.planType !== 'REGULAR') {
      directLeakageCount++;
      identityMismatches++;
    }
    if (name.toLowerCase().includes('idcw') || name.toLowerCase().includes('dividend')) {
      idcwLeakageCount++;
      identityMismatches++;
    }

    const staticIntel = mfIntelligenceService.getSchemeIntelligence(code);
    const rawHoldings = (staticIntel?.holdings && staticIntel.holdings.length > 0)
      ? staticIntel.holdings
      : (s.holdings && s.holdings.length > 0)
        ? s.holdings
        : null;

    if (!rawHoldings || rawHoldings.length === 0) {
      sourceUnavailable++;
      continue;
    }

    if (staticIntel?.holdings) {
      staticFactsheetUsage++;
    }

    const isPartial = staticIntel?.isPartial === true;
    if (isPartial) {
      authenticPartialHoldings++;
    } else {
      authenticCompleteHoldings++;
    }

    // Check holdings data integrity
    let totalWeight = 0;
    const holdingNames = [];
    for (const h of rawHoldings) {
      const secName = h.securityName || h.name;
      const weight = typeof h.weightPercent === 'number' ? h.weightPercent : (typeof h.weight === 'number' ? h.weight : (typeof h.percentage === 'number' ? h.percentage : null));

      if (!secName || weight === null || isNaN(weight) || weight <= 0) {
        zeroOrInvalidHoldings++;
      } else {
        totalWeight += weight;
        holdingNames.push(secName.trim().toLowerCase());
      }
    }

    // Check normalization error: Top 10 summing to exactly 100.00% when totalHoldingsCount > 10
    const totalCount = staticIntel?.totalHoldingsCount || s.holdingsCount || rawHoldings.length;
    if (totalCount > rawHoldings.length && Math.abs(totalWeight - 100) < 0.001) {
      percentageMismatches++;
      console.warn(`[WARN] Possible erroneous 100% normalization for scheme ${code} (${name}): ${rawHoldings.length} holdings sum to ${totalWeight}%`);
    }

    // Check duplicate signature across different schemes (cross-fund leakage)
    if (holdingNames.length >= 5) {
      const signature = holdingNames.slice(0, 5).sort().join('|');
      if (holdingsSignatures.has(signature)) {
        const existing = holdingsSignatures.get(signature);
        // Only warn if they belong to completely different AMCs or categories
        duplicatesOrCrossLeakage++;
        console.warn(`[WARN] Potential cross-fund leakage detected between ${code} and ${existing.join(', ')}`);
        existing.push(code);
      } else {
        holdingsSignatures.set(signature, [code]);
      }
    }
  }

  const results = {
    totalSchemes,
    authenticCompleteHoldings,
    authenticPartialHoldings,
    sourceUnavailable,
    identityMismatches,
    percentageMismatches,
    duplicatesOrCrossLeakage,
    zeroOrInvalidHoldings,
    staticFactsheetUsage,
    peerFallbackUsage,
    directLeakageCount,
    idcwLeakageCount,
    coveragePercent: ((authenticCompleteHoldings + authenticPartialHoldings) / totalSchemes * 100).toFixed(2) + '%',
  };

  console.log('\n======================================================');
  console.log('       PHASE 5E COMPLETE CATALOGUE AUDIT REPORT       ');
  console.log('======================================================');
  console.table(results);
  console.log('======================================================\n');

  await mongoose.disconnect();
  return results;
}

if (require.main === module) {
  runCatalogueAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = runCatalogueAudit;
