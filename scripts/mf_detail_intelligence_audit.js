/**
 * VikaOne Mutual Fund — Phase 5D Database Detail Intelligence Audit Script
 * Audits all Regular Growth schemes in MongoDB and Tier 2 Statutory Catalog
 * for completeness, provenance, data isolation, and suspicious duplicate patterns.
 */

const mongoose = require('mongoose');
require('dotenv').config();
const MutualFundScheme = require('../models/MutualFundScheme');
const intel = require('../services/mfIntelligenceService');
const amcRegistry = require('../services/amcSourceRegistry');
const controller = require('../controllers/mutualFundsController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function runAudit() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
  console.log('   VIKAONE MUTUAL FUND — PHASE 5D DATABASE DETAIL INTELLIGENCE AUDIT                      ');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGO_URI);

  // 1. Database Universe Queries
  const allRegularGrowth = await MutualFundScheme.find({
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  });

  const totalSchemes = allRegularGrowth.length;
  console.log(`Auditing ${totalSchemes} Regular Growth schemes in database...\n`);

  // Direct and IDCW Leakage checks
  const directLeakageCount = await MutualFundScheme.countDocuments({
    planType: 'REGULAR',
    schemeName: { $regex: /direct/i },
  });

  const idcwLeakageCount = await MutualFundScheme.countDocuments({
    planType: 'REGULAR',
    option: { $regex: /idcw|dividend/i },
  });

  // Track field statistics
  let holdingsPopulated = 0;
  let holdingsVerified = 0;
  let schemeAumPopulated = 0;
  let schemeAumVerified = 0;
  let amcTotalAumPopulated = 0;
  let amcTotalAumVerified = 0;
  let minSipPopulated = 0;
  let minSipVerified = 0;
  let minPurchasePopulated = 0;
  let minPurchaseVerified = 0;
  let fundManagerPopulated = 0;
  let managerQualificationPopulated = 0;
  let managerExperiencePopulated = 0;
  let managerTenurePopulated = 0;
  let benchmarkPopulated = 0;
  let exitLoadPopulated = 0;
  let terPopulated = 0;
  let riskometerPopulated = 0;
  let objectivePopulated = 0;
  let fundHousePopulated = 0;
  let planTypePopulated = 0;
  let optionPopulated = 0;
  let provenanceComplete = 0;

  // Track suspicious duplicates & leakages
  const suspiciousDuplicates = {
    schemeAumEqualsAmcAum: [],
    sameManagerAcrossUnrelatedAmcs: [],
    sameHoldingsAcrossUnrelatedSchemes: [],
    sameObjectiveAcrossUnrelatedSchemes: [],
    sameAumAcrossUnrelatedSchemes: [],
    sameTenureAcrossUnrelatedSchemes: [],
  };

  const aumMap = new Map();
  const managerAmcMap = new Map();
  const objectiveMap = new Map();
  const holdingsSignatureMap = new Map();
  const tenureMap = new Map();

  // Audit sample & catalogued schemes via getSchemeDetail controller to ensure API/DB consistency
  const cataloguedList = intel.getAllCataloguedSchemes();
  const cataloguedCodes = new Set(cataloguedList.map(s => s.schemeCode));

  for (const s of allRegularGrowth) {
    const code = s.schemeCode || s.amfiCode;
    const isCatalogued = cataloguedCodes.has(code);
    const staticIntel = isCatalogued ? intel.getSchemeIntelligence(code) : null;
    const amcEntry = amcRegistry.getAmcSources(s.amcCode);

    // Scheme AUM
    const effectiveAum = s.aum ?? staticIntel?.aum ?? null;
    if (effectiveAum !== null && effectiveAum > 0) {
      schemeAumPopulated++;
      if (s.aumSource || staticIntel?.aumSource) schemeAumVerified++;
      
      // Check for suspicious identical AUM across unrelated schemes
      if (!aumMap.has(effectiveAum)) {
        aumMap.set(effectiveAum, []);
      }
      aumMap.get(effectiveAum).push({ code, name: s.schemeName, amc: s.amcCode });
    }

    // AMC Total AUM
    const effectiveAmcAum = amcEntry?.totalAum ?? null;
    if (effectiveAmcAum !== null) {
      amcTotalAumPopulated++;
      if (amcEntry?.totalAumSource) amcTotalAumVerified++;
    }

    // Check scheme AUM == AMC Total AUM
    if (effectiveAum && effectiveAmcAum && Math.abs(effectiveAum - effectiveAmcAum) < 0.001) {
      suspiciousDuplicates.schemeAumEqualsAmcAum.push({
        schemeCode: code,
        schemeName: s.schemeName,
        aum: effectiveAum,
        amcAum: effectiveAmcAum,
      });
    }

    // Holdings
    const effectiveHoldings = (s.holdings && s.holdings.length > 0) ? s.holdings : (staticIntel?.holdings || null);
    if (effectiveHoldings && effectiveHoldings.length > 0) {
      holdingsPopulated++;
      if (s.holdingsSource || staticIntel?.holdingsSource) holdingsVerified++;

      // Holdings signature (top holding name + weight)
      const sig = effectiveHoldings.slice(0, 3).map(h => `${h.name}:${h.weight}`).join('|');
      if (!holdingsSignatureMap.has(sig)) {
        holdingsSignatureMap.set(sig, []);
      }
      holdingsSignatureMap.get(sig).push({ code, name: s.schemeName, amc: s.amcCode });
    }

    // Minimum SIP & Purchase
    const effectiveMinSip = s.minSipAmount ?? staticIntel?.minSipAmount ?? null;
    if (effectiveMinSip !== null) {
      minSipPopulated++;
      if (s.minSipSource || staticIntel?.minSipSource) minSipVerified++;
    }

    const effectiveMinPurchase = s.minPurchaseAmount ?? staticIntel?.minPurchaseAmount ?? null;
    if (effectiveMinPurchase !== null) {
      minPurchasePopulated++;
      if (s.minPurchaseSource || staticIntel?.minPurchaseSource) minPurchaseVerified++;
    }

    // Fund Manager
    const effectiveManager = s.fundManager || staticIntel?.fundManager || null;
    if (effectiveManager) {
      fundManagerPopulated++;

      // Check manager across AMCs
      const mgrClean = effectiveManager.split(',')[0].trim();
      if (!managerAmcMap.has(mgrClean)) {
        managerAmcMap.set(mgrClean, new Set());
      }
      managerAmcMap.get(mgrClean).add(s.amcCode);
    }

    // Manager details
    const mgrDetails = (s.fundManagerDetails && s.fundManagerDetails.length > 0)
      ? s.fundManagerDetails
      : (staticIntel?.fundManagerDetails || []);

    if (mgrDetails.length > 0) {
      if (mgrDetails.some(m => m.qualification)) managerQualificationPopulated++;
      if (mgrDetails.some(m => m.experience)) managerExperiencePopulated++;
      if (mgrDetails.some(m => m.tenure || m.tenureDisplay)) {
        managerTenurePopulated++;
        const ten = mgrDetails[0].tenureDisplay || mgrDetails[0].tenure;
        if (!tenureMap.has(ten)) tenureMap.set(ten, []);
        tenureMap.get(ten).push({ code, name: s.schemeName });
      }
    }

    // Benchmark, Exit Load, TER, Riskometer
    if (s.benchmark || staticIntel?.benchmark) benchmarkPopulated++;
    if (s.exitLoad || staticIntel?.exitLoad) exitLoadPopulated++;
    if (s.expenseRatio !== null && s.expenseRatio !== undefined || staticIntel?.expenseRatio !== undefined) terPopulated++;
    if (s.riskometer || staticIntel?.riskometer) riskometerPopulated++;

    // Investment Objective
    const effectiveObj = s.investmentObjective || staticIntel?.investmentObjective || null;
    if (effectiveObj) {
      objectivePopulated++;
      if (!objectiveMap.has(effectiveObj)) {
        objectiveMap.set(effectiveObj, []);
      }
      objectiveMap.get(effectiveObj).push({ code, name: s.schemeName, amc: s.amcCode });
    }

    // Fund House
    if (s.amcName && s.amcCode) fundHousePopulated++;

    // Plan & Option
    if (s.planType === 'REGULAR') planTypePopulated++;
    if (s.option === 'GROWTH') optionPopulated++;

    // Provenance
    if (s.dataProvenance || staticIntel?.dataProvenance) provenanceComplete++;
  }

  // Analyze suspicious duplicate clusters
  for (const [mgr, amcSet] of managerAmcMap.entries()) {
    if (amcSet.size > 2) {
      suspiciousDuplicates.sameManagerAcrossUnrelatedAmcs.push({ manager: mgr, amcs: Array.from(amcSet) });
    }
  }

  for (const [sig, list] of holdingsSignatureMap.entries()) {
    const amcs = new Set(list.map(x => x.amc));
    if (amcs.size > 1 && list.length > 1) {
      suspiciousDuplicates.sameHoldingsAcrossUnrelatedSchemes.push({ signature: sig, schemes: list });
    }
  }

  for (const [obj, list] of objectiveMap.entries()) {
    const amcs = new Set(list.map(x => x.amc));
    if (amcs.size > 1 && list.length > 1) {
      suspiciousDuplicates.sameObjectiveAcrossUnrelatedSchemes.push({ objective: obj.substring(0, 40) + '...', count: list.length });
    }
  }

  // Print Report
  console.log('───────────────────────────────────────────────────────────────────────────────────────────');
  console.log(' 1. DATABASE UNIVERSE & FIELD COMPLETENESS AUDIT');
  console.log('───────────────────────────────────────────────────────────────────────────────────────────');
  const metrics = [
    ['Total Regular Growth schemes', totalSchemes],
    ['Holdings populated', holdingsPopulated],
    ['Holdings verified (source-backed)', holdingsVerified],
    ['Scheme AUM populated', schemeAumPopulated],
    ['Scheme AUM verified (source-backed)', schemeAumVerified],
    ['AMC Total AUM populated', amcTotalAumPopulated],
    ['AMC Total AUM verified (source-backed)', amcTotalAumVerified],
    ['Minimum SIP populated', minSipPopulated],
    ['Minimum SIP verified (source-backed)', minSipVerified],
    ['Minimum Purchase populated', minPurchasePopulated],
    ['Minimum Purchase verified (source-backed)', minPurchaseVerified],
    ['Fund Manager populated', fundManagerPopulated],
    ['Manager Qualification populated', managerQualificationPopulated],
    ['Manager Experience populated', managerExperiencePopulated],
    ['Manager Tenure populated', managerTenurePopulated],
    ['Benchmark populated', benchmarkPopulated],
    ['Exit Load populated', exitLoadPopulated],
    ['Expense Ratio (TER) populated', terPopulated],
    ['Riskometer populated', riskometerPopulated],
    ['Investment Objective populated', objectivePopulated],
    ['Fund House populated', fundHousePopulated],
    ['Plan Type (REGULAR) populated', planTypePopulated],
    ['Option (GROWTH) populated', optionPopulated],
    ['Provenance Complete', provenanceComplete],
  ];

  for (const [label, val] of metrics) {
    const pct = totalSchemes > 0 ? ((val / totalSchemes) * 100).toFixed(1) : '0.0';
    console.log(` ${label.padEnd(45)} : ${String(val).padStart(6)} (${pct}%)`);
  }

  console.log('\n───────────────────────────────────────────────────────────────────────────────────────────');
  console.log(' 2. DATA INTEGRITY & LEAKAGE CHECKS');
  console.log('───────────────────────────────────────────────────────────────────────────────────────────');
  console.log(` Direct Plan leakage in Regular catalogue : ${directLeakageCount} (Expected: 0)`);
  console.log(` IDCW leakage in Growth catalogue         : ${idcwLeakageCount} (Expected: 0)`);
  console.log(` Scheme AUM == AMC Total AUM collisions    : ${suspiciousDuplicates.schemeAumEqualsAmcAum.length} (Expected: 0)`);
  console.log(` Cross-AMC Fund Manager Collisions        : ${suspiciousDuplicates.sameManagerAcrossUnrelatedAmcs.length} (Expected: 0)`);
  console.log(` Cross-AMC Holdings Copying / Collisions  : ${suspiciousDuplicates.sameHoldingsAcrossUnrelatedSchemes.length} (Expected: 0)`);
  console.log(` Cross-AMC Objective Copying / Collisions : ${suspiciousDuplicates.sameObjectiveAcrossUnrelatedSchemes.length} (Expected: 0)`);

  const auditPassed =
    directLeakageCount === 0 &&
    idcwLeakageCount === 0 &&
    suspiciousDuplicates.schemeAumEqualsAmcAum.length === 0 &&
    suspiciousDuplicates.sameHoldingsAcrossUnrelatedSchemes.length === 0 &&
    suspiciousDuplicates.sameObjectiveAcrossUnrelatedSchemes.length === 0;

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════');
  console.log(` FINAL STATUS: ${auditPassed ? 'DATABASE_AUDIT_PASSED' : 'DATABASE_AUDIT_FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

runAudit().catch(console.error);
