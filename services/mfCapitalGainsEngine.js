const MfCapitalGain = require('../models/MfCapitalGain');
const MfTransaction = require('../models/MfTransaction');
const MutualFundScheme = require('../models/MutualFundScheme');

/**
 * Determine Indian Financial Year from date (e.g. 2026-06-15 -> "2026-2027")
 */
function getFinancialYear(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0=Jan, 2=Mar, 3=Apr
  if (month >= 3) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Classify scheme tax bucket
 * - EQUITY_ORIENTED: >= 65% domestic equity
 * - DEBT_SPECIFIED: <= 35% equity (taxed at slab rate post Finance Act 2023)
 * - OTHER_HYBRID: 35% to 65% equity
 */
function classifyTaxCategory(scheme) {
  const cat = (scheme?.category || '').toLowerCase();
  const subCat = (scheme?.subCategory || '').toLowerCase();

  if (cat.includes('equity') || subCat.includes('equity') || subCat.includes('elss')) {
    return 'EQUITY_ORIENTED';
  }
  if (cat.includes('debt') || subCat.includes('debt') || cat.includes('liquid') || cat.includes('money market')) {
    return 'DEBT_SPECIFIED';
  }
  if (cat.includes('hybrid')) {
    return 'OTHER_HYBRID';
  }
  return 'UNKNOWN_REQUIRES_REVIEW';
}

/**
 * Process realized capital gains on redemption using FIFO (First-In, First-Out) matching.
 * Distinguishes Equity vs Non-Equity/Debt without making unsubstantiated tax assumptions.
 */
async function processRedemptionCapitalGains(redemptionOrder) {
  if (!redemptionOrder || !redemptionOrder.user) return [];

  const userId = redemptionOrder.user;
  const sCode = redemptionOrder.schemeCode.toUpperCase();
  const totalUnitsToRedeem = redemptionOrder.redemptionUnits || redemptionOrder.units || 0;
  const redemptionNav = redemptionOrder.allottedNav || redemptionOrder.navAtOrder || 0;
  const redemptionDate = redemptionOrder.settlementDate || redemptionOrder.createdAt || new Date();

  if (totalUnitsToRedeem <= 0 || redemptionNav <= 0) return [];

  // Fetch scheme category for taxation classification
  const scheme = await MutualFundScheme.findOne({ schemeCode: sCode });
  const category = scheme?.category || 'Equity';
  const taxCategory = classifyTaxCategory(scheme);

  // 1. Fetch available purchase lots in chronological FIFO order
  const purchaseLots = await MfTransaction.find({
    user: userId,
    schemeCode: sCode,
    transactionType: { $in: ['PURCHASE', 'SIP_INSTALLMENT', 'SWITCH_IN'] },
    status: 'CONFIRMED',
    fifoRemainingUnits: { $gt: 0 },
  }).sort({ transactionDate: 1 });

  let unitsNeeded = totalUnitsToRedeem;
  const createdGains = [];
  const fy = getFinancialYear(redemptionDate);

  for (const lot of purchaseLots) {
    if (unitsNeeded <= 0) break;

    const availableInLot = lot.fifoRemainingUnits;
    const unitsMatched = Math.min(availableInLot, unitsNeeded);

    // Calculate lot holding metrics
    const purchaseDate = lot.transactionDate;
    const holdingDays = Math.max(0, Math.floor((new Date(redemptionDate) - new Date(purchaseDate)) / (86400000)));
    const purchaseNav = lot.nav;
    const purchaseCost = +(unitsMatched * purchaseNav).toFixed(2);
    const redemptionProceeds = +(unitsMatched * redemptionNav).toFixed(2);
    const realizedGain = +(redemptionProceeds - purchaseCost).toFixed(2);

    // Phase 4 Taxation classification:
    // 1. Equity-oriented: Holding period > 365 days is LTCG, <= 365 days is STCG
    // 2. Debt / Specified mutual funds post Finance Act 2023: Gains are treated as short term capital gains taxed at slab rates
    let gainType = 'STCG';
    if (taxCategory === 'EQUITY_ORIENTED' && holdingDays > 365) {
      gainType = 'LTCG';
    } else if (taxCategory === 'DEBT_SPECIFIED') {
      gainType = 'STCG'; // Taxed at applicable slab rate
    }

    // Deduct from lot
    lot.fifoRemainingUnits = +(availableInLot - unitsMatched).toFixed(4);
    await lot.save();

    // Create capital gain record
    const gainRecord = await MfCapitalGain.create({
      user: userId,
      redemptionOrder: redemptionOrder._id,
      purchaseTransaction: lot._id,
      schemeCode: sCode,
      schemeName: redemptionOrder.schemeName,
      category,
      planType: 'REGULAR',
      unitsRedeemed: unitsMatched,
      purchaseDate,
      redemptionDate,
      holdingDays,
      purchaseNav,
      redemptionNav,
      purchaseCost,
      redemptionProceeds,
      realizedGain,
      gainType,
      financialYear: fy,
      remarks: `FIFO matched lot from ${purchaseDate.toISOString().split('T')[0]} (${holdingDays} days) [TaxBucket: ${taxCategory}]`,
    });

    createdGains.push(gainRecord);
    unitsNeeded = +(unitsNeeded - unitsMatched).toFixed(4);
  }

  return createdGains;
}

/**
 * Fetch realized capital gains report for a specific financial year
 * Strictly separates transaction calculation data from professional tax advice.
 */
async function getCapitalGainsReport(userId, requestedFy = null) {
  const currentFy = requestedFy || getFinancialYear(new Date());

  const query = { user: userId };
  if (requestedFy) {
    query.financialYear = requestedFy;
  }

  const gains = await MfCapitalGain.find(query).sort({ redemptionDate: -1 });

  let totalStcg = 0;
  let totalLtcg = 0;
  let totalProceeds = 0;
  let totalCost = 0;

  gains.forEach((g) => {
    if (g.gainType === 'STCG') {
      totalStcg += g.realizedGain;
    } else if (g.gainType === 'LTCG') {
      totalLtcg += g.realizedGain;
    }
    totalProceeds += g.redemptionProceeds;
    totalCost += g.purchaseCost;
  });

  const netRealizedGain = +(totalProceeds - totalCost).toFixed(2);

  return {
    financialYear: currentFy,
    productionTaxVerified: false, // Per Phase 4 mandate: requires external qualified tax/legal review
    taxReportingStatus: 'TAX_CALCULATION_DATA_ONLY_NOT_TAX_ADVICE',
    summary: {
      totalProceeds: +totalProceeds.toFixed(2),
      totalCost: +totalCost.toFixed(2),
      netRealizedGain,
      stcg: +totalStcg.toFixed(2),
      ltcg: +totalLtcg.toFixed(2),
      totalRedemptionsCount: gains.length,
      disclaimer: 'DISCLAIMER: The calculations shown are derived strictly from transaction lot records for analytical purposes. VikaOne is not a tax advisor and does not provide legal or tax advice. Current Indian tax laws (including Finance Act 2023 & 2024 amendments) apply distinct tax rates based on underlying asset allocation, residency, and slab rates. Please consult your chartered accountant or tax advisor for filing your Income Tax Return.',
    },
    transactions: gains,
  };
}

module.exports = {
  getFinancialYear,
  classifyTaxCategory,
  processRedemptionCapitalGains,
  getCapitalGainsReport,
};
