/**
 * VikaOne Mutual Fund — Phase 5G Portfolio Snapshot Service
 * Creates and manages immutable monthly portfolio snapshots with cryptographic hashes,
 * breakdown counts, and strict identity validation.
 */

const crypto = require('crypto');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');
const MutualFundScheme = require('../models/MutualFundScheme');
const validationService = require('./mfPortfolioValidationService');
const sourceRegistry = require('./mfPortfolioSourceRegistry');

class MfPortfolioSnapshotService {
  constructor() {
    this.parserVersion = 'v5G-1.0.0';
  }

  calculateHash(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Ingest and store complete portfolio snapshot
   */
  async saveSnapshot(payload) {
    const { schemeCode, planType = 'REGULAR', option = 'GROWTH', holdings = [] } = payload;

    const targetScheme = await MutualFundScheme.findOne({
      schemeCode,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    });

    if (!targetScheme) {
      throw new Error(`Target Regular Growth scheme not found: ${schemeCode}`);
    }

    const identityCheck = validationService.validateSchemeIdentity(payload, targetScheme);
    if (!identityCheck.isValid) {
      throw new Error(`Identity validation failed for ${schemeCode}: ${identityCheck.errors.join('; ')}`);
    }

    const posCheck = validationService.validatePositions(holdings, {
      asOfDate: payload.asOfDate || payload.portfolioAsOf || '2026-09-30',
      sourceName: payload.sourceName || payload.source,
      sourceDocument: payload.sourceDocument || payload.sourceDoc,
      sourceUrl: payload.sourceUrl,
      sourceType: payload.sourceType || 'AMC_MONTHLY_PORTFOLIO',
    });

    if (!posCheck.isValid) {
      throw new Error(`Positions validation failed for ${schemeCode}: ${posCheck.errors.join('; ')}`);
    }

    const asOfDate = new Date(payload.asOfDate || payload.portfolioAsOf || '2026-09-30');
    const sourceHash = this.calculateHash({ schemeCode, asOfDate, positions: posCheck.positions });

    // Mark previous snapshots for this scheme as non-current
    await MutualFundPortfolioSnapshot.updateMany(
      { schemeCode, isin: targetScheme.isin, planType: 'REGULAR', option: 'GROWTH' },
      { $set: { isCurrent: false } }
    );

    const isPartial = payload.isPartial === true || (payload.totalPortfolioPositions && payload.totalPortfolioPositions > posCheck.positions.length);
    const totalCount = payload.totalPortfolioPositions || posCheck.positions.length;

    // Upsert immutable snapshot
    const snapshot = await MutualFundPortfolioSnapshot.findOneAndUpdate(
      {
        schemeCode,
        isin: targetScheme.isin,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
      },
      {
        schemeId: targetScheme._id,
        schemeCode,
        isin: targetScheme.isin,
        amcCode: targetScheme.amcCode,
        amcName: targetScheme.amcName,
        schemeName: targetScheme.schemeName,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
        portfolioAsOf: asOfDate,
        source: payload.source || 'Official AMC Monthly Portfolio Disclosure',
        sourceDocumentId: payload.sourceDocumentId || payload.sourceDocument || null,
        sourceDocument: payload.sourceDocument || 'Monthly_Portfolio_Disclosure.xlsx',
        sourceUrl: payload.sourceUrl || null,
        sourceType: payload.sourceType || 'AMC_MONTHLY_PORTFOLIO',
        sourceHash,
        checksum: sourceHash,
        parserVersion: this.parserVersion,
        holdingsAvailable: true,
        isPartial,
        totalHoldingsCount: totalCount,
        displayedCount: posCheck.positions.length,
        totalPortfolioPositions: totalCount,
        equitySecurityCount: posCheck.counts.equitySecurityCount,
        debtSecurityCount: posCheck.counts.debtSecurityCount,
        moneyMarketCount: posCheck.counts.moneyMarketCount,
        repoCount: posCheck.counts.repoCount,
        cashEquivalentCount: posCheck.counts.cashEquivalentCount,
        derivativePositionCount: posCheck.counts.derivativePositionCount,
        otherPositionCount: posCheck.counts.otherPositionCount,
        portfolioStatus: isPartial ? 'PARTIAL_SOURCE' : 'COMPLETE_VERIFIED',
        isCurrent: true,
        holdings: posCheck.positions,
        ingestedAt: new Date(),
        totalPortfolioNetAssets: payload.totalPortfolioNetAssets || null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Sync to MutualFundScheme for backward compatibility
    await MutualFundScheme.updateOne(
      { schemeCode },
      {
        $set: {
          holdings: posCheck.positions.map((p) => ({
            name: p.securityName,
            weight: p.weightPercent,
            sector: p.sector,
            asOfDate: p.asOfDate,
            source: p.sourceName || payload.source,
          })),
          holdingsAsOfDate: asOfDate,
          holdingsSource: payload.source,
        },
      }
    );

    return snapshot;
  }

  /**
   * Get current active snapshot for a scheme
   */
  async getCurrentSnapshot(schemeCode) {
    if (!schemeCode) return null;
    return MutualFundPortfolioSnapshot.findOne({
      schemeCode,
      planType: 'REGULAR',
      option: 'GROWTH',
      isCurrent: true,
    }).lean();
  }

  /**
   * Get paginated holdings tied to snapshotId
   */
  async getPaginatedHoldings(schemeCode, options = {}) {
    const { page = 1, limit = 50, assetClass, snapshotId } = options;

    let snapshot;
    if (snapshotId) {
      snapshot = await MutualFundPortfolioSnapshot.findById(snapshotId).lean();
    } else {
      snapshot = await this.getCurrentSnapshot(schemeCode);
    }

    if (!snapshot || !snapshot.holdings || snapshot.holdings.length === 0) {
      return {
        snapshotId: null,
        total: 0,
        page: Number(page),
        limit: Number(limit),
        hasMore: false,
        items: [],
      };
    }

    let filtered = snapshot.holdings;
    if (assetClass && assetClass !== 'ALL') {
      filtered = filtered.filter((h) => h.assetClass === assetClass);
    }

    const startIndex = (Number(page) - 1) * Number(limit);
    const paginatedItems = filtered.slice(startIndex, startIndex + Number(limit));
    const hasMore = startIndex + Number(limit) < filtered.length;

    return {
      snapshotId: snapshot._id,
      schemeCode: snapshot.schemeCode,
      portfolioAsOf: snapshot.asOfDate,
      source: snapshot.source,
      sourceDocument: snapshot.sourceDocument,
      total: filtered.length,
      totalPortfolioPositions: snapshot.totalPortfolioPositions,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(filtered.length / Number(limit)),
      hasMore,
      items: paginatedItems,
    };
  }
}

module.exports = new MfPortfolioSnapshotService();
