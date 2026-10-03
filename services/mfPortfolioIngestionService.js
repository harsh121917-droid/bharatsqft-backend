/**
 * VikaOne Mutual Fund — Portfolio Ingestion Service (Phase 5F)
 * Architecture:
 *   AMC Source Registry
 *         ↓
 *   AMC Portfolio Adapter
 *         ↓
 *   Raw Portfolio Document
 *         ↓
 *   Parser
 *         ↓
 *   Scheme Identity Resolver
 *         ↓
 *   Holding Validator
 *         ↓
 *   Portfolio Snapshot (MongoDB)
 *         ↓
 *   Mutual Fund Detail API
 *         ↓
 *   Flutter UI
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MfSchemePortfolioSnapshot = require('../models/MfSchemePortfolioSnapshot');
const MutualFundScheme = require('../models/MutualFundScheme');
const amcSourceRegistry = require('./amcSourceRegistry');

const DISCLOSURES_DIR = path.join(__dirname, '..', 'data', 'amc_disclosures');

class MfPortfolioIngestionService {
  constructor() {
    this.parserVersion = 'v1.2.0-phase5F';
  }

  /**
   * Calculate SHA-256 checksum of raw payload
   */
  calculateChecksum(payload) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Validate scheme identity against customer scope (Strict Regular + Growth)
   */
  async validateSchemeIdentity(schemeData, targetScheme = null) {
    const errors = [];

    if (schemeData.planType && schemeData.planType.toUpperCase() !== 'REGULAR') {
      errors.push(`Identity mismatch: source planType is '${schemeData.planType}', Only REGULAR plans supported. DIRECT plans rejected.`);
    }

    if (schemeData.option && schemeData.option.toUpperCase() !== 'GROWTH') {
      errors.push(`Identity mismatch: source option is '${schemeData.option}', Only GROWTH options supported. IDCW options rejected.`);
    }

    if (!targetScheme && (schemeData.isin || schemeData.schemeCode)) {
      targetScheme = await MutualFundScheme.findOne({
        planType: 'REGULAR',
        schemeName: { $not: { $regex: 'direct', $options: 'i' } },
        $or: [
          schemeData.isin ? { isin: schemeData.isin.toUpperCase() } : null,
          schemeData.schemeCode ? { schemeCode: String(schemeData.schemeCode) } : null,
        ].filter(Boolean),
      }).lean();
    }

    if (!targetScheme) {
      errors.push(`Target scheme not found in catalogue: schemeCode=${schemeData.schemeCode || 'N/A'}, isin=${schemeData.isin || 'N/A'}`);
    } else {
      if (targetScheme.planType !== 'REGULAR') {
        errors.push(`Identity mismatch: target scheme planType is '${targetScheme.planType}', expected 'REGULAR'`);
      }

      if (targetScheme.option !== 'GROWTH') {
        errors.push(`Identity mismatch: target scheme option is '${targetScheme.option}', expected 'GROWTH'`);
      }

      if ((targetScheme.schemeName && targetScheme.schemeName.toLowerCase().includes('direct')) ||
          (schemeData.schemeName && schemeData.schemeName.toLowerCase().includes('direct')) ||
          (schemeData.planType && schemeData.planType.toUpperCase() === 'DIRECT')) {
        errors.push('Direct plan detected in customer growth scheme');
      }

      if ((targetScheme.schemeName && /idcw|dividend/i.test(targetScheme.schemeName)) ||
          (schemeData.schemeName && /idcw|dividend/i.test(schemeData.schemeName)) ||
          (schemeData.option && /idcw|dividend/i.test(schemeData.option))) {
        errors.push('IDCW option detected in customer growth scheme');
      }

      if (schemeData.schemeCode && targetScheme.schemeCode && String(schemeData.schemeCode) !== String(targetScheme.schemeCode)) {
        errors.push(`Scheme code mismatch: source '${schemeData.schemeCode}' vs catalog '${targetScheme.schemeCode}'`);
      }

      if (schemeData.isin && targetScheme.isin && schemeData.isin.toUpperCase() !== targetScheme.isin.toUpperCase()) {
        errors.push(`ISIN mismatch: source '${schemeData.isin}' vs catalog '${targetScheme.isin}'`);
      }

      if (schemeData.amcCode && targetScheme.amcCode && schemeData.amcCode.toUpperCase() !== targetScheme.amcCode.toUpperCase()) {
        errors.push(`AMC code mismatch: source '${schemeData.amcCode}' vs catalog '${targetScheme.amcCode}'`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Identity check failed: ${errors.join(', ')}`);
    }

    return {
      isValid: true,
      errors: [],
    };
  }

  /**
   * Validate individual holding items and overall portfolio percentages
   */
  validateHoldings(rawHoldings, totalNetAssets = null, isKnownComplete = true) {
    if (typeof totalNetAssets === 'boolean') {
      isKnownComplete = totalNetAssets;
      totalNetAssets = null;
    }
    const validatedHoldings = [];
    const errors = [];
    const seenSecurities = new Set();
    let duplicateCount = 0;
    let sumWeight = 0;

    for (let i = 0; i < rawHoldings.length; i++) {
      const h = rawHoldings[i];
      const securityName = (h.securityName || h.name || '').trim();

      if (!securityName) {
        errors.push(`Holding row #${i + 1} has empty securityName`);
        continue;
      }

      const weight = typeof h.weightPercent === 'number'
        ? h.weightPercent
        : (typeof h.weight === 'number' ? h.weight : (typeof h.percentage === 'number' ? h.percentage : null));

      if (weight !== null && (isNaN(weight) || weight < 0)) {
        const err = `Holding '${securityName}' has invalid weight: ${weight}`;
        errors.push(err);
        throw new Error(err);
      }

      // Check for duplicate instruments
      const key = `${securityName.toLowerCase()}|${h.isin || 'NO_ISIN'}`;
      if (seenSecurities.has(key)) {
        duplicateCount++;
        console.warn(`[HoldingValidator WARN] Duplicate instrument entry: ${securityName}`);
        continue;
      }
      seenSecurities.add(key);

      if (weight !== null) {
        sumWeight += weight;
      }

      validatedHoldings.push({
        securityName,
        isin: h.isin ? h.isin.trim().toUpperCase() : null,
        sector: (h.sector || 'Diversified').trim(),
        assetClass: h.assetClass || 'Equity',
        quantity: typeof h.quantity === 'number' ? h.quantity : (h.qty ? Number(h.qty) : null),
        marketValue: typeof h.marketValue === 'number' ? h.marketValue : (h.mv ? Number(h.mv) : null),
        weightPercent: weight !== null ? parseFloat(weight.toFixed(4)) : null,
        weightSource: h.weightSource || 'OFFICIAL_AMC_DISCLOSURE',
        asOfDate: h.asOfDate ? new Date(h.asOfDate) : new Date('2026-09-30'),
        sourceName: h.sourceName || null,
        sourceDocument: h.sourceDocument || null,
        sourceUrl: h.sourceUrl || null,
        sourceType: h.sourceType || 'AMC_MONTHLY_PORTFOLIO',
      });
    }

    if (sumWeight > 105) {
      errors.push(`Portfolio total weight exceeds 105%: ${sumWeight.toFixed(2)}%`);
    }

    const isPartial = isKnownComplete === false;

    return {
      isValid: errors.length === 0,
      errors,
      holdings: validatedHoldings,
      validHoldings: validatedHoldings,
      duplicateCount,
      isPartial,
      sumWeight: parseFloat(sumWeight.toFixed(2)),
    };
  }

  /**
   * Ingest raw AMC disclosure file into MfSchemePortfolioSnapshot and sync MutualFundScheme
   */
  async ingestDisclosureFile(filename) {
    const filePath = path.isAbsolute(filename) ? filename : path.join(DISCLOSURES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Disclosure file not found: ${filePath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const checksum = this.calculateChecksum(rawData);

    const schemeCode = rawData.schemeCode;
    const targetScheme = await MutualFundScheme.findOne({
      schemeCode,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    });

    await this.validateSchemeIdentity(rawData, targetScheme);

    const holdingsCheck = this.validateHoldings(rawData.holdings, rawData.totalPortfolioNetAssets);
    if (!holdingsCheck.isValid) {
      throw new Error(`Holdings validation failed for ${schemeCode}: ${holdingsCheck.errors.join(', ')}`);
    }

    const asOfDate = new Date(rawData.asOfDate || '2026-09-30');
    const isPartial = rawData.isPartial === true || (rawData.totalHoldingsCount && rawData.totalHoldingsCount > holdingsCheck.holdings.length);
    const totalCount = rawData.totalHoldingsCount || holdingsCheck.holdings.length;

    // Archive any previous snapshot for this scheme as non-current
    await MfSchemePortfolioSnapshot.updateMany(
      { schemeCode, isin: targetScheme.isin, planType: 'REGULAR', option: 'GROWTH' },
      { $set: { isCurrent: false } }
    );

    // Upsert the new snapshot with compound unique key
    const snapshot = await MfSchemePortfolioSnapshot.findOneAndUpdate(
      {
        schemeCode,
        isin: targetScheme.isin,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
      },
      {
        schemeCode,
        isin: targetScheme.isin,
        amcCode: targetScheme.amcCode,
        amcName: targetScheme.amcName,
        schemeName: targetScheme.schemeName,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
        source: rawData.source,
        sourceDocument: rawData.sourceDocument,
        sourceUrl: rawData.sourceUrl,
        sourceType: rawData.sourceType || 'AMC_MONTHLY_PORTFOLIO',
        holdingsAvailable: true,
        isPartial,
        totalHoldingsCount: totalCount,
        displayedCount: holdingsCheck.holdings.length,
        portfolioStatus: isPartial ? 'SOURCE_PARTIAL' : 'SOURCE_AVAILABLE_AND_VERIFIED',
        isCurrent: true,
        holdings: holdingsCheck.holdings,
        ingestedAt: new Date(),
        parserVersion: this.parserVersion,
        checksum,
        totalPortfolioNetAssets: rawData.totalPortfolioNetAssets,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Sync to MutualFundScheme document for backward compatibility
    await MutualFundScheme.updateOne(
      { schemeCode },
      {
        $set: {
          holdings: holdingsCheck.holdings.map(h => ({
            name: h.securityName,
            weight: h.weightPercent,
            sector: h.sector,
            asOfDate: h.asOfDate,
            source: h.sourceName || rawData.source,
          })),
          holdingsAsOfDate: asOfDate,
          holdingsSource: rawData.source,
        },
      }
    );

    console.log(`[Ingested] Scheme ${schemeCode} (${targetScheme.schemeName}): ${holdingsCheck.holdings.length} authentic holdings (total: ${totalCount}, isPartial: ${isPartial}, sum: ${holdingsCheck.sumWeight}%)`);
    return snapshot;
  }

  /**
   * Ingest in-memory raw AMC disclosure snapshot
   */
  async ingestSnapshot(rawData) {
    const checksum = this.calculateChecksum(rawData);
    const schemeCode = rawData.schemeCode;
    const targetScheme = await MutualFundScheme.findOne({
      schemeCode,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    });

    await this.validateSchemeIdentity(rawData, targetScheme);

    const holdingsCheck = this.validateHoldings(rawData.holdings || [], rawData.totalPortfolioNetAssets);
    if (!holdingsCheck.isValid) {
      throw new Error(`Holdings validation failed for ${schemeCode}: ${holdingsCheck.errors.join(', ')}`);
    }

    const asOfDate = new Date(rawData.asOfDate || '2026-09-30');
    const isPartial = rawData.isPartial === true || (rawData.totalHoldingsCount && rawData.totalHoldingsCount > holdingsCheck.holdings.length);
    const totalCount = rawData.totalHoldingsCount || holdingsCheck.holdings.length;

    await MfSchemePortfolioSnapshot.updateMany(
      { schemeCode, isin: targetScheme.isin, planType: 'REGULAR', option: 'GROWTH' },
      { $set: { isCurrent: false } }
    );

    const snapshot = await MfSchemePortfolioSnapshot.findOneAndUpdate(
      {
        schemeCode,
        isin: targetScheme.isin,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
      },
      {
        schemeCode,
        isin: targetScheme.isin,
        amcCode: targetScheme.amcCode,
        amcName: targetScheme.amcName,
        schemeName: targetScheme.schemeName,
        planType: 'REGULAR',
        option: 'GROWTH',
        asOfDate,
        source: rawData.source || 'AMC_STATUTORY_DISCLOSURE',
        sourceDocument: rawData.sourceDocument || 'Monthly Portfolio Disclosure',
        sourceUrl: rawData.sourceUrl || null,
        sourceType: rawData.sourceType || 'AMC_MONTHLY_PORTFOLIO',
        holdingsAvailable: true,
        isPartial,
        totalHoldingsCount: totalCount,
        displayedCount: holdingsCheck.holdings.length,
        portfolioStatus: isPartial ? 'SOURCE_PARTIAL' : 'SOURCE_AVAILABLE_AND_VERIFIED',
        isCurrent: true,
        holdings: holdingsCheck.holdings,
        ingestedAt: new Date(),
        parserVersion: this.parserVersion,
        checksum,
        totalPortfolioNetAssets: rawData.totalPortfolioNetAssets,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return snapshot;
  }

  /**
   * Ingest all statutory disclosure files in the disclosures directory
   */
  async ingestAllDisclosures() {
    if (!fs.existsSync(DISCLOSURES_DIR)) {
      return { total: 0, ingested: 0 };
    }

    const files = fs.readdirSync(DISCLOSURES_DIR).filter(f => f.endsWith('.json'));
    const results = [];

    for (const f of files) {
      try {
        const snap = await this.ingestDisclosureFile(f);
        results.push({ filename: f, status: 'SUCCESS', schemeCode: snap.schemeCode, count: snap.holdings.length });
      } catch (err) {
        console.error(`[Ingestion Error] Failed ${f}:`, err.message);
        results.push({ filename: f, status: 'FAILED', error: err.message });
      }
    }

    return { total: files.length, results };
  }

  /**
   * Retrieve active verified portfolio snapshot for a scheme
   */
  async getActiveSnapshot(schemeCode) {
    return MfSchemePortfolioSnapshot.findOne({
      schemeCode,
      planType: 'REGULAR',
      option: 'GROWTH',
      isCurrent: true,
    }).lean();
  }

  /**
   * Monthly refresh handler - handles successful fetch and temporary failure fallback
   */
  async handleMonthlyRefresh(schemeCode, newDisclosureData) {
    if (!newDisclosureData) {
      // Temporary source failure: Retain last verified snapshot with original asOfDate
      console.warn(`[Refresh WARN] Temporary source failure for ${schemeCode}. Retaining last verified snapshot.`);
      const lastSnapshot = await this.getActiveSnapshot(schemeCode);
      if (lastSnapshot) {
        return {
          status: 'RETAINED_PREVIOUS_VERIFIED',
          asOfDate: lastSnapshot.asOfDate,
          holdingsCount: lastSnapshot.holdings.length,
        };
      }
      return { status: 'SOURCE_NOT_AVAILABLE', asOfDate: null, holdingsCount: 0 };
    }

    // If new disclosure data provided, ingest it
    const tempFile = path.join(DISCLOSURES_DIR, `temp_refresh_${schemeCode}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(newDisclosureData), 'utf8');
    const snap = await this.ingestDisclosureFile(tempFile);
    fs.unlinkSync(tempFile);
    return { status: 'REFRESHED_SUCCESS', snapshot: snap };
  }
}

module.exports = new MfPortfolioIngestionService();
