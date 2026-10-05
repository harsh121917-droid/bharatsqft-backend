require('dotenv').config();
const s = require('../services/mfIntelligenceService');
const amcRegistry = require('../services/amcSourceRegistry');

const codes = s.getVerifiedSchemeCodes();
console.log(`Checking ${codes.length} schemes in VERIFIED_FACTSHEET_CATALOG:`);

const results = [];
for (const code of codes) {
  const d = s.getSchemeIntelligence(code);
  const amc = amcRegistry.getAmcSources(d.amcCode);
  const amcTotal = amc ? amc.totalAum : null;
  const aumRatio = (amcTotal && d.aum) ? (d.aum / amcTotal) : null;
  const isSuspicious = aumRatio && aumRatio > 1.0;

  results.push({
    code,
    name: d.schemeName.slice(0, 35),
    amcCode: d.amcCode,
    schemeAum: d.aum,
    amcTotalAum: amcTotal,
    schemeVsAmcRatio: aumRatio ? aumRatio.toFixed(2) : 'N/A',
    suspicious: isSuspicious ? 'YES (> 100% of AMC!)' : 'OK',
  });
}

console.table(results);
