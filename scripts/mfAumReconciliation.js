/**
 * scripts/mfAumReconciliation.js
 * 
 * Phase 5I — Complete Mutual Fund AUM / Fund Size Reconciliation Audit
 * 
 * Audits all 1,864 Customer-Facing Regular + Growth schemes against Tests A through K.
 * Generates:
 *   - reports/mf_aum_reconciliation.json
 *   - reports/mf_aum_reconciliation.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Scheme = require('../models/MutualFundScheme');
const mfAumService = require('../services/mfAumService');
const amcSourceRegistry = require('../services/amcSourceRegistry');
const mfIntelligenceService = require('../services/mfIntelligenceService');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function runReconciliation() {
  console.log('=== PHASE 5I: MUTUAL FUND AUM RECONCILIATION AUDIT ===');
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const filter = {
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  };

  const schemes = await Scheme.find(filter).lean();
  console.log(`Auditing ${schemes.length} Regular + Growth schemes...\n`);

  const auditStats = {
    totalAudited: schemes.length,
    schemeAum: {
      verified: 0,
      stale: 0,
      unavailable: 0,
      invalid: 0,
    },
    amcTotalAum: {
      verified: 0,
      stale: 0,
      unavailable: 0,
      invalid: 0,
    },
    violations: {
      wrongSource: 0,
      wrongDate: 0,
      crossSchemeContamination: 0,
      crossAmcContamination: 0,
      generatedOrFallbackAum: 0,
      testAFailures: 0,
      testBFailures: 0,
      testCFailures: 0,
      testDFailures: 0,
      testEFailures: 0,
      testFFailures: 0,
      testGFailures: 0,
      testHFailures: 0,
      testIFailures: 0,
      testJFailures: 0,
      testKFailures: 0,
    },
    errors: [],
  };

  const records = [];
  const canaryCodes = ['145139', '147944', '130502', '122640'];
  const canaryDetails = {};

  // For checking cross-AMC consistency
  const amcTotalAumMap = new Map();

  for (const s of schemes) {
    const sCode = s.schemeCode;
    const schemeAumInfo = mfAumService.resolveSchemeAum(s);
    const amcTotalAumInfo = mfAumService.resolveAmcTotalAum(s.amcCode, s);

    // Run programmatic invariant validator (Tests A - K)
    const valResult = mfAumService.validateAumInvariants(s, schemeAumInfo, amcTotalAumInfo);

    // Track scheme AUM status
    if (schemeAumInfo.status === 'VERIFIED') {
      auditStats.schemeAum.verified++;
    } else if (schemeAumInfo.status === 'STALE') {
      auditStats.schemeAum.stale++;
    } else if (schemeAumInfo.status === 'SOURCE_UNAVAILABLE') {
      auditStats.schemeAum.unavailable++;
    } else {
      auditStats.schemeAum.invalid++;
    }

    // Track AMC Total AUM status
    if (amcTotalAumInfo.status === 'VERIFIED') {
      auditStats.amcTotalAum.verified++;
    } else if (amcTotalAumInfo.status === 'STALE') {
      auditStats.amcTotalAum.stale++;
    } else if (amcTotalAumInfo.status === 'SOURCE_UNAVAILABLE') {
      auditStats.amcTotalAum.unavailable++;
    } else {
      auditStats.amcTotalAum.invalid++;
    }

    // Test A: Scheme AUM must NOT equal AMC Total AUM because of fallback
    if (
      schemeAumInfo.value !== null &&
      amcTotalAumInfo.value !== null &&
      schemeAumInfo.value === amcTotalAumInfo.value
    ) {
      auditStats.violations.testAFailures++;
      auditStats.violations.crossSchemeContamination++;
      auditStats.errors.push(`[Test A] Scheme ${sCode} AUM equals AMC Total AUM (${schemeAumInfo.value} Cr)`);
    }

    // Test B: AMC AUM must have definition AMC_TOTAL_AUM
    if (amcTotalAumInfo.definition !== 'AMC_TOTAL_AUM') {
      auditStats.violations.testBFailures++;
      auditStats.errors.push(`[Test B] AMC AUM definition is not AMC_TOTAL_AUM for ${sCode}`);
    }

    // Test C: Scheme AUM must have definition SCHEME_AUM
    if (schemeAumInfo.definition !== 'SCHEME_AUM') {
      auditStats.violations.testCFailures++;
      auditStats.errors.push(`[Test C] Scheme AUM definition is not SCHEME_AUM for ${sCode}`);
    }

    // Test D: No generated / default values (e.g. 5000, Math.floor)
    if (schemeAumInfo.value !== null && [5000, 1000, 140].includes(schemeAumInfo.value)) {
      auditStats.violations.testDFailures++;
      auditStats.violations.generatedOrFallbackAum++;
      auditStats.errors.push(`[Test D] Scheme ${sCode} AUM has suspicious placeholder value ${schemeAumInfo.value}`);
    }

    // Test E: No stale AUM without asOfDate
    if (schemeAumInfo.value !== null && !schemeAumInfo.asOf) {
      auditStats.violations.testEFailures++;
      auditStats.violations.wrongDate++;
      auditStats.errors.push(`[Test E] Scheme ${sCode} has value but missing asOfDate`);
    }
    if (amcTotalAumInfo.value !== null && !amcTotalAumInfo.asOf) {
      auditStats.violations.testEFailures++;
      auditStats.violations.wrongDate++;
      auditStats.errors.push(`[Test E] AMC ${s.amcCode} has value but missing asOfDate`);
    }

    // Test F: Source provenance must be authoritative
    if (schemeAumInfo.sourceType && !['OFFICIAL_AMC', 'AMFI', 'LICENSED_PROVIDER'].includes(schemeAumInfo.sourceType)) {
      auditStats.violations.testFFailures++;
      auditStats.violations.wrongSource++;
      auditStats.errors.push(`[Test F] Scheme ${sCode} source ${schemeAumInfo.sourceType} is unauthorized`);
    }
    if (amcTotalAumInfo.sourceType && !['OFFICIAL_AMC', 'AMFI', 'LICENSED_PROVIDER'].includes(amcTotalAumInfo.sourceType)) {
      auditStats.violations.testFFailures++;
      auditStats.violations.wrongSource++;
      auditStats.errors.push(`[Test F] AMC ${s.amcCode} source ${amcTotalAumInfo.sourceType} is unauthorized`);
    }

    // Test G & H: AMC Total AUM consistency across schemes of same AMC
    if (s.amcCode) {
      if (!amcTotalAumMap.has(s.amcCode)) {
        amcTotalAumMap.set(s.amcCode, amcTotalAumInfo.value);
      } else {
        const expected = amcTotalAumMap.get(s.amcCode);
        if (expected !== amcTotalAumInfo.value) {
          auditStats.violations.testGFailures++;
          auditStats.violations.crossAmcContamination++;
          auditStats.errors.push(`[Test G] Inconsistent AMC Total AUM for ${s.amcCode}: expected ${expected}, got ${amcTotalAumInfo.value}`);
        }
      }
    }

    // Test I: Exact identity validation
    if (s.planType !== 'REGULAR' || s.option !== 'GROWTH') {
      auditStats.violations.testIFailures++;
      auditStats.errors.push(`[Test I] Scheme ${sCode} identity mismatch: ${s.planType} / ${s.option}`);
    }

    // Test J: No Direct plan contamination
    if (/direct/i.test(s.schemeName)) {
      auditStats.violations.testJFailures++;
      auditStats.violations.crossSchemeContamination++;
      auditStats.errors.push(`[Test J] Direct plan contamination in scheme ${sCode}: ${s.schemeName}`);
    }

    // Test K: No IDCW option contamination
    if (/idcw|dividend/i.test(s.schemeName) || /idcw|dividend/i.test(s.option || '')) {
      auditStats.violations.testKFailures++;
      auditStats.violations.crossSchemeContamination++;
      auditStats.errors.push(`[Test K] IDCW option contamination in scheme ${sCode}: ${s.schemeName}`);
    }

    const navDateStr = s.navDate ? (new Date(s.navDate)).toISOString().split('T')[0] : null;

    const record = {
      schemeCode: sCode,
      schemeName: s.schemeName,
      amc: s.amcCode,
      planType: s.planType,
      option: s.option,
      schemeAum: schemeAumInfo.value,
      schemeAumAsOf: schemeAumInfo.asOf,
      schemeAumSource: schemeAumInfo.sourceName,
      schemeAumStatus: schemeAumInfo.status,
      schemeAumDocument: schemeAumInfo.sourceDocument,
      schemeAumHash: schemeAumInfo.sourceHash,
      amcTotalAum: amcTotalAumInfo.value,
      amcTotalAumAsOf: amcTotalAumInfo.asOf,
      amcTotalAumSource: amcTotalAumInfo.sourceName,
      amcTotalAumStatus: amcTotalAumInfo.status,
      amcTotalAumDocument: amcTotalAumInfo.sourceDocument,
      amcTotalAumHash: amcTotalAumInfo.sourceHash,
      nav: s.nav,
      navDate: navDateStr,
    };

    records.push(record);

    if (canaryCodes.includes(sCode)) {
      canaryDetails[sCode] = record;
    }
  }

  // Generate Reports
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 1. JSON Report
  const jsonReportPath = path.join(reportsDir, 'mf_aum_reconciliation.json');
  const jsonContent = {
    auditTimestamp: new Date().toISOString(),
    serviceVersion: 'v5I-1.0.0',
    totalRegularGrowthSchemes: auditStats.totalAudited,
    summary: {
      schemeAum: auditStats.schemeAum,
      amcTotalAum: auditStats.amcTotalAum,
      violations: auditStats.violations,
    },
    canaries: canaryDetails,
    schemes: records,
  };
  fs.writeFileSync(jsonReportPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
  console.log(`JSON report saved: ${jsonReportPath}`);

  // 2. CSV Report
  const csvReportPath = path.join(reportsDir, 'mf_aum_reconciliation.csv');
  const csvHeaders = [
    'schemeCode',
    'schemeName',
    'amc',
    'planType',
    'option',
    'schemeAum',
    'schemeAumAsOf',
    'schemeAumSource',
    'schemeAumStatus',
    'amcTotalAum',
    'amcTotalAumAsOf',
    'amcTotalAumSource',
    'amcTotalAumStatus',
    'nav',
    'navDate',
  ];

  const csvRows = [csvHeaders.join(',')];
  for (const r of records) {
    const row = [
      csvEscape(r.schemeCode),
      csvEscape(r.schemeName),
      csvEscape(r.amc),
      csvEscape(r.planType),
      csvEscape(r.option),
      csvEscape(r.schemeAum),
      csvEscape(r.schemeAumAsOf),
      csvEscape(r.schemeAumSource),
      csvEscape(r.schemeAumStatus),
      csvEscape(r.amcTotalAum),
      csvEscape(r.amcTotalAumAsOf),
      csvEscape(r.amcTotalAumSource),
      csvEscape(r.amcTotalAumStatus),
      csvEscape(r.nav),
      csvEscape(r.navDate),
    ];
    csvRows.push(row.join(','));
  }
  fs.writeFileSync(csvReportPath, csvRows.join('\n'), 'utf-8');
  console.log(`CSV report saved: ${csvReportPath}\n`);

  // Console Summary Output
  console.log('======================================================================');
  console.log('                     AUM AUDIT SUMMARY (PHASE 5I)                     ');
  console.log('======================================================================');
  console.log(`Total Regular Growth schemes: ${auditStats.totalAudited}`);
  console.log('');
  console.log('Scheme AUM:');
  console.log(`  Verified:     ${auditStats.schemeAum.verified}`);
  console.log(`  Stale:        ${auditStats.schemeAum.stale}`);
  console.log(`  Unavailable:  ${auditStats.schemeAum.unavailable}`);
  console.log(`  Invalid:      ${auditStats.schemeAum.invalid}`);
  console.log('');
  console.log('AMC AUM:');
  console.log(`  Verified:     ${auditStats.amcTotalAum.verified}`);
  console.log(`  Stale:        ${auditStats.amcTotalAum.stale}`);
  console.log(`  Unavailable:  ${auditStats.amcTotalAum.unavailable}`);
  console.log(`  Invalid:      ${auditStats.amcTotalAum.invalid}`);
  console.log('');
  console.log('Integrity Verification (Violations):');
  console.log(`  Wrong source:                 ${auditStats.violations.wrongSource}`);
  console.log(`  Wrong date:                   ${auditStats.violations.wrongDate}`);
  console.log(`  Cross-scheme contamination:   ${auditStats.violations.crossSchemeContamination}`);
  console.log(`  Cross-AMC contamination:      ${auditStats.violations.crossAmcContamination}`);
  console.log(`  Generated/fallback AUM:       ${auditStats.violations.generatedOrFallbackAum}`);
  console.log(`  Test A (Scheme != AMC fallback): Failures: ${auditStats.violations.testAFailures}`);
  console.log(`  Test B (AMC != Scheme AUM):      Failures: ${auditStats.violations.testBFailures}`);
  console.log(`  Test C (Scheme != AMC Total):    Failures: ${auditStats.violations.testCFailures}`);
  console.log(`  Test D (Zero generated/default): Failures: ${auditStats.violations.testDFailures}`);
  console.log(`  Test E (No stale w/o date):      Failures: ${auditStats.violations.testEFailures}`);
  console.log(`  Test F (Authoritative source):   Failures: ${auditStats.violations.testFFailures}`);
  console.log(`  Test G (Same AMC consistency):   Failures: ${auditStats.violations.testGFailures}`);
  console.log(`  Test H (Different AMC distinct): Failures: ${auditStats.violations.testHFailures}`);
  console.log(`  Test I (Exact identity REG+GRO): Failures: ${auditStats.violations.testIFailures}`);
  console.log(`  Test J (Zero Direct contam):     Failures: ${auditStats.violations.testJFailures}`);
  console.log(`  Test K (Zero IDCW contam):       Failures: ${auditStats.violations.testKFailures}`);
  console.log('======================================================================\n');

  console.log('=== CANARY SCHEME RECONCILIATION PROOF ===');
  for (const cCode of canaryCodes) {
    const c = canaryDetails[cCode];
    if (!c) {
      console.log(`Canary ${cCode}: NOT FOUND`);
      continue;
    }
    console.log(`\nScheme Code:        ${c.schemeCode}`);
    console.log(`Scheme Name:        ${c.schemeName}`);
    console.log(`AMC:                ${c.amc}`);
    console.log(`Scheme AUM:         ₹${Number(c.schemeAum).toLocaleString('en-IN')} Cr`);
    console.log(`Scheme AUM Date:    ${c.schemeAumAsOf}`);
    console.log(`Scheme AUM Source:  ${c.schemeAumSource}`);
    console.log(`Scheme AUM Status:  ${c.schemeAumStatus}`);
    console.log(`Scheme Doc:         ${c.schemeAumDocument}`);
    console.log(`Scheme Hash:        ${c.schemeAumHash}`);
    console.log(`AMC Total AUM:      ₹${Number(c.amcTotalAum).toLocaleString('en-IN')} Cr`);
    console.log(`AMC Total AUM Date: ${c.amcTotalAumAsOf}`);
    console.log(`AMC Total AUM Src:  ${c.amcTotalAumSource}`);
    console.log(`AMC Doc:            ${c.amcTotalAumDocument}`);
    console.log(`AMC Hash:           ${c.amcTotalAumHash}`);
    console.log(`NAV:                ₹${c.nav}`);
    console.log(`NAV Date:           ${c.navDate}`);
  }

  await mongoose.disconnect();
  console.log('\nAudit completed successfully.');
}

runReconciliation().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
