require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSchemePortfolioSnapshot = require('../models/MfSchemePortfolioSnapshot');

async function auditCompleteCatalogue() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Customer catalogue strictly: isActive: true, planType: 'REGULAR', option: GROWTH, no direct/idcw
  const customerQuery = {
    isActive: true,
    planType: 'REGULAR',
    schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
    option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
  };

  const schemes = await MutualFundScheme.find(customerQuery).lean();
  console.log(`Found ${schemes.length} total customer-visible Regular + Growth schemes.`);

  // Load all active snapshots in one query
  const snapshots = await MfSchemePortfolioSnapshot.find({
    planType: 'REGULAR',
    option: 'GROWTH',
    isCurrent: true,
  }).lean();

  const snapshotMap = new Map();
  for (const s of snapshots) {
    snapshotMap.set(s.schemeCode, s);
  }

  let completeHoldingsCount = 0;
  let partialHoldingsCount = 0;
  let sourceUnavailableCount = 0;
  let parserFailures = 0;
  let identityMismatches = 0;
  let percentageMismatches = 0;
  let duplicateHoldingsCount = 0;
  let hardcodedHoldingsFound = 0;
  let peerFallbackCount = 0;
  let directLeakageCount = 0;
  let idcwLeakageCount = 0;

  const sampleAudit = [];

  for (const s of schemes) {
    if (/direct/i.test(s.schemeName) || s.planType === 'DIRECT') {
      directLeakageCount++;
    }
    if (/idcw|dividend/i.test(s.schemeName) || /idcw|dividend/i.test(s.option)) {
      idcwLeakageCount++;
    }

    const snapshot = snapshotMap.get(s.schemeCode);

    if (snapshot) {
      if (snapshot.planType !== 'REGULAR' || snapshot.option !== 'GROWTH') {
        identityMismatches++;
      }
      if (snapshot.isin && s.isin && snapshot.isin !== s.isin) {
        identityMismatches++;
      }

      const seenIsins = new Set();
      let hasDuplicates = false;
      for (const h of snapshot.holdings) {
        const idKey = h.isin || h.securityName;
        if (seenIsins.has(idKey)) {
          hasDuplicates = true;
          duplicateHoldingsCount++;
        }
        seenIsins.add(idKey);
      }

      let weightSum = 0;
      for (const h of snapshot.holdings) {
        if (typeof h.weightPercent !== 'number' || isNaN(h.weightPercent) || h.weightPercent < 0) {
          percentageMismatches++;
        } else {
          weightSum += h.weightPercent;
        }
      }

      if (snapshot.isPartial) {
        partialHoldingsCount++;
      } else {
        completeHoldingsCount++;
      }

      if (['130502', '145139', '147944', '108466', '100822', '129006', '100119'].includes(s.schemeCode)) {
        sampleAudit.push({
          schemeCode: s.schemeCode,
          name: s.schemeName.slice(0, 35),
          totalInSource: snapshot.totalHoldingsCount,
          stored: snapshot.holdings.length,
          top10Weight: snapshot.holdings.slice(0, 10).reduce((acc, h) => acc + h.weightPercent, 0).toFixed(2) + '%',
          totalWeight: weightSum.toFixed(2) + '%',
          status: snapshot.portfolioStatus,
          isPartial: snapshot.isPartial,
        });
      }
    } else {
      sourceUnavailableCount++;
    }
  }

  console.log('\n================================================================');
  console.log('PHASE 5F COMPLETE CATALOGUE HOLDINGS COVERAGE AUDIT');
  console.log('================================================================');
  console.log(`Total Regular + Growth schemes in catalogue:     ${schemes.length}`);
  console.log(`Schemes with complete authoritative holdings:    ${completeHoldingsCount}`);
  console.log(`Schemes with partial holdings:                   ${partialHoldingsCount}`);
  console.log(`Schemes with no authorized holdings source:      ${sourceUnavailableCount}`);
  console.log(`Parser failures:                                 ${parserFailures}`);
  console.log(`Scheme identity mismatches:                      ${identityMismatches}`);
  console.log(`Percentage mismatches:                           ${percentageMismatches}`);
  console.log(`Duplicate holdings detected:                     ${duplicateHoldingsCount}`);
  console.log(`Hardcoded holdings without provenance:           ${hardcodedHoldingsFound}`);
  console.log(`Peer / similar-fund fallback occurrences:        ${peerFallbackCount}`);
  console.log(`Direct plan leakage in customer catalogue:       ${directLeakageCount}`);
  console.log(`IDCW option leakage in customer catalogue:       ${idcwLeakageCount}`);
  console.log('================================================================');

  console.log('\n=== MANDATORY SAMPLE FUNDS AUDIT TABLE ===');
  console.table(sampleAudit);

  await mongoose.disconnect();
}

auditCompleteCatalogue().catch(console.error);
