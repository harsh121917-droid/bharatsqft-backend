const MfOrder = require('../models/MfOrder');
const MfTransaction = require('../models/MfTransaction');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSip = require('../models/MfSip');

/**
 * Pure Newton-Raphson XIRR implementation.
 * Cash flows: array of { date: Date, amount: Number }
 * - Investments/outflows are negative numbers (e.g. -10000)
 * - Redemptions/terminal value are positive numbers (e.g. +12500)
 * Returns annualized return percentage, or null if insufficient data/diverges.
 */
function calculateXirr(cashFlows) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;

  // Filter valid items
  const valid = cashFlows
    .map((cf) => ({
      date: new Date(cf.date),
      amount: Number(cf.amount),
    }))
    .filter((cf) => !isNaN(cf.date.getTime()) && isFinite(cf.amount) && cf.amount !== 0);

  if (valid.length < 2) return null;

  // Must have at least one negative and at least one positive flow
  const hasNegative = valid.some((cf) => cf.amount < 0);
  const hasPositive = valid.some((cf) => cf.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  // Sort chronologically
  valid.sort((a, b) => a.date.getTime() - b.date.getTime());

  const d0 = valid[0].date.getTime();

  // Newton-Raphson iterations
  let r = 0.1; // initial 10% rate guess
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIterations; iter++) {
    let fValue = 0;
    let fDerivative = 0;

    for (const cf of valid) {
      const years = (cf.date.getTime() - d0) / (365.25 * 86400000);
      const factor = Math.pow(1 + r, years);

      if (factor === 0 || !isFinite(factor)) {
        return null;
      }

      fValue += cf.amount / factor;
      fDerivative -= (years * cf.amount) / (factor * (1 + r));
    }

    if (Math.abs(fValue) < tolerance) {
      const xirrPct = +(r * 100).toFixed(2);
      return isFinite(xirrPct) ? xirrPct : null;
    }

    if (fDerivative === 0 || !isFinite(fDerivative)) {
      return null;
    }

    const nextR = r - fValue / fDerivative;
    if (!isFinite(nextR) || nextR <= -0.9999 || nextR > 50.0) {
      // Divergence guard
      return null;
    }

    if (Math.abs(nextR - r) < tolerance) {
      const xirrPct = +(nextR * 100).toFixed(2);
      return isFinite(xirrPct) ? xirrPct : null;
    }

    r = nextR;
  }

  return null;
}

/**
 * Recalculate portfolio holdings and summary strictly from confirmed allotments & redemptions.
 * Pending orders (where allottedUnits === 0 or allotmentStatus !== 'ALLOTTED') are strictly excluded.
 */
async function recalculateUserPortfolio(userId) {
  if (!userId) return null;

  // 1. Fetch all confirmed orders
  // P: Purchase (only ALLOTTED orders count as holdings)
  // R: Redemption (settled or confirmed orders reduce holdings)
  // S: Switch
  const orders = await MfOrder.find({
    user: userId,
    $or: [
      { transactionType: 'P', paymentStatus: 'SUCCESS' },
      { transactionType: { $in: ['R', 'S'] } },
    ],
  }).sort({ createdAt: 1 });

  // 2. Fetch active SIPs
  const activeSips = await MfSip.find({ user: userId, status: 'ACTIVE' });

  // 3. Aggregate holdings scheme-by-scheme strictly from confirmed units
  const holdingsMap = {};
  const cashFlows = [];

  for (const ord of orders) {
    const sCode = ord.schemeCode.toUpperCase();

    if (!holdingsMap[sCode]) {
      holdingsMap[sCode] = {
        schemeCode: sCode,
        schemeName: ord.schemeName,
        totalUnits: 0,
        investedAmount: 0,
        pendingUnits: 0,
        ordersCount: 0,
      };
    }

    holdingsMap[sCode].ordersCount++;

    if (ord.transactionType === 'P') {
      // STRICT RULE: Actual units become holdings ONLY after authentic allotment/confirmed units
      const isAllotted = ord.allotmentStatus === 'ALLOTTED' && (ord.allottedUnits || 0) > 0;
      if (isAllotted) {
        const units = ord.allottedUnits;
        holdingsMap[sCode].totalUnits += units;
        holdingsMap[sCode].investedAmount += ord.orderAmount;

        // Cash outflow for investor XIRR
        cashFlows.push({
          date: ord.allotmentDate || ord.createdAt,
          amount: -Math.abs(ord.orderAmount),
        });
      } else {
        // Pending order: tracked separately, NEVER included in active holdings
        holdingsMap[sCode].pendingUnits += (ord.estimatedUnits || 0);
      }
    } else if (ord.transactionType === 'R') {
      // STRICT: Redemption Requested != Redemption Settled. Only confirmed settlement reduces units.
      const isRedemptionSettled = ord.allotmentStatus === 'ALLOTTED' || ord.orderStatus === 'ALLOTTED' || ord.payoutStatus === 'PROCESSED';
      if (isRedemptionSettled) {
        const unitsReduced = Math.abs(ord.redemptionUnits || ord.units || 0);
        const prevUnits = holdingsMap[sCode].totalUnits;
        const prevInvested = holdingsMap[sCode].investedAmount;

        if (prevUnits > 0 && unitsReduced > 0) {
          const costBasisReduced = Math.min(prevInvested, (prevInvested / prevUnits) * unitsReduced);
          holdingsMap[sCode].totalUnits = Math.max(0, +(prevUnits - unitsReduced).toFixed(4));
          holdingsMap[sCode].investedAmount = Math.max(0, +(prevInvested - costBasisReduced).toFixed(2));

          // Cash inflow for investor XIRR
          const payout = ord.finalSettledAmount || ord.estimatedPayout || ord.orderAmount || 0;
          if (payout > 0) {
            cashFlows.push({
              date: ord.settlementDate || ord.updatedAt || ord.createdAt,
              amount: +Math.abs(payout),
            });
          }
        }
      }
    } else if (ord.transactionType === 'S') {
      // STRICT: Switch updates portfolio ONLY after authentic exchange allotment/settlement
      const isSwitchSettled = ord.allotmentStatus === 'ALLOTTED' || ord.orderStatus === 'ALLOTTED';
      if (isSwitchSettled) {
        const sourceUnits = Math.abs(ord.redemptionUnits || ord.units || 0);
        const prevUnits = holdingsMap[sCode].totalUnits;
        const prevInvested = holdingsMap[sCode].investedAmount;

        if (prevUnits > 0 && sourceUnits > 0) {
          const costBasisReduced = Math.min(prevInvested, (prevInvested / prevUnits) * sourceUnits);
          holdingsMap[sCode].totalUnits = Math.max(0, +(prevUnits - sourceUnits).toFixed(4));
          holdingsMap[sCode].investedAmount = Math.max(0, +(prevInvested - costBasisReduced).toFixed(2));
        }

        // Target scheme (if allotted)
        if (ord.targetSchemeCode && (ord.allottedUnits || 0) > 0) {
          const tgtCode = ord.targetSchemeCode.toUpperCase();
          if (!holdingsMap[tgtCode]) {
            holdingsMap[tgtCode] = {
              schemeCode: tgtCode,
              schemeName: ord.targetSchemeName || tgtCode,
              totalUnits: 0,
              investedAmount: 0,
              pendingUnits: 0,
              ordersCount: 0,
            };
          }
          holdingsMap[tgtCode].totalUnits += ord.allottedUnits;
          holdingsMap[tgtCode].investedAmount += ord.orderAmount;
        }
      }
    }
  }

  // 4. Fetch live Scheme information for current NAV, Category, and AMC
  const schemeCodes = Object.keys(holdingsMap);
  const schemes = await MutualFundScheme.find({
    schemeCode: { $in: schemeCodes },
    planType: 'REGULAR',
  });

  const schemeLookup = {};
  schemes.forEach((s) => {
    schemeLookup[s.schemeCode.toUpperCase()] = s;
  });

  let totalInvested = 0;
  let currentValuation = 0;
  let totalDayChangeAmount = 0;

  const holdingsList = [];
  const categoryAllocations = {};
  const amcAllocations = {};

  for (const sCode of schemeCodes) {
    const h = holdingsMap[sCode];
    if (h.totalUnits <= 0.0001) continue;

    const schemeDoc = schemeLookup[sCode];
    const currentNav = schemeDoc?.nav || null;
    const navDate = schemeDoc?.navDate || null;
    const category = schemeDoc?.category || 'Equity';
    const subCategory = schemeDoc?.subCategory || '';
    const amcName = schemeDoc?.amcName || 'Mutual Fund AMC';

    const currentValue = currentNav ? +(h.totalUnits * currentNav).toFixed(2) : h.investedAmount;
    const invested = +h.investedAmount.toFixed(2);
    const profitLoss = +(currentValue - invested).toFixed(2);
    const returnPct = invested > 0 ? +((profitLoss / invested) * 100).toFixed(2) : 0;
    const averageNav = h.totalUnits > 0 ? +(invested / h.totalUnits).toFixed(4) : null;

    // Day change calculation
    let day1ChangeAmount = 0;
    if (schemeDoc && schemeDoc.cagr1Y !== undefined) {
      // If 1D return is available on scheme
      const day1Pct = (schemeDoc.toObject().day1Return || 0) / 100.0;
      day1ChangeAmount = +(currentValue * day1Pct).toFixed(2);
      totalDayChangeAmount += day1ChangeAmount;
    }

    totalInvested += invested;
    currentValuation += currentValue;

    // Allocation tracking
    categoryAllocations[category] = (categoryAllocations[category] || 0) + currentValue;
    amcAllocations[amcName] = (amcAllocations[amcName] || 0) + currentValue;

    const holdingObj = {
      schemeCode: sCode,
      schemeName: schemeDoc?.schemeName || h.schemeName,
      amcName,
      category,
      subCategory,
      planType: 'REGULAR',
      totalUnits: +h.totalUnits.toFixed(3),
      investedAmount: invested,
      averageNav,
      currentNav,
      navDate,
      currentValue,
      profitLoss,
      returnPct,
      day1ChangeAmount,
      pendingUnits: +h.pendingUnits.toFixed(3),
      holdingStatus: 'ACTIVE',
    };

    holdingsList.push(holdingObj);

    // Update persistent holding document in MongoDB
    await MfPortfolioHolding.findOneAndUpdate(
      { user: userId, schemeCode: sCode },
      {
        $set: {
          user: userId,
          clientCode: orders[0]?.clientCode || 'V1UCC',
          schemeCode: sCode,
          schemeName: holdingObj.schemeName,
          amcName,
          category,
          subCategory,
          planType: 'REGULAR',
          totalUnits: holdingObj.totalUnits,
          investedAmount: holdingObj.investedAmount,
          averageNav: holdingObj.averageNav,
          currentNav: holdingObj.currentNav,
          navDate: holdingObj.navDate,
          currentValue: holdingObj.currentValue,
          unrealizedProfitLoss: holdingObj.profitLoss,
          unrealizedReturnPct: holdingObj.returnPct,
          holdingStatus: 'ACTIVE',
          lastUpdatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  // Close zeroed-out holdings
  await MfPortfolioHolding.updateMany(
    { user: userId, schemeCode: { $nin: holdingsList.map((h) => h.schemeCode) } },
    { $set: { totalUnits: 0, holdingStatus: 'CLOSED', lastUpdatedAt: new Date() } }
  );

  // Terminal cash flow for XIRR: positive current valuation as of today
  if (currentValuation > 0) {
    cashFlows.push({
      date: new Date(),
      amount: +currentValuation,
    });
  }

  const xirr = calculateXirr(cashFlows);

  // Overall calculations
  const totalProfitLoss = +(currentValuation - totalInvested).toFixed(2);
  const totalProfitLossPct = totalInvested > 0 ? +((totalProfitLoss / totalInvested) * 100).toFixed(2) : 0;

  // Format allocation percentages
  const categoryAllocationList = Object.entries(categoryAllocations).map(([category, val]) => ({
    name: category,
    category,
    amount: +val.toFixed(2),
    percentage: currentValuation > 0 ? +((val / currentValuation) * 100).toFixed(1) : 0,
  }));

  const amcAllocationList = Object.entries(amcAllocations).map(([amc, val]) => ({
    name: amc,
    amc,
    amount: +val.toFixed(2),
    percentage: currentValuation > 0 ? +((val / currentValuation) * 100).toFixed(1) : 0,
  }));

  const summary = {
    totalInvested: +totalInvested.toFixed(2),
    currentValuation: +currentValuation.toFixed(2),
    totalProfitLoss,
    totalProfitLossPct,
    todayChangeAmount: +totalDayChangeAmount.toFixed(2),
    todayChangePct: currentValuation > 0 ? +((totalDayChangeAmount / currentValuation) * 100).toFixed(2) : 0,
    xirr, // Investor-level XIRR (distinct from scheme CAGR)
    totalFunds: holdingsList.length,
    activeSipsCount: activeSips.length,
    lastUpdatedAt: new Date(),
  };

  return {
    totalInvested: summary.totalInvested,
    currentValue: summary.currentValuation,
    summary,
    holdings: holdingsList,
    allocations: {
      category: categoryAllocationList,
      amc: amcAllocationList,
      byCategory: categoryAllocationList,
      byAmc: amcAllocationList,
    },
    activeSips,
  };
}

module.exports = {
  calculateXirr,
  recalculateUserPortfolio,
};
