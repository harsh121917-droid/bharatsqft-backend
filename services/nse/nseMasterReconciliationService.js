const axios = require('axios');
const MutualFundScheme = require('../../models/MutualFundScheme');
const nseClient = require('./nseClient');

/**
 * NSE MF II Master Data & RTA Reconciliation Engine
 * Complies with NSE MFSS Protocol v1.9.8 & Web File Structure specification.
 * 
 * Rules:
 * 1. Primary Mapping Key: ISIN + Scheme Code + Plan + Option
 * 2. Regular Plans ONLY: Exclude all Direct plans at the backend/database level.
 * 3. Separate Growth vs IDCW: Growth, IDCW Payout, IDCW Reinvestment are distinct records.
 * 4. Cross-check against AMFI & RTA feeds on the exact same NAV date.
 * 5. Flag mismatches in reconciliation audit log instead of blindly overwriting.
 */

class NseMasterReconciliationService {
  constructor() {
    this.auditFlags = [];
    this.lastReconciledAt = null;
  }

  /**
   * Determine Plan Type: Regular vs Direct
   * As per NSE spec: If Scheme Plan is 'D' or name contains 'DIRECT' -> DIRECT
   */
  parsePlanType(planCode, schemeName = '') {
    const p = String(planCode || '').trim().toUpperCase();
    const nameLower = String(schemeName || '').toLowerCase();
    if (p === 'D' || p === 'DIRECT' || nameLower.includes('direct')) {
      return 'DIRECT';
    }
    return 'REGULAR';
  }

  /**
   * Determine Option: Growth vs IDCW vs Bonus
   * As per NSE NAV Master spec:
   * Z = Growth / Bonus / Others
   * Y = Dividend Reinvestment (IDCW Reinvestment)
   * N = Dividend Payout (IDCW Payout)
   */
  parseOption(reinvestFlag, schemeCode = '', schemeName = '') {
    const flag = String(reinvestFlag || '').trim().toUpperCase();
    const code = String(schemeCode || '').toUpperCase();
    const name = String(schemeName || '').toLowerCase();

    if (flag === 'Y') {
      return { option: 'IDCW', dividendType: 'REINVESTMENT' };
    }
    if (flag === 'N') {
      return { option: 'IDCW', dividendType: 'PAYOUT' };
    }
    if (code.endsWith('-GR') || code.endsWith('GR') || name.includes('growth')) {
      return { option: 'GROWTH', dividendType: 'NONE' };
    }
    if (code.endsWith('-DP') || name.includes('payout') || name.includes('idcw payout')) {
      return { option: 'IDCW', dividendType: 'PAYOUT' };
    }
    if (code.endsWith('-DR') || name.includes('reinvest')) {
      return { option: 'IDCW', dividendType: 'REINVESTMENT' };
    }
    if (name.includes('bonus')) {
      return { option: 'BONUS', dividendType: 'NONE' };
    }
    return { option: 'GROWTH', dividendType: 'NONE' };
  }

  /**
   * Parse Scheme Category from Scheme Type & Name
   */
  parseCategory(schemeType = '', schemeName = '') {
    const s = (schemeType + ' ' + schemeName).toLowerCase();
    if (s.includes('elss') || s.includes('tax saver')) return 'Tax Saver (ELSS)';
    if (s.includes('gold') || s.includes('silver') || s.includes('commodity')) return 'Gold & Commodity';
    if (s.includes('liquid') || s.includes('overnight') || s.includes('money market')) return 'Liquid & Overnight';
    if (s.includes('hybrid') || s.includes('balanced') || s.includes('dynamic asset') || s.includes('arbitrage')) return 'Hybrid';
    if (s.includes('index') || s.includes('etf') || s.includes('nifty') || s.includes('sensex')) return 'Index';
    if (s.includes('debt') || s.includes('gilt') || s.includes('bond') || s.includes('banking and psu') || s.includes('income')) return 'Debt';
    return 'Equity';
  }

  /**
   * Parse Sub-category for Equity Funds
   */
  parseSubCategory(category, schemeName = '') {
    const name = schemeName.toLowerCase();
    if (category === 'Equity') {
      if (name.includes('small cap')) return 'Small Cap';
      if (name.includes('mid cap') || name.includes('midcap')) return 'Mid Cap';
      if (name.includes('large & mid') || name.includes('large and mid')) return 'Large & Mid Cap';
      if (name.includes('large cap') || name.includes('bluechip') || name.includes('top 100')) return 'Large Cap';
      if (name.includes('flexi cap') || name.includes('flexicap')) return 'Flexi Cap';
      if (name.includes('multi cap') || name.includes('multicap')) return 'Multi Cap';
      if (name.includes('focused')) return 'Focused Fund';
      if (name.includes('value') || name.includes('contra')) return 'Value / Contra';
      return 'Equity Fund';
    }
    return category;
  }

  /**
   * 1. Ingest & Parse NSE Master Scheme Raw Pipe-separated text
   * Format per NSE Spec (Web file Structure page 77):
   * 0: Unique No | 1: Scheme Code | 2: RTA Scheme Code | 3: AMC Scheme Code | 4: ISIN |
   * 5: AMC Code | 6: Scheme Type | 7: Scheme Plan ('D' for Direct) | 8: Scheme Name |
   * 9: Purchase Allowed | ... | 25: RTA Agent Code | 26: AMC Active Flag | 27: Dividend Reinvest Flag | 28: SIP Flag
   */
  parseNseSchemeMasterText(fileContent) {
    const lines = fileContent.split(/\r?\n/);
    const regularSchemes = [];
    const directSchemesExcluded = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('UNIQUE NO')) continue;

      const cols = line.split('|').map((c) => c.trim());
      if (cols.length < 9) continue;

      const uniqueNo = cols[0];
      const schemeCode = cols[1]; // NSE Scheme Code
      const rtaSchemeCode = cols[2];
      const amcSchemeCode = cols[3];
      const isin = cols[4];
      const amcCode = cols[5];
      const schemeType = cols[6];
      const planCode = cols[7]; // 'D' for Direct, else Regular
      const schemeName = cols[8];
      const purchaseAllowed = cols[9] === 'Y';
      const rtaAgentCode = cols[25] || '';
      const amcActive = cols[26] === '1' || cols[26] === 'Y';
      const divReinvestFlag = cols[27];
      const sipAllowed = cols[28] === '1' || cols[28] === 'Y';

      const planType = this.parsePlanType(planCode, schemeName);

      // RULE 3: Exclude ALL Direct Plans at the backend/database level
      if (planType === 'DIRECT') {
        directSchemesExcluded.push({
          schemeCode,
          isin,
          schemeName,
          reason: 'Direct Plan excluded per MFD regulatory compliance',
        });
        continue;
      }

      // RULE 4: Parse Option strictly
      const { option, dividendType } = this.parseOption(divReinvestFlag, schemeCode, schemeName);
      const category = this.parseCategory(schemeType, schemeName);
      const subCategory = this.parseSubCategory(category, schemeName);

      // Unique composite key: ISIN + Scheme Code + Plan + Option
      const compositeKey = `${isin || ''}_${schemeCode}_${planType}_${option}`;

      regularSchemes.push({
        compositeKey,
        uniqueNo,
        schemeCode, // NSE Scheme Code
        nseSchemeCode: schemeCode,
        rtaSchemeCode,
        amcSchemeCode,
        isin,
        amcCode,
        amcName: amcCode.replace(/_/g, ' ').replace(' MF', ' Mutual Fund'),
        schemeName,
        planType: 'REGULAR',
        option,
        dividendType,
        category,
        subCategory,
        purchaseAllowed,
        sipAllowed,
        isActive: amcActive,
        rtaAgentCode,
      });
    }

    return {
      totalParsed: lines.length,
      regularCount: regularSchemes.length,
      directExcludedCount: directSchemesExcluded.length,
      regularSchemes,
      directSchemesExcluded,
    };
  }

  /**
   * 2. Ingest & Parse NSE NAV Master Text
   * Format per NSE Spec (Web file Structure page 83):
   * 0: NAV Date (YYYY-MM-DD) | 1: Scheme Code | 2: Scheme Name | 3: RTA Scheme Code |
   * 4: Div. Reinvest Flag (Y/N/Z) | 5: ISIN | 6: NAV Value | 7: RTA Code
   */
  parseNseNavMasterText(fileContent) {
    const lines = fileContent.split(/\r?\n/);
    const navMapByIsin = new Map();
    const navMapBySchemeCode = new Map();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const cols = line.split('|').map((c) => c.trim());
      if (cols.length < 7) continue;

      const navDate = cols[0];
      const schemeCode = cols[1];
      const schemeName = cols[2];
      const rtaSchemeCode = cols[3];
      const divReinvestFlag = cols[4];
      const isin = cols[5];
      const navVal = parseFloat(cols[6]);
      const rtaCode = cols[7] || '';

      if (isNaN(navVal) || navVal <= 0) continue;

      const navRecord = {
        navDate,
        schemeCode,
        schemeName,
        rtaSchemeCode,
        divReinvestFlag,
        isin,
        nav: navVal,
        rtaCode,
      };

      if (isin && isin.length > 5) {
        navMapByIsin.set(isin, navRecord);
      }
      if (schemeCode) {
        navMapBySchemeCode.set(schemeCode, navRecord);
      }
    }

    return {
      totalNavRecords: lines.length,
      navMapByIsin,
      navMapBySchemeCode,
    };
  }

  /**
   * 3. Fetch Official AMFI Daily Master Feed (RTA/AMFI benchmark source)
   * Official URL: https://portal.amfiindia.com/spages/NAVAll.txt
   */
  async fetchOfficialAmfiFeed() {
    try {
      const res = await axios.get('https://portal.amfiindia.com/spages/NAVAll.txt', {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      const lines = res.data.split(/\r?\n/);
      const amfiByIsin = new Map();
      const amfiByCode = new Map();

      for (const line of lines) {
        if (!line.includes(';')) continue;
        const parts = line.split(';').map((p) => p.trim());
        if (parts.length < 5) continue;

        const amfiCode = parts[0];
        const isinGrowth = parts[1];
        const isinDiv = parts[2];
        const schemeName = parts[3];
        const navStr = parts[parts.length - 2];
        const dateStr = parts[parts.length - 1]; // e.g. 29-Sep-2026
        const nav = parseFloat(navStr);

        if (!isNaN(nav) && nav > 0) {
          const amfiRecord = {
            amfiCode,
            isinGrowth: isinGrowth !== '-' ? isinGrowth : null,
            isinDiv: isinDiv !== '-' ? isinDiv : null,
            schemeName,
            nav,
            dateStr,
            isDirect: schemeName.toLowerCase().includes('direct'),
            isGrowth: schemeName.toLowerCase().includes('growth'),
          };

          if (isinGrowth && isinGrowth !== '-') amfiByIsin.set(isinGrowth, amfiRecord);
          if (isinDiv && isinDiv !== '-') amfiByIsin.set(isinDiv, amfiRecord);
          if (amfiCode) amfiByCode.set(amfiCode, amfiRecord);
        }
      }

      return { amfiByIsin, amfiByCode };
    } catch (e) {
      console.error('[NseMasterService] Failed to fetch AMFI feed:', e.message);
      return { amfiByIsin: new Map(), amfiByCode: new Map() };
    }
  }

  /**
   * 4. Complete Reconciliation & Alignment
   * Compares NSE Master, AMFI/RTA Feed, and VikaOne Database
   */
  async reconcileAllSchemes({ dryRun = false } = {}) {
    console.log('🔄 [Reconciliation] Starting full Mutual Fund Master & NAV reconciliation...');
    const startTime = Date.now();
    this.auditFlags = [];

    // Step A: Fetch AMFI / RTA Master
    const { amfiByIsin, amfiByCode } = await this.fetchOfficialAmfiFeed();
    console.log(`[Reconciliation] Loaded ${amfiByIsin.size} ISIN records from AMFI feed.`);

    // Step B: Query all existing schemes in DB
    const dbSchemes = await MutualFundScheme.find().lean();
    console.log(`[Reconciliation] Found ${dbSchemes.length} schemes in Vikaone Database.`);

    const report = {
      totalDbSchemes: dbSchemes.length,
      directPlansRemoved: 0,
      navDiscrepanciesFlagged: 0,
      matchedAccurately: 0,
      amfiCodeMapped: 0,
      flags: [],
    };

    const bulkOps = [];

    for (const scheme of dbSchemes) {
      const schemeId = scheme._id;
      const isin = scheme.isin;
      const schemeName = scheme.schemeName || '';
      const schemeCode = scheme.schemeCode;
      const dbNav = scheme.nav;

      // Check 1: Direct Plan Check (Rule 3: VikaOne shows Regular Plans only)
      if (scheme.planType === 'DIRECT' || schemeName.toLowerCase().includes('direct')) {
        report.directPlansRemoved++;
        const flag = {
          type: 'DIRECT_PLAN_DETECTED',
          schemeCode,
          isin,
          schemeName,
          action: dryRun ? 'FLAGGED_FOR_DELETION' : 'DELETED',
        };
        report.flags.push(flag);
        this.auditFlags.push(flag);

        if (!dryRun) {
          bulkOps.push({
            deleteOne: { filter: { _id: schemeId } },
          });
        }
        continue;
      }

      // Check 2: Match against AMFI / RTA feed using ISIN
      let amfiMatch = null;
      if (isin && amfiByIsin.has(isin)) {
        amfiMatch = amfiByIsin.get(isin);
      } else if (scheme.amfiCode && amfiByCode.has(scheme.amfiCode)) {
        amfiMatch = amfiByCode.get(scheme.amfiCode);
      } else if (amfiByCode.has(schemeCode)) {
        amfiMatch = amfiByCode.get(schemeCode);
      }

      if (!amfiMatch) {
        const flag = {
          type: 'RTA_AMFI_UNMATCHED',
          schemeCode,
          isin,
          schemeName,
          detail: 'No corresponding active ISIN found in AMFI master feed',
        };
        report.flags.push(flag);
        this.auditFlags.push(flag);
        continue;
      }

      // Check 3: Cross-check Plan & Option between DB and AMFI / RTA
      if (amfiMatch.isDirect) {
        const flag = {
          type: 'DIRECT_AMFI_MISMATCH',
          schemeCode,
          isin,
          schemeName,
          amfiName: amfiMatch.schemeName,
          detail: 'ISIN maps to a DIRECT plan in AMFI! Flagged to protect Regular plan integrity.',
        };
        report.flags.push(flag);
        this.auditFlags.push(flag);
        continue;
      }

      // Check 4: NAV Difference Comparison
      const rtaNav = amfiMatch.nav;
      const navDiff = Math.abs(dbNav - rtaNav);

      if (navDiff > 0.05) {
        report.navDiscrepanciesFlagged++;
        const flag = {
          type: 'NAV_DISCREPANCY',
          schemeCode,
          isin,
          schemeName,
          dbNav,
          rtaNav,
          difference: +navDiff.toFixed(4),
          navDate: amfiMatch.dateStr,
        };
        report.flags.push(flag);
        this.auditFlags.push(flag);

        if (!dryRun) {
          bulkOps.push({
            updateOne: {
              filter: { _id: schemeId },
              update: {
                $set: {
                  nav: rtaNav,
                  amfiCode: amfiMatch.amfiCode,
                  planType: 'REGULAR',
                  option: amfiMatch.isGrowth ? 'GROWTH' : 'IDCW',
                  navDate: amfiMatch.dateStr ? new Date(amfiMatch.dateStr.split('-').reverse().join('-')) : new Date(),
                },
              },
            },
          });
        }
      } else {
        report.matchedAccurately++;
        if (!dryRun && !scheme.amfiCode) {
          bulkOps.push({
            updateOne: {
              filter: { _id: schemeId },
              update: {
                $set: {
                  amfiCode: amfiMatch.amfiCode,
                  planType: 'REGULAR',
                  option: amfiMatch.isGrowth ? 'GROWTH' : 'IDCW',
                },
              },
            },
          });
          report.amfiCodeMapped++;
        }
      }
    }

    // Execute bulk operations if not dryRun
    if (!dryRun && bulkOps.length > 0) {
      console.log(`[Reconciliation] Executing ${bulkOps.length} bulk operations...`);
      await MutualFundScheme.bulkWrite(bulkOps, { ordered: false });
    }

    this.lastReconciledAt = new Date().toISOString();
    report.durationMs = Date.now() - startTime;
    report.lastReconciledAt = this.lastReconciledAt;

    console.log(`✅ [Reconciliation Complete]: Matched: ${report.matchedAccurately}, Nav Updated: ${report.navDiscrepanciesFlagged}, Direct Removed: ${report.directPlansRemoved}, Flags: ${report.flags.length}`);
    return report;
  }

  getAuditReport() {
    return {
      lastReconciledAt: this.lastReconciledAt,
      totalFlags: this.auditFlags.length,
      flags: this.auditFlags,
    };
  }
}

module.exports = new NseMasterReconciliationService();
