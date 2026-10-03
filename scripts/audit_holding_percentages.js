require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MfSchemePortfolioSnapshot = require('../models/MfSchemePortfolioSnapshot');

async function auditPercentages() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const disclosuresDir = path.join(__dirname, '..', 'data', 'amc_disclosures');
  const files = fs.readdirSync(disclosuresDir).filter(f => f.endsWith('.json'));

  let totalAudited = 0;
  let exactMatches = 0;
  let roundingDiffs = 0;
  let incorrectPercentages = 0;
  let missingPercentages = 0;
  let unverifiablePercentages = 0;

  const auditRows = [];

  for (const file of files) {
    const filePath = path.join(disclosuresDir, file);
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const snapshot = await MfSchemePortfolioSnapshot.findOne({
      schemeCode: rawData.schemeCode,
      planType: 'REGULAR',
      option: 'GROWTH',
      isCurrent: true,
    }).lean();

    if (!snapshot) {
      console.log(`[AUDIT] No snapshot found for ${rawData.schemeCode} (${rawData.schemeName})`);
      continue;
    }

    const officialMap = new Map();
    for (const h of rawData.holdings) {
      const key = (h.isin || h.securityName).trim().toUpperCase();
      officialMap.set(key, h);
    }

    for (const stored of snapshot.holdings) {
      totalAudited++;
      const key = (stored.isin || stored.securityName).trim().toUpperCase();
      const official = officialMap.get(key);

      if (!official) {
        unverifiablePercentages++;
        auditRows.push({
          scheme: rawData.schemeName,
          security: stored.securityName,
          storedPct: stored.weightPercent,
          officialPct: 'N/A',
          diff: 'N/A',
          source: snapshot.sourceDocument,
          asOf: snapshot.asOfDate.toISOString().split('T')[0],
          status: 'UNVERIFIABLE',
        });
        continue;
      }

      if (stored.weightPercent === null || stored.weightPercent === undefined) {
        missingPercentages++;
        auditRows.push({
          scheme: rawData.schemeName,
          security: stored.securityName,
          storedPct: 'NULL',
          officialPct: official.weightPercent,
          diff: 'N/A',
          source: snapshot.sourceDocument,
          asOf: snapshot.asOfDate.toISOString().split('T')[0],
          status: 'MISSING',
        });
        continue;
      }

      const diff = Math.abs(stored.weightPercent - official.weightPercent);
      if (diff === 0) {
        exactMatches++;
        auditRows.push({
          scheme: rawData.schemeName,
          security: stored.securityName,
          storedPct: stored.weightPercent + '%',
          officialPct: official.weightPercent + '%',
          diff: '0.00%',
          source: snapshot.sourceDocument,
          asOf: snapshot.asOfDate.toISOString().split('T')[0],
          status: 'EXACT_MATCH',
        });
      } else if (diff <= 0.01) {
        roundingDiffs++;
        auditRows.push({
          scheme: rawData.schemeName,
          security: stored.securityName,
          storedPct: stored.weightPercent + '%',
          officialPct: official.weightPercent + '%',
          diff: (stored.weightPercent - official.weightPercent).toFixed(4) + '%',
          source: snapshot.sourceDocument,
          asOf: snapshot.asOfDate.toISOString().split('T')[0],
          status: 'ROUNDING_TOLERANCE',
        });
      } else {
        incorrectPercentages++;
        auditRows.push({
          scheme: rawData.schemeName,
          security: stored.securityName,
          storedPct: stored.weightPercent + '%',
          officialPct: official.weightPercent + '%',
          diff: (stored.weightPercent - official.weightPercent).toFixed(4) + '%',
          source: snapshot.sourceDocument,
          asOf: snapshot.asOfDate.toISOString().split('T')[0],
          status: 'INCORRECT',
        });
      }
    }
  }

  console.log('\n=== HOLDING PERCENTAGE AUDIT SAMPLE (First 15 Holdings) ===');
  console.log('---------------------------------------------------------------------------------------------------------');
  console.log('Scheme | Security | Stored % | Official % | Difference | Source | As-of | Status');
  console.log('---------------------------------------------------------------------------------------------------------');
  for (const row of auditRows.slice(0, 15)) {
    console.log(`${row.scheme.slice(0, 22)} | ${row.security.slice(0, 20)} | ${row.storedPct} | ${row.officialPct} | ${row.diff} | ${row.source.slice(0, 25)} | ${row.asOf} | ${row.status}`);
  }

  console.log('\n=== PERCENTAGE AUDIT SUMMARY ===');
  console.log(`Total holdings audited: ${totalAudited}`);
  console.log(`Exact matches: ${exactMatches}`);
  console.log(`Rounding-only differences: ${roundingDiffs}`);
  console.log(`Incorrect percentages: ${incorrectPercentages}`);
  console.log(`Missing percentages: ${missingPercentages}`);
  console.log(`Unverifiable percentages: ${unverifiablePercentages}`);

  await mongoose.disconnect();
}

auditPercentages().catch(console.error);
