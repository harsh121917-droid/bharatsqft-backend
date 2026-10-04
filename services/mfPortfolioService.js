/**
 * VikaOne Mutual Fund — Phase 5G Portfolio Orchestration Service
 * Integrates source registry, validation, snapshot persistence, and API exposure.
 */

const snapshotService = require('./mfPortfolioSnapshotService');
const sourceRegistry = require('./mfPortfolioSourceRegistry');
const validationService = require('./mfPortfolioValidationService');
const MutualFundScheme = require('../models/MutualFundScheme');

class MfPortfolioService {
  /**
   * Get formatted portfolio object for scheme detail view
   */
  async getSchemePortfolio(schemeCode) {
    const snapshot = await snapshotService.getCurrentSnapshot(schemeCode);

    if (!snapshot || !snapshot.holdings || snapshot.holdings.length === 0) {
      return {
        asOfDate: null,
        source: null,
        sourceDocument: null,
        sourceUrl: null,
        snapshotId: null,
        totalHoldingsCount: null,
        totalPortfolioPositions: null,
        holdingsAvailable: false,
        isPartial: false,
        displayedCount: null,
        portfolioStatus: 'SOURCE_UNAVAILABLE',
        breakdown: {
          equitySecurityCount: 0,
          debtSecurityCount: 0,
          moneyMarketCount: 0,
          repoCount: 0,
          cashEquivalentCount: 0,
          derivativePositionCount: 0,
          otherPositionCount: 0,
        },
        holdings: null,
        holdingsAsOf: null,
        holdingsSource: null,
      };
    }

    const asOfStr = snapshot.asOfDate instanceof Date
      ? snapshot.asOfDate.toISOString().split('T')[0]
      : String(snapshot.asOfDate).split('T')[0];

    const sortedHoldings = [...snapshot.holdings].sort((a, b) => {
      const wa = typeof a.weightPercent === 'number' ? a.weightPercent : -1;
      const wb = typeof b.weightPercent === 'number' ? b.weightPercent : -1;
      return wb - wa;
    });

    const isPartial = snapshot.isPartial === true;
    const totalCount = snapshot.totalPortfolioPositions || snapshot.totalHoldingsCount || sortedHoldings.length;

    return {
      asOfDate: asOfStr,
      source: snapshot.source,
      sourceDocument: snapshot.sourceDocument,
      sourceUrl: snapshot.sourceUrl,
      snapshotId: snapshot._id,
      totalHoldingsCount: totalCount,
      totalPortfolioPositions: totalCount,
      holdingsAvailable: true,
      isPartial,
      displayedCount: sortedHoldings.length,
      portfolioStatus: snapshot.portfolioStatus || (isPartial ? 'PARTIAL_SOURCE' : 'COMPLETE_VERIFIED'),
      breakdown: {
        equitySecurityCount: snapshot.equitySecurityCount || 0,
        debtSecurityCount: snapshot.debtSecurityCount || 0,
        moneyMarketCount: snapshot.moneyMarketCount || 0,
        repoCount: snapshot.repoCount || 0,
        cashEquivalentCount: snapshot.cashEquivalentCount || 0,
        derivativePositionCount: snapshot.derivativePositionCount || 0,
        otherPositionCount: snapshot.otherPositionCount || 0,
      },
      holdings: sortedHoldings.map((h, idx) => ({
        securityName: h.securityName,
        name: h.securityName,
        isin: h.isin,
        sector: h.sector || 'Diversified',
        assetClass: h.assetClass || 'EQUITY',
        sourceAssetClass: h.sourceAssetClass || h.assetClass || 'EQUITY',
        quantity: h.quantity,
        marketValue: h.marketValue,
        weightPercent: h.weightPercent,
        weight: h.weightPercent,
        percentage: h.weightPercent,
        sourceWeightText: h.sourceWeightText || null,
        weightSource: h.weightSource || 'OFFICIAL_AMC_DISCLOSURE',
        rating: h.rating || null,
        maturityDate: h.maturityDate || null,
        coupon: h.coupon || null,
        sourceOrder: h.sourceOrder || (idx + 1),
        asOfDate: asOfStr,
        source: h.source || h.sourceName || snapshot.source,
        sourceName: h.sourceName || snapshot.source,
        sourceDocument: h.sourceDocument || snapshot.sourceDocument,
        sourceUrl: h.sourceUrl || snapshot.sourceUrl,
        sourceType: h.sourceType || snapshot.sourceType || 'AMC_MONTHLY_PORTFOLIO',
      })),
      holdingsAsOf: asOfStr,
      holdingsSource: snapshot.source,
    };
  }

  /**
   * Get paginated holdings for dedicated holdings view
   */
  async getPaginatedHoldings(schemeCode, options = {}) {
    return snapshotService.getPaginatedHoldings(schemeCode, options);
  }
}

module.exports = new MfPortfolioService();
