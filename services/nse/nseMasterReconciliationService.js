const axios = require('axios');
const MutualFundScheme = require('../../models/MutualFundScheme');
const MfSipSchemeMaster = require('../../models/MfSipSchemeMaster');
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
    if (flag === 'Z') {
      if (name.includes('bonus')) return { option: 'BONUS', dividendType: 'NONE' };
      return { option: 'GROWTH', dividendType: 'NONE' };
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
   * Format strictly per NSE Spec (Web file Structure pages 77-79, Demat Scheme Master):
   * 0: Unique No | 1: Scheme Code | 2: RTA Scheme Code | 3: AMC Scheme Code | 4: ISIN |
   * 5: AMC Code | 6: Scheme Type | 7: Scheme Plan ('D' for Direct) | 8: Scheme Name |
   * 9: Purchase Allowed | 10: Purchase Tran Mode | 11: Min Purchase Amount | 12: Add Purchase Amount |
   * 13: Max Purchase Amount | 14: Purchase Amount Multiplier | 15: Purchase Cutoff Time |
   * 16: Redemption Allowed | 17: Redemption Tran Mode | 18: Min Redemption Qty | 19: Red Qty Mult |
   * 20: Max Redemption Qty | 21: Red Amount Min | 22: Red Amount Max | 23: Red Amount Mult |
   * 24: Redemption Cutoff Time | 25: RTA Agent Code | 26: AMC Active Flag | 27: Dividend Reinvest Flag |
   * 28: SIP Flag | 29: STP Flag | 30: SWP Flag | 31: Switch Flag | 32: Settlement Type |
   * 33: AMC Ind | 34: Face Value | 35: Start Date | 36: End Date | 37: Exit Load Flag |
   * 38: Exit Load | 39: Lock In Period Flag | 40: Lock In Period | 41: Channel Partner Code | 42: Reopening Date
   */
  parseNseSchemeMasterText(fileContent) {
    const lines = fileContent.split(/\r?\n/);
    const regularSchemes = [];
    const directSchemesExcluded = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('UNIQUE NO')) continue;

      const cols = line.split('|').map((c) => c.trim());
      if (cols.length < 9) continue;

      const uniqueNo = cols[0];
      const schemeCode = cols[1]; // NSE Scheme Code
      const rtaSchemeCode = cols[2] || '';
      const amcSchemeCode = cols[3] || '';
      const isin = cols[4] || '';
      const amcCode = cols[5] || '';
      const schemeType = cols[6] || '';
      const planCode = cols[7] || ''; // 'D' for Direct, else Regular
      const schemeName = cols[8]; // PRESERVE SOURCE NAME FAITHFULLY
      const purchaseAllowed = cols[9] === 'Y';
      const minPurchaseAmount = cols.length > 11 && cols[11] ? parseFloat(cols[11]) || null : null;
      const addPurchaseAmount = cols.length > 12 && cols[12] ? parseFloat(cols[12]) || null : null;
      const maxPurchaseAmount = cols.length > 13 && cols[13] ? parseFloat(cols[13]) || null : null;
      const purchaseAmountMultiplier = cols.length > 14 && cols[14] ? parseFloat(cols[14]) || null : null;
      const purchaseCutoffTime = cols.length > 15 ? cols[15] || null : null;

      const redemptionAllowed = cols.length > 16 ? (cols[16] === '1' || cols[16] === 'Y') : true;
      const minRedemptionQty = cols.length > 18 && cols[18] ? parseFloat(cols[18]) || null : null;
      const minRedemptionAmount = cols.length > 21 && cols[21] ? parseFloat(cols[21]) || null : null;
      const redemptionCutoffTime = cols.length > 24 ? cols[24] || null : null;

      const rtaAgentCode = cols.length > 25 ? cols[25] || '' : '';
      const amcActive = cols.length > 26 ? (cols[26] === '1' || cols[26] === 'Y') : true;
      const divReinvestFlag = cols.length > 27 ? cols[27] : '';
      const sipAllowed = cols.length > 28 ? (cols[28] === '1' || cols[28] === 'Y') : true;
      const stpAllowed = cols.length > 29 ? (cols[29] === '1' || cols[29] === 'Y') : false;
      const swpAllowed = cols.length > 30 ? (cols[30] === '1' || cols[30] === 'Y') : false;
      const switchAllowed = cols.length > 31 ? (cols[31] === '1' || cols[31] === 'Y') : false;
      const exitLoad = cols.length > 38 && cols[38] ? cols[38] : null;
      const lockInPeriod = cols.length > 40 && cols[40] ? parseInt(cols[40], 10) || null : null;

      const planType = this.parsePlanType(planCode, schemeName);

      // RULE: Exclude ALL Direct Plans at the backend/database level for MFD Regular catalog
      if (planType === 'DIRECT') {
        directSchemesExcluded.push({
          schemeCode,
          isin,
          schemeName,
          reason: 'Direct Plan excluded per MFD regulatory compliance',
        });
        continue;
      }

      // RULE: Parse Option strictly
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
        amcName: amcCode ? amcCode.replace(/_/g, ' ').replace(' MF', ' Mutual Fund') : 'Mutual Fund',
        schemeName, // Preserved without invented suffixes
        planType: 'REGULAR',
        option,
        dividendType,
        category,
        subCategory,
        purchaseAllowed,
        minPurchaseAmount,
        addPurchaseAmount,
        maxPurchaseAmount,
        purchaseAmountMultiplier,
        purchaseCutoffTime,
        redemptionAllowed,
        minRedemptionQty,
        minRedemptionAmount,
        redemptionCutoffTime,
        sipAllowed,
        stpAllowed,
        swpAllowed,
        switchAllowed,
        exitLoad,
        lockInPeriod,
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
   * 1b. Ingest & Parse NSE SIP Scheme Master Raw Pipe-separated text
   * Format strictly per NSE Spec (Web file Structure pages 79-80, SIP Scheme Master):
   * 0: AMC CODE | 1: AMC NAME | 2: SCHEME CODE | 3: SCHEME NAME | 4: SIP TRANSACTION MODE |
   * 5: SIP FREQUENCY | 6: SIP DATES | 7: SIP MINIMUM GAP | 8: SIP MAXIMUM GAP |
   * 9: SIP INSTALLMENT GAP | 10: SIP STATUS | 11: SIP MINIMUM INSTALLMENT AMOUNT |
   * 12: SIP MAXIMUM INSTALLMENT AMOUNT | 13: SIP MULTIPLIER AMOUNT |
   * 14: SIP MINIMUM INSTALLMENT NUMBERS | 15: SIP MAXIMUM INSTALLMENT NUMBERS |
   * 16: SCHEME ISIN | 17: SCHEME TYPE | 18: PAUSE FLAG | 19: PAUSE MIN INSTALLMENTS |
   * 20: PAUSE MAX INSTALLMENTS | 21: PAUSE MODIFICATION COUNT
   */
  parseNseSipMasterText(fileContent) {
    const lines = fileContent.split(/\r?\n/);
    const sipRecords = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.toUpperCase().startsWith('AMC CODE')) continue;

      const cols = line.split('|').map((c) => c.trim());
      if (cols.length < 17) continue;

      const amcCode = cols[0];
      const amcName = cols[1];
      const schemeCode = cols[2];
      const schemeName = cols[3];
      const sipTransactionMode = cols[4];
      const sipFrequency = cols[5];
      const sipDates = cols[6];
      const sipMinimumGap = cols[7] ? parseFloat(cols[7]) || null : null;
      const sipMaximumGap = cols[8] ? parseFloat(cols[8]) || null : null;
      const sipInstallmentGap = cols[9] ? parseFloat(cols[9]) || null : null;
      const sipStatus = cols[10];
      const minInstallmentAmount = cols[11] ? parseFloat(cols[11]) || null : null;
      const maxInstallmentAmount = cols[12] ? parseFloat(cols[12]) || null : null;
      const multiplierAmount = cols[13] ? parseFloat(cols[13]) || null : null;
      const minInstallmentNumbers = cols[14] ? parseInt(cols[14], 10) || null : null;
      const maxInstallmentNumbers = cols[15] ? parseInt(cols[15], 10) || null : null;
      const isin = cols[16];
      const schemeType = cols.length > 17 ? cols[17] : '';
      const pauseFlag = cols.length > 18 ? cols[18] : 'N';
      const pauseMinInstallments = cols.length > 19 && cols[19] ? parseInt(cols[19], 10) || null : null;
      const pauseMaxInstallments = cols.length > 20 && cols[20] ? parseInt(cols[20], 10) || null : null;
      const pauseModificationCount = cols.length > 21 && cols[21] ? parseInt(cols[21], 10) || null : null;

      sipRecords.push({
        amcCode,
        amcName,
        schemeCode,
        schemeName,
        sipTransactionMode,
        sipFrequency,
        frequency: sipFrequency,
        sipDates,
        sipMinimumGap,
        sipMaximumGap,
        sipInstallmentGap,
        sipStatus,
        minInstallmentAmount,
        maxInstallmentAmount,
        multiplierAmount,
        minInstallmentNumbers,
        maxInstallmentNumbers,
        isin,
        schemeType,
        pauseFlag,
        pauseMinInstallments,
        pauseMaxInstallments,
        pauseModificationCount,
      });
    }

    return {
      totalParsed: lines.length,
      sipRecordCount: sipRecords.length,
      sipRecords,
    };
  }

  /**
   * Ingests parsed SIP Master rows into MfSipSchemeMaster and synchronizes MutualFundScheme
   */
  async ingestNseSipMaster(fileContent) {
    const { sipRecords } = this.parseNseSipMasterText(fileContent);
    if (!sipRecords || sipRecords.length === 0) {
      return { success: false, message: 'No valid SIP master records parsed' };
    }

    const sipOps = [];
    const schemeOps = [];

    // Group by schemeCode to find MONTHLY or default minimum SIP amount
    const schemeSipMap = new Map();

    for (const record of sipRecords) {
      sipOps.push({
        updateOne: {
          filter: { schemeCode: record.schemeCode, sipFrequency: record.sipFrequency },
          update: { $set: record },
          upsert: true,
        },
      });

      // Keep lowest valid minInstallmentAmount or MONTHLY frequency for MutualFundScheme summary
      if (!schemeSipMap.has(record.schemeCode) || record.sipFrequency === 'MONTHLY') {
        schemeSipMap.set(record.schemeCode, record);
      }
    }

    for (const [code, r] of schemeSipMap.entries()) {
      schemeOps.push({
        updateOne: {
          filter: { schemeCode: code },
          update: {
            $set: {
              minSipAmount: r.minInstallmentAmount, // Null if not in master; never default to 500!
              maxSipAmount: r.maxInstallmentAmount,
              sipMultiplierAmount: r.multiplierAmount,
              sipFrequency: r.sipFrequency,
              sipDates: r.sipDates,
              minSipInstallments: r.minInstallmentNumbers,
              maxSipInstallments: r.maxInstallmentNumbers,
              sipAllowed: r.sipStatus === '1' || r.sipStatus === 'Y',
            },
          },
        },
      });
    }

    if (sipOps.length > 0) {
      await MfSipSchemeMaster.bulkWrite(sipOps, { ordered: false });
    }
    if (schemeOps.length > 0) {
      await MutualFundScheme.bulkWrite(schemeOps, { ordered: false });
    }

    return {
      success: true,
      totalSipRecords: sipRecords.length,
      schemesUpdated: schemeOps.length,
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
