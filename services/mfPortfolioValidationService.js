/**
 * VikaOne Mutual Fund — Phase 5G Portfolio Validation Service
 * Enforces strict financial data rules:
 * 1. Scheme identity validation (Strict Regular + Growth, reject Direct/IDCW).
 * 2. Position row validation (non-empty name, non-negative weight, valid assetClass).
 * 3. Anti-normalization rule (never scale top holdings to 100%).
 * 4. Preservation of non-equity instruments (TREPS, Reverse Repo, G-Secs, Debt, Cash).
 * 5. Special weight text handling (e.g. '<0.01%').
 */

const VALID_ASSET_CLASSES = [
  'EQUITY',
  'DEBT',
  'GOVERNMENT_SECURITY',
  'MONEY_MARKET',
  'REPO',
  'REVERSE_REPO',
  'TREPS',
  'CASH',
  'CASH_EQUIVALENT',
  'ETF',
  'MUTUAL_FUND',
  'DERIVATIVE',
  'REIT_INVIT',
  'GOLD',
  'OTHER',
  'NET_CURRENT_ASSETS',
];

class MfPortfolioValidationService {
  /**
   * Validate scheme identity against customer catalogue invariants
   */
  validateSchemeIdentity(sourceMeta, targetScheme) {
    const errors = [];

    if (!targetScheme) {
      errors.push(`Target scheme not found in catalog: schemeCode=${sourceMeta.schemeCode || 'N/A'}, isin=${sourceMeta.isin || 'N/A'}`);
      return { isValid: false, errors };
    }

    if (sourceMeta.planType && sourceMeta.planType.toUpperCase() !== 'REGULAR') {
      errors.push(`Identity mismatch: source planType is '${sourceMeta.planType}'. Only REGULAR plans permitted.`);
    }

    if (sourceMeta.option && sourceMeta.option.toUpperCase() !== 'GROWTH') {
      errors.push(`Identity mismatch: source option is '${sourceMeta.option}'. Only GROWTH options permitted.`);
    }

    if (targetScheme.planType !== 'REGULAR') {
      errors.push(`Target scheme planType '${targetScheme.planType}' is not REGULAR`);
    }

    if (targetScheme.option !== 'GROWTH') {
      errors.push(`Target scheme option '${targetScheme.option}' is not GROWTH`);
    }

    if (/direct/i.test(targetScheme.schemeName) || (sourceMeta.schemeName && /direct/i.test(sourceMeta.schemeName))) {
      errors.push('Direct plan detected in customer growth catalogue');
    }

    if (/idcw|dividend/i.test(targetScheme.schemeName) || (sourceMeta.schemeName && /idcw|dividend/i.test(sourceMeta.schemeName))) {
      errors.push('IDCW option detected in customer growth catalogue');
    }

    if (sourceMeta.isin && targetScheme.isin && sourceMeta.isin.toUpperCase() !== targetScheme.isin.toUpperCase()) {
      errors.push(`ISIN mismatch: source '${sourceMeta.isin}' vs catalog '${targetScheme.isin}'`);
    }

    if (sourceMeta.amcCode && targetScheme.amcCode && sourceMeta.amcCode.toUpperCase() !== targetScheme.amcCode.toUpperCase()) {
      errors.push(`AMC code mismatch: source '${sourceMeta.amcCode}' vs catalog '${targetScheme.amcCode}'`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Normalize and map asset class string into standard enum
   */
  normalizeAssetClass(rawClass) {
    if (!rawClass) return 'OTHER';
    const s = String(rawClass).trim().toUpperCase();

    if (s.includes('TREPS') || s.includes('TRIPARTY')) return 'TREPS';
    if (s.includes('REVERSE REPO') || s.includes('REV REPO')) return 'REVERSE_REPO';
    if (s.includes('REPO')) return 'REPO';
    if (s.includes('GOVERNMENT') || s.includes('G-SEC') || s.includes('TREASURY') || s.includes('SOVEREIGN') || s.includes('SDL')) return 'GOVERNMENT_SECURITY';
    if (s.includes('EQUITY')) return 'EQUITY';
    if (s.includes('DEBT') || s.includes('BOND') || s.includes('NCD') || s.includes('DEBENTURE')) return 'DEBT';
    if (s.includes('MONEY MARKET') || s.includes('COMMERCIAL PAPER') || s.includes('CERTIFICATE OF DEPOSIT') || s.includes('CP') || s.includes('CD')) return 'MONEY_MARKET';
    if (s.includes('DERIVATIVE') || s.includes('FUTURE') || s.includes('OPTION') || s.includes('HEDG')) return 'DERIVATIVE';
    if (s.includes('ETF')) return 'ETF';
    if (s.includes('MUTUAL FUND')) return 'MUTUAL_FUND';
    if (s.includes('REIT') || s.includes('INVIT')) return 'REIT_INVIT';
    if (s.includes('GOLD')) return 'GOLD';
    if (s.includes('RECEIVABLE') || s.includes('PAYABLE') || s.includes('NET CURRENT') || s.includes('CASH')) return 'CASH_EQUIVALENT';

    return 'OTHER';
  }

  /**
   * Validate portfolio positions array
   */
  validatePositions(rawPositions, options = {}) {
    const validated = [];
    const errors = [];
    let duplicateCount = 0;
    let sumWeight = 0;

    const counts = {
      totalPortfolioPositions: 0,
      equitySecurityCount: 0,
      debtSecurityCount: 0,
      moneyMarketCount: 0,
      repoCount: 0,
      cashEquivalentCount: 0,
      derivativePositionCount: 0,
      otherPositionCount: 0,
    };

    const seenKeys = new Map();

    for (let i = 0; i < rawPositions.length; i++) {
      const pos = rawPositions[i];
      const securityName = (pos.securityName || pos.name || '').trim();

      if (!securityName) {
        errors.push(`Row #${i + 1}: Empty security/instrument name`);
        continue;
      }

      // Parse weightPercent and sourceWeightText
      let weightPercent = null;
      let sourceWeightText = null;

      if (typeof pos.weightPercent === 'number') {
        weightPercent = pos.weightPercent;
      } else if (typeof pos.weight === 'number') {
        weightPercent = pos.weight;
      } else if (typeof pos.percentage === 'number') {
        weightPercent = pos.percentage;
      } else if (typeof pos.weightPercent === 'string' || typeof pos.weight === 'string') {
        const str = String(pos.weightPercent || pos.weight).trim();
        if (str.startsWith('<')) {
          sourceWeightText = str;
          weightPercent = null; // statutory negligible weight
        } else {
          const parsed = parseFloat(str.replace('%', ''));
          weightPercent = isNaN(parsed) ? null : parsed;
        }
      }

      if (weightPercent !== null && (isNaN(weightPercent) || weightPercent < 0)) {
        errors.push(`Row #${i + 1} (${securityName}): Invalid negative weight ${weightPercent}`);
        continue;
      }

      const assetClass = this.normalizeAssetClass(pos.assetClass || pos.sourceAssetClass);
      const isin = pos.isin ? pos.isin.trim().toUpperCase() : null;

      // Duplicate detection key (name + isin + tranche if any)
      const dedupKey = `${securityName.toLowerCase()}|${isin || 'NO_ISIN'}|${pos.maturityDate || ''}`;
      if (seenKeys.has(dedupKey)) {
        duplicateCount++;
      }
      seenKeys.set(dedupKey, true);

      if (weightPercent !== null) {
        sumWeight += weightPercent;
      }

      // Update breakdown counts
      counts.totalPortfolioPositions++;
      if (assetClass === 'EQUITY') counts.equitySecurityCount++;
      else if (assetClass === 'DEBT' || assetClass === 'GOVERNMENT_SECURITY') counts.debtSecurityCount++;
      else if (assetClass === 'MONEY_MARKET') counts.moneyMarketCount++;
      else if (assetClass === 'REPO' || assetClass === 'REVERSE_REPO' || assetClass === 'TREPS') counts.repoCount++;
      else if (assetClass === 'CASH' || assetClass === 'CASH_EQUIVALENT' || assetClass === 'NET_CURRENT_ASSETS') counts.cashEquivalentCount++;
      else if (assetClass === 'DERIVATIVE') counts.derivativePositionCount++;
      else counts.otherPositionCount++;

      validated.push({
        securityName,
        name: securityName,
        isin,
        sector: (pos.sector || 'Diversified').trim(),
        assetClass,
        sourceAssetClass: pos.sourceAssetClass || pos.assetClass || assetClass,
        quantity: typeof pos.quantity === 'number' ? pos.quantity : (pos.qty ? Number(pos.qty) : null),
        marketValue: typeof pos.marketValue === 'number' ? pos.marketValue : (pos.mv ? Number(pos.mv) : null),
        weightPercent: weightPercent !== null ? parseFloat(weightPercent.toFixed(4)) : null,
        sourceWeightText,
        weightSource: pos.weightSource || 'OFFICIAL_AMC_DISCLOSURE',
        rating: pos.rating || null,
        maturityDate: pos.maturityDate ? new Date(pos.maturityDate) : null,
        coupon: typeof pos.coupon === 'number' ? pos.coupon : null,
        sourceOrder: typeof pos.sourceOrder === 'number' ? pos.sourceOrder : (i + 1),
        sourceRow: typeof pos.sourceRow === 'number' ? pos.sourceRow : (i + 1),
        asOfDate: pos.asOfDate ? new Date(pos.asOfDate) : new Date(options.asOfDate || '2026-09-30'),
        sourceName: pos.sourceName || options.sourceName || null,
        sourceDocument: pos.sourceDocument || options.sourceDocument || null,
        sourceUrl: pos.sourceUrl || options.sourceUrl || null,
        sourceType: pos.sourceType || options.sourceType || 'AMC_MONTHLY_PORTFOLIO',
      });
    }

    // Weight sum sanity check (should not exceed 105% allowing for statutory receivables)
    if (sumWeight > 105) {
      errors.push(`Portfolio total weight exceeds 105%: ${sumWeight.toFixed(2)}%`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      positions: validated,
      duplicateCount,
      counts,
      sumWeight: parseFloat(sumWeight.toFixed(2)),
    };
  }
}

module.exports = new MfPortfolioValidationService();
