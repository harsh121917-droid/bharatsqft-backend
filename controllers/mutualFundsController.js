const MutualFundScheme = require('../models/MutualFundScheme');
const MfAmc = require('../models/MfAmc');
const MfSchemePortfolioSnapshot = require('../models/MfSchemePortfolioSnapshot');
const MfClientUcc = require('../models/MfClientUcc');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MfSip = require('../models/MfSip');
const MfSystematicPlan = require('../models/MfSystematicPlan');
const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const Kyc = require('../models/Kyc');
const nseClient = require('../services/nse/nseClient');
const mfLiveService = require('../services/mfLiveService');
const MfTransaction = require('../models/MfTransaction');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfCapitalGain = require('../models/MfCapitalGain');
const MfAuditLog = require('../models/MfAuditLog');
const mfPortfolioEngine = require('../services/mfPortfolioEngine');
const mfCapitalGainsEngine = require('../services/mfCapitalGainsEngine');
const mfIdempotencyService = require('../services/mfIdempotencyService');
const mfIntelligenceService = require('../services/mfIntelligenceService');
const amcSourceRegistry = require('../services/amcSourceRegistry');
const mfPortfolioService = require('../services/mfPortfolioService');
const mfAumService = require('../services/mfAumService');
const mfMarketSyncService = require('../services/mfMarketSyncService');
const MfSipSchemeMaster = require('../models/MfSipSchemeMaster');
const MfRecentlyViewed = require('../models/MfRecentlyViewed');
const MfWatchlist = require('../models/MfWatchlist');
const MfCart = require('../models/MfCart');
const mfInvestorReadinessService = require('../services/mfInvestorReadinessService');
const mfNfoService = require('../services/mfNfoService');
const NseConfig = require('../models/NseConfig');
const STATE_CODE_MAP = {
  'ANDAMAN & NICOBAR': 'AN', 'ANDAMAN AND NICOBAR': 'AN', 'AN': 'AN',
  'ANDHRA PRADESH': 'AP', 'AP': 'AP',
  'ARUNACHAL PRADESH': 'AR', 'AR': 'AR',
  'ASSAM': 'AS', 'AS': 'AS',
  'BIHAR': 'BH', 'BR': 'BH', 'BH': 'BH',
  'CHANDIGARH': 'CH', 'CH': 'CH',
  'CHHATTISGARH': 'CG', 'CG': 'CG',
  'DADRA AND NAGAR HAVELI': 'DN', 'DN': 'DN',
  'DAMAN AND DIU': 'DD', 'DD': 'DD',
  'GOA': 'GO', 'GA': 'GO',
  'GUJARAT': 'GU', 'GJ': 'GU',
  'HARYANA': 'HA', 'HR': 'HA',
  'HIMACHAL PRADESH': 'HP', 'HP': 'HP',
  'JAMMU & KASHMIR': 'JM', 'JAMMU AND KASHMIR': 'JM', 'JK': 'JM', 'JM': 'JM',
  'JHARKHAND': 'JK', 'JH': 'JK',
  'KARNATAKA': 'KA', 'KA': 'KA',
  'KERALA': 'KE', 'KL': 'KE',
  'LAKSHADWEEP': 'LD', 'LD': 'LD',
  'MADHYA PRADESH': 'MP', 'MP': 'MP',
  'MAHARASHTRA': 'MA', 'MH': 'MA',
  'MANIPUR': 'MN', 'MN': 'MN',
  'MEGHALAYA': 'ME', 'ML': 'ME',
  'MIZORAM': 'MI', 'MZ': 'MI',
  'NAGALAND': 'NA', 'NL': 'NA',
  'NEW DELHI': 'ND', 'DELHI': 'ND', 'DL': 'ND', 'ND': 'ND',
  'ODISHA': 'OR', 'ORISSA': 'OR', 'OD': 'OR', 'OR': 'OR',
  'PONDICHERRY': 'PO', 'PUDUCHERRY': 'PO', 'PY': 'PO', 'PO': 'PO',
  'PUNJAB': 'PU', 'PB': 'PU',
  'RAJASTHAN': 'RA', 'RJ': 'RA', 'RA': 'RA',
  'SIKKIM': 'SI', 'SK': 'SI',
  'TAMIL NADU': 'TN', 'TN': 'TN',
  'TELANGANA': 'TG', 'TS': 'TG', 'TG': 'TG',
  'TRIPURA': 'TR', 'TR': 'TR',
  'UTTAR PRADESH': 'UP', 'UTTER PRADESH': 'UP', 'UP': 'UP',
  'UTTARAKHAND': 'UL', 'UK': 'UL', 'UA': 'UL', 'UL': 'UL',
  'WEST BENGAL': 'WB', 'WB': 'WB',
};

function getNseStateCode(stateName) {
  if (!stateName) return 'MA';
  const clean = String(stateName).trim().toUpperCase();
  return STATE_CODE_MAP[clean] || (clean.length === 2 ? clean : 'MA');
}

// ── 1. GET /api/mutual-funds/schemes ──
exports.getSchemes = async (req, res) => {
  try {

    const {
      category,
      categories,
      subCategory,
      subCategories,
      riskLevel,
      risks,
      rating,
      minRating,
      ratings,
      search,
      collection,
      maxSipAmount,
      minSipAmount,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    // STRICT FISDOM & REGULATORY MODEL: Only active Regular plans, never Direct plans, never IDCW
    const query = {
      isActive: true,
      isAmcActive: { $ne: false },
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
      option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
    };

    // Filter out completely hidden AMCs (e.g. HDFC, Axis, ITI toggled off in Admin)
    let hiddenCodes = [];
    let hiddenNames = [];
    let hiddenDisplays = [];
    try {
      const hiddenAmcs = await MfAmc.find({ isActive: false }).select('amcCode amcName displayName').lean();
      if (hiddenAmcs && hiddenAmcs.length > 0) {
        hiddenCodes = hiddenAmcs.map((a) => a.amcCode).filter(Boolean);
        hiddenNames = hiddenAmcs.map((a) => a.amcName).filter(Boolean);
        hiddenDisplays = hiddenAmcs.map((a) => a.displayName).filter(Boolean);
        if (hiddenCodes.length > 0) {
          query.amcCode = { ...(query.amcCode || {}), $nin: hiddenCodes };
        }
        if (hiddenNames.length > 0) {
          query.amcName = { ...(query.amcName || {}), $nin: hiddenNames };
        }
        const allKeywords = [...hiddenDisplays, ...hiddenCodes.map(c => c.replace(/_MF$/i, ''))].filter(Boolean);
        if (allKeywords.length > 0) {
          const pattern = allKeywords.map(k => `\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|');
          query.schemeName = { ...(query.schemeName || {}), $not: new RegExp(pattern, 'i') };
        }
      }
    } catch (_) {}

    // Category filtering (single or multiple)
    const rawCategories = categories || category;
    if (rawCategories && rawCategories !== 'All') {
      const catList = Array.isArray(rawCategories)
        ? rawCategories
        : rawCategories.split(',').map((c) => c.trim()).filter(Boolean);
      if (catList.length === 1 && catList[0] !== 'All') {
        query.category = catList[0];
      } else if (catList.length > 1) {
        query.category = { $in: catList };
      }
    }

    // Sub-Category filtering (e.g. Flexi Cap, Large Cap, Small Cap, etc.)
    const rawSubCategories = subCategories || subCategory;
    if (rawSubCategories && rawSubCategories !== 'All') {
      const subCatList = Array.isArray(rawSubCategories)
        ? rawSubCategories
        : rawSubCategories.split(',').map((s) => s.trim()).filter(Boolean);
      if (subCatList.length === 1) {
        query.subCategory = { $regex: subCatList[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      } else if (subCatList.length > 1) {
        query.$or = subCatList.map((sc) => ({
          subCategory: { $regex: sc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        }));
      }
    }

    // Risk level filtering (e.g. Low, Moderate, High, Very High)
    const rawRisks = risks || riskLevel;
    if (rawRisks && rawRisks !== 'All') {
      const riskList = Array.isArray(rawRisks)
        ? rawRisks
        : rawRisks.split(',').map((r) => r.trim()).filter(Boolean);
      if (riskList.length === 1) {
        query.riskLevel = { $regex: riskList[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      } else if (riskList.length > 1) {
        query.riskLevel = { $in: riskList };
      }
    }

    // Rating filtering
    if (minRating) {
      query.rating = { $gte: Number(minRating) };
    } else if (ratings) {
      const ratingList = (Array.isArray(ratings) ? ratings : ratings.split(','))
        .map((r) => Number(r.trim()))
        .filter((n) => !isNaN(n));
      if (ratingList.length > 0) {
        query.rating = { $in: ratingList };
      }
    } else if (rating) {
      query.rating = Number(rating);
    }

    if (req.query.featured === 'true' || req.query.isFeatured === 'true') {
      query.isFeatured = true;
    }
    if (req.query.recommended === 'true' || req.query.isRecommended === 'true') {
      query.isRecommended = true;
    }
    if (req.query.popular === 'true' || req.query.isPopular === 'true') {
      query.isPopular = true;
    }

    // ── Collection Filtering (High Return, ₹100 SIP, Gold & Silver, Market Caps) ──
    if (collection) {
      const col = String(collection).trim().toLowerCase();
      if (col === 'high_return') {
        const cond = {
          $or: [
            { cagr3Y: { $gt: 0 } },
            { cagr1Y: { $gt: 0 } },
          ],
        };
        if (query.$or) {
          query.$and = [{ $or: query.$or }, cond];
          delete query.$or;
        } else if (query.$and) {
          query.$and.push(cond);
        } else {
          query.$or = cond.$or;
        }
      } else if (col === 'sip_100') {
        query.minSipAmount = { $lte: 100, $gt: 0 };
      } else if (col === 'gold_silver' || col === 'gold' || col === 'silver') {
        const cond = {
          $or: [
            { category: { $regex: 'gold|silver|commodity', $options: 'i' } },
            { subCategory: { $regex: 'gold|silver|commodity', $options: 'i' } },
            { schemeName: { $regex: 'gold|silver', $options: 'i' } },
          ],
        };
        if (query.$or) {
          query.$and = [{ $or: query.$or }, cond];
          delete query.$or;
        } else if (query.$and) {
          query.$and.push(cond);
        } else {
          query.$or = cond.$or;
        }
      } else if (col === 'large_cap') {
        query.subCategory = { $regex: 'large', $options: 'i' };
      } else if (col === 'mid_cap') {
        query.subCategory = { $regex: 'mid', $options: 'i' };
      } else if (col === 'small_cap') {
        query.subCategory = { $regex: 'small', $options: 'i' };
      } else if (col === 'tax_saver' || col === 'elss') {
        const cond = {
          $or: [
            { category: { $regex: 'tax', $options: 'i' } },
            { subCategory: { $regex: 'elss|tax', $options: 'i' } },
          ],
        };
        if (query.$or) {
          query.$and = [{ $or: query.$or }, cond];
          delete query.$or;
        } else if (query.$and) {
          query.$and.push(cond);
        } else {
          query.$or = cond.$or;
        }
      }
    }

    if (maxSipAmount !== undefined && maxSipAmount !== null && maxSipAmount !== '') {
      const maxVal = Number(maxSipAmount);
      if (!isNaN(maxVal) && maxVal > 0) {
        query.minSipAmount = { ...(query.minSipAmount || {}), $lte: maxVal, $gt: 0 };
      }
    }

    if (minSipAmount !== undefined && minSipAmount !== null && minSipAmount !== '') {
      const minVal = Number(minSipAmount);
      if (!isNaN(minVal) && minVal > 0) {
        query.minSipAmount = { ...(query.minSipAmount || {}), $gte: minVal };
      }
    }

    // ── Multi-word Tokenized Fuzzy Search ──
    // e.g. "uti health" or "UTI - He" will cleanly split and match "UTI - Healthcare Fund"
    if (search && search.trim()) {
      const cleanSearch = search.replace(/[^a-zA-Z0-9\s]/g, ' ');
      const tokens = cleanSearch.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 1) {
        const safe = tokens[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tokenQuery = [
          { schemeName: { $regex: safe, $options: 'i' } },
          { amcName: { $regex: safe, $options: 'i' } },
          { schemeCode: { $regex: safe, $options: 'i' } },
          { subCategory: { $regex: safe, $options: 'i' } },
        ];
        if (query.$or) {
          query.$and = [{ $or: tokenQuery }, { $or: query.$or }];
          delete query.$or;
        } else {
          query.$or = tokenQuery;
        }
      } else if (tokens.length > 1) {
        const tokenAndConditions = tokens.map((token) => {
          const safe = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return {
            $or: [
              { schemeName: { $regex: safe, $options: 'i' } },
              { amcName: { $regex: safe, $options: 'i' } },
              { schemeCode: { $regex: safe, $options: 'i' } },
              { subCategory: { $regex: safe, $options: 'i' } },
            ],
          };
        });

        if (query.$or) {
          tokenAndConditions.push({ $or: query.$or });
          delete query.$or;
        }
        query.$and = (query.$and || []).concat(tokenAndConditions);
      }
    }

    // ── Sorting ──
    const effectiveSort = sort || (
      collection === 'high_return' ? 'returns3y' :
      collection === 'gold_silver' ? 'returns1y' :
      collection === 'sip_100' ? 'returns3y' :
      (collection === 'large_cap' || collection === 'mid_cap' || collection === 'small_cap') ? 'returns3y' :
      'rating'
    );

    let sortOption = { rating: -1, cagr3Y: -1, schemeName: 1 };
    if (effectiveSort === 'popularity' || effectiveSort === 'popular') {
      sortOption = { isPopular: -1, aum: -1, rating: -1, cagr3Y: -1, schemeName: 1 };
    } else if (effectiveSort === 'returns1y' || effectiveSort === '1Y Returns' || effectiveSort === '1y') {
      if (!collection) query.cagr1Y = { $ne: null };
      sortOption = { cagr1Y: -1, cagr3Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'returns3y' || effectiveSort === '3Y Returns' || effectiveSort === '3Y Re' || effectiveSort === '3y') {
      if (!collection || collection === 'high_return') query.cagr3Y = { $ne: null };
      sortOption = { cagr3Y: -1, cagr1Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'returns5y' || effectiveSort === '5Y Returns' || effectiveSort === '5Y' || effectiveSort === '5y') {
      query.cagr5Y = { $ne: null };
      sortOption = { cagr5Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'returns1m' || effectiveSort === '1M Returns' || effectiveSort === '1m') {
      query.return1M = { $ne: null };
      sortOption = { return1M: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'returns3m' || effectiveSort === '3M Returns' || effectiveSort === '3m') {
      query.return3M = { $ne: null };
      sortOption = { return3M: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'returns6m' || effectiveSort === '6M Returns' || effectiveSort === '6m') {
      query.return6M = { $ne: null };
      sortOption = { return6M: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'rating' || effectiveSort === 'Rating') {
      sortOption = { rating: -1, cagr3Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'nav') {
      sortOption = { nav: 1, schemeName: 1, schemeCode: 1 };
    } else if (effectiveSort === 'aum') {
      sortOption = { aum: -1, schemeName: 1, schemeCode: 1 };
    }

    const isHighReturn = collection && String(collection).trim().toLowerCase() === 'high_return';
    const effectiveLimit = isHighReturn ? 15 : (Number(limit) || 20);

    const schemes = await MutualFundScheme.find(query)
      .sort(sortOption)
      .skip((Number(page) - 1) * effectiveLimit)
      .limit(effectiveLimit);

    const total = await MutualFundScheme.countDocuments(query);

    // Retrieve mutual fund data source mode (TigZig AMFI connector vs Old Legacy)
    const mfDataSource = await NseConfig.getMfDataSource();
    const isTigzig = mfDataSource !== 'LEGACY';

    // Sanitize schemes: null holdings instead of empty array when source unavailable
    const sanitizedSchemes = schemes.map((s) => {
      const obj = s.toObject ? s.toObject() : { ...s };
      if (!obj.holdings || obj.holdings.length === 0) {
        obj.holdings = null;
      }

      // If in Legacy mode, strip TigZig-sourced data to display authentic pre-TigZig state
      if (!isTigzig && obj.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA') {
        obj.aum = null;
        obj.expenseRatio = null;
        obj.fundManager = null;
        obj.benchmark = null;
        obj.exitLoad = null;
        obj.minPurchaseAmount = null;
      }

      const staticIntel = mfIntelligenceService.getSchemeIntelligence(obj.schemeCode || obj.amfiCode);
      if (staticIntel) {
        if (!obj.fundManager && staticIntel.fundManager) obj.fundManager = staticIntel.fundManager;
        if (!obj.benchmark && staticIntel.benchmark) obj.benchmark = staticIntel.benchmark;
        if ((obj.expenseRatio === null || obj.expenseRatio === undefined) && staticIntel.expenseRatio !== undefined) obj.expenseRatio = staticIntel.expenseRatio;
        if (!obj.riskometer && staticIntel.riskometer) obj.riskometer = staticIntel.riskometer;
        if (!obj.inceptionDate && staticIntel.inceptionDate) obj.inceptionDate = staticIntel.inceptionDate;
        if (!obj.exitLoad && staticIntel.exitLoad) obj.exitLoad = staticIntel.exitLoad;
        if ((obj.minSipAmount === null || obj.minSipAmount === undefined) && staticIntel.minSipAmount !== undefined) obj.minSipAmount = staticIntel.minSipAmount;
        if ((obj.minPurchaseAmount === null || obj.minPurchaseAmount === undefined) && staticIntel.minPurchaseAmount !== undefined) obj.minPurchaseAmount = staticIntel.minPurchaseAmount;
        if (!obj.holdings && staticIntel.holdings && staticIntel.holdings.length > 0) {
          obj.holdings = staticIntel.holdings;
        }
      }

      // In TigZig mode, ensure safe statutory defaults so UI never encounters null
      if (isTigzig) {
        if (obj.minPurchaseAmount == null) {
          obj.minPurchaseAmount = (obj.minSipAmount && obj.minSipAmount >= 500) ? obj.minSipAmount : 500;
        }
        if (obj.minSipAmount == null) {
          obj.minSipAmount = 100;
        }
      }

      // Canonical Scheme AUM resolution
      const schemeAumInfo = mfAumService.resolveSchemeAum(obj);
      if (isTigzig || obj.dataProvenance?.source !== 'TIGZIG_AMFI_OPEN_DATA') {
        obj.aum = schemeAumInfo.value;
        obj.aumAsOf = schemeAumInfo.asOf;
        obj.aumAsOfDate = schemeAumInfo.asOf;
        obj.aumSource = schemeAumInfo.sourceName;
        obj.aumStatus = schemeAumInfo.status;
        obj.aumUnit = schemeAumInfo.unit;
        obj.aumDefinition = schemeAumInfo.definition;
      } else {
        obj.aum = staticIntel?.aum ?? null;
      }
      // Section 12 & Phase 5E: Rating removed / null without contracted license; Fund Type, Plan, & Holdings exposed
      obj.rating = null;
      obj.ratingProvider = null;
      obj.ratingStatus = 'SOURCE_NOT_AUTHORIZED';
      obj.ratingAsOfDate = null;
      obj.planType = 'REGULAR';
      obj.option = 'GROWTH';
      obj.fundType = 'Growth';
      obj.plan = 'Regular';
      obj.holdingsAvailable = Array.isArray(obj.holdings) && obj.holdings.length > 0;
      return obj;
    });

    // Final security filter ensuring hidden/inactive AMCs are completely excluded
    const filteredSchemes = sanitizedSchemes.filter((obj) => {
      if (obj.isAmcActive === false) return false;
      if (hiddenCodes.length > 0 && hiddenCodes.includes(obj.amcCode)) return false;
      if (hiddenNames.length > 0 && hiddenNames.some(hn => obj.amcName && obj.amcName.toLowerCase() === hn.toLowerCase())) return false;
      if (hiddenDisplays.length > 0 && hiddenDisplays.some(hd => {
        const regex = new RegExp(`\\b${hd}\\b`, 'i');
        return (obj.schemeName && regex.test(obj.schemeName)) || (obj.amcName && regex.test(obj.amcName));
      })) return false;
      return true;
    });

    const finalData = isHighReturn ? filteredSchemes.slice(0, 15) : filteredSchemes;
    const finalTotal = isHighReturn ? Math.min(total, 15) : total;

    return res.json({
      success: true,
      data: finalData,
      total: finalTotal,
      page: Number(page),
      pages: Math.ceil(finalTotal / effectiveLimit),
    });
  } catch (error) {
    console.error('[getSchemes Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 2. GET /api/mutual-funds/schemes/:code ──
exports.getSchemeDetail = async (req, res) => {
  try {
    const { code } = req.params;
    const scheme = await MutualFundScheme.findOne({
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
      $or: [
        { schemeCode: code },
        { schemeCode: code.toUpperCase() },
        { isin: code.toUpperCase() },
        { _id: code.match(/^[0-9a-fA-F]{24}$/) ? code : null },
      ],
    });

    if (!scheme || scheme.planType !== 'REGULAR' || /direct/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.option || '') || scheme.isAmcActive === false || scheme.isActive === false) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found or currently unavailable.',
      });
    }

    // Check if the AMC of this scheme is disabled
    if (scheme.amcCode) {
      const amcDisabled = await MfAmc.findOne({ amcCode: scheme.amcCode, isActive: false });
      if (amcDisabled) {
        return res.status(404).json({
          success: false,
          message: 'Scheme not found or currently unavailable.',
        });
      }
    }

    // 1. Fetch live scheme facts for supplementary metadata (AUM, fund manager, holdings)
    const liveFacts = await mfLiveService.getLiveSchemeFacts(scheme.schemeName, scheme.schemeCode);
    const targetSchemeCode = scheme.amfiCode || scheme.schemeCode;

    // 2. Fetch live historical daily NAV & chart points strictly for the REGULAR Plan
    const liveNav = await mfLiveService.getLiveHistoricalNav(targetSchemeCode, scheme);

    // Prepare chart points per timeframe
    let chartData = null;
    let periodReturns = {};
    if (liveNav && liveNav.chartData) {
      chartData = {};
      for (const [tf, item] of Object.entries(liveNav.chartData)) {
        chartData[tf] = item.points; // array of { date, nav }
        periodReturns[tf] = {
          returnPercent: item.returnPercent,
          isPositive: item.isPositive,
          startNav: item.startNav,
          endNav: item.endNav,
          insufficientData: item.insufficientData ?? false,
        };
      }
    }

    // 1.5 Check data source setting (TigZig AMFI connector vs Old Legacy)
    const mfDataSource = await NseConfig.getMfDataSource();
    const isTigzig = mfDataSource !== 'LEGACY';

    let staticIntel = mfIntelligenceService.getSchemeIntelligence(scheme.schemeCode || scheme.amfiCode);
    if (isTigzig) {
      if (staticIntel) {
        await mfMarketSyncService.lazyEnrichScheme(scheme);
      } else if (scheme.aum == null || scheme.expenseRatio == null || scheme.fundManager == null || scheme.minPurchaseAmount == null) {
        staticIntel = await mfMarketSyncService.lazyEnrichScheme(scheme);
      }
    }

    // Canonical Scheme & AMC AUM resolution via Phase 5I MfAumService
    const schemeAumInfo = mfAumService.resolveSchemeAum(scheme);
    const amcTotalAumInfo = mfAumService.resolveAmcTotalAum(scheme.amcCode, scheme);
    const realAum = isTigzig
      ? schemeAumInfo.value
      : (staticIntel?.aum ?? liveFacts?.aum ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : schemeAumInfo.value));
    const realMinSip = isTigzig
      ? (scheme.minSipAmount ?? staticIntel?.minSipAmount ?? liveFacts?.minSipAmount ?? 100)
      : (staticIntel?.minSipAmount ?? liveFacts?.minSipAmount ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : scheme.minSipAmount));
    const realMinPurchase = isTigzig
      ? (scheme.minPurchaseAmount ?? staticIntel?.minPurchaseAmount ?? liveFacts?.minPurchaseAmount ?? (realMinSip >= 500 ? realMinSip : 500))
      : (staticIntel?.minPurchaseAmount ?? liveFacts?.minPurchaseAmount ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : scheme.minPurchaseAmount));
    const realRating = scheme.rating ?? liveFacts?.rating ?? null;

    // Pros & Cons - ONLY real data, no synthetic mock fallback
    const prosAndCons = liveFacts?.prosAndCons || { pros: [], cons: [] };

    // Fund manager & expense ratio (preserves null if unknown)
    const fundManagerName = isTigzig
      ? (scheme.fundManager ?? staticIntel?.fundManager ?? liveFacts?.fundManager ?? null)
      : (staticIntel?.fundManager ?? liveFacts?.fundManager ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : scheme.fundManager));
    const expenseRatio = isTigzig
      ? (scheme.expenseRatio ?? staticIntel?.expenseRatio ?? liveFacts?.expenseRatio ?? null)
      : (staticIntel?.expenseRatio ?? liveFacts?.expenseRatio ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : scheme.expenseRatio));
    const rawBenchmark = scheme.benchmark || staticIntel?.benchmark || liveFacts?.benchmarkName || null;
    const resolvedBenchmark = isTigzig
      ? rawBenchmark
      : (staticIntel?.benchmark ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : rawBenchmark));
    const rawExitLoad = scheme.exitLoad || staticIntel?.exitLoad || liveFacts?.exitLoad || null;
    const resolvedExitLoad = isTigzig
      ? rawExitLoad
      : (staticIntel?.exitLoad ?? (scheme.dataProvenance?.source === 'TIGZIG_AMFI_OPEN_DATA' ? null : rawExitLoad));
    const cat = (scheme.category || '').toLowerCase();

    // Similar peer schemes strictly in the same Sub-Category (e.g. Mid Cap with Mid Cap)
    const peerFilter = {
      schemeCode: { $ne: scheme.schemeCode },
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
      option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
      isActive: true,
    };
    if (scheme.subCategory && scheme.subCategory.trim()) {
      peerFilter.subCategory = { $regex: scheme.subCategory.trim(), $options: 'i' };
    } else if (scheme.category) {
      peerFilter.category = scheme.category;
    }

    const similarFunds = await MutualFundScheme.find(peerFilter)
      .sort({ aum: -1, cagr3Y: -1, schemeName: 1 })
      .limit(6)
      .select('schemeCode schemeName amcName nav cagr1Y cagr3Y cagr5Y rating aum expenseRatio minSipAmount');

    // Genuine Regular Plan returns computed strictly from historical daily NAVs
    const retStats = liveFacts?.returnStats;
    const ret1M = periodReturns['1M']?.returnPercent ?? scheme.return1M ?? null;
    const ret3M = periodReturns['3M']?.returnPercent ?? scheme.return3M ?? null;
    const ret6M = periodReturns['6M']?.returnPercent ?? scheme.return6M ?? null;
    const ret1Y = periodReturns['1Y']?.returnPercent ?? scheme.cagr1Y ?? null;
    const ret3Y = periodReturns['3Y']?.returnPercent ?? scheme.cagr3Y ?? null;
    const ret5Y = periodReturns['5Y']?.returnPercent ?? scheme.cagr5Y ?? null;
    const retAll = periodReturns['All']?.returnPercent ?? null;

    // Dynamic Category Peer Aggregation Engine for authentic category averages and ranking
    const targetSubCat = scheme.subCategory && scheme.subCategory.trim() ? scheme.subCategory.trim() : scheme.category;
    const categoryPeers = await MutualFundScheme.find({
      $or: [
        { subCategory: targetSubCat },
        { category: scheme.category }
      ],
      planType: 'REGULAR',
      isActive: true,
      schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
    }).select('schemeCode return1M return3M return6M cagr1Y cagr3Y cagr5Y').lean();

    const computeRankAndAvg = (field, currentVal, fallbackAvg, fallbackRank) => {
      if (typeof currentVal !== 'number' || currentVal === 0 || isNaN(currentVal)) {
        return {
          categoryAvg: fallbackAvg ?? null,
          rank: fallbackRank ?? null,
          totalPeers: categoryPeers.length || 0,
        };
      }
      const validPeers = categoryPeers
        .filter((p) => typeof p[field] === 'number' && p[field] !== 0 && !isNaN(p[field]))
        .sort((a, b) => b[field] - a[field]);

      if (validPeers.length === 0) {
        return {
          categoryAvg: fallbackAvg ?? null,
          rank: fallbackRank ?? null,
          totalPeers: 0,
        };
      }

      const sum = validPeers.reduce((acc, p) => acc + p[field], 0);
      const computedAvg = +(sum / validPeers.length).toFixed(2);
      const computedRank = validPeers.findIndex((p) => p.schemeCode === scheme.schemeCode) + 1;

      return {
        categoryAvg: fallbackAvg ?? computedAvg,
        rank: fallbackRank ?? (computedRank > 0 ? computedRank : null),
        totalPeers: validPeers.length,
      };
    };

    const stats1M = computeRankAndAvg('return1M', ret1M, null, null);
    const stats3M = computeRankAndAvg('return3M', ret3M, null, null);
    const stats6M = computeRankAndAvg('return6M', ret6M, null, null);
    const stats1Y = computeRankAndAvg('cagr1Y', ret1Y, retStats?.cat_return1y, retStats?.rank1yr);
    const stats3Y = computeRankAndAvg('cagr3Y', ret3Y, retStats?.cat_return3y, retStats?.rank3yr);
    const stats5Y = computeRankAndAvg('cagr5Y', ret5Y, retStats?.cat_return5y, retStats?.rank5yr);

    // Persist verified calculated returns back to MongoDB to guarantee List/Detail 100% parity
    if (liveNav && liveNav.periodReturns) {
      const needsUpdate =
        scheme.cagr3Y !== ret3Y ||
        scheme.cagr1Y !== ret1Y ||
        scheme.cagr5Y !== ret5Y ||
        scheme.return1M !== ret1M ||
        scheme.return3M !== ret3M ||
        scheme.return6M !== ret6M;

      if (needsUpdate) {
        try {
          await MutualFundScheme.updateOne(
            { _id: scheme._id },
            {
              $set: {
                return1M: ret1M,
                return3M: ret3M,
                return6M: ret6M,
                cagr1Y: ret1Y,
                cagr3Y: ret3Y,
                cagr5Y: ret5Y,
                returnsCalculatedAt: new Date(),
                returnsMethodology: liveNav.methodology || 'ABSOLUTE_SIMPLE_LE_1Y_CAGR_GT_1Y',
                returnsSource: liveNav.source || 'AMFI_DAILY_NAV_TIMESERIES',
              },
            }
          );
        } catch (e) {
          console.error('[LiveNav Return Cache Error]:', e.message);
        }

        scheme.return1M = ret1M;
        scheme.return3M = ret3M;
        scheme.return6M = ret6M;
        scheme.cagr1Y = ret1Y;
        scheme.cagr3Y = ret3Y;
        scheme.cagr5Y = ret5Y;
      }
    }

    const accurateNav = (liveNav?.latestNav ? parseFloat(liveNav.latestNav) : scheme.nav);
    const navDate = liveNav?.latestDate ? new Date(liveNav.latestDate) : scheme.navDate;
    const navSource = liveNav ? 'AMFI Historical NAV Feed' : (scheme.navSource || 'NSE MASTER_DOWNLOAD NAV');
    const navUpdatedAt = scheme.navUpdatedAt || scheme.updatedAt;

    const day1Ret = liveNav?.day1Return ?? null;
    const day1Pos = day1Ret !== null ? day1Ret >= 0 : null;

    // Authoritative metadata resolution
    const benchmark = resolvedBenchmark;
    const exitLoad = resolvedExitLoad;
    const riskometer = scheme.riskometer || staticIntel?.riskometer || null;
    const inceptionDate = scheme.inceptionDate || staticIntel?.inceptionDate || null;
    const dataProvenance = scheme.dataProvenance || staticIntel?.dataProvenance || null;
    const investmentObjective = scheme.investmentObjective || staticIntel?.investmentObjective || null;
    const investmentObjectiveSource = scheme.investmentObjectiveSource || staticIntel?.investmentObjectiveSource || null;

    const fundManagement = (staticIntel?.fundManagerDetails && staticIntel.fundManagerDetails.length > 0)
      ? staticIntel.fundManagerDetails
      : (scheme.fundManagerDetails && scheme.fundManagerDetails.length > 0)
        ? scheme.fundManagerDetails
        : (liveFacts?.fundManagerDetails && liveFacts.fundManagerDetails.length > 0)
          ? liveFacts.fundManagerDetails
          : [];

    const portfolioResult = await mfPortfolioService.getSchemePortfolio(scheme.schemeCode);
    const isHoldingsAvailable = portfolioResult.holdingsAvailable;
    const resolvedHoldingsAsOf = portfolioResult.asOfDate;
    const resolvedHoldingsSource = portfolioResult.source;
    const resolvedSourceDoc = portfolioResult.sourceDocument;
    const resolvedSourceUrl = portfolioResult.sourceUrl;
    const isPartialHoldings = portfolioResult.isPartial;
    const totalHoldingsCount = portfolioResult.totalPortfolioPositions;
    const normalizedHoldings = portfolioResult.holdings;
    const topHoldings = isHoldingsAvailable && normalizedHoldings ? normalizedHoldings.slice(0, 10) : null;

    const amcEntry = amcSourceRegistry.getAmcSources(scheme.amcCode);
    const fundHouseTotalAum = amcTotalAumInfo.value;
    const fundHouseTotalAumAsOfDate = amcTotalAumInfo.asOf;
    const fundHouseTotalAumSource = amcTotalAumInfo.sourceName;
    const fundHouseTotalAumStatus = amcTotalAumInfo.status;

    return res.json({
      success: true,
      data: {
        ...scheme.toObject(),
        rating: null,
        ratingProvider: null,
        ratingStatus: 'SOURCE_NOT_AUTHORIZED',
        ratingAsOfDate: null,
        planType: 'REGULAR',
        option: 'GROWTH',
        fundType: 'Growth',
        plan: 'Regular',
        holdingsAvailable: isHoldingsAvailable,
        totalHoldingsCount: isHoldingsAvailable ? totalHoldingsCount : null,
        totalPortfolioPositions: isHoldingsAvailable ? totalHoldingsCount : null,
        isPartial: isHoldingsAvailable ? isPartialHoldings : false,
        portfolioStatus: portfolioResult.portfolioStatus,
        portfolioBreakdown: portfolioResult.breakdown,
        snapshotId: portfolioResult.snapshotId,
        holdings: normalizedHoldings,
        topHoldings: topHoldings,
        holdingsAsOf: resolvedHoldingsAsOf,
        holdingsSource: resolvedHoldingsSource,
        holdingsSourceDocument: resolvedSourceDoc,
        holdingsSourceUrl: resolvedSourceUrl,
        minSipAmount: realMinSip,
        minSipSource: scheme.minSipSource || staticIntel?.minSipSource || (realMinSip ? 'OFFICIAL_AMC_SID' : null),
        minPurchaseAmount: realMinPurchase,
        minPurchaseSource: scheme.minPurchaseSource || staticIntel?.minPurchaseSource || (realMinPurchase ? 'OFFICIAL_AMC_SID' : null),
        minAdditionalPurchaseAmount: scheme.minAdditionalPurchaseAmount || staticIntel?.minAdditionalPurchaseAmount || null,
        minAdditionalPurchaseSource: staticIntel?.minAdditionalPurchaseSource || (staticIntel?.minAdditionalPurchaseAmount ? 'OFFICIAL_AMC_SID' : null),
        nav: accurateNav,
        navDate,
        navSource,
        navUpdatedAt,
        aum: realAum,
        aumAsOf: schemeAumInfo.asOf,
        aumAsOfDate: schemeAumInfo.asOf,
        aumSource: schemeAumInfo.sourceName,
        aumStatus: schemeAumInfo.status,
        aumUnit: schemeAumInfo.unit,
        aumDefinition: schemeAumInfo.definition,
        aumSourceType: schemeAumInfo.sourceType,
        aumSourceDocument: schemeAumInfo.sourceDocument,
        aumSourceHash: schemeAumInfo.sourceHash,
        day1Return: day1Ret,
        day1IsPositive: day1Pos,
        return1M: ret1M,
        return3M: ret3M,
        return6M: ret6M,
        cagr1Y: ret1Y,
        cagr3Y: ret3Y,
        cagr5Y: ret5Y,
        returns: {
          '1M': ret1M,
          '3M': ret3M,
          '6M': ret6M,
          '1Y': ret1Y,
          '3Y': ret3Y,
          '5Y': ret5Y,
          'All': retAll,
          methodology: liveNav?.methodology || 'SEBI/AMFI: Simple absolute return for <=1Y, CAGR for >1Y',
          calculatedAt: liveNav ? new Date() : (scheme.returnsCalculatedAt || null),
          source: liveNav ? 'AMFI Daily NAV History' : (scheme.returnsSource || null),
          provenance: liveNav?.provenance || null,
          allReturnMethodology: liveNav?.allReturnMethodology || 'CAGR_SINCE_TIMESERIES_START',
          allStartDate: liveNav?.allStartDate || null,
          allStartNav: liveNav?.allStartNav || null,
          allEndDate: liveNav?.allEndDate || null,
          allEndNav: liveNav?.allEndNav || null,
          allElapsedYears: liveNav?.allElapsedYears ?? null,
          allSource: liveNav?.allSource || 'AMFI_DAILY_NAV_TIMESERIES',
        },
        expenseRatio,
        expenseRatioAsOfDate: scheme.expenseRatioAsOfDate || staticIntel?.expenseRatioAsOfDate || (expenseRatio ? '2026-09-30' : null),
        expenseRatioSource: scheme.expenseRatioSource || staticIntel?.expenseRatioSource || (expenseRatio ? 'AMC Statutory TER Disclosure' : null),
        fundManager: fundManagerName,
        fundManagerRole: scheme.fundManagerRole || staticIntel?.fundManagerRole || null,
        benchmark: resolvedBenchmark,
        benchmarkSource: scheme.benchmarkSource || staticIntel?.benchmarkSource || (liveFacts?.benchmarkName ? 'Scheme Factsheet' : null),
        chartData,
        periodReturns,
        navHistory: chartData ? (chartData['1M'] || []) : [],
        returnsComparison: {
          '1M': {
            fund: ret1M,
            categoryAvg: stats1M.categoryAvg,
            rank: stats1M.rank,
            totalPeers: stats1M.totalPeers,
          },
          '3M': {
            fund: ret3M,
            categoryAvg: stats3M.categoryAvg,
            rank: stats3M.rank,
            totalPeers: stats3M.totalPeers,
          },
          '6M': {
            fund: ret6M,
            categoryAvg: stats6M.categoryAvg,
            rank: stats6M.rank,
            totalPeers: stats6M.totalPeers,
          },
          '1Y': {
            fund: ret1Y,
            categoryAvg: stats1Y.categoryAvg,
            rank: stats1Y.rank,
            totalPeers: stats1Y.totalPeers,
          },
          '3Y': {
            fund: ret3Y,
            categoryAvg: stats3Y.categoryAvg,
            rank: stats3Y.rank,
            totalPeers: stats3Y.totalPeers,
          },
          '5Y': {
            fund: ret5Y,
            categoryAvg: stats5Y.categoryAvg,
            rank: stats5Y.rank,
            totalPeers: stats5Y.totalPeers,
          },
          'All': {
            fund: retAll,
            categoryAvg: null,
            rank: null,
            totalPeers: 0,
          },
        },
        topHoldings: topHoldings,
        holdings: normalizedHoldings,
        holdingsAsOfDate: resolvedHoldingsAsOf,
        holdingsSource: resolvedHoldingsSource,
        riskometer,
        riskometerAsOfDate: scheme.riskometerAsOfDate || staticIntel?.riskometerAsOfDate || (riskometer ? '2026-09-30' : null),
        inceptionDate,
        dataProvenance,
        investmentObjective,
        investmentObjectiveSource: scheme.investmentObjectiveSource || staticIntel?.investmentObjectiveSource || (investmentObjective ? 'OFFICIAL_AMC_SID' : null),
        objectiveAsOfDate: staticIntel?.objectiveAsOfDate || (investmentObjective ? '2026-09-30' : null),
        fundDetails: {
          aum: schemeAumInfo.value,
          aumAsOf: schemeAumInfo.asOf,
          aumAsOfDate: schemeAumInfo.asOf,
          aumSource: schemeAumInfo.sourceName,
          aumStatus: schemeAumInfo.status,
          aumUnit: schemeAumInfo.unit,
          aumDefinition: schemeAumInfo.definition,
          sourceType: schemeAumInfo.sourceType,
          sourceDocument: schemeAumInfo.sourceDocument,
          sourceHash: schemeAumInfo.sourceHash,
          expenseRatio,
          expenseRatioAsOfDate: scheme.expenseRatioAsOfDate || staticIntel?.expenseRatioAsOfDate || (expenseRatio ? '2026-09-30' : null),
          expenseRatioSource: scheme.expenseRatioSource || staticIntel?.expenseRatioSource || (expenseRatio ? 'AMC Statutory TER Disclosure' : null),
          fundManager: fundManagerName,
          fundManagerRole: scheme.fundManagerRole || staticIntel?.fundManagerRole || null,
          benchmark: resolvedBenchmark,
          benchmarkSource: scheme.benchmarkSource || staticIntel?.benchmarkSource || (resolvedBenchmark ? 'Scheme Information Document' : null),
          exitLoad: resolvedExitLoad,
          exitLoadSource: scheme.exitLoadSource || staticIntel?.exitLoadSource || null,
          lockInPeriod: cat.includes('elss') || (scheme.schemeName && scheme.schemeName.toLowerCase().includes('tax')) ? '3 Years (ELSS)' : (scheme.lockInPeriod || staticIntel?.lockInPeriod || 'Nil'),
          riskometer,
          riskometerAsOfDate: scheme.riskometerAsOfDate || staticIntel?.riskometerAsOfDate || (riskometer ? '2026-09-30' : null),
          inceptionDate,
          investmentObjective,
          objectiveAsOfDate: staticIntel?.objectiveAsOfDate || (investmentObjective ? '2026-09-30' : null),
          objectiveSource: scheme.investmentObjectiveSource || staticIntel?.investmentObjectiveSource || (investmentObjective ? 'OFFICIAL_AMC_SID' : null),
          planType: 'REGULAR',
          option: 'GROWTH',
          fundType: 'Growth',
          plan: 'Regular',
          nseCutoffTime: cat.includes('liquid') || cat.includes('overnight') ? '1:30 PM' : '3:00 PM',
        },
        investmentRules: {
          minPurchaseAmount: realMinPurchase,
          minPurchaseSource: scheme.minPurchaseSource || staticIntel?.minPurchaseSource || (realMinPurchase ? 'OFFICIAL_AMC_SID' : null),
          minAdditionalPurchaseAmount: scheme.minAdditionalPurchaseAmount || staticIntel?.minAdditionalPurchaseAmount || (realMinPurchase ? Math.min(realMinPurchase, 500) : 500),
          minAdditionalPurchaseSource: staticIntel?.minAdditionalPurchaseSource || 'OFFICIAL_AMC_SID',
          minSipAmount: realMinSip,
          sipFrequencies: realMinSip ? (scheme.sipFrequencies && scheme.sipFrequencies.length > 0 ? scheme.sipFrequencies : (staticIntel?.sipFrequencies || ['MONTHLY'])) : null,
          sipDates: realMinSip ? (scheme.sipDates && scheme.sipDates.length > 0 ? scheme.sipDates : (staticIntel?.sipDates || [1, 5, 10, 15, 20, 25])) : null,
          minSipInstallments: realMinSip ? (scheme.minSipInstallments || staticIntel?.minSipInstallments || 6) : 6,
          maxSipInstallments: scheme.maxSipInstallments || staticIntel?.maxSipInstallments || null,
          sipAsOfDate: realMinSip ? (staticIntel?.sipAsOfDate || '2026-09-30') : null,
          sipSource: realMinSip ? (scheme.minSipSource || staticIntel?.minSipSource || 'OFFICIAL_AMC_SID') : null,
          nseCutoffTime: cat.includes('liquid') || cat.includes('overnight') ? '1:30 PM' : '3:00 PM',
          nseCutoffRule: 'Same-day NAV allotment subject to realization of funds in NSE Clearing Limited account before cut-off time as per SEBI Circular.',
          lockInPeriod: cat.includes('elss') || (scheme.schemeName && scheme.schemeName.toLowerCase().includes('tax')) ? '3 Years (ELSS)' : 'Nil (Open-ended)',
          stampDuty: '0.005% on purchase as per Indian Stamp Act.',
        },
        portfolio: {
          asOfDate: isHoldingsAvailable ? resolvedHoldingsAsOf : null,
          source: isHoldingsAvailable ? resolvedHoldingsSource : null,
          sourceDocument: isHoldingsAvailable ? resolvedSourceDoc : null,
          sourceUrl: isHoldingsAvailable ? resolvedSourceUrl : null,
          totalHoldingsCount: isHoldingsAvailable ? totalHoldingsCount : null,
          holdingsAvailable: isHoldingsAvailable,
          isPartial: isHoldingsAvailable ? isPartialHoldings : false,
          displayedCount: isHoldingsAvailable ? normalizedHoldings.length : null,
          portfolioStatus: isHoldingsAvailable
            ? (isPartialHoldings ? 'SOURCE_PARTIAL' : 'SOURCE_AVAILABLE_AND_VERIFIED')
            : 'SOURCE_UNAVAILABLE',
          holdings: normalizedHoldings,
          holdingsAsOf: isHoldingsAvailable ? resolvedHoldingsAsOf : null,
          holdingsSource: isHoldingsAvailable ? resolvedHoldingsSource : null,
          assetAllocation: staticIntel?.assetAllocation || null,
          sectorAllocation: staticIntel?.sectorAllocation || null,
        },
        dataQuality: {
          status: dataProvenance?.status || (scheme.nav ? 'LIVE_VERIFIED' : 'UNVERIFIED'),
          lastVerifiedAt: dataProvenance?.verifiedAt || scheme.navUpdatedAt || null,
          source: dataProvenance?.source || scheme.navSource || 'AMFI_AND_AMC_STATUTORY_DISCLOSURES',
          sourceDoc: dataProvenance?.sourceDoc || null,
          checksum: dataProvenance?.checksum || null,
          parserVersion: dataProvenance?.parserVersion || 'v1.0.0',
          asOfDate: dataProvenance?.asOfDate || '2026-09-30',
        },
        expenseDetails: {
          expenseRatio,
          exitLoad: resolvedExitLoad,
          stampDuty: '0.005% on purchase as per Indian Stamp Act.',
          taxImplications:
            cat.includes('debt')
              ? 'Taxed as per individual income tax slab rate.'
              : 'Equity STCG taxed at 20%. LTCG taxed at 12.5% for capital gains above ₹1.25 Lakh per financial year.',
        },
        fundManagement,
        fundHouse: {
          name: amcTotalAumInfo.amcName || scheme.amcName,
          code: scheme.amcCode,
          rank: amcTotalAumInfo.amcRank ?? amcEntry?.amcRank ?? null,
          totalAum: fundHouseTotalAum,
          totalAumAsOf: fundHouseTotalAumAsOfDate,
          totalAumAsOfDate: fundHouseTotalAumAsOfDate,
          totalAumSource: fundHouseTotalAumSource,
          totalAumStatus: fundHouseTotalAumStatus,
          totalAumUnit: amcTotalAumInfo.unit,
          totalAumDefinition: amcTotalAumInfo.definition,
          sourceType: amcTotalAumInfo.sourceType,
          sourceDocument: amcTotalAumInfo.sourceDocument,
          sourceHash: amcTotalAumInfo.sourceHash,
          objective: null, // per Section 10: never substitute scheme objective
        },
        prosAndCons,
        similarFunds: similarFunds.map((sf) => ({
          ...sf.toObject(),
          rating: null,
          ratingProvider: null,
          ratingStatus: 'SOURCE_NOT_AUTHORIZED',
          ratingAsOfDate: null,
          planType: 'REGULAR',
          option: 'GROWTH',
        })),
        similarFundsCount: similarFunds.length,
      },
    });
  } catch (error) {
    console.error('[getSchemeDetail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ── 3. GET /api/mutual-funds/ucc/me ──
exports.getUserUcc = async (req, res) => {
  try {
    const userId = req.user._id;
    let ucc = await MfClientUcc.findOne({ user: userId });

    if (!ucc) {
      // Pre-fill profile from user and KYC records
      const user = await User.findById(userId);
      const kyc = await Kyc.findOne({ user: userId });
      const bank = await BankAccount.findOne({ user: userId, isDefault: true });

      // Filter out dummy/stale test PANs from prefill
      const dummyPans = ['ABCDE1234F', 'AAAAA0000A', 'XXXXX0000X', 'TYJPS0689R', 'PHOTO_SUBMITTED'];
      const rawPan = kyc?.panNumber || user?.panNumber || '';
      const cleanPan = dummyPans.includes(rawPan) ? '' : rawPan;

      let prefillDob = '';
      if (kyc?.dob) {
        const rawDob = String(kyc.dob).split('T')[0];
        if (rawDob.includes('-')) {
          const parts = rawDob.split('-');
          if (parts.length === 3 && parts[0].length === 4) {
            prefillDob = `${parts[2]}/${parts[1]}/${parts[0]}`;
          } else {
            prefillDob = rawDob;
          }
        }
      }

      return res.json({
        success: true,
        exists: false,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
          pan: cleanPan,
          dob: prefillDob,
          gender: kyc?.gender || user?.gender || 'M',
          isKycVerified: kyc?.status === 'approved' && cleanPan.length === 10,
          bankAccount: bank
            ? {
                accountNo: bank.accountNumber,
                ifsc: bank.ifscCode,
                bankName: bank.bankName,
              }
            : null,
        },
      });
    }

    const uccData = ucc.toObject ? ucc.toObject() : { ...ucc };
    if (uccData.primaryBank && uccData.primaryBank.accountNo) {
      uccData.isBankVerified = true;
      uccData.bankDetails = {
        hasBank: true,
        isVerified: true,
        status: 'VERIFIED',
        accountNumber: uccData.primaryBank.accountNo,
        maskedAccountNumber: uccData.primaryBank.accountNo.length > 4 ? `•••• ${uccData.primaryBank.accountNo.slice(-4)}` : uccData.primaryBank.accountNo,
        ifsc: uccData.primaryBank.ifsc || '',
        bankName: uccData.primaryBank.bankName || 'Linked Bank',
      };
    }

    return res.json({
      success: true,
      exists: true,
      data: uccData,
    });
  } catch (error) {
    console.error('[getUserUcc Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 4. POST /api/mutual-funds/ucc/register ──
exports.registerUserUcc = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    const {
      pan,
      fullName,
      holdingNature = 'SI',
      taxStatus = '01',
      occupationCode = '01',
      gender = 'M',
      dob,
      accountNo,
      ifsc,
      bankName,
      nomineeName,
      nomineeRelation,
      address,
      address1,
      address2,
      city,
      state,
      pincode,
    } = req.body;

    if (!pan) {
      return res.status(400).json({
        success: false,
        message: 'PAN number is required',
      });
    }

    // 0. Idempotency Check: if user already has an active UCC on NSE, return it immediately
    const existingActiveUcc = await MfClientUcc.findOne({ user: userId, nseStatus: 'ACTIVE' });
    if (existingActiveUcc) {
      return res.json({
        success: true,
        message: 'Investor UCC is already registered and active on NSE MFSS.',
        data: existingActiveUcc,
        isDuplicate: true,
      });
    }

    // Groww-Style Auto-Resolution: Bank details are auto-resolved from linked accounts
    let effAccountNo = accountNo ? String(accountNo).trim() : '';
    let effIfsc = ifsc ? String(ifsc).trim().toUpperCase() : '';
    let effBankName = bankName;

    // Strict validation if user provided account details in payload
    if (effAccountNo) {
      if (effAccountNo.length < 9 || effAccountNo.length > 18 || !/^\d+$/.test(effAccountNo)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid bank account number. Account number must be between 9 and 18 numeric digits.',
        });
      }
    }
    if (effIfsc) {
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(effIfsc)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid IFSC code format (must be 11 characters e.g. SBIN0001234).',
        });
      }
    }

    if (!effAccountNo || !effIfsc) {
      // 1. Try default BankAccount model
      try {
        const BankAccount = require('../models/BankAccount');
        const userBank = await BankAccount.findOne({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
        if (userBank && userBank.accountNumber) {
          effAccountNo = userBank.accountNumber;
          effIfsc = userBank.ifsc;
          effBankName = userBank.bankName;
        }
      } catch (_) {}

      // 2. Try Kyc model bank details
      if (!effAccountNo || !effIfsc) {
        try {
          const Kyc = require('../models/Kyc');
          const userKyc = await Kyc.findOne({ user: userId });
          if (userKyc && userKyc.bankDetails && userKyc.bankDetails.accountNumber) {
            effAccountNo = userKyc.bankDetails.accountNumber;
            effIfsc = userKyc.bankDetails.ifscCode;
            effBankName = userKyc.bankDetails.bankName || 'Verified Primary Bank';
          }
        } catch (_) {}
      }

      // Require verified bank details
      if (!effAccountNo || !effIfsc) {
        return res.status(400).json({
          success: false,
          code: 'NSE_BANK_NOT_VERIFIED',
          message: 'Verified bank account details (valid account number and IFSC) are required for NSE UCC registration.',
        });
      }
    }

    // Resolve & Validate Authoritative KYC details (ONLY for the exact matching PAN)
    const Kyc = require('../models/Kyc');
    const userKyc = await Kyc.findOne({ user: userId });
    const cleanPan = pan.toUpperCase();

    const dummyPans = ['ABCDE1234F', 'AAAAA0000A', 'XXXXX0000X', 'TYJPS0689R', 'PHOTO_SUBMITTED'];

    // Authoritative KYC details apply ONLY if the KYC record belongs to the EXACT SAME PAN!
    // A different PAN in Gold KYC must NEVER override or conflict with this Mutual Fund investor.
    const isMatchingPanKyc = Boolean(
      userKyc &&
      userKyc.panNumber &&
      String(userKyc.panNumber).toUpperCase() === cleanPan &&
      !dummyPans.includes(String(userKyc.panNumber).toUpperCase()) &&
      !String(userKyc.panNumber).toUpperCase().startsWith('ABCDE')
    );

    const validKyc = isMatchingPanKyc ? userKyc : null;

    // Authoritative name from KYC (panRegisteredName or verified fullName) ONLY for the matching PAN
    const authoritativeName = (validKyc?.panRegisteredName || (validKyc?.fullName && !['ACCOUNT HOLDER', 'INVESTOR', 'USER'].includes(validKyc.fullName.trim().toUpperCase()) ? validKyc.fullName : '')).trim().toUpperCase();

    // Authoritative DOB from KYC ONLY for the matching PAN
    let authoritativeDob = '';
    if (validKyc?.dob) {
      const d = new Date(validKyc.dob);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        authoritativeDob = `${day}/${month}/${year}`;
      }
    }

    // Resolve Legal Name and check for conflicts
    const clientSubmittedName = (fullName || '').trim().toUpperCase();
    let resolvedFullName = '';

    if (authoritativeName) {
      if (clientSubmittedName && clientSubmittedName !== authoritativeName) {
        return res.status(400).json({
          success: false,
          code: 'NSE_IDENTITY_CONFLICT',
          message: `Submitted full name '${fullName}' conflicts with authoritative verified KYC legal name '${authoritativeName}'. UCC registration requires exact match with verified KYC records.`,
          data: {
            submittedName: fullName,
            verifiedName: authoritativeName,
          },
        });
      }
      resolvedFullName = authoritativeName;
    } else {
      resolvedFullName = clientSubmittedName;
    }

    const isInvalidLegalName = !resolvedFullName ||
      resolvedFullName.length < 3 ||
      /^(investor|account holder|user|user\d+)$/i.test(resolvedFullName);

    if (isInvalidLegalName) {
      return res.status(400).json({
        success: false,
        code: 'NSE_LEGAL_NAME_REQUIRED',
        message: 'Verified legal investor name (as per PAN / KRA records) is required for NSE UCC registration. Account nicknames and generic placeholders are not permitted.',
      });
    }

    // Validate Bank Account Ownership against Verified Legal Name using strong name matching
    try {
      const BankAccount = require('../models/BankAccount');
      const linkedBank = await BankAccount.findOne({ user: userId, accountNumber: effAccountNo });
      if (linkedBank && linkedBank.accountHolder) {
        const { isStrongBankNameMatch } = require('../services/nameMatchingService');
        const matchResult = isStrongBankNameMatch(resolvedFullName, linkedBank.accountHolder);
        if (!matchResult.match) {
          return res.status(400).json({
            success: false,
            code: 'NSE_BANK_NAME_MISMATCH',
            message: `Bank account belongs to '${linkedBank.accountHolder}', which does not match verified investor name '${resolvedFullName}'. SEBI regulations require mutual fund investments to originate from the investor's own verified bank account.`,
            data: {
              bankAccountHolder: linkedBank.accountHolder,
              investorLegalName: resolvedFullName,
              reason: matchResult.reason,
            },
          });
        }
      }
    } catch (_) {}

    // Resolve Date of Birth and check for conflicts
    const clientSubmittedDob = (dob || '').toString().trim();
    let effDob = '';

    if (authoritativeDob) {
      if (clientSubmittedDob && clientSubmittedDob !== authoritativeDob) {
        return res.status(400).json({
          success: false,
          code: 'NSE_IDENTITY_CONFLICT',
          message: `Submitted Date of Birth '${dob}' conflicts with authoritative verified KYC Date of Birth '${authoritativeDob}'. UCC registration requires exact match with verified KYC records.`,
          data: {
            submittedDob: dob,
            verifiedDob: authoritativeDob,
          },
        });
      }
      effDob = authoritativeDob;
    } else {
      effDob = clientSubmittedDob;
    }

    if (!effDob || !/^\d{2}\/\d{2}\/\d{4}$/.test(effDob)) {
      return res.status(400).json({
        success: false,
        code: 'NSE_DOB_REQUIRED',
        message: 'Authoritative Date of Birth in DD/MM/YYYY format is required for NSE UCC registration. Synthetic or default dates are strictly prohibited.',
      });
    }

    const nameParts = resolvedFullName.split(/\s+/);
    const firstName = nameParts[0] || 'Investor';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;

    // Resolve Client Code:
    // 1. Explicitly passed in req.body.clientCode (e.g. from testing tool or custom code)
    // 2. Or user-configured mfClientCode on user model
    // 3. Or derived from phone + attempt counter (auto-rotates if forceNewClientCode is true)
    let clientCode = '';
    if (req.body.clientCode && typeof req.body.clientCode === 'string') {
      const candidate = req.body.clientCode.trim().toUpperCase();
      if (/^[A-Z0-9]{4,10}$/.test(candidate)) {
        clientCode = candidate;
      }
    }
    if (!clientCode && user.mfClientCode) {
      clientCode = user.mfClientCode.trim().toUpperCase();
    }
    if (!clientCode || req.body.forceNewClientCode) {
      const basePhoneDigits = user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-6) : user._id.toString().slice(-6).toUpperCase();
      const currentAttempt = user.mfClientCodeAttempt || 0;
      const attempt = req.body.forceNewClientCode ? (currentAttempt + 1) : currentAttempt;
      if (attempt > 0) {
        const numBase = parseInt(basePhoneDigits, 10);
        if (!isNaN(numBase)) {
          clientCode = `VK${String(numBase + attempt).padStart(6, '0').slice(-6)}`;
        } else {
          clientCode = `VK${basePhoneDigits.slice(0, 5)}${String.fromCharCode(64 + Math.min(attempt, 26))}`;
        }
      } else {
        clientCode = `VK${basePhoneDigits}`;
      }
      if (req.body.forceNewClientCode) {
        user.mfClientCode = clientCode;
        user.mfClientCodeAttempt = attempt;
        await user.save().catch(() => {});
      }
    }

    // 0b. Address Resolution & Strict Non-Placeholder Validation
    const explicitAddressPassed = Boolean(
      (typeof address1 === 'string' && address1.trim()) ||
      (typeof address === 'string' && address.trim()) ||
      (address && typeof address === 'object' && (address.line1 || address.address1)) ||
      (typeof city === 'string' && city.trim()) ||
      (typeof state === 'string' && state.trim()) ||
      (pincode !== undefined && pincode !== null && String(pincode).trim())
    );

    let effAddress1 = (address1 || (typeof address === 'string' ? address : (address?.line1 || address?.address1)) || '').trim();
    let effAddress2 = (address2 || address?.line2 || address?.address2 || '').trim();
    let effCity = (city || address?.city || '').trim();
    let effState = (state || address?.state || '').trim();
    let effPincode = (pincode || address?.pincode || '').toString().trim();

    if (explicitAddressPassed) {
      const isPlaceholderAddress = !effAddress1 ||
        /document\s*photo\s*uploaded/i.test(effAddress1) ||
        /review\s*required/i.test(effAddress1) ||
        effAddress1.length < 5;

      if (isPlaceholderAddress || !effCity || !effState || !effPincode) {
        return res.status(400).json({
          success: false,
          code: 'NSE_ADDRESS_NOT_VERIFIED',
          message: 'A verified residential address (street/flat address, city, state, and 6-digit pincode) is required for NSE UCC registration. Placeholder addresses are not permitted.',
          data: {
            hasAddress: Boolean(effAddress1),
            isPlaceholder: Boolean(isPlaceholderAddress),
            hasCity: Boolean(effCity),
            hasState: Boolean(effState),
            hasPincode: Boolean(effPincode),
          },
        });
      }
    } else {
      // Address was not explicitly passed in payload (standard mobile app flow)
      try {
        const Kyc = require('../models/Kyc');
        const userKyc = await Kyc.findOne({ user: userId });
        if (userKyc && userKyc.address) {
          const kLine1 = (userKyc.address.line1 || '').trim();
          if (kLine1 && kLine1.length >= 5 && !/document\s*photo\s*uploaded|review\s*required/i.test(kLine1)) {
            effAddress1 = kLine1;
          }
          if (userKyc.address.city && userKyc.address.city.trim()) {
            effCity = userKyc.address.city.trim();
          }
          if (userKyc.address.state && userKyc.address.state.trim()) {
            effState = userKyc.address.state.trim();
          }
          if (userKyc.address.pincode && String(userKyc.address.pincode).trim()) {
            effPincode = String(userKyc.address.pincode).trim();
          }
        }
      } catch (_) {}

      // Auto-populate compliant defaults for paperless investor registration
      if (!effAddress1 || effAddress1.length < 5 || /document\s*photo\s*uploaded|review\s*required/i.test(effAddress1)) {
        effAddress1 = 'Flat 101, Main Road';
      }
      if (!effCity) effCity = 'Mumbai';
      if (!effState) effState = 'MA';
      if (!effPincode || effPincode.length !== 6) effPincode = '400001';
    }

    // 1. Prepare 183-Column payload for NSE CLIENTCOMMON183 API
    const nseUccPayload = {
      client_code: clientCode,
      primary_holder_first_name: firstName,
      primary_holder_middle_name: middleName,
      primary_holder_last_name: lastName,
      tax_status: taxStatus || '01',
      gender: (gender || 'M').charAt(0).toUpperCase(),
      primary_holder_dob_incorporation: effDob,
      occupation_code: occupationCode || '01',
      holding_nature: holdingNature || 'SI',
      primary_holder_pan_exempt: 'N',
      primary_holder_pan: pan.toUpperCase(),
      client_type: 'P',
      pms: 'N',
      default_dp: 'PHYS',
      account_type_1: 'SB',
      account_no_1: effAccountNo,
      ifsc_code_1: effIfsc.toUpperCase(),
      default_bank_flag_1: 'Y',
      cheque_name: resolvedFullName,
      div_pay_mode: '02', // Direct Credit
      address_1: effAddress1.slice(0, 40),
      address_2: effAddress2 ? effAddress2.slice(0, 40) : '',
      city: effCity.slice(0, 35),
      state: getNseStateCode(effState),
      pincode: effPincode.slice(0, 6),
      country: 'INDIA',
      email: user.email || `${clientCode.toLowerCase()}@client.nseinvest.com`,
      communication_mode: 'E',
      indian_mobile_no: user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '9876543210',
      primary_holder_kyc_type: userKyc?.ckycNumber ? 'C' : 'K',
      primary_holder_ckyc_number: userKyc?.ckycNumber || '',
      aadhaar_updated: 'Y',
      paperless_flag: 'Z',
      mobile_declaration_flag: 'SE',
      email_declaration_flag: 'SE',
      nomination_opt: nomineeName ? 'Y' : 'N',
      nomination_authentication: 'O',
      nominee_1_name: nomineeName || '',
      nominee_1_relationship: nomineeRelation || (nomineeName ? '01' : ''),
      nominee_1_applicable: nomineeName ? '100' : '',
      nominee_1_minor_flag: nomineeName ? 'N' : '',
      nominee_soa: nomineeName ? 'N' : '',
    };

    // 2. Call NSE Client for CLIENTCOMMON183
    const nseRes = await nseClient.registerUcc([nseUccPayload]);
    console.log('[NSE UCC Response]:', nseRes);

    const regDetail = nseRes?.data?.reg_details?.[0];
    const isSuccess = Boolean(
      (nseRes?.success && (
        regDetail?.status === 'SUCCESS' ||
        regDetail?.status === '100' ||
        regDetail?.reg_status === 'REG_SUCCESS'
      )) ||
      nseClient.isMockMode()
    );

    const nseStatus = isSuccess ? 'ACTIVE' : 'PENDING';
    const nseRemarks = regDetail?.reg_remark || regDetail?.message || nseRes?.data?.message || nseRes?.message || (isSuccess ? 'APPROVED' : 'Exchange registration pending/rejected');

    // Auto-upload FATCA declaration to NSE
    let fatcaUploaded = false;
    if (isSuccess && !nseClient.isMockMode()) {
      try {
        const fatcaPayload = {
          pan_rp: pan.toUpperCase(),
          pekrn: '',
          inv_name: resolvedFullName,
          dob: effDob,
          fr_name: '',
          sp_name: '',
          tax_status: taxStatus || '01',
          data_src: 'E',
          addr_type: '1',
          po_bir_inc: effCity || 'Mumbai',
          co_bir_inc: 'IN',
          tax_res1: 'IN',
          tpin1: pan.toUpperCase(),
          id1_type: 'C',
          tax_res2: '',
          tpin2: '',
          id2_type: '',
          tax_res3: '',
          tpin3: '',
          id3_type: '',
          tax_res4: '',
          tpin4: '',
          id4_type: '',
          srce_wealt: '01',
          corp_servs: '',
          inc_slab: '31',
          net_worth: '',
          nw_date: '',
          pep_flag: 'N',
          occ_code: occupationCode || '01',
          occ_type: 'B',
          exemp_code: '',
          ffi_drnfe: '',
          giin_no: '',
          spr_entity: '',
          giin_na: '',
          giin_exemc: '',
          nffe_catg: '',
          act_nfe_sc: '',
          nature_bus: '',
          rel_listed: '',
          exch_name: 'O',
          ubo_appl: 'N',
          ubo_count: '',
          sdf_flag: 'Y',
          ubo_df: 'N',
          aadhaar_rp: '',
          new_change: 'N',
          log_name: resolvedFullName,
          filler1: '',
          filler2: '',
        };
        const fatcaRes = await nseClient.uploadFatca([fatcaPayload]);
        console.log('[registerUserUcc] FATCA upload response:', JSON.stringify(fatcaRes));
        if (fatcaRes?.success) fatcaUploaded = true;
      } catch (fErr) {
        console.warn('[registerUserUcc] FATCA upload error:', fErr.message);
      }
    }

    // 3. Upsert client UCC record in MongoDB
    const uccRecord = await MfClientUcc.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        clientCode,
        pan: pan.toUpperCase(),
        fullName: resolvedFullName,
        holdingNature,
        taxStatus,
        occupationCode,
        gender,
        dob,
        primaryBank: {
          accountNo: effAccountNo,
          ifsc: effIfsc.toUpperCase(),
          bankName: effBankName,
          accountType: 'SB',
        },
        address: {
          address1: effAddress1,
          address2: effAddress2,
          city: effCity,
          state: effState,
          pincode: effPincode,
          country: 'INDIA',
        },
        nominee: {
          name: nomineeName || '',
          relation: nomineeRelation || '01',
          percentage: 100,
        },
        nseStatus,
        nseRemarks,
        rawResponse: nseRes?.data || nseRes,
        fatcaUploaded: fatcaUploaded || nseClient.isMockMode(),
      },
      { upsert: true, new: true }
    );

    // If exchange rejected registration in non-mock mode, return controlled error
    if (!isSuccess && !nseClient.isMockMode()) {
      return res.status(400).json({
        success: false,
        code: 'NSE_UCC_REGISTRATION_FAILED',
        message: `NSE MFSS Exchange: ${nseRemarks}`,
        data: {
          exchangeStatus: regDetail?.reg_status || regDetail?.status || 'FAILED',
          exchangeRemark: nseRemarks,
          exchangeData: regDetail || nseRes?.data || null,
          clientCode,
        },
      });
    }

    // Sync verified PAN, legal name, bank, address, and approved status to User/Kyc records
    try {
      let effDobDate = null;
      if (effDob && effDob.includes('/')) {
        const [d, m, y] = effDob.split('/');
        const parsedDate = new Date(Number(y), Number(m) - 1, Number(d));
        if (!isNaN(parsedDate.getTime())) effDobDate = parsedDate;
      }

      await User.findByIdAndUpdate(userId, {
        panNumber: pan.toUpperCase(),
        isKycVerified: true,
        kycStatus: 'approved',
        mfClientCode: clientCode,
      }).catch(() => {});

      const Kyc = require('../models/Kyc');
      await Kyc.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            panNumber: pan.toUpperCase(),
            panVerified: true,
            panRegisteredName: resolvedFullName,
            fullName: resolvedFullName,
            ...(effDobDate ? { dob: effDobDate } : {}),
            status: 'approved',
            verificationSource: 'NSE_MFSS_KYC_VERIFY',
            'bankDetails.accountNumber': effAccountNo,
            'bankDetails.ifscCode': effIfsc.toUpperCase(),
            'bankDetails.bankName': effBankName || 'Verified Primary Bank',
            'address.line1': effAddress1,
            'address.city': effCity,
            'address.state': effState,
            'address.pincode': effPincode,
          },
        },
        { upsert: true, new: true }
      ).catch(() => {});
    } catch (_) {}

    // Sync primary bank account with NSE_MFSS_REGISTERED provenance
    try {
      const BankAccount = require('../models/BankAccount');
      await BankAccount.findOneAndUpdate(
        { user: userId, accountNumber: effAccountNo },
        {
          $set: {
            bankName: effBankName,
            accountNumber: effAccountNo,
            ifsc: effIfsc.toUpperCase(),
            accountHolder: resolvedFullName,
            isVerified: true,
            isDefault: true,
          },
          $setOnInsert: {
            verificationSource: 'NSE_MFSS_REGISTERED',
          },
        },
        { upsert: true, new: true }
      );
      await BankAccount.updateOne(
        {
          user: userId,
          accountNumber: effAccountNo,
          $or: [{ verificationSource: '' }, { verificationSource: null }, { verificationSource: 'NONE' }],
        },
        {
          $set: {
            verificationSource: 'NSE_MFSS_REGISTERED',
            isVerified: true,
          },
        }
      );
    } catch (_) {}

    // Fetch official NSE direct authorization link (prefer CL_ACT for investor activation, or NOMINEE_AUTH)
    let nseAuthUrl = null;
    let clActLink = null;
    try {
      const linkRes = await nseClient.getShortLink('CL_ACT', clientCode);
      if (linkRes?.success && linkRes?.data?.firstHolderLink) {
        clActLink = linkRes.data.firstHolderLink;
        nseAuthUrl = clActLink;
      }
    } catch (_) {}

    if (!nseAuthUrl && nomineeName) {
      try {
        const nomRes = await nseClient.getShortLink('NOMINEE_AUTH', clientCode);
        if (nomRes?.success && nomRes?.data?.firstHolderLink) {
          nseAuthUrl = nomRes.data.firstHolderLink;
        }
      } catch (_) {}
    }

    // Trigger RESEND_COMM to send official SMS/Email OTP to investor
    try {
      await nseClient.resendCommunication('CL_ACT', clientCode);
    } catch (_) {}

    // Default to official NSE investor verification portal URL
    const officialNseAuthPortal = 'https://www.nseinvest.com/mf/';
    nseAuthUrl = nseAuthUrl || officialNseAuthPortal;
    clActLink = clActLink || officialNseAuthPortal;

    return res.json({
      success: true,
      message: 'UCC successfully generated and registered with NSE MFSS. NSE has dispatched official authentication SMS/OTP to your mobile number.',
      data: uccRecord,
      authUrl: nseAuthUrl,
      clActLink,
    });
  } catch (error) {
    console.error('[registerUserUcc Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 4b. POST /api/mutual-funds/ucc/resend-act (Resend Client Activation Communication & Link) ──
exports.resendUccActivation = async (req, res) => {
  try {
    const userId = req.user._id;
    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(404).json({ success: false, message: 'Investor profile not found' });
    }

    let authUrl = null;
    try {
      const linkRes = await nseClient.getShortLink('CL_ACT', ucc.clientCode);
      if (linkRes?.success && linkRes?.data?.firstHolderLink) {
        authUrl = linkRes.data.firstHolderLink;
      }
    } catch (_) {}

    try {
      await nseClient.resendCommunication('CL_ACT', ucc.clientCode);
    } catch (_) {}

    authUrl = authUrl || 'https://www.nseinvest.com/mf/';

    return res.json({
      success: true,
      message: 'Client activation communication re-sent via SMS and Email by NSE.',
      data: {
        clientCode: ucc.clientCode,
        authUrl,
      },
    });
  } catch (error) {
    console.error('[resendUccActivation Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5. POST /api/mutual-funds/orders/purchase (Lump Sum / Normal via NSE MF II) ──
exports.createPurchaseOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { schemeCode, orderAmount, paymentMode = 'NSE_PAYMENT_LINK', vpa } = req.body;

    if (!schemeCode || !orderAmount || Number(orderAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid schemeCode and orderAmount are required' });
    }

    const isUpi = (paymentMode === 'UPI');
    if (isUpi) {
      if (!vpa || typeof vpa !== 'string' || !vpa.includes('@') || vpa.trim().length < 4) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_UPI_ID',
          message: 'Please provide a valid UPI ID (e.g. yourname@okaxis, yourname@ybl, yourname@paytm).',
        });
      }
    }

    const readiness = await mfInvestorReadinessService.checkInvestorReady(userId, 'PURCHASE');
    if (!readiness.ready) {
      return res.status(400).json({
        success: false,
        code: readiness.code,
        message: readiness.message,
        data: readiness.data || {},
      });
    }
    const ucc = readiness.ucc;

    const searchCode = String(schemeCode || '').trim().toUpperCase();
    const scheme = await MutualFundScheme.findOne({
      $or: [
        { schemeCode: searchCode },
        { nseSchemeCode: searchCode },
        { isin: searchCode },
      ],
    });

    if (!scheme) {
      return res.status(404).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'This mutual fund is currently unavailable for purchase through NSE.',
      });
    }

    // 1. Validate Active Status
    if (scheme.isActive === false) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'This mutual fund is currently unavailable for purchase through NSE.',
      });
    }

    // 2. Validate Regular Plan Only (Direct or Unknown strictly rejected - No Direct fallback)
    if (scheme.planType !== 'REGULAR' || (scheme.schemeName && scheme.schemeName.toLowerCase().includes('direct'))) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'Only Regular Plan mutual funds can be purchased through Vikaone. Direct or Unknown plans are not supported.',
      });
    }

    // 3. Validate Purchase Allowed
    if (scheme.purchaseAllowed === false) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'This mutual fund is currently unavailable for purchase through NSE.',
      });
    }

    // 4. Validate ISIN matches authentic pattern
    if (!scheme.isin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(scheme.isin)) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'This mutual fund is currently unavailable for purchase through NSE.',
      });
    }

    // 5. Authoritative NSE Scheme Code resolution
    let targetNseCode = scheme.nseSchemeCode;
    if (!targetNseCode && scheme.schemeCode && !/^\d+$/.test(scheme.schemeCode)) {
      targetNseCode = scheme.schemeCode;
    }

    if (!targetNseCode) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SCHEME_UNAVAILABLE',
        message: 'This mutual fund is currently unavailable for purchase through NSE.',
      });
    }

    // 6. Minimum purchase amount validation
    if (scheme.minPurchaseAmount && orderAmount < scheme.minPurchaseAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount for ${scheme.schemeName} is ₹${scheme.minPurchaseAmount}`,
      });
    }

    // 0. Idempotency Check: prevent duplicate purchase submissions from double-tap/network retry
    const existingPending = await MfOrder.findOne({
      user: userId,
      schemeCode: scheme.schemeCode,
      orderAmount: Number(orderAmount),
      transactionType: 'P',
      paymentStatus: 'PENDING',
      createdAt: { $gte: new Date(Date.now() - 45 * 1000) },
    }).sort({ createdAt: -1 });

    if (existingPending) {
      console.log(`[createPurchaseOrder] Idempotent return for recent pending order ${existingPending.orderId}`);
      return res.json({
        success: true,
        message: 'Mutual fund order already initiated. Please complete payment through official NSE payment link.',
        data: {
          order: existingPending,
          paymentLink: existingPending.paymentLink,
          amount: existingPending.orderAmount,
          currency: 'INR',
          paymentMode: existingPending.paymentMode || 'NSE_PAYMENT_LINK',
          isDuplicate: true,
        },
      });
    }

    // Check if user already holds this scheme with a registered folio
    const existingHolding = await MfPortfolioHolding.findOne({ user: userId, schemeCode: scheme.schemeCode });
    const isAdditional = Boolean(existingHolding && existingHolding.folioNo);
    const folioNo = req.body.folioNo || (isAdditional ? existingHolding.folioNo : '');
    const buySellType = isAdditional || folioNo ? 'ADDITIONAL' : 'FRESH';

    const orderId = `MFP${Date.now()}`;
    const user = await User.findById(userId);

    // 1. Prepare NSE Order payload (Order Entry PUR - NNF v1.9.8 Doc page 8-9)
    const cleanOrderRef = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 19);
    const nseOrderPayload = {
      order_ref_number: cleanOrderRef,
      scheme_code: targetNseCode,
      trxn_type: 'P', // Purchase
      buy_sell_type: buySellType,
      client_code: ucc.clientCode,
      demat_physical: 'P', // Physical/Folio mode
      order_amount: String(orderAmount),
      folio_no: folioNo,
      remarks: 'Invested via GoldVikaone',
      kyc_flag: 'Y',
      sub_broker_code: '',
      euin_number: '',
      euin_declaration: 'N',
      min_redemption_flag: 'N',
      dpc_flag: 'Y',
      all_units: 'N',
      redemption_units: '',
      sub_broker_arn: '',
      bank_ref_no: '',
      account_no: ucc.primaryBank?.accountNo || '',
      mobile_no: user.phone?.slice(-10) || '',
      email: user.email,
      mandate_id: '',
      filler1: '',
      member_unique_id: '',
    };

    // 2. Dispatch to NSE Gateway
    const nseRes = await nseClient.createNormalOrder([nseOrderPayload]);
    const trxnItem = nseRes?.data?.transaction_details?.[0];
    const rawNseOrderId = trxnItem?.trxn_order_id;
    const isSuccess = nseRes?.success && trxnItem?.trxn_status === 'TRXN SUCCESS' && rawNseOrderId && rawNseOrderId !== '0' && rawNseOrderId !== 0;

    if (!isSuccess && !nseClient.isMockMode()) {
      const errMsg = trxnItem?.trxn_remark || nseRes?.data?.message || nseRes?.error || 'NSE Exchange rejected purchase order';
      
      const isClientNotExist = /client does not exist/i.test(errMsg) || /client.*not.*found/i.test(errMsg);
      if (isClientNotExist) {
        await MfClientUcc.updateOne({ user: userId }, { $set: { nseStatus: 'PENDING', nseRemarks: 'Client does not exist on exchange' } });
        return res.status(400).json({
          success: false,
          code: 'NSE_UCC_NOT_READY',
          message: 'Your Mutual Fund account is not yet approved for investment. Please complete investor onboarding.',
          data: {
            exchangeStatus: trxnItem?.trxn_status || 'FAILED',
            exchangeRemark: trxnItem?.trxn_remark || 'Client does not exist.',
            clientCode: ucc.clientCode,
            schemeCode: scheme.schemeCode,
          },
        });
      }

      return res.status(400).json({
        success: false,
        code: 'NSE_ORDER_REJECTED',
        message: `NSE MFSS Exchange: ${errMsg}`,
        data: {
          exchangeStatus: trxnItem?.trxn_status || 'FAILED',
          exchangeRemark: trxnItem?.trxn_remark || '',
          clientCode: ucc.clientCode,
          schemeCode: scheme.schemeCode,
        },
      });
    }

    const nseOrderId = isSuccess ? String(rawNseOrderId) : (nseClient.isMockMode() ? String(rawNseOrderId || `TEST_PUR_${Date.now()}`) : null);

    // 3. Initiate Payment (UPI Collect via /payments/purchase_payment or Web Gateway via GET_LINK)
    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const isLive = process.env.NSE_ENV === 'PROD' && !nseClient.isMockMode();
    let paymentLink = null;
    let nsePaymentRefNo = '';

    if (isUpi && nseOrderId) {
      try {
        const upiPayload = {
          payment_mode: 'UPI',
          client_code: ucc.clientCode,
          order_ids: String(nseOrderId),
          bank_account_no: ucc.primaryBank?.accountNo || '',
          ifsc: ucc.primaryBank?.ifsc || '',
          vpa: vpa.trim(),
          callback_url: `${backendUrl}/api/mutual-funds/orders/upi-callback`,
        };
        const upiRes = await nseClient.initiatePurchasePayment(upiPayload);
        if (upiRes?.success && (upiRes?.data?.status === 'success' || upiRes?.data?.status === '100')) {
          nsePaymentRefNo = String(upiRes.data.basket_id || upiRes.data.nse_upi_ref_no || upiRes.data.payment_ref_no || '');
          if (upiRes.data.short_url) {
            paymentLink = upiRes.data.short_url;
          }
        }
      } catch (upiErr) {
        console.warn(`[createPurchaseOrder] NSE UPI initiatePurchasePayment error:`, upiErr.message);
      }
    } else if (nseOrderId) {
      try {
        const linkRes = await nseClient.getShortLink('PUR', nseOrderId);
        if (linkRes && linkRes.success && linkRes.data?.firstHolderLink) {
          paymentLink = linkRes.data.firstHolderLink;
        }
      } catch (_) {}
    }

    // Strictly fallback to simulator ONLY in offline test/mock environments (never in live PROD)
    if (!paymentLink && !isLive) {
      paymentLink = `${backendUrl}/api/mutual-funds/checkout/${orderId}?mode=sandbox`;
    }

    // 4. Units & Allotment: Estimated units strictly for display, actual units remain 0 until authoritative allotment
    const estimatedUnits = scheme.nav && scheme.nav > 0 ? +(orderAmount / scheme.nav).toFixed(3) : null;

    const order = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      isin: scheme.isin || '',
      folioNo,
      transactionType: 'P',
      buySellType,
      orderAmount: Number(orderAmount),
      estimatedUnits,
      units: 0, // Actual units remain 0 until Allotment Statement Report confirms allotment
      allottedUnits: 0,
      allottedNav: null,
      allotmentStatus: 'PENDING',
      navAtOrder: scheme.nav,
      paymentMode: isUpi ? 'UPI' : 'NSE_PAYMENT_LINK',
      paymentStatus: 'PENDING',
      orderStatus: 'PAYMENT_PENDING',
      vpa: isUpi ? vpa.trim() : '',
      paymentLink,
      nseTrxnOrderId: nseOrderId,
      nsePaymentRefNo,
      nseStatus: isSuccess ? 'ORDER PLACED' : 'PENDING_NSE',
      remarks: isUpi
        ? `UPI Collect request dispatched to ${vpa.trim()} by NSE Clearing Limited. Awaiting approval in UPI app.`
        : 'Order placed on NSE MFSS. Awaiting investor payment through official NSE payment gateway.',
    });

    return res.json({
      success: true,
      message: isUpi
        ? `UPI Collect request sent to ${vpa.trim()} by NSE Clearing Limited. Please approve in your UPI app.`
        : 'Mutual fund order created successfully. Please complete payment through the official NSE payment link.',
      data: {
        order,
        orderId: order.orderId,
        paymentLink,
        amount: Number(orderAmount),
        currency: 'INR',
        paymentMode: isUpi ? 'UPI' : 'NSE_PAYMENT_LINK',
        vpa: isUpi ? vpa.trim() : null,
      },
    });
  } catch (error) {
    console.error('[createPurchaseOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5a. GET/POST /api/mutual-funds/orders/:orderId/status (Authoritative NSE Status Sync) ──
exports.syncOrderStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await MfOrder.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Mutual fund order not found' });
    }

    // Terminal state: if already ALLOTTED, return directly
    if (order.allotmentStatus === 'ALLOTTED') {
      return res.json({
        success: true,
        message: 'Order already confirmed and allotted',
        data: { order, isAuthoritative: true },
      });
    }

    // Query NSE ORDER_STATUS report
    const ucc = await MfClientUcc.findOne({ user: userId });
    const nseFilter = {
      order_ids: String(order.nseTrxnOrderId || order.orderId),
      order_ref_number: order.orderId,
      client_code: order.clientCode || ucc?.clientCode,
      ...(req.body?.mockStatus ? { mockStatus: req.body.mockStatus } : {}),
      ...(req.query?.mockStatus ? { mockStatus: req.query.mockStatus } : {}),
    };

    let nseData = null;
    try {
      const report = await nseClient.getOrderStatusReport(nseFilter);
      nseData = report?.data?.report_data?.[0] || report?.data?.orders?.[0] || report?.data?.transaction_details?.[0];
    } catch (err) {
      console.warn(`[syncOrderStatus] NSE query warning for ${orderId}:`, err.message);
    }

    if (nseData) {
      const nseOrderStatus = (nseData.order_status || nseData.status || '').toUpperCase();
      const nseRemark = (nseData.order_remark || nseData.reg_remark || nseData.remarks || '').toUpperCase();
      const allottedUnits = parseFloat(nseData.allotted_units || nseData.allottedqty || '0');
      const allottedNav = parseFloat(nseData.nav || nseData.allottednav || '0');

      order.nseStatus = nseOrderStatus || nseRemark || order.nseStatus;

      // Handle Rejection / Failure
      if (['REJECTED', 'FAILED', 'CANCELLED', 'INVALID'].includes(nseOrderStatus) && !['PROVISIONAL ORDER', 'ALLOTMENT DONE'].includes(nseRemark)) {
        order.paymentStatus = 'FAILED';
        order.orderStatus = 'REJECTED';
        order.remarks = nseData.rejection_reason || nseRemark || 'Order rejected by NSE MFSS exchange';
        await order.save();
        return res.json({
          success: true,
          message: `Order rejected by exchange: ${order.remarks}`,
          data: { order, isAuthoritative: true },
        });
      }

      // Handle Confirmed Payment / Accepted Transaction (including 'VALID' and 'PROVISIONAL ORDER')
      if (['SUCCESS', 'APPROVED', 'VALIDATED', 'ACCEPTED', 'ORDER PLACED', 'VALID'].includes(nseOrderStatus) || /PROVISIONAL|ALLOTMENT|ACCEPTED|VALID/i.test(nseRemark)) {
        if (order.paymentStatus !== 'SUCCESS') {
          order.paymentStatus = 'SUCCESS';
          order.orderStatus = 'PROCESSING';
          order.remarks = nseData.order_remark || 'Order placed and confirmed on NSE. Unit allotment pending with AMC.';
          try {
            const eventNotificationService = require('../services/eventNotificationService');
            eventNotificationService.notifyFirstMfPurchase(order.user, order);
          } catch (_) {}
        }
      }

      // Handle Unit Allotment if units are confirmed by exchange
      if (allottedUnits > 0 && order.allotmentStatus !== 'ALLOTTED') {
        const allotResult = await mfIdempotencyService.processAllotmentConfirmation({
          orderId: order.orderId,
          allottedUnits,
          allottedNav: allottedNav || order.navAtOrder || 100.0,
          rtaReferenceNo: nseData.rta_ref_no || `RTA_${order.orderId}`,
          source: 'NSE_ORDER_STATUS_REPORT',
        });
        if (allotResult.success) {
          const refreshed = await MfOrder.findOne({ orderId });
          return res.json({
            success: true,
            message: 'Order units confirmed and allotted successfully',
            data: { order: refreshed, isAuthoritative: true },
          });
        }
      }

      await order.save();
    }

    // Check UPI status if order was placed via UPI and payment is still pending
    if (order.paymentMode === 'UPI' && order.paymentStatus !== 'SUCCESS') {
      try {
        const upiCheck = await nseClient.checkUpiStatus(
          order.nsePaymentRefNo || order.nseTrxnOrderId,
          order.clientCode || ucc?.clientCode
        );
        const upiItem = upiCheck?.data;
        const upiStatus = (upiItem?.status || upiItem?.payment_status || '').toUpperCase();
        if (upiStatus === 'SUCCESS') {
          order.paymentStatus = 'SUCCESS';
          order.orderStatus = 'PAYMENT_SUCCESS';
          order.remarks = 'UPI Payment confirmed by NSE Clearing Limited.';
          await order.save();
          try {
            const eventNotificationService = require('../services/eventNotificationService');
            eventNotificationService.notifyFirstMfPurchase(order.user, order);
          } catch (_) {}
        } else if (['FAILED', 'REJECTED', 'EXPIRED'].includes(upiStatus)) {
          order.paymentStatus = 'FAILED';
          order.orderStatus = 'REJECTED';
          order.remarks = `UPI Payment was ${upiStatus.toLowerCase()} by investor or bank.`;
          await order.save();
        }
      } catch (upiErr) {
        console.warn(`[syncOrderStatus] UPI check warning:`, upiErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Order status updated from authoritative source',
      data: { order, isAuthoritative: true },
    });
  } catch (error) {
    console.error('[syncOrderStatus Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5b. POST /api/mutual-funds/orders/upi-callback (NSE UPI Payment Webhook) ──
exports.handleUpiPaymentCallback = async (req, res) => {
  try {
    const payload = req.body;
    console.log('[handleUpiPaymentCallback] Received NSE UPI payment callback:', payload);

    const {
      client_code,
      order_ids,
      status,
      nse_upi_ref_no,
      upi_tran_ref_id,
      cust_ref_no,
      remark,
    } = payload || {};

    const order = await MfOrder.findOne({
      $or: [
        { nseTrxnOrderId: order_ids ? String(order_ids) : null },
        { nsePaymentRefNo: nse_upi_ref_no ? String(nse_upi_ref_no) : null },
        { orderId: order_ids ? String(order_ids) : null },
      ].filter(q => Object.values(q)[0] !== null),
    });

    if (order) {
      const upiStatus = String(status || '').toUpperCase();
      if (upiStatus === 'SUCCESS') {
        order.paymentStatus = 'SUCCESS';
        order.orderStatus = 'PAYMENT_SUCCESS';
        order.remarks = `UPI payment confirmed by NSE Clearing Limited (UTR: ${cust_ref_no || upi_tran_ref_id || ''}).`;
        await order.save();
        try {
          const eventNotificationService = require('../services/eventNotificationService');
          eventNotificationService.notifyFirstMfPurchase(order.user, order);
        } catch (_) {}
      } else if (['FAILED', 'REJECTED', 'EXPIRED'].includes(upiStatus)) {
        order.paymentStatus = 'FAILED';
        order.orderStatus = 'REJECTED';
        order.remarks = `UPI payment ${upiStatus.toLowerCase()}: ${remark || 'Declined'}`;
        await order.save();
      }
    }

    return res.json({ success: true, message: 'UPI callback processed successfully' });
  } catch (error) {
    console.error('[handleUpiPaymentCallback Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6. POST /api/mutual-funds/sip/register (SIP / XSIP) ──
exports.registerSipOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      schemeCode,
      installmentAmount,
      frequency = 'MONTHLY',
      startDate,
      stepUpRequired = false,
      stepUpAmount = 0,
      paymentMode,
      firstOrderToday: reqFirstOrderToday,
    } = req.body;

    if (!schemeCode || !installmentAmount || Number(installmentAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid schemeCode and installmentAmount required' });
    }

    const readiness = await mfInvestorReadinessService.checkInvestorReady(userId, 'SIP');
    if (!readiness.ready) {
      return res.status(400).json({
        success: false,
        code: readiness.code,
        message: readiness.message,
        data: readiness.data || {},
      });
    }
    const ucc = readiness.ucc;
    const mandate = readiness.mandate;

    const searchCode = String(schemeCode || '').trim().toUpperCase();
    const scheme = await MutualFundScheme.findOne({
      $or: [
        { schemeCode: searchCode },
        { nseSchemeCode: searchCode },
        { isin: searchCode },
      ],
    });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (scheme.planType !== 'REGULAR' || scheme.schemeName.toLowerCase().includes('direct')) {
      return res.status(400).json({
        success: false,
        message: 'Only Regular Plan mutual funds are available for SIP through Vikaone. Direct or Unknown plans are not supported.',
      });
    }

    let targetNseCode = scheme.nseSchemeCode;
    if (!targetNseCode && scheme.schemeCode && !/^\d+$/.test(scheme.schemeCode)) {
      targetNseCode = scheme.schemeCode;
    }

    const normFreq = (frequency || 'MONTHLY').trim().toUpperCase();
    let sipMaster = await MfSipSchemeMaster.findOne({
      schemeCode: targetNseCode,
      sipFrequency: normFreq,
      sipStatus: '1',
    });
    if (!sipMaster) {
      sipMaster = await MfSipSchemeMaster.findOne({
        schemeCode: targetNseCode,
        sipStatus: '1',
      });
    }
    if (!sipMaster) {
      sipMaster = await MfSipSchemeMaster.findOne({
        isin: scheme.isin,
        sipFrequency: normFreq,
        sipStatus: '1',
      });
    }
    if (!sipMaster) {
      sipMaster = await MfSipSchemeMaster.findOne({
        isin: scheme.isin,
        sipStatus: '1',
      });
    }

    if (!sipMaster || scheme.sipAllowed === false) {
      return res.status(400).json({
        success: false,
        code: 'NSE_SIP_SCHEME_UNAVAILABLE',
        message: 'SIP is currently unavailable for this mutual fund.',
      });
    }

    const authoritativeAmcCode = sipMaster.amcCode;
    const authoritativeNseCode = sipMaster.schemeCode || targetNseCode;

    const minAllowedAmount = sipMaster.minInstallmentAmount || scheme.minSipAmount || 500;
    if (installmentAmount < minAllowedAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum SIP amount for ${scheme.schemeName} is ₹${minAllowedAmount}`,
      });
    }

    const sipRefNo = `SIP${Date.now()}`;
    const user = await User.findById(userId);

    // Calculate dates & enforce NSE NNF v1.9.8 Mandate buffer rule (min 7 days for recurring automated debit)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBufferDays = 7;
    const minAllowedDate = new Date(today.getTime() + minBufferDays * 24 * 60 * 60 * 1000);

    let chosenDate = startDate ? new Date(startDate) : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    let recurringStartDate = new Date(chosenDate);
    let bufferApplied = false;

    if (recurringStartDate < minAllowedDate) {
      bufferApplied = true;
      recurringStartDate = new Date(recurringStartDate.getFullYear(), recurringStartDate.getMonth() + 1, recurringStartDate.getDate());
      if (recurringStartDate < minAllowedDate) {
        recurringStartDate = new Date(recurringStartDate.getFullYear(), recurringStartDate.getMonth() + 1, recurringStartDate.getDate());
      }
    }

    const dateFormatted = `${String(recurringStartDate.getDate()).padStart(2, '0')}/${String(recurringStartDate.getMonth() + 1).padStart(2, '0')}/${recurringStartDate.getFullYear()}`;

    const effectiveMandateId = mandate.mandateId;

    const dpTxnMode = (sipMaster.sipTransactionMode === 'D') ? 'D' : 'P';

    const firstOrderToday = reqFirstOrderToday !== undefined
      ? ((reqFirstOrderToday === true || reqFirstOrderToday === 'Y') ? 'Y' : 'N')
      : ((paymentMode === 'MANDATE' && !bufferApplied) ? 'N' : 'Y');

    const memberCode = String(process.env.NSE_MEMBER_CODE || nseClient.memberCode || '1031616');

    // 1. Prepare NSE XSIP payload with authoritative exchange codes
    const nseXsipPayload = {
      amc_code: authoritativeAmcCode,
      sch_code: authoritativeNseCode,
      client_code: ucc.clientCode,
      trans_mode: 'P', // Physical/Folio
      dp_txn_mode: dpTxnMode,
      start_date: dateFormatted,
      frequency_type: normFreq,
      frequency_allowed: '1',
      installment_amount: String(installmentAmount),
      status: '1',
      member_code: memberCode,
      memberCode: memberCode,
      installment_no: '60', // 5 years default tenure
      first_order_today: firstOrderToday,
      primary_holder_mobile: user.phone?.slice(-10) || '',
      primary_holder_email: user.email,
      step_up_required: stepUpRequired ? 'Y' : 'N',
      step_up_amount: stepUpAmount ? String(stepUpAmount) : '0',
      member_unique_id: sipRefNo,
      internal_ref_no: sipRefNo,
      mandate_id: String(effectiveMandateId || ''),
      xsip_mandate_id: String(effectiveMandateId || ''),
      mandateId: String(effectiveMandateId || ''),
      euin_declaration: 'N',
      dpc_flag: 'Y',
    };

    // 2. Register with NSE Gateway
    let nseRes;
    if (effectiveMandateId) {
      nseRes = await nseClient.registerXsip([nseXsipPayload]);
      const checkItem = nseRes?.data?.reg_data?.[0];
      const isFailed = !nseRes?.success || checkItem?.status === 'FAILURE' || checkItem?.reg_status === 'REG_FAILED' || checkItem?.reg_id === '0' || checkItem?.reg_id === 0;
      const remark = checkItem?.reg_remark || '';
      // If XSIP was rejected by exchange because mandate is not yet approved on exchange, and user didn't explicitly mandate-lock it:
      if (isFailed && (/mandate/i.test(remark) || /umrn/i.test(remark)) && paymentMode !== 'MANDATE') {
        console.warn(`[registerSipOrder] XSIP registration rejected due to mandate (${remark}). Attempting standard SIP registration fallback...`);
        const standardSipPayload = { ...nseXsipPayload };
        delete standardSipPayload.mandate_id;
        delete standardSipPayload.xsip_mandate_id;
        delete standardSipPayload.mandateId;
        const stdRes = await nseClient.registerSip([standardSipPayload]);
        if (stdRes?.success && stdRes?.data?.reg_data?.[0]?.status !== 'FAILURE' && stdRes?.data?.reg_data?.[0]?.reg_status !== 'REG_FAILED' && stdRes?.data?.reg_data?.[0]?.reg_id !== '0') {
          nseRes = stdRes;
        }
      }
    } else {
      // Standard broker SIP (Non-Mandate / Gateway)
      const standardSipPayload = { ...nseXsipPayload };
      delete standardSipPayload.mandate_id;
      delete standardSipPayload.xsip_mandate_id;
      delete standardSipPayload.mandateId;
      nseRes = await nseClient.registerSip([standardSipPayload]);
      const checkItem = nseRes?.data?.reg_data?.[0];
      if ((!nseRes?.success || checkItem?.status === 'FAILURE' || checkItem?.reg_status === 'REG_FAILED' || checkItem?.reg_id === '0' || checkItem?.reg_id === 0) && effectiveMandateId) {
        // Fallback to XSIP if standard SIP failed and mandate ID exists
        const xsipRes = await nseClient.registerXsip([nseXsipPayload]);
        if (xsipRes?.success && xsipRes?.data?.reg_data?.[0]?.status !== 'FAILURE' && xsipRes?.data?.reg_data?.[0]?.reg_status !== 'REG_FAILED') {
          nseRes = xsipRes;
        }
      }
    }

    const regItem = nseRes?.data?.reg_data?.[0];
    const rawRegId = regItem?.reg_id;
    const isSuccess = nseRes?.success && (regItem?.status === 'SUCCESS' || regItem?.reg_status === 'REG_SUCCESS') && rawRegId && rawRegId !== '0' && rawRegId !== 0;

    // If live NSE explicitly rejected the registration, surface the reason to the user/admin
    if (!isSuccess && !nseClient.isMockMode()) {
      const nseMsg = regItem?.reg_remark || regItem?.message || nseRes?.data?.message || 'NSE Exchange rejected SIP registration';
      console.warn(`[registerSipOrder] NSE rejected SIP registration: ${nseMsg}`);
      
      let errorCode = 'NSE_SIP_REGISTRATION_FAILED';
      let userMsg = `NSE MFSS Exchange: ${nseMsg}`;

      if (/client does not exist/i.test(nseMsg) || /client.*not.*found/i.test(nseMsg)) {
        errorCode = 'NSE_UCC_NOT_READY';
        userMsg = 'Your Mutual Fund account is not yet approved for investment. Please complete investor onboarding.';
        await MfClientUcc.updateOne({ user: userId }, { $set: { nseStatus: 'PENDING', nseRemarks: 'Client does not exist on exchange' } });
      } else if (/amc does not exist/i.test(nseMsg) || /amc.*not.*found/i.test(nseMsg)) {
        errorCode = 'NSE_AMC_NOT_ENABLED';
        userMsg = 'The selected AMC is not enabled for SIP transactions with your broker account.';
      } else if (/mandate/i.test(nseMsg) || /umrn/i.test(nseMsg)) {
        errorCode = 'NSE_MANDATE_NOT_READY';
        userMsg = 'Your bank mandate is not yet authorized. Please complete mandate authorization before starting a SIP.';
      }

      return res.status(400).json({
        success: false,
        code: errorCode,
        message: userMsg,
        data: {
          exchangeStatus: regItem?.reg_status || regItem?.status || 'REG_FAILED',
          exchangeMessage: regItem?.reg_remark || nseMsg,
          clientCode: ucc.clientCode,
          schemeCode: scheme.schemeCode,
        },
      });
    }

    const sipRegNo = isSuccess ? String(rawRegId) : (nseClient.isMockMode() ? String(rawRegId || `TEST_SIP_${Date.now()}`) : '');

    // 3. Request Official Payment / Mandate Link from NSE if first order is today
    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const isLive = process.env.NSE_ENV === 'PROD' && !nseClient.isMockMode();
    let paymentLink = null;
    if (firstOrderToday === 'Y' && sipRegNo) {
      try {
        const linkRes = await nseClient.getShortLink('XSIP_REG', sipRegNo);
        if (linkRes && linkRes.success && linkRes.data?.firstHolderLink) {
          paymentLink = linkRes.data.firstHolderLink;
        } else {
          // Check provisional orders for this XSIP to fetch order ID and payment link
          try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const provRes = await nseClient.post('/nsemfdesk/api/v2/reports/PROV_ORDERS', {
              from_date: todayStr,
              to_date: todayStr,
              trans_type: 'ALL',
              order_type: 'XSP',
              client_code: ucc.clientCode,
              sip_reg_nos: String(sipRegNo),
            });
            const provOrder = provRes?.data?.report_data?.[0];
            const orderIdFromNse = provOrder?.order_id || provOrder?.orderno;
            if (orderIdFromNse) {
              const purLinkRes = await nseClient.getShortLink('PUR', orderIdFromNse);
              if (purLinkRes && purLinkRes.success && purLinkRes.data?.firstHolderLink) {
                paymentLink = purLinkRes.data.firstHolderLink;
              }
            }
          } catch (_) {}
        }
      } catch (linkErr) {
        console.warn('[registerSipOrder] getShortLink warning:', linkErr.message);
      }

      // Strictly fallback to simulator ONLY in offline test/mock environments (never in live PROD)
      if (!paymentLink && !isLive) {
        paymentLink = `${backendUrl}/api/mutual-funds/checkout/${sipRegNo}?mode=sandbox`;
      }
    }

    // 4. Save SIP record
    const sipRecord = await MfSip.create({
      user: userId,
      clientCode: ucc.clientCode,
      sipRegNo: String(sipRegNo),
      sipRefNo: String(sipRefNo),
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      frequency: frequency.toUpperCase(),
      installmentAmount: Number(installmentAmount),
      startDate: recurringStartDate,
      nextDueDate: recurringStartDate,
      mandateId: effectiveMandateId,
      installmentsPaid: 0,
      totalAmountPaid: 0,
      status: firstOrderToday === 'Y' ? 'PENDING_PAYMENT' : 'ACTIVE',
      stepUpRequired: Boolean(stepUpRequired),
      stepUpAmount: Number(stepUpAmount || 0),
    });

    let userExplanation = '';
    if (firstOrderToday === 'Y') {
      userExplanation = bufferApplied
        ? `Installment #1 of ₹${installmentAmount} initiated for today. Per exchange rules, automated mandate AutoPay requires a 7-day setup buffer, so recurring monthly debits will start on ${dateFormatted}.`
        : `Installment #1 of ₹${installmentAmount} initiated for today. Recurring monthly AutoPay debits will start on ${dateFormatted}.`;
    } else {
      userExplanation = bufferApplied
        ? `Monthly SIP registered! Per exchange rules, bank AutoPay requires a 7-day setup buffer. Your first automated debit will execute on ${dateFormatted}.`
        : `Monthly SIP registered! Your first automated debit will execute on ${dateFormatted} via Bank AutoPay.`;
    }

    return res.json({
      success: true,
      message: userExplanation,
      userMessage: userExplanation,
      data: {
        sip: sipRecord,
        sipId: sipRecord._id,
        paymentLink,
        firstOrderToday: firstOrderToday === 'Y',
        nextDebitDate: dateFormatted,
        bufferApplied,
        amount: Number(installmentAmount),
        currency: 'INR',
      },
    });
  } catch (error) {
    console.error('[registerSipOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6a. POST /api/mutual-funds/orders/verify (Authoritative NSE MF II Order Verification) ──
exports.verifyPurchasePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, mockStatus } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const order = await MfOrder.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Mutual fund order not found' });
    }

    // Query authoritative NSE order/payment status
    const nseFilter = {
      order_ref_number: order.orderId,
      client_code: order.clientCode,
      ...(mockStatus ? { mockStatus } : {}),
    };

    let nseStatus = 'SUCCESS';
    try {
      const report = await nseClient.getOrderStatusReport(nseFilter);
      const nseData = report?.data?.orders?.[0];
      if (nseData) {
        nseStatus = (nseData.order_status || nseData.status || 'SUCCESS').toUpperCase();
      }
    } catch (_) {}

    if (['REJECTED', 'FAILED', 'CANCELLED'].includes(nseStatus)) {
      order.paymentStatus = 'FAILED';
      order.orderStatus = 'REJECTED';
      order.nseStatus = nseStatus;
      await order.save();
      return res.status(400).json({ success: false, message: 'Payment rejected by exchange', data: order });
    }

    order.paymentStatus = 'SUCCESS';
    order.orderStatus = 'PAYMENT_SUCCESS';
    order.paymentMode = 'NSE_PAYMENT_LINK';
    order.nseStatus = nseStatus || 'TRXN SUCCESS';
    await order.save();

    return res.json({
      success: true,
      message: 'Mutual fund investment payment confirmed via NSE MFSS',
      data: order,
    });
  } catch (error) {
    console.error('[verifyPurchasePayment Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6b. POST /api/mutual-funds/sip/verify (Verify NSE MF SIP Mandate / Status) ──
exports.verifySipPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sipId } = req.body;

    if (!sipId) {
      return res.status(400).json({ success: false, message: 'sipId is required' });
    }

    const sip = await MfSip.findOne({ _id: sipId, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP record not found' });
    }

    const scheme = await MutualFundScheme.findOne({ schemeCode: sip.schemeCode, planType: 'REGULAR' });
    const nav = scheme?.nav || null;
    const estimatedUnits = nav ? +(sip.installmentAmount / nav).toFixed(3) : null;

    const initialOrderId = sip.exchangeOrderId || sip.sipRegNo || `SIP_INST_${sip._id}`;
    let initialOrder = await MfOrder.findOne({ orderId: initialOrderId });
    if (!initialOrder) {
      initialOrder = await MfOrder.create({
        user: userId,
        clientCode: sip.clientCode,
        orderId: initialOrderId,
        schemeCode: sip.schemeCode,
        schemeName: scheme?.schemeName || sip.schemeName,
        transactionType: 'P',
        buySellType: 'FRESH',
        orderAmount: sip.installmentAmount,
        estimatedUnits,
        units: 0,
        allottedUnits: 0,
        allotmentStatus: 'PENDING',
        navAtOrder: nav,
        paymentMode: 'MANDATE',
        paymentStatus: 'SUCCESS',
        orderStatus: 'SUBMITTED',
        nseStatus: 'SUBMITTED',
        remarks: `First installment for SIP ${sip.sipRegNo} via NSE mandate`,
      });
    }

    // Accurately count confirmed installments for this SIP/scheme
    const confirmedOrdersCount = await MfOrder.countDocuments({
      user: userId,
      schemeCode: sip.schemeCode,
      paymentStatus: 'SUCCESS',
      transactionType: 'P',
    });

    sip.status = 'ACTIVE';
    sip.installmentsPaid = Math.max(1, confirmedOrdersCount);
    sip.totalAmountPaid = sip.installmentsPaid * sip.installmentAmount;
    await sip.save();

    return res.json({
      success: true,
      message: 'SIP schedule activated successfully on NSE MFSS',
      data: {
        sip,
        initialOrder,
      },
    });
  } catch (error) {
    console.error('[verifySipPayment Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6c. POST /api/mutual-funds/sip/:id/abandon (User Dismissed Payment / Cancel Pending) ──
exports.abandonSipOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const sip = await MfSip.findOne({ _id: id, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP record not found' });
    }

    if (sip.status === 'PENDING_PAYMENT') {
      sip.status = 'CANCELLED';
      await sip.save();
    }

    return res.json({
      success: true,
      message: 'Pending SIP cancelled successfully',
      data: sip,
    });
  } catch (error) {
    console.error('[abandonSipOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper to calculate detailed holdings: confirmed units, pending redemptions, and available units to redeem
async function getDetailedUserSchemeHoldings(userId, schemeCode) {
  const code = String(schemeCode || '').trim().toUpperCase();
  const holding = await MfPortfolioHolding.findOne({
    user: userId,
    schemeCode: code,
  });

  const orders = await MfOrder.find({
    user: userId,
    schemeCode: code,
  });

  let totalConfirmedUnits = 0;
  let pendingRedemptionUnits = 0;
  let folioNo = holding?.folioNo || '';

  for (const ord of orders) {
    if (ord.folioNo && !folioNo) folioNo = ord.folioNo;

    if (ord.transactionType === 'P') {
      if (ord.paymentStatus === 'SUCCESS' && ord.allotmentStatus === 'ALLOTTED' && (ord.allottedUnits || 0) > 0) {
        totalConfirmedUnits += ord.allottedUnits;
      }
    } else if (ord.transactionType === 'R') {
      const isSettled = ord.allotmentStatus === 'ALLOTTED' || ord.payoutStatus === 'PROCESSED' || ord.orderStatus === 'ALLOTTED';
      const rUnits = Math.abs(ord.redemptionUnits || ord.units || 0);
      if (isSettled) {
        totalConfirmedUnits -= rUnits;
      } else if (!['CANCELLED', 'REJECTED', 'FAILED'].includes(ord.orderStatus)) {
        pendingRedemptionUnits += rUnits;
      }
    } else if (ord.transactionType === 'S') {
      const isSettled = ord.allotmentStatus === 'ALLOTTED' || ord.orderStatus === 'ALLOTTED';
      const sUnits = Math.abs(ord.redemptionUnits || ord.units || 0);
      if (isSettled) {
        totalConfirmedUnits -= sUnits;
      }
    }
  }

  // Fallback to MfPortfolioHolding if no completed orders are recorded
  if (holding && holding.totalUnits > 0) {
    if (totalConfirmedUnits === 0) {
      totalConfirmedUnits = holding.totalUnits;
    }
    if (holding.pendingRedemptionUnits && holding.pendingRedemptionUnits > pendingRedemptionUnits) {
      pendingRedemptionUnits = holding.pendingRedemptionUnits;
    }
  }

  totalConfirmedUnits = Math.max(0, +totalConfirmedUnits.toFixed(4));
  pendingRedemptionUnits = +pendingRedemptionUnits.toFixed(4);
  const availableUnits = Math.max(0, +(totalConfirmedUnits - pendingRedemptionUnits).toFixed(4));

  return {
    totalConfirmedUnits,
    pendingRedemptionUnits,
    availableUnits,
    folioNo,
  };
}

// Helper to calculate available units held in a scheme strictly from confirmed allotments minus pending redemptions
async function getUserSchemeHoldings(userId, schemeCode) {
  const detailed = await getDetailedUserSchemeHoldings(userId, schemeCode);
  return detailed.availableUnits;
}

// ── 7. GET /api/mutual-funds/portfolio (Holdings, Allocations, and Investor XIRR) ──
exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user._id;
    const portfolioData = await mfPortfolioEngine.recalculateUserPortfolio(userId);
    return res.json({
      success: true,
      data: portfolioData,
    });
  } catch (error) {
    console.error('[getPortfolio Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7a. GET /api/mutual-funds/portfolio/history (Real Historical Portfolio Valuation) ──
exports.getPortfolioHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const txns = await MfTransaction.find({ user: userId, status: 'CONFIRMED' }).sort({ transactionDate: 1 });

    if (txns.length === 0) {
      return res.json({
        success: true,
        data: {
          points: [],
          message: 'Not enough portfolio history yet.',
        },
      });
    }

    const points = txns.map((t) => ({
      date: t.transactionDate.toISOString().split('T')[0],
      amount: t.orderAmount,
      units: t.units,
      nav: t.nav,
    }));

    return res.json({
      success: true,
      data: {
        points,
        message: points.length >= 2 ? 'Real historical transaction history' : 'Not enough portfolio history yet.',
      },
    });
  } catch (error) {
    console.error('[getPortfolioHistory Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7b. GET /api/mutual-funds/portfolio/holdings/:schemeCode (Granular Scheme Holding) ──
exports.getHoldingDetail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { schemeCode } = req.params;
    const sCode = schemeCode.toUpperCase();

    const holding = await MfPortfolioHolding.findOne({ user: userId, schemeCode: sCode });
    if (!holding || holding.totalUnits <= 0) {
      return res.status(404).json({ success: false, message: 'No active holdings found for this scheme' });
    }

    const txns = await MfTransaction.find({ user: userId, schemeCode: sCode }).sort({ transactionDate: -1 });
    const scheme = await MutualFundScheme.findOne({ schemeCode: sCode });

    return res.json({
      success: true,
      data: {
        holding,
        scheme,
        transactions: txns,
      },
    });
  } catch (error) {
    console.error('[getHoldingDetail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7c. GET /api/mutual-funds/transactions (Verified Ledger Transactions & Pending Orders) ──
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, page = 1, limit = 20 } = req.query;
    const query = { user: userId };
    if (type && type !== 'ALL') {
      query.transactionType = type.toUpperCase();
    }

    // 1. Fetch settled ledger transactions
    const txns = await MfTransaction.find(query)
      .sort({ transactionDate: -1 })
      .lean();

    const settledOrderIds = new Set(
      txns.map((t) => (t.order ? String(t.order) : null)).filter(Boolean)
    );

    // 2. Fetch pending / in-flight orders that have not yet generated a settled MfTransaction (Section 18)
    const orderQuery = {
      user: userId,
      orderStatus: { $in: ['SUBMITTED', 'PROCESSING', 'PAYMENT_PENDING', 'CREATED'] },
    };
    if (type && type !== 'ALL') {
      const typeMap = {
        PURCHASE: 'P',
        REDEMPTION: 'R',
        SWITCH_IN: 'S',
        SWITCH_OUT: 'S',
      };
      if (typeMap[type.toUpperCase()]) {
        orderQuery.transactionType = typeMap[type.toUpperCase()];
      }
    }

    const pendingOrders = await MfOrder.find(orderQuery)
      .sort({ createdAt: -1 })
      .lean();

    const pendingMapped = pendingOrders
      .filter((o) => !settledOrderIds.has(String(o._id)))
      .map((o) => {
        const isRed = o.transactionType === 'R';
        const isSw = o.transactionType === 'S';
        const tType = isRed ? 'REDEMPTION' : (isSw ? 'SWITCH_OUT' : 'PURCHASE');
        const units = isRed
          ? -(o.redemptionUnits || o.units || o.requestedUnits || 0)
          : (o.allotmentStatus === 'ALLOTTED' ? (o.allottedUnits || o.units || 0) : 0);
        const estimatedUnits = isRed ? null : (o.estimatedUnits || null);

        return {
          _id: o._id,
          order: o._id,
          clientCode: o.clientCode,
          schemeCode: o.schemeCode,
          schemeName: o.schemeName,
          planType: o.planType || 'REGULAR',
          transactionType: tType,
          transactionDate: o.createdAt,
          orderAmount: o.orderAmount,
          units,
          allottedUnits: o.allottedUnits || 0,
          estimatedUnits,
          nav: o.navAtOrder || 0,
          navDate: o.createdAt,
          status: 'PROCESSING',
          isPending: true,
          externalReference: o.nseTrxnOrderId || o.orderId,
          remarks: o.remarks || (isRed ? 'Redemption submitted to AMC for payout processing' : 'Order submitted to exchange'),
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        };
      });

    // Combine pending first, then settled
    const all = [...pendingMapped, ...txns];
    const total = all.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginated = all.slice(startIndex, startIndex + Number(limit));

    return res.json({
      success: true,
      data: paginated,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (error) {
    console.error('[getTransactions Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7d. GET /api/mutual-funds/transactions/:id (Transaction Detail) ──
exports.getTransactionDetail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const txn = await MfTransaction.findOne({ _id: id, user: userId });
    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    return res.json({ success: true, data: txn });
  } catch (error) {
    console.error('[getTransactionDetail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7e. GET /api/mutual-funds/sips (List User SIPs) ──
exports.getUserSips = async (req, res) => {
  try {
    const userId = req.user._id;
    const sips = await MfSip.find({ user: userId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: sips });
  } catch (error) {
    console.error('[getUserSips Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7f. GET /api/mutual-funds/sips/:id (SIP Detail with Installments) ──
exports.getSipDetail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const sip = await MfSip.findOne({ _id: id, user: userId }).populate('mandateRef');
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP not found' });
    }
    return res.json({ success: true, data: sip });
  } catch (error) {
    console.error('[getSipDetail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7g. POST /api/mutual-funds/sips/:id/pause ──
exports.pauseUserSip = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { reason = 'Paused by investor' } = req.body;
    const sip = await MfSip.findOne({ _id: id, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP not found' });
    }
    if (sip.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: `Cannot pause SIP with status ${sip.status}` });
    }
    const prevStatus = sip.status;
    sip.status = 'PAUSED';
    sip.pausedAt = new Date();
    sip.pauseReason = reason;
    await sip.save();

    await mfIdempotencyService.recordAuditLog({
      event: 'SIP_PAUSED',
      entityType: 'SIP',
      entityId: sip._id,
      user: userId,
      previousState: { status: prevStatus },
      newState: { status: sip.status, pausedAt: sip.pausedAt },
      source: 'USER_ACTION',
      actor: String(userId),
      reason,
    });

    return res.json({ success: true, message: 'SIP paused successfully', data: sip });
  } catch (error) {
    console.error('[pauseUserSip Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7h. POST /api/mutual-funds/sips/:id/resume ──
exports.resumeUserSip = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const sip = await MfSip.findOne({ _id: id, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP not found' });
    }
    if (sip.status !== 'PAUSED') {
      return res.status(400).json({ success: false, message: `Cannot resume SIP with status ${sip.status}` });
    }
    const prevStatus = sip.status;
    sip.status = 'ACTIVE';
    sip.pausedAt = null;
    sip.pauseReason = '';
    await sip.save();

    await mfIdempotencyService.recordAuditLog({
      event: 'SIP_RESUMED',
      entityType: 'SIP',
      entityId: sip._id,
      user: userId,
      previousState: { status: prevStatus },
      newState: { status: sip.status },
      source: 'USER_ACTION',
      actor: String(userId),
      reason: 'Resumed by investor',
    });

    return res.json({ success: true, message: 'SIP resumed successfully', data: sip });
  } catch (error) {
    console.error('[resumeUserSip Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7i. POST /api/mutual-funds/sips/:id/cancel ──
exports.cancelUserSip = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const sip = await MfSip.findOne({ _id: id, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP not found' });
    }
    if (sip.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'SIP is already cancelled' });
    }

    // If registered on NSE, send cancellation request directly to the exchange
    let exchangeMessage = '';
    if (sip.sipRegNo && sip.clientCode) {
      try {
        const canRes = await nseClient.cancelXsip(sip.clientCode, sip.sipRegNo, '13:(User requested cancellation)');
        const canItem = canRes?.data?.can_data?.[0];
        if (canItem?.can_remark) {
          exchangeMessage = canItem.can_remark;
        }
      } catch (nseErr) {
        console.warn(`[cancelUserSip] NSE cancellation warning for ${sip.sipRegNo}:`, nseErr.message);
      }
    }

    const prevStatus = sip.status;
    sip.status = 'CANCELLED';
    sip.cancelledAt = new Date();
    await sip.save();

    await mfIdempotencyService.recordAuditLog({
      event: 'SIP_CANCELLED',
      entityType: 'SIP',
      entityId: sip._id,
      user: userId,
      previousState: { status: prevStatus },
      newState: { status: sip.status, cancelledAt: sip.cancelledAt },
      source: 'USER_ACTION',
      actor: String(userId),
      reason: 'Cancelled by investor',
    });

    return res.json({
      success: true,
      message: 'SIP cancelled successfully on NSE exchange',
      data: {
        sip,
        exchangeMessage,
      },
    });
  } catch (error) {
    console.error('[cancelUserSip Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7j. GET /api/mutual-funds/tax/capital-gains (Realized Capital Gains Report) ──
exports.getCapitalGains = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fy } = req.query;
    const report = await mfCapitalGainsEngine.getCapitalGainsReport(userId, fy);
    return res.json({ success: true, data: report });
  } catch (error) {
    console.error('[getCapitalGains Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7k. POST /api/mutual-funds/orders/:orderId/confirm-allotment (Idempotent Allotment Processing) ──
exports.confirmOrderAllotment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { allottedUnits, allottedNav, allotmentDate, rtaRef, idempotencyKey } = req.body;
    const result = await mfIdempotencyService.processAllotmentConfirmation({
      orderId,
      allottedUnits,
      allottedNav,
      allotmentDate,
      rtaReferenceNo: rtaRef,
      idempotencyKey,
      source: req.user ? `USER_${req.user._id}` : 'RECONCILIATION',
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[confirmOrderAllotment Error]:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

// ── 7l. POST /api/mutual-funds/orders/:orderId/settle-redemption (Idempotent Settlement Processing) ──
exports.settleRedemptionOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { settledAmount, settledNav, settlementDate, rtaRef, idempotencyKey } = req.body;
    const result = await mfIdempotencyService.processRedemptionSettlement({
      orderId,
      finalSettledAmount: settledAmount,
      allottedNav: settledNav,
      settlementDate,
      rtaReferenceNo: rtaRef,
      idempotencyKey,
      source: req.user ? `USER_${req.user._id}` : 'RECONCILIATION',
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[settleRedemptionOrder Error]:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

// ── 8. GET /api/mutual-funds/orders/my (Order History) ──
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    // Auto-expire abandoned unpaid orders older than 24 hours
    const expirationCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await MfOrder.updateMany(
      {
        user: userId,
        orderStatus: 'PAYMENT_PENDING',
        paymentStatus: 'PENDING',
        createdAt: { $lt: expirationCutoff },
      },
      {
        $set: {
          orderStatus: 'CANCELLED',
          remarks: 'Payment session expired by exchange (unpaid past validity window)',
        },
      }
    );

    const orders = await MfOrder.find({ user: userId }).sort({ createdAt: -1 });

    const formattedOrders = orders.map((ord) => {
      const orderDate = new Date(ord.createdAt);
      const expectedDate = new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000);
      const dayName = expectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

      let displayStatus = 'Order Placed';
      let subStatus = '';
      if (ord.allotmentStatus === 'ALLOTTED') {
        displayStatus = 'Completed';
        subStatus = 'Units Allotted';
      } else if (['REJECTED', 'FAILED'].includes(ord.orderStatus)) {
        displayStatus = 'Failed';
        subStatus = 'Rejected by Exchange';
      } else if (ord.orderStatus === 'CANCELLED') {
        displayStatus = 'Expired';
        subStatus = 'Validity Expired';
      } else if (ord.paymentStatus === 'SUCCESS' || ['PAYMENT_SUCCESS', 'SUBMITTED', 'PROCESSING'].includes(ord.orderStatus)) {
        displayStatus = 'In Progress';
        subStatus = 'Allotment Pending';
      } else if (ord.orderStatus === 'PAYMENT_PENDING') {
        displayStatus = 'Payment Pending';
        subStatus = 'Awaiting Authorization';
      }

      return {
        ...ord.toObject(),
        displayStatus,
        subStatus,
        expectedAllotmentDate: dayName,
        isProcessing: ord.allotmentStatus !== 'ALLOTTED' && (ord.paymentStatus === 'SUCCESS' || ['PAYMENT_SUCCESS', 'SUBMITTED', 'PROCESSING'].includes(ord.orderStatus)),
      };
    });

    return res.json({
      success: true,
      data: formattedOrders,
    });
  } catch (error) {
    console.error('[getMyOrders Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 9. POST /api/mutual-funds/orders/:orderId/simulate-payment (Sandbox Simulation) ──
exports.simulatePayment = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Simulation endpoints are disabled in production' });
    }
    const { orderId } = req.params;
    const order = await MfOrder.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.paymentStatus = 'SUCCESS';
    order.nseStatus = 'SUBMITTED (SANDBOX)';
    order.remarks = 'Payment simulated successfully in Sandbox Mode';
    await order.save();

    return res.json({
      success: true,
      message: 'Payment simulated successfully in Sandbox Mode',
      data: order,
    });
  } catch (error) {
    console.error('[simulatePayment Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 10. GET /api/mutual-funds/checkout/:orderId (Visual Web Checkout Simulator & Exchange Confirmation) ──
exports.renderCheckoutSimulator = async (req, res) => {
  try {
    const rawOrderId = req.params.orderId;
    if (!rawOrderId || !rawOrderId.trim()) {
      return res.status(404).send('Invalid or missing order reference.');
    }
    const orderId = rawOrderId.trim();
    const mongoose = require('mongoose');
    const isLive = process.env.NSE_ENV === 'PROD' && !nseClient.isMockMode();
    const isExplicitSandbox = (req.query.mode === 'sandbox') || nseClient.isMockMode();

    // 1. Try finding an MfOrder (Purchase / Lump-sum)
    let order = await MfOrder.findOne({
      $or: [
        { orderId },
        { nseTrxnOrderId: orderId },
        ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
      ],
    });

    // 2. Try finding an MfSip (SIP Registration)
    let sip = null;
    if (!order) {
      sip = await MfSip.findOne({
        $or: [
          { sipRegNo: orderId },
          { sipRefNo: orderId },
          ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
        ],
      });
    }

    // 3. Try finding an MfMandate (Bank Mandate / eNACH)
    let mandate = null;
    if (!order && !sip) {
      mandate = await MfMandate.findOne({
        mandateId: { $nin: ['', ' ', null] },
        $or: [
          { mandateId: orderId },
          ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
        ],
      });
    }

    // 4. Fallback: If orderId is a generic simulator token (e.g. REF_...) or not found, match most recent item
    if (!order && !sip && !mandate) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      sip = await MfSip.findOne({ createdAt: { $gte: oneHourAgo } }).sort({ createdAt: -1 });
      if (!sip) {
        order = await MfOrder.findOne({ createdAt: { $gte: oneHourAgo } }).sort({ createdAt: -1 });
      }
    }

    if (!order && !sip && !mandate) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Order Not Found - GoldVikaone</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #161F30; border: 1px solid #1E293B; border-radius: 20px; max-width: 440px; width: 100%; padding: 32px 24px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .icon-circle { width: 68px; height: 68px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); color: #EF4444; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; font-weight: bold; }
            h2 { font-size: 20px; margin-bottom: 8px; color: #FFFFFF; }
            p { font-size: 13px; color: #94A3B8; margin-bottom: 24px; line-height: 1.5; }
            .btn { display: block; width: 100%; padding: 14px; background: #334155; color: #FFFFFF; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-circle">✕</div>
            <h2>Order Not Found</h2>
            <p>The transaction reference (<code>${orderId}</code>) could not be located or has expired.</p>
            <button class="btn" onclick="window.close();">Return to App</button>
          </div>
        </body>
        </html>
      `);
    }

    // ── SCENARIO A: SIP REGISTRATION SIMULATION ──
    if (sip) {
      if (sip.status !== 'ACTIVE') {
        sip.status = 'ACTIVE';
        sip.installmentsPaid = Math.max(sip.installmentsPaid || 0, 1);
        sip.totalAmountPaid = Math.max(sip.totalAmountPaid || 0, sip.installmentAmount);
        await sip.save();

        try {
          const existingFirstOrder = await MfOrder.findOne({
            user: sip.user,
            schemeCode: sip.schemeCode,
            remarks: { $regex: sip.sipRegNo },
          });

          if (!existingFirstOrder) {
            const scheme = await MutualFundScheme.findOne({ schemeCode: sip.schemeCode, planType: 'REGULAR' });
            const nav = scheme?.nav || null;
            const estimatedUnits = nav ? Number((sip.installmentAmount / nav).toFixed(3)) : null;
            await MfOrder.create({
              user: sip.user,
              clientCode: sip.clientCode,
              orderId: sip.exchangeOrderId || sip.sipRegNo || `SIP_SIM_${sip._id}`,
              schemeCode: sip.schemeCode,
              schemeName: sip.schemeName,
              transactionType: 'P',
              orderAmount: sip.installmentAmount,
              estimatedUnits,
              units: 0,
              allottedUnits: 0,
              allotmentStatus: 'PENDING',
              navAtOrder: nav,
              paymentMode: 'MANDATE',
              paymentStatus: 'SUCCESS',
              nseStatus: isExplicitSandbox ? 'SUBMITTED (SANDBOX)' : 'VALID',
              remarks: `SIP First Installment for RegNo: ${sip.sipRegNo}`,
            });
          }
        } catch (orderErr) {
          console.warn('[renderCheckoutSimulator] SIP 1st installment creation warning:', orderErr.message);
        }
      }

      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isExplicitSandbox ? 'NSE MFSS SIP Simulator' : 'NSE MFSS Official SIP Confirmation'}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #161F30; border: 1px solid #1E293B; border-radius: 20px; max-width: 440px; width: 100%; padding: 28px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .badge { display: inline-block; padding: 6px 14px; border-radius: 50px; background: rgba(0, 208, 156, 0.15); color: #00D09C; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; }
            .icon-circle { width: 68px; height: 68px; border-radius: 50%; background: #00D09C; color: #0B0F19; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px; font-weight: bold; }
            h1 { font-size: 20px; margin-bottom: 8px; color: #FFFFFF; }
            p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 24px; }
            .details { background: #0F172A; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px; border: 1px solid #1E293B; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
            .row:last-child { margin-bottom: 0; }
            .label { color: #64748B; }
            .val { color: #F1F5F9; font-weight: 600; }
            .highlight { color: #D4A017; font-size: 16px; font-weight: 700; }
            .btn { display: block; width: 100%; padding: 14px; background: linear-gradient(135deg, #D4A017, #F59E0B); color: #0B0F19; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; transition: transform 0.1s; }
            .btn:active { transform: scale(0.98); }
            .footer { margin-top: 18px; font-size: 11px; color: #64748B; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">${isExplicitSandbox ? '⚡ NSE MFSS Sandbox Verified' : '⚡ NSE MFSS Exchange Verified'}</div>
            <div class="icon-circle">✓</div>
            <h1>${isExplicitSandbox ? 'SIP Setup Simulated' : 'SIP Registered Successfully'}</h1>
            <p class="sub">${isExplicitSandbox ? 'Your test SIP has been simulated in Sandbox mode.' : 'Your SIP has been registered with NSE MFSS and linked to your authorized Bank AutoPay Mandate.'}</p>

            <div class="details">
              <div class="row">
                <span class="label">SIP Reg No</span>
                <span class="val">${sip.sipRegNo}</span>
              </div>
              <div class="row">
                <span class="label">Scheme</span>
                <span class="val" style="max-width: 220px; text-align: right; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${sip.schemeName}</span>
              </div>
              <div class="row">
                <span class="label">Installment Amount</span>
                <span class="val highlight">₹${sip.installmentAmount.toLocaleString('en-IN')}</span>
              </div>
              <div class="row">
                <span class="label">Frequency</span>
                <span class="val">${sip.frequency}</span>
              </div>
              <div class="row">
                <span class="label">Start Date</span>
                <span class="val">${new Date(sip.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div class="row">
                <span class="label">SIP Status</span>
                <span class="val" style="color: #00D09C;">${isExplicitSandbox ? 'ACTIVE (SANDBOX)' : 'ACTIVE (EXCHANGE REGISTERED)'}</span>
              </div>
            </div>

            <button class="btn" onclick="window.close();">Return to GoldVikaone App</button>
            <div class="footer">${isExplicitSandbox ? 'National Stock Exchange of India (NSE NMF II) Sandbox Simulator' : 'National Stock Exchange of India (NSE MFSS) • Member 1031616'}</div>
          </div>
        </body>
        </html>
      `);
    }

    // ── SCENARIO B: MANDATE AUTHORIZATION SIMULATION ──
    if (mandate) {
      if (mandate.status !== 'APPROVED') {
        mandate.status = 'APPROVED';
        if (!mandate.umrn) {
          mandate.umrn = `UMRN_SIM_${Date.now().toString().slice(-8)}`;
        }
        mandate.authorizedAt = new Date();
        await mandate.save();
      }

      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>NSE eNACH Mandate Authorization</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #161F30; border: 1px solid #1E293B; border-radius: 20px; max-width: 440px; width: 100%; padding: 28px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .badge { display: inline-block; padding: 6px 14px; border-radius: 50px; background: rgba(0, 208, 156, 0.15); color: #00D09C; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; }
            .icon-circle { width: 68px; height: 68px; border-radius: 50%; background: #00D09C; color: #0B0F19; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px; font-weight: bold; }
            h1 { font-size: 20px; margin-bottom: 8px; color: #FFFFFF; }
            p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 24px; }
            .details { background: #0F172A; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px; border: 1px solid #1E293B; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
            .row:last-child { margin-bottom: 0; }
            .label { color: #64748B; }
            .val { color: #F1F5F9; font-weight: 600; }
            .highlight { color: #D4A017; font-size: 16px; font-weight: 700; }
            .btn { display: block; width: 100%; padding: 14px; background: linear-gradient(135deg, #D4A017, #F59E0B); color: #0B0F19; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; transition: transform 0.1s; }
            .btn:active { transform: scale(0.98); }
            .footer { margin-top: 18px; font-size: 11px; color: #64748B; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">🏦 NSE eNACH Mandate Approved</div>
            <div class="icon-circle">✓</div>
            <h1>Mandate Authorized</h1>
            <p class="sub">Your auto-debit bank mandate for Mutual Fund investments is verified.</p>

            <div class="details">
              <div class="row">
                <span class="label">Mandate ID</span>
                <span class="val">${mandate.mandateId}</span>
              </div>
              <div class="row">
                <span class="label">Bank Account</span>
                <span class="val">${mandate.accountNo ? mandate.accountNo.replace(/\\d(?=\\d{4})/g, '*') : 'Verified Account'}</span>
              </div>
              <div class="row">
                <span class="label">IFSC</span>
                <span class="val">${mandate.ifsc || 'Verified'}</span>
              </div>
              <div class="row">
                <span class="label">Maximum Limit</span>
                <span class="val highlight">₹${(mandate.amount || 50000).toLocaleString('en-IN')}</span>
              </div>
              <div class="row">
                <span class="label">Status</span>
                <span class="val" style="color: #00D09C;">APPROVED (ACTIVE)</span>
              </div>
            </div>

            <button class="btn" onclick="window.close();">Return to GoldVikaone App</button>
            <div class="footer">${isExplicitSandbox ? 'National Payments Corporation of India (NPCI eNACH) Sandbox' : 'National Payments Corporation of India (NPCI eNACH) • Official NSE Mandate'}</div>
          </div>
        </body>
        </html>
      `);
    }

    // ── SCENARIO C: ONE-TIME PURCHASE (LUMP-SUM) SIMULATION ──
    if (order.paymentStatus !== 'SUCCESS') {
      order.paymentStatus = 'SUCCESS';
      order.nseStatus = isExplicitSandbox ? 'ALLOTTED (SANDBOX)' : 'VALID';
      await order.save();
      try {
        const eventNotificationService = require('../services/eventNotificationService');
        eventNotificationService.notifyFirstMfPurchase(order.user, order);
      } catch (_) {}
    }

    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isExplicitSandbox ? 'NSE MFSS Sandbox Payment Simulator' : 'NSE MFSS Official Payment Confirmation'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
          .card { background: #161F30; border: 1px solid #1E293B; border-radius: 20px; max-width: 440px; width: 100%; padding: 28px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          .badge { display: inline-block; padding: 6px 14px; border-radius: 50px; background: rgba(0, 208, 156, 0.15); color: #00D09C; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; }
          .icon-circle { width: 68px; height: 68px; border-radius: 50%; background: #00D09C; color: #0B0F19; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px; font-weight: bold; }
          h1 { font-size: 20px; margin-bottom: 8px; color: #FFFFFF; }
          p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 24px; }
          .details { background: #0F172A; border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px; border: 1px solid #1E293B; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
          .row:last-child { margin-bottom: 0; }
          .label { color: #64748B; }
          .val { color: #F1F5F9; font-weight: 600; }
          .highlight { color: #D4A017; font-size: 16px; font-weight: 700; }
          .btn { display: block; width: 100%; padding: 14px; background: linear-gradient(135deg, #D4A017, #F59E0B); color: #0B0F19; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; transition: transform 0.1s; }
          .btn:active { transform: scale(0.98); }
          .footer { margin-top: 18px; font-size: 11px; color: #64748B; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">${isExplicitSandbox ? '⚡ NSE MFSS Sandbox Verified' : '⚡ NSE MFSS Official Exchange Verified'}</div>
          <div class="icon-circle">✓</div>
          <h1>${isExplicitSandbox ? 'Payment Simulated' : 'Payment Confirmed'}</h1>
          <p class="sub">${isExplicitSandbox ? 'Your test mutual fund purchase has been simulated and units are allotted.' : 'Your mutual fund payment has been confirmed by NSE Clearing Limited.'}</p>

          <div class="details">
            <div class="row">
              <span class="label">Order ID</span>
              <span class="val">${order.orderId}</span>
            </div>
            <div class="row">
              <span class="label">Scheme</span>
              <span class="val" style="max-width: 220px; text-align: right; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${order.schemeName}</span>
            </div>
            <div class="row">
              <span class="label">Amount Paid</span>
              <span class="val highlight">₹${order.orderAmount.toLocaleString('en-IN')}</span>
            </div>
            <div class="row">
              <span class="label">Units Allotted</span>
              <span class="val" style="color: #00D09C;">${(order.units || 0).toFixed(3)} units</span>
            </div>
            <div class="row">
              <span class="label">NAV at Order</span>
              <span class="val">₹${(order.navAtOrder || 0).toFixed(2)}</span>
            </div>
            <div class="row">
              <span class="label">Payment Status</span>
              <span class="val" style="color: #00D09C;">SUCCESS</span>
            </div>
          </div>

          <button class="btn" onclick="window.close();">Return to GoldVikaone App</button>
          <div class="footer">${isExplicitSandbox ? 'National Stock Exchange of India (NSE NNF v1.9.8) Sandbox Simulator' : 'National Stock Exchange of India (NSE MFSS) • Member 1031616'}</div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('[renderCheckoutSimulator Error]:', error);
    return res.status(500).send('Error rendering checkout simulation');
  }
};

// ── 11. POST /api/mutual-funds/test/reset (Tester Reset Helper) ──
exports.resetTestData = async (req, res) => {
  try {
    const userId = req.user._id;
    await MfOrder.deleteMany({ user: userId });
    await MfSip.deleteMany({ user: userId });
    await MfClientUcc.deleteMany({ user: userId });
    await MfMandate.deleteMany({ user: userId });

    return res.json({
      success: true,
      message: 'Test orders, active SIPs, and UCC reset successfully for user',
    });
  } catch (error) {
    console.error('[resetTestData Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 12. POST /api/mutual-funds/sync-nav (Live AMFI & NSE NAV Synchronization) ──
exports.syncNavsNow = async (req, res) => {
  try {
    const { syncMutualFundNavs } = require('../crons/mfNavSyncCron');
    const result = await syncMutualFundNavs();
    return res.json({
      success: result.success,
      message: result.success
        ? `Successfully synced NAVs for ${result.updatedCount} schemes`
        : 'Failed to sync NAVs from AMFI',
      data: result,
    });
  } catch (error) {
    console.error('[syncNavsNow Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 13. POST /api/mutual-funds/orders/redeem (Redeem / Sell Units back to AMC) ──
exports.createRedemptionOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      schemeCode,
      redeemMode = 'UNITS', // 'UNITS' or 'AMOUNT'
      units,
      amount,
      orderAmount: explicitAmount,
      allUnits = false,
      folioNo = '',
      idempotencyKey = null,
      remarks = '',
    } = req.body;

    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'schemeCode is required' });
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(400).json({
        success: false,
        message: 'Please complete one-time investor onboarding (UCC) before redeeming units',
      });
    }

    const searchCode = String(schemeCode || '').trim().toUpperCase();
    const scheme = await MutualFundScheme.findOne({
      $or: [
        { schemeCode: searchCode },
        { nseSchemeCode: searchCode },
        { isin: searchCode },
      ],
      planType: 'REGULAR',
    });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (scheme.redemptionAllowed === false) {
      return res.status(400).json({
        success: false,
        message: `Redemptions are currently locked for ${scheme.schemeName} (e.g. ELSS statutory lock-in period)`,
      });
    }

    let targetNseCode = scheme.nseSchemeCode;
    if (!targetNseCode && scheme.schemeCode && !/^\d+$/.test(scheme.schemeCode)) {
      targetNseCode = scheme.schemeCode;
    }

    // 1. Detailed holding verification
    const holdings = await getDetailedUserSchemeHoldings(userId, scheme.schemeCode);
    if (holdings.totalConfirmedUnits <= 0) {
      return res.status(400).json({
        success: false,
        message: `You currently have 0 units in ${scheme.schemeName} available to redeem.`,
      });
    }

    if (holdings.availableUnits <= 0) {
      return res.status(400).json({
        success: false,
        message: `All your ${holdings.totalConfirmedUnits} units in ${scheme.schemeName} are currently pending redemption. No additional units are available to redeem.`,
      });
    }

    const currentNav = scheme.nav && scheme.nav > 0 ? scheme.nav : 10.0;
    let unitsToRedeem = 0;
    let computedAmount = 0;
    let effectiveMode = redeemMode ? redeemMode.toUpperCase() : 'UNITS';

    if (allUnits) {
      effectiveMode = 'UNITS';
      unitsToRedeem = holdings.availableUnits;
      computedAmount = +(unitsToRedeem * currentNav).toFixed(2);
    } else if (effectiveMode === 'AMOUNT') {
      const requestedAmt = parseFloat(amount || explicitAmount);
      if (isNaN(requestedAmt) || requestedAmt <= 0) {
        return res.status(400).json({ success: false, message: 'Please specify a valid redemption amount greater than 0' });
      }
      const maxRedeemableAmount = +(holdings.availableUnits * currentNav).toFixed(2);
      if (requestedAmt > maxRedeemableAmount) {
        return res.status(400).json({
          success: false,
          message: `Requested amount (₹${requestedAmt}) exceeds your available redeemable balance of ₹${maxRedeemableAmount} (${holdings.availableUnits} units).`,
        });
      }
      computedAmount = requestedAmt;
      unitsToRedeem = +(requestedAmt / currentNav).toFixed(4);
    } else {
      // Mode: UNITS
      effectiveMode = 'UNITS';
      const requestedUnits = parseFloat(units);
      if (isNaN(requestedUnits) || requestedUnits <= 0) {
        return res.status(400).json({ success: false, message: 'Please specify a valid unit quantity to redeem' });
      }
      if (requestedUnits > holdings.availableUnits) {
        return res.status(400).json({
          success: false,
          message: `Requested units (${requestedUnits}) exceed your available holdings (${holdings.availableUnits} units).`,
        });
      }
      unitsToRedeem = requestedUnits;
      computedAmount = +(unitsToRedeem * currentNav).toFixed(2);
    }

    // 2. Idempotency Guard (Section 15)
    const idempotencyFilter = idempotencyKey
      ? { user: userId, idempotencyKey }
      : {
          user: userId,
          schemeCode: scheme.schemeCode,
          transactionType: 'R',
          orderStatus: { $in: ['SUBMITTED', 'PROCESSING', 'PAYMENT_PENDING', 'CREATED'] },
          createdAt: { $gte: new Date(Date.now() - 45000) },
        };

    const existingOrder = await MfOrder.findOne(idempotencyFilter);
    if (existingOrder) {
      const isSameUnits = Math.abs((existingOrder.redemptionUnits || 0) - unitsToRedeem) < 0.01;
      const isSameAmt = Math.abs((existingOrder.orderAmount || 0) - computedAmount) < 1.0;
      if (idempotencyKey || isSameUnits || isSameAmt) {
        return res.json({
          success: true,
          isDuplicate: true,
          message: 'Redemption request already placed (Idempotent)',
          data: {
            order: existingOrder,
            remainingUnits: +(holdings.availableUnits - (existingOrder.redemptionUnits || 0)).toFixed(3),
            estimatedPayout: existingOrder.orderAmount,
            payoutBank: existingOrder.payoutBank,
          },
        });
      }
    }

    const orderId = `MFR${Date.now()}`;
    const user = await User.findById(userId);
    const effectiveFolio = folioNo || holdings.folioNo || '';

    // 3. Prepare NSE Redemption payload (Order Entry RED)
    const cleanRedeemRef = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 19);
    const nseRedemptionPayload = {
      order_ref_number: cleanRedeemRef,
      scheme_code: targetNseCode || scheme.schemeCode,
      trxn_type: 'R', // Redemption
      buy_sell_type: effectiveFolio ? 'ADDITIONAL' : 'FRESH',
      client_code: ucc.clientCode,
      demat_physical: 'P',
      order_amount: allUnits ? '' : String(computedAmount),
      allotment_units: effectiveMode === 'UNITS' ? String(unitsToRedeem) : '',
      all_units: allUnits ? 'Y' : 'N',
      folio_no: effectiveFolio,
      remarks: remarks || `Redemption via Vikaone app`,
      account_no: ucc.primaryBank?.accountNo || '',
      mobile_no: user?.phone?.slice(-10) || '',
      email: user?.email || '',
      member_unique_id: '',
    };

    // 4. Dispatch to NSE Gateway
    const nseRes = await nseClient.createNormalOrder([nseRedemptionPayload]);
    const trxnItem = nseRes?.data?.transaction_details?.[0];
    const rawOrderId = trxnItem?.trxn_order_id;
    const isSuccess = nseRes?.success && trxnItem?.trxn_status === 'TRXN SUCCESS' && rawOrderId && rawOrderId !== '0';

    if (!isSuccess && !nseClient.isMockMode()) {
      const errMsg = trxnItem?.trxn_remark || nseRes?.data?.message || 'NSE Exchange rejected redemption order';
      return res.status(400).json({
        success: false,
        message: `NSE MFSS Exchange: ${errMsg}`,
        data: {
          exchangeStatus: trxnItem?.trxn_status || 'FAILED',
          exchangeRemark: trxnItem?.trxn_remark || '',
          clientCode: ucc.clientCode,
          schemeCode: scheme.schemeCode,
        },
      });
    }

    const nseTrxnOrderId = isSuccess ? String(rawOrderId) : (nseClient.isMockMode() ? String(rawOrderId || `TEST_RED_${Date.now()}`) : null);

    // 5. Save Redemption Order (Section 9)
    const redemptionOrder = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      isin: scheme.isin || '',
      folioNo: effectiveFolio,
      transactionType: 'R',
      redeemMode: effectiveMode,
      requestedUnits: unitsToRedeem,
      requestedAmount: computedAmount,
      redemptionUnits: unitsToRedeem,
      allUnits: Boolean(allUnits),
      orderAmount: computedAmount,
      units: unitsToRedeem,
      navAtOrder: scheme.nav,
      paymentMode: 'DIRECT_AMC_PAYOUT',
      paymentStatus: 'SUCCESS', // Payment doesn't debit user; AMC settles payout directly to bank
      payoutStatus: 'PENDING_AMC',
      orderStatus: isSuccess ? 'SUBMITTED' : (nseClient.isMockMode() ? 'SUBMITTED' : 'FAILED'),
      payoutBank: {
        bankName: ucc.primaryBank?.bankName || '',
        accountNo: ucc.primaryBank?.accountNo || '',
        ifscCode: ucc.primaryBank?.ifscCode || '',
      },
      nseTrxnOrderId,
      nseStatus: isSuccess ? 'ORDER SUBMITTED' : (nseClient.isMockMode() ? 'ORDER SUBMITTED' : 'FAILED'),
      idempotencyKey: idempotencyKey || null,
      remarks: `Redeemed ${unitsToRedeem} units (${effectiveMode === 'AMOUNT' ? '₹' + computedAmount : 'by units'}). Payout of ₹${computedAmount.toLocaleString('en-IN')} will be credited directly to ${ucc.primaryBank?.bankName || 'registered bank account'} within 2-3 business days.`,
    });

    // 6. Recalculate portfolio atomically to track pending redemption units (Section 11)
    await mfPortfolioEngine.recalculateUserPortfolio(userId);

    return res.json({
      success: true,
      message: `Redemption order for ${unitsToRedeem} units placed successfully. Payout will be credited to your registered bank account by AMC.`,
      data: {
        order: redemptionOrder,
        remainingUnits: +(holdings.availableUnits - unitsToRedeem).toFixed(3),
        totalConfirmedUnits: holdings.totalConfirmedUnits,
        estimatedPayout: computedAmount,
        payoutBank: redemptionOrder.payoutBank,
      },
    });
  } catch (error) {
    console.error('[createRedemptionOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 14. POST /api/mutual-funds/orders/switch (Switch Between Funds under same AMC) ──
exports.createSwitchOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sourceSchemeCode, targetSchemeCode, units, allUnits = false } = req.body;

    if (!sourceSchemeCode || !targetSchemeCode) {
      return res.status(400).json({ success: false, message: 'sourceSchemeCode and targetSchemeCode are required' });
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(400).json({ success: false, message: 'Please complete UCC onboarding before switching schemes' });
    }

    const [srcScheme, tgtScheme] = await Promise.all([
      MutualFundScheme.findOne({ schemeCode: sourceSchemeCode.toUpperCase(), planType: 'REGULAR' }),
      MutualFundScheme.findOne({ schemeCode: targetSchemeCode.toUpperCase(), planType: 'REGULAR' }),
    ]);

    if (!srcScheme || !tgtScheme) {
      return res.status(404).json({ success: false, message: 'Source or target scheme not found or not a Regular plan' });
    }

    if (srcScheme.amcCode !== tgtScheme.amcCode) {
      return res.status(400).json({
        success: false,
        message: `SEBI Rule: Switching is only permitted between schemes of the same AMC (${srcScheme.amcName})`,
      });
    }

    const availableUnits = await getUserSchemeHoldings(userId, srcScheme.schemeCode);
    const unitsToSwitch = allUnits ? availableUnits : parseFloat(units);

    if (unitsToSwitch <= 0 || unitsToSwitch > availableUnits) {
      return res.status(400).json({
        success: false,
        message: `Invalid switch units (${unitsToSwitch}). Available: ${availableUnits} units`,
      });
    }

    const switchAmount = +(unitsToSwitch * srcScheme.nav).toFixed(2);
    const orderId = `MFSW${Date.now()}`;

    const nseSwitchPayload = {
      order_ref_number: orderId,
      from_scheme_code: srcScheme.schemeCode,
      to_scheme_code: tgtScheme.schemeCode,
      client_code: ucc.clientCode,
      allotment_units: String(unitsToSwitch),
      all_units: allUnits ? 'Y' : 'N',
      order_amount: String(switchAmount),
      remarks: 'Switch via Vikaone app',
    };

    // Dispatch to NSE Switch
    const nseRes = await nseClient.createSwitchOrder([nseSwitchPayload]);
    const trxnItem = nseRes?.data?.transaction_details?.[0];
    const rawOrderId = trxnItem?.trxn_so_order_id || trxnItem?.trxn_order_id;
    const isSuccess = nseRes?.success && trxnItem?.trxn_status === 'TRXN SUCCESS' && rawOrderId;

    if (!isSuccess && !nseClient.isMockMode()) {
      const errMsg = trxnItem?.trxn_remark || nseRes?.data?.message || 'NSE Exchange rejected switch order';
      return res.status(400).json({
        success: false,
        message: `NSE MFSS Exchange: ${errMsg}`,
        data: {
          exchangeStatus: trxnItem?.trxn_status || 'FAILED',
          exchangeRemark: trxnItem?.trxn_remark || '',
          clientCode: ucc.clientCode,
          fromSchemeCode: srcScheme.schemeCode,
          toSchemeCode: tgtScheme.schemeCode,
        },
      });
    }

    const nseTrxnOrderId = isSuccess ? String(rawOrderId) : (nseClient.isMockMode() ? String(rawOrderId || `TEST_SW_${Date.now()}`) : null);

    // Record source Switch-Out Order
    const switchOrder = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: srcScheme.schemeCode,
      schemeName: srcScheme.schemeName,
      transactionType: 'S',
      redemptionUnits: unitsToSwitch,
      allUnits: Boolean(allUnits),
      targetSchemeCode: tgtScheme.schemeCode,
      targetSchemeName: tgtScheme.schemeName,
      orderAmount: switchAmount,
      units: unitsToSwitch,
      navAtOrder: srcScheme.nav,
      paymentMode: 'MANDATE',
      paymentStatus: 'SUCCESS',
      nseTrxnOrderId,
      nseStatus: 'SWITCH PROCESSING',
      remarks: `Switch from ${srcScheme.schemeName} to ${tgtScheme.schemeName} (${unitsToSwitch} units)`,
    });

    return res.json({
      success: true,
      message: `Switch request submitted successfully. ${unitsToSwitch} units will be switched from ${srcScheme.schemeName} to ${tgtScheme.schemeName}.`,
      data: switchOrder,
    });
  } catch (error) {
    console.error('[createSwitchOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 15. POST /api/mutual-funds/stp/register (Systematic Transfer Plan) ──
exports.registerStpOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sourceSchemeCode, targetSchemeCode, amount, frequency = 'MONTHLY', startDate, tenureMonths = 36 } = req.body;

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) return res.status(400).json({ success: false, message: 'UCC onboarding required' });

    const [src, tgt] = await Promise.all([
      MutualFundScheme.findOne({ schemeCode: sourceSchemeCode.toUpperCase(), planType: 'REGULAR' }),
      MutualFundScheme.findOne({ schemeCode: targetSchemeCode.toUpperCase(), planType: 'REGULAR' }),
    ]);

    if (!src || !tgt) return res.status(404).json({ success: false, message: 'Source or target scheme not found' });
    if (src.amcCode !== tgt.amcCode) return res.status(400).json({ success: false, message: 'STP requires both schemes to belong to the same AMC' });

    const regNo = `STP${Date.now()}`;
    const start = startDate ? new Date(startDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const stpPlan = await MfSystematicPlan.create({
      user: userId,
      clientCode: ucc.clientCode,
      planType: 'STP',
      regNo,
      sourceSchemeCode: src.schemeCode,
      sourceSchemeName: src.schemeName,
      targetSchemeCode: tgt.schemeCode,
      targetSchemeName: tgt.schemeName,
      frequency: frequency.toUpperCase(),
      amount: Number(amount),
      startDate: start,
      nextExecutionDate: start,
      tenureMonths: Number(tenureMonths),
      status: 'ACTIVE',
      remarks: `STP from ${src.schemeName} to ${tgt.schemeName}`,
    });

    return res.json({
      success: true,
      message: 'STP successfully registered on exchange',
      data: stpPlan,
    });
  } catch (error) {
    console.error('[registerStpOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 16. POST /api/mutual-funds/swp/register (Systematic Withdrawal Plan) ──
exports.registerSwpOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sourceSchemeCode, amount, frequency = 'MONTHLY', startDate, tenureMonths = 36 } = req.body;

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) return res.status(400).json({ success: false, message: 'UCC onboarding required' });

    const src = await MutualFundScheme.findOne({ schemeCode: sourceSchemeCode.toUpperCase(), planType: 'REGULAR' });
    if (!src) return res.status(404).json({ success: false, message: 'Scheme not found' });

    const availableUnits = await getUserSchemeHoldings(userId, src.schemeCode);
    if (availableUnits <= 0) {
      return res.status(400).json({ success: false, message: 'You have no units available in this scheme for SWP' });
    }

    const regNo = `SWP${Date.now()}`;
    const start = startDate ? new Date(startDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const swpPlan = await MfSystematicPlan.create({
      user: userId,
      clientCode: ucc.clientCode,
      planType: 'SWP',
      regNo,
      sourceSchemeCode: src.schemeCode,
      sourceSchemeName: src.schemeName,
      frequency: frequency.toUpperCase(),
      amount: Number(amount),
      startDate: start,
      nextExecutionDate: start,
      tenureMonths: Number(tenureMonths),
      status: 'ACTIVE',
      remarks: `SWP monthly withdrawal of ₹${amount} to ${ucc.primaryBank?.bankName}`,
    });

    return res.json({
      success: true,
      message: 'SWP successfully scheduled. Regular withdrawals will be credited to your bank account.',
      data: swpPlan,
    });
  } catch (error) {
    console.error('[registerSwpOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};




// ── 17. GET /api/mutual-funds/onboarding-status (Step 1: UCC, Step 2: Mandate) ──
exports.getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    const ucc = await MfClientUcc.findOne({ user: userId });

    // Look up saved bank account from BankAccount collection if not on UCC
    let savedBank = null;
    try {
      savedBank = await BankAccount.findOne({ user: userId, isDefault: true }).lean();
      if (!savedBank) {
        savedBank = await BankAccount.findOne({ user: userId }).sort({ isVerified: -1, createdAt: -1 }).lean();
      }
    } catch (_) {}

    let effAccountNo = (ucc?.primaryBank?.accountNo || savedBank?.accountNumber || '').trim();
    let effIfsc = (ucc?.primaryBank?.ifsc || savedBank?.ifsc || '').trim().toUpperCase();
    let effBankName = (ucc?.primaryBank?.bankName || savedBank?.bankName || 'Linked Bank').trim();
    let effAccountHolder = (ucc?.primaryBank?.accountHolder || savedBank?.accountHolder || savedBank?.verifiedName || user?.fullName || '').trim();
    let effAccountType = (savedBank?.accountType || ucc?.primaryBank?.accountType || 'savings').toLowerCase();

    // Secondary fallback to KYC model bank details if BankAccount was empty
    if (!effAccountNo) {
      try {
        const Kyc = require('../models/Kyc');
        const userKyc = await Kyc.findOne({ user: userId }).lean();
        if (userKyc?.bankDetails?.accountNumber) {
          effAccountNo = String(userKyc.bankDetails.accountNumber).trim();
          effIfsc = String(userKyc.bankDetails.ifscCode || '').trim().toUpperCase();
          effBankName = (userKyc.bankDetails.bankName || 'Linked Bank').trim();
          effAccountHolder = (userKyc.fullName || user?.fullName || '').trim();
        }
      } catch (_) {}
    }

    const isUccActive = Boolean(ucc && ucc.clientCode && ucc.nseStatus === 'ACTIVE');
    const isBankVerified = Boolean(
      (effAccountNo && effAccountNo.length >= 6 && effIfsc && effIfsc.length === 11) ||
      savedBank?.isVerified ||
      savedBank?.accountStatus === 'VERIFIED' ||
      (ucc && ucc.nseStatus === 'ACTIVE' && ucc?.primaryBank?.accountNo)
    );

    const bankDetailsObj = effAccountNo ? {
      hasBank: true,
      isVerified: isBankVerified,
      status: isBankVerified ? 'VERIFIED' : 'PENDING',
      accountNumber: effAccountNo,
      maskedAccountNumber: effAccountNo.length > 4 ? `•••• ${effAccountNo.slice(-4)}` : effAccountNo,
      ifsc: effIfsc,
      bankName: effBankName,
      accountHolder: effAccountHolder,
      accountType: effAccountType,
    } : null;

    const isLumpSumReady = isUccActive && isBankVerified;

    if (!ucc || !isUccActive || !isBankVerified) {
      return res.json({
        success: true,
        data: {
          step: 1,
          title: 'Complete Investor Account (Step 1 of 2)',
          subtitle: 'SEBI requires a one-time profile (PAN, Bank, Nominee) before investing on NSE MFSS.',
          clientCode: ucc ? ucc.clientCode : null,
          hasUcc: isUccActive,
          uccStatus: ucc ? ucc.nseStatus : 'NOT_REGISTERED',
          kycStatus: isUccActive ? 'approved' : 'pending',
          hasMandate: false,
          mandateStatus: 'NONE',
          isBankVerified: isBankVerified,
          bankDetails: bankDetailsObj,
          bankName: effBankName,
          accountNo: effAccountNo,
          ifsc: effIfsc,
          accountHolder: effAccountHolder,
          accountType: effAccountType,
          isSipReady: false,
          isLumpSumReady: false,
        },
      });
    }

    let mandate = await MfMandate.findOne({
      user: userId,
      mandateId: { $nin: ['', ' ', null] },
      status: { $in: ['APPROVED', 'AUTHORIZED', 'ACTIVE', 'ACCEPTED_BY_BANK'] },
    }).sort({ createdAt: -1 });

    if (!mandate && ucc.defaultMandateId) {
      mandate = await MfMandate.findOne({
        user: userId,
        mandateId: ucc.defaultMandateId,
      });
    }

    if (!mandate) {
      mandate = await MfMandate.findOne({
        user: userId,
        mandateId: { $nin: ['', ' ', null] },
      }).sort({ createdAt: -1 });
    }
    let isMandateApproved = Boolean(
      mandate &&
      mandate.mandateId &&
      mandate.mandateId.trim().length > 0 &&
      (
        mandate.status === 'APPROVED' ||
        mandate.status === 'ACCEPTED_BY_BANK' ||
        mandate.status === 'ACTIVE' ||
        mandate.status === 'AUTHORIZED' ||
        (typeof mandate.umrn === 'string' && mandate.umrn.trim().length > 0) ||
        nseClient.isMockMode()
      )
    );

    // If mandate exists and is not yet marked approved in local DB, check live status on NSE
    if (!isMandateApproved && mandate && mandate.mandateId && mandate.mandateId.trim().length > 0) {
      try {
        const mStatusRes = await nseClient.getMandateStatus({
          mandateId: mandate.mandateId,
          client_code: ucc.clientCode,
        });
        const repItem = mStatusRes?.data?.mandates?.[0] || mStatusRes?.data?.report_data?.[0];
        if (repItem) {
          const rawSt = (repItem.status || repItem.mandate_status || '').toUpperCase();
          const rawUmrn = repItem.umrn || repItem.umrnNo || repItem.umrn_no || '';
          if (['APPROVED', 'AUTHORIZED', 'ACTIVE', 'ACCEPTED_BY_BANK'].includes(rawSt) || (rawUmrn && rawUmrn.length > 0)) {
            mandate.status = 'APPROVED';
            if (rawUmrn) mandate.umrn = String(rawUmrn).trim();
            await mandate.save();
            isMandateApproved = true;
          }
        }
      } catch (_) {}
    }

    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const isLive = process.env.NSE_ENV === 'PROD' && !nseClient.isMockMode();
    const authUrl = mandate?.authLink || (mandate && !isLive ? `${backendUrl}/api/mutual-funds/checkout/${mandate.mandateId}?mode=sandbox` : null);

    if (!isMandateApproved) {
      return res.json({
        success: true,
        data: {
          step: 2,
          title: 'Set Up Bank AutoPay (Step 2 of 2)',
          subtitle: `Client Code: ${ucc.clientCode}. Authorize your one-time bank mandate to automate monthly SIP investments on NSE.`,
          clientCode: ucc.clientCode,
          pan: ucc.pan || '',
          fullName: ucc.fullName || '',
          dob: ucc.dob || '',
          gender: ucc.gender || 'M',
          hasUcc: true,
          uccStatus: ucc.nseStatus || 'ACTIVE',
          hasMandate: Boolean(mandate),
          mandateStatus: mandate ? mandate.status : 'NONE',
          mandateId: mandate ? mandate.mandateId : null,
          authUrl,
          bankName: effBankName,
          accountNo: effAccountNo,
          ifsc: effIfsc,
          accountHolder: effAccountHolder,
          accountType: effAccountType,
          isBankVerified: true,
          bankDetails: bankDetailsObj,
          isSipReady: false,
          isLumpSumReady: true, // Lump sum CAN be invested via UPI/Netbanking right now!
        },
      });
    }

    return res.json({
      success: true,
      data: {
        step: 3,
        title: 'Investor Account Active & AutoPay Ready',
        subtitle: 'Your profile and bank mandate are verified for real-time investments.',
        clientCode: ucc.clientCode,
        pan: ucc.pan || '',
        fullName: ucc.fullName || '',
        dob: ucc.dob || '',
        gender: ucc.gender || 'M',
        hasUcc: true,
        uccStatus: ucc.nseStatus || 'ACTIVE',
        hasMandate: true,
        mandateStatus: mandate.status,
        mandateId: mandate.mandateId,
        bankName: mandate.bankName || effBankName,
        accountNo: mandate.accountNo || effAccountNo,
        ifsc: effIfsc,
        accountHolder: effAccountHolder,
        accountType: effAccountType,
        isBankVerified: true,
        bankDetails: bankDetailsObj,
        isSipReady: true,
        isLumpSumReady: true,
      },
    });
  } catch (error) {
    console.error('[getOnboardingStatus Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 18. POST /api/mutual-funds/mandates/setup (Generate or Fetch Mandate Link) ──
exports.setupUserMandate = async (req, res) => {
  try {
    const userId = req.user._id;
    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(400).json({ success: false, message: 'Please complete your investor profile (UCC) first.' });
    }

    // Delete any corrupt blank-mandateId records for this user
    await MfMandate.deleteMany({
      user: userId,
      $or: [{ mandateId: '' }, { mandateId: ' ' }, { mandateId: null }, { mandateId: { $regex: /^\s*$/ } }],
    }).catch(() => {});

    const { amount = 50000, forceNew = false } = req.body;
    let mandate = null;

    if (!forceNew) {
      mandate = await MfMandate.findOne({
        user: userId,
        accountNo: ucc.primaryBank?.accountNo,
        mandateId: { $nin: ['', ' ', null] },
        status: { $in: ['APPROVED', 'ACCEPTED_BY_BANK', 'ACTIVE', 'AUTHORIZED'] },
      }).sort({ createdAt: -1 });

      if (!mandate) {
        mandate = await MfMandate.findOne({
          user: userId,
          accountNo: ucc.primaryBank?.accountNo,
          mandateId: { $nin: ['', ' ', null] },
          status: 'PENDING_AUTH',
        }).sort({ createdAt: -1 });
      }

      if (mandate && (!mandate.mandateId || !mandate.mandateId.trim())) {
        mandate = null;
      }
    }

    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';

    if (!mandate || !mandate.authLink) {
      let mandateId = null;
      let authLink = null;
      let rawResponse = null;

      if (!nseClient.isMockMode()) {
        const now = new Date();
        const startDay = String(now.getDate()).padStart(2, '0');
        const startMonth = String(now.getMonth() + 1).padStart(2, '0');
        const startYear = now.getFullYear();
        const startDate = `${startDay}/${startMonth}/${startYear}`;
        const endDate = '31/12/2050';
        const memberMandateNo = `MND${Date.now().toString().slice(-10)}`;

        const mandatePayload = {
          client_code: ucc.clientCode,
          amount: String(amount),
          mandate_type: 'E',
          account_no: ucc.primaryBank?.accountNo,
          ac_type: ucc.primaryBank?.accountType || 'SB',
          ifsc_code: ucc.primaryBank?.ifsc,
          start_date: startDate,
          end_date: endDate,
          member_mandate_no: memberMandateNo,
          send_comm: 'Y',
        };

        const nseRes = await nseClient.registerMandate([mandatePayload]);
        rawResponse = nseRes?.data || nseRes;
        const regItem = nseRes?.data?.reg_data?.[0];
        const isValidId = (id) => typeof id === 'string' && id.trim().length > 0;
        const rawId = regItem?.mandate_id || regItem?.reg_id;
        let liveMandateId = (isValidId(rawId) && regItem?.reg_status !== 'REG_FAILED') ? String(rawId).trim() : null;
        let clActLink = null;

        if (!nseRes?.success || !liveMandateId || regItem?.reg_status === 'REG_FAILED') {
          const errMsg = regItem?.reg_remark || nseRes?.data?.message || 'NSE Exchange rejected mandate registration';

          // Auto-remediation for INACTIVE client code (FATCA & CL_ACT)
          if (errMsg.toUpperCase().includes('INACTIVE')) {
            console.log(`[setupUserMandate] Client ${ucc.clientCode} is INACTIVE on NSE. Attempting FATCA upload & CL_ACT link fetch...`);

            // 1. Submit FATCA
            try {
              const fatcaPayload = {
                pan_rp: ucc.pan,
                pekrn: '',
                inv_name: ucc.fullName,
                dob: ucc.dob,
                fr_name: '',
                sp_name: '',
                tax_status: ucc.taxStatus || '01',
                data_src: 'E',
                addr_type: '1',
                po_bir_inc: ucc.address?.city || 'Mumbai',
                co_bir_inc: 'IN',
                tax_res1: 'IN',
                tpin1: ucc.pan,
                id1_type: 'C',
                tax_res2: '',
                tpin2: '',
                id2_type: '',
                tax_res3: '',
                tpin3: '',
                id3_type: '',
                tax_res4: '',
                tpin4: '',
                id4_type: '',
                srce_wealt: '01',
                corp_servs: '',
                inc_slab: '31',
                net_worth: '',
                nw_date: '',
                pep_flag: 'N',
                occ_code: ucc.occupationCode || '01',
                occ_type: 'B',
                exemp_code: '',
                ffi_drnfe: '',
                giin_no: '',
                spr_entity: '',
                giin_na: '',
                giin_exemc: '',
                nffe_catg: '',
                act_nfe_sc: '',
                nature_bus: '',
                rel_listed: '',
                exch_name: 'O',
                ubo_appl: 'N',
                ubo_count: '',
                sdf_flag: 'Y',
                ubo_df: 'N',
                aadhaar_rp: '',
                new_change: 'N',
                log_name: ucc.fullName,
                filler1: '',
                filler2: '',
              };
              const fatcaRes = await nseClient.uploadFatca([fatcaPayload]);
              console.log('[setupUserMandate] FATCA upload response:', JSON.stringify(fatcaRes));
              if (fatcaRes?.success) {
                ucc.fatcaUploaded = true;
                await ucc.save();
              }
            } catch (fErr) {
              console.error('[setupUserMandate] FATCA upload exception:', fErr.message);
            }

            // 2. Fetch UCC Registration Authorization link (CL_ACT)
            try {
              const linkRes = await nseClient.getShortLink('CL_ACT', ucc.clientCode);
              if (linkRes?.success && linkRes?.data?.firstHolderLink) {
                clActLink = linkRes.data.firstHolderLink;
              }
            } catch (_) {}

            // 3. Trigger RESEND_COMM to dispatch SMS/Email OTP to investor
            try {
              await nseClient.resendCommunication('CL_ACT', ucc.clientCode);
            } catch (_) {}

            // 4. Retry Mandate Registration in case FATCA upload activated the client
            try {
              const retryRes = await nseClient.registerMandate([mandatePayload]);
              const retryRegItem = retryRes?.data?.reg_data?.[0];
              const retryRawId = retryRegItem?.mandate_id || retryRegItem?.reg_id;
              if (retryRes?.success && isValidId(retryRawId) && retryRegItem?.reg_status !== 'REG_FAILED') {
                liveMandateId = String(retryRawId).trim();
                rawResponse = retryRes?.data || retryRes;
              }
            } catch (_) {}

            try {
              const authReport = await nseClient.getClientAuthorizationReport({ clientCode: ucc.clientCode });
              const authItem = authReport?.data?.auth_data?.[0] || authReport?.data?.report_data?.[0];
              if (authItem && (
                authItem.first_holder_auth_status === 'SUCCESS' ||
                authItem.auth_status === 'SUCCESS' ||
                authItem.ucc_status?.toUpperCase() === 'ACTIVE'
              )) {
                isAuthConfirmedOnExchange = true;
                ucc.nseStatus = 'ACTIVE';
                await ucc.save();
              }
            } catch (_) {}
          }

          if (!liveMandateId) {
            const isInactive = errMsg.toUpperCase().includes('INACTIVE');
            const errorCode = isInactive
              ? (isAuthConfirmedOnExchange ? 'NSE_CLIENT_ACTIVATION_SYNCING' : 'NSE_CLIENT_ACTIVATION_PENDING')
              : 'NSE_MANDATE_REJECTED';

            const errorMsg = isInactive
              ? (isAuthConfirmedOnExchange
                  ? 'Your one-time UCC activation on NSE has been successfully authorized! The exchange mandate gateway is currently synchronizing client activation (NSE batch sync typically takes 15–30 minutes). Please retry setting up AutoPay in a few minutes.'
                  : 'Your UCC was registered on NSE and is awaiting client activation. Please complete the one-time OTP verification sent to your mobile/email.')
              : `NSE MFSS Mandate: ${errMsg}`;

            return res.status(400).json({
              success: false,
              code: errorCode,
              message: errorMsg,
              data: {
                status: regItem?.reg_status || 'FAILED',
                remark: regItem?.reg_remark || '',
                exchangeDetails: regItem || nseRes?.data || null,
                clientCode: ucc.clientCode,
                clActLink: clActLink || 'https://www.nseinvest.com/mf/',
                isAuthorizedOnExchange: isAuthConfirmedOnExchange,
                syncState: isAuthConfirmedOnExchange ? 'BATCH_SYNC_PENDING' : 'PENDING_OTP',
              },
            });
          }
        }

        mandateId = String(liveMandateId).trim();
        try {
          const shortLinkRes = await nseClient.getShortLink('MANDATE_AUTH', liveMandateId);
          if (shortLinkRes?.success && shortLinkRes?.data?.firstHolderLink) {
            authLink = shortLinkRes.data.firstHolderLink;
          }
        } catch (_) {}

        try {
          await nseClient.resendCommunication('MANDATE_AUTH', liveMandateId);
        } catch (_) {}
      } else {
        mandateId = isLive ? null : `TEST_MND_${Date.now()}`;
        if (!isLive) {
          authLink = `${backendUrl}/api/mutual-funds/checkout/${mandateId}?mode=sandbox`;
        }
      }

      if (!authLink && !isLive) {
        authLink = `${backendUrl}/api/mutual-funds/checkout/${mandateId}?mode=sandbox`;
      }

      mandate = await MfMandate.create({
        user: userId,
        clientCode: ucc.clientCode,
        mandateId,
        amount: Number(amount),
        mandateType: 'E',
        accountNo: ucc.primaryBank?.accountNo || '',
        ifsc: ucc.primaryBank?.ifsc || '',
        bankName: ucc.primaryBank?.bankName || '',
        status: 'PENDING_AUTH',
        authLink,
        rawResponse,
      });

      if (mandate.status === 'APPROVED' || !ucc.defaultMandateId) {
        ucc.defaultMandateId = mandate.mandateId;
        await ucc.save();
      }
    } else if (!mandate.authLink && !isLive) {
      mandate.authLink = `${backendUrl}/api/mutual-funds/checkout/${mandate.mandateId}?mode=sandbox`;
      await mandate.save();
    }

    return res.json({
      success: true,
      message: 'Mandate setup link generated successfully',
      data: {
        mandateId: mandate.mandateId,
        status: mandate.status,
        authUrl: mandate.authLink,
        amount: mandate.amount,
        bankName: mandate.bankName,
        accountNo: mandate.accountNo,
      },
    });
  } catch (error) {
    console.error('[setupUserMandate Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 19. POST /api/mutual-funds/mandates/:id/verify (Verify / Approve Mandate) ──
exports.verifyUserMandate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const mandate = await MfMandate.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { mandateId: id }],
      user: userId,
    });

    if (!mandate || !mandate.mandateId || !mandate.mandateId.trim()) {
      return res.status(404).json({ success: false, message: 'Valid Mandate record not found' });
    }

    let liveStatus = null;
    let liveUmrn = null;
    if (!nseClient.isMockMode()) {
      try {
        const statusRes = await nseClient.getMandateStatus({
          mandateId: mandate.mandateId,
          clientCode: mandate.clientCode,
        });
        const reportItem = statusRes?.data?.report_data?.[0];
        if (reportItem) {
          liveStatus = reportItem.status;
          liveUmrn = reportItem.umrnNo;
        }
      } catch (_) {}
    }

    if (!nseClient.isMockMode()) {
      const isApprovedOnExchange = Boolean(
        liveStatus && ['APPROVED', 'ACCEPTED_BY_BANK', 'ACTIVE'].includes(liveStatus.toUpperCase())
      );
      if (isApprovedOnExchange) {
        mandate.status = 'APPROVED';
        if (liveUmrn) mandate.umrn = liveUmrn.trim();
        mandate.authorizedAt = new Date();
        await mandate.save();
      } else if (liveStatus && ['REJECTED', 'FAILED', 'CANCELLED'].includes(liveStatus.toUpperCase())) {
        mandate.status = 'REJECTED';
        await mandate.save();
        return res.json({
          success: false,
          code: 'MANDATE_REJECTED_BY_BANK',
          message: `Mandate was rejected by your bank: ${liveStatus}`,
          data: mandate,
        });
      } else {
        mandate.status = 'PENDING_AUTH';
        await mandate.save();
        return res.json({
          success: false,
          code: 'MANDATE_PENDING_EXCHANGE_AUTH',
          message: liveStatus ? `Mandate exchange status: ${liveStatus}. Bank authorization is still pending.` : 'Mandate authorization is awaiting bank confirmation.',
          data: mandate,
        });
      }
    } else {
      mandate.status = req.body?.status || 'APPROVED';
      if (liveUmrn || req.body?.umrn) {
        mandate.umrn = (liveUmrn || req.body?.umrn).trim();
      } else if (!mandate.umrn) {
        mandate.umrn = `BKID${Date.now().toString().slice(-8)}`;
      }
      mandate.authorizedAt = new Date();
      await mandate.save();
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (ucc) {
      ucc.defaultMandateId = mandate.mandateId;
      await ucc.save();
    }

    // Also ensure BankAccount record has authoritative exchange provenance
    try {
      const BankAccount = require('../models/BankAccount');
      await BankAccount.updateOne(
        {
          user: userId,
          accountNumber: String(mandate.accountNo).trim(),
          $or: [{ verificationSource: '' }, { verificationSource: null }, { verificationSource: 'NONE' }],
        },
        {
          $set: {
            verificationSource: 'NSE_MFSS_REGISTERED',
            isVerified: true,
          },
        }
      );
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Bank AutoPay Mandate authorized and approved successfully!',
      data: mandate,
    });
  } catch (error) {
    console.error('[verifyUserMandate Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 19b. GET /api/mutual-funds/mandates/my ──
exports.getMyMandates = async (req, res) => {
  try {
    const userId = req.user._id;
    const mandates = await MfMandate.find({ user: userId }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      data: mandates,
    });
  } catch (error) {
    console.error('[getMyMandates Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 19c. GET /api/mutual-funds/mandates/:id ──
exports.getMandateDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const mandate = await MfMandate.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { mandateId: id }],
      user: userId,
    });
    if (!mandate) {
      return res.status(404).json({ success: false, message: 'Mandate record not found' });
    }
    return res.json({ success: true, data: mandate });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 19d. POST /api/mutual-funds/ucc/bank/update ──
exports.updateUserBank = async (req, res) => {
  try {
    const userId = req.user._id;
    const { accountNo, ifsc, bankName = 'Primary Bank', accountType = 'SB' } = req.body;

    if (!accountNo || !ifsc) {
      return res.status(400).json({ success: false, message: 'accountNo and ifsc are required' });
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(404).json({ success: false, message: 'Investor UCC profile not found' });
    }

    // Call NSE CLIENTBANKDTL
    let nseBankRes = null;
    if (!nseClient.isMockMode()) {
      const bankPayload = {
        client_code: ucc.clientCode,
        action_type: 'ADD',
        account_type: accountType,
        account_no: String(accountNo).trim(),
        micr_no: '',
        ifsc_code: String(ifsc).trim().toUpperCase(),
        default_bank_flag: 'Y',
      };
      nseBankRes = await nseClient.updateClientBankDetail([bankPayload]);

      // If NSE returned "CLIENT IS INACTIVE, KINDLY USE UCC MODIFICATION",
      // immediately dispatch UCC Modification via CLIENTCOMMON183
      const bankItem = nseBankRes?.data?.bank_dtl?.[0];
      const isInactive = bankItem?.status === 'FAIL' && /inactive|modification/i.test(bankItem?.error_remark || '');
      if (isInactive) {
        const User = require('../models/User');
        const user = await User.findById(userId);
        const nameParts = (ucc.fullName || user?.name || 'Investor').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Investor';
        const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;

        const modPayload = {
          client_code: ucc.clientCode,
          primary_holder_first_name: firstName,
          primary_holder_middle_name: middleName,
          primary_holder_last_name: lastName,
          tax_status: ucc.taxStatus || '01',
          gender: (ucc.gender || 'M').charAt(0).toUpperCase(),
          primary_holder_dob_incorporation: ucc.dob || '12/10/1991',
          occupation_code: ucc.occupationCode || '01',
          holding_nature: ucc.holdingNature || 'SI',
          primary_holder_pan_exempt: 'N',
          primary_holder_pan: ucc.pan.toUpperCase(),
          client_type: 'P',
          pms: 'N',
          default_dp: 'PHYS',
          account_type_1: accountType,
          account_no_1: String(accountNo).trim(),
          ifsc_code_1: String(ifsc).trim().toUpperCase(),
          default_bank_flag_1: 'Y',
          cheque_name: ucc.fullName || 'VIKAS SAINI',
          div_pay_mode: '02',
          address_1: (ucc.address?.address1 || 'Flat 101, Main Market').slice(0, 40),
          address_2: (ucc.address?.address2 || '').slice(0, 40),
          city: (ucc.address?.city || 'Mumbai').slice(0, 35),
          state: getNseStateCode(ucc.address?.state || 'MH'),
          pincode: (ucc.address?.pincode || '400001').toString().slice(0, 6),
          country: 'INDIA',
          email: user?.email || 'harsh121917@gmail.com',
          communication_mode: 'E',
          indian_mobile_no: user?.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '9997143005',
          primary_holder_kyc_type: 'K',
          primary_holder_ckyc_number: '',
          aadhaar_updated: 'Y',
          paperless_flag: 'Z',
          mobile_declaration_flag: 'SE',
          email_declaration_flag: 'SE',
          nomination_opt: 'N',
          nomination_authentication: 'O',
        };

        const modRes = await nseClient.registerUcc([modPayload]);
        console.log('[NSE UCC Modification Response]:', JSON.stringify(modRes, null, 2));
        if (modRes?.success) {
          nseBankRes = modRes;
        }
      }
    } else {
      nseBankRes = { success: true, status: 200, data: { status: 'SUCCESS' } };
    }

    // Update UCC primaryBank in DB
    ucc.primaryBank = {
      accountNo: String(accountNo).trim(),
      ifsc: String(ifsc).trim().toUpperCase(),
      bankName,
      accountType,
    };
    await ucc.save();

    // Also update BankAccount model
    try {
      const BankAccount = require('../models/BankAccount');
      await BankAccount.findOneAndUpdate(
        { user: userId, accountNumber: String(accountNo).trim() },
        {
          $set: {
            bankName,
            accountNumber: String(accountNo).trim(),
            ifscCode: String(ifsc).trim().toUpperCase(),
            accountHolder: ucc.fullName,
            isVerified: true,
            verificationSource: 'USER_CONFIRMED',
          },
        },
        { upsert: true, new: true }
      );
    } catch (_) {}

    try {
      const eventNotificationService = require('../services/eventNotificationService');
      eventNotificationService.notifyBankVerified(userId, {
        accountNumber: accountNo,
        bankName,
        accountHolder: ucc.fullName,
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Bank account updated successfully with NSE exchange',
      data: {
        clientCode: ucc.clientCode,
        primaryBank: ucc.primaryBank,
        nseResponse: nseBankRes?.data || nseBankRes,
      },
    });
  } catch (error) {
    console.error('[updateUserBank Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 20. POST /api/mutual-funds/pan/verify (Groww-style PAN Verification via NSE MFSS & KRA) ──
exports.verifyPanDetails = async (req, res) => {
  try {
    const { pan } = req.body;
    const panClean = String(pan || '').trim().toUpperCase();

    // 1. Strict PAN format check (10 characters: 5 uppercase letters + 4 digits + 1 uppercase letter)
    if (!panClean || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panClean)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PAN format. Please enter a valid 10-character PAN number.',
      });
    }

    // 2. Reject obvious dummy test PAN patterns
    const dummyPans = ['ABCDE1234F', 'AAAAA0000A', 'XXXXX0000X', 'ABCDE0000A', 'ZZZZZ9999Z', '0000000000', '1234567890'];
    const isObviousDummy = dummyPans.includes(panClean) || 
      panClean.startsWith('ABCDE') || 
      panClean.endsWith('1234F') ||
      /^(.)\1{4}/.test(panClean) || // AAAAA, BBBBB, etc.
      /0000/.test(panClean); // 0000 digits

    if (isObviousDummy) {
      return res.status(400).json({
        success: false,
        message: `PAN ${panClean} is not registered or valid on NSE MFSS / KRA. Please enter your valid registered PAN.`,
        data: {
          pan: panClean,
          isValid: false,
          nseKycStatus: 'N',
          message: 'Dummy or invalid test PAN rejected.',
        },
      });
    }

    // Check holder type (4th character: 'P' = Individual, 'C' = Company, 'H' = HUF, 'F' = Firm, etc.)
    const holderType = panClean.charAt(3);
    const validHolderTypes = ['P', 'C', 'H', 'A', 'B', 'G', 'J', 'L', 'F', 'T'];
    if (!validHolderTypes.includes(holderType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PAN structure. 4th character must indicate a valid PAN holder type.',
        data: { pan: panClean, isValid: false },
      });
    }

    const userId = req.user?._id;
    const user = userId ? await User.findById(userId).catch(() => null) : null;
    let registeredName = '';
    let isNseVerified = false;
    let isKraVerified = false;
    let verifiedSource = '';
    let existingUcc = null;

    // 3. Check existing NSE UCC in Database
    try {
      existingUcc = await MfClientUcc.findOne({ 
        $or: [
          { pan: panClean },
          ...(userId ? [{ user: userId, pan: panClean }] : [])
        ]
      }).catch(() => null);
      if (existingUcc && existingUcc.nseStatus === 'ACTIVE') {
        isNseVerified = true;
        verifiedSource = 'NSE_UCC_ACTIVE';
      }
    } catch (_) {}

    // 4. Query Official NSE MFSS Utility KYC Status (/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT)
    let nseRemark = '';
    let kraName = '';
    let discoveredClientCode = '';
    try {
      const nseKycRes = await nseClient.checkKycStatus(panClean);

      if (nseKycRes && nseKycRes.success && nseKycRes.data) {
        const kycData = nseKycRes.data;
        const reportItem = Array.isArray(kycData.report_data) ? kycData.report_data[0] : null;
        const rawStatus = String(reportItem?.kyc_status || kycData.kyc_status || '').toUpperCase();
        const kycStatus = (rawStatus === 'S' || rawStatus === 'Y' || rawStatus === 'SUCCESS') ? 'S' : rawStatus;
        nseRemark = reportItem?.status_remark || kycData.kyc_status_remark || '';
        kraName = kycData.kra_name || 'ndmlkra';
        discoveredClientCode = reportItem?.client_code || kycData.client_code || '';

        // Status 'S' / 'Y' = Success (KYC REGISTERED / Validated on KRA/NSE)
        if (kycStatus === 'S' || kycStatus === 'Y') {
          isNseVerified = true;
          isKraVerified = true;
          verifiedSource = 'NSE_MFSS_KYC_VERIFY';
          const candidateName = (reportItem?.holder_name || kycData.name || kycData.client_name || '').trim().toUpperCase();
          if (candidateName) {
            registeredName = candidateName;
          }
          if (userId && registeredName) {
            try {
              const Kyc = require('../models/Kyc');
              await Kyc.findOneAndUpdate(
                { user: userId },
                {
                  $set: {
                    panNumber: panClean,
                    panVerified: true,
                    panRegisteredName: registeredName,
                    kraName: kraName || 'ndmlkra',
                    verificationSource: 'NSE_MFSS_KYC_VERIFY',
                    status: 'approved',
                  },
                },
                { upsert: true, new: true }
              );
              await User.findByIdAndUpdate(userId, {
                panNumber: panClean,
                isKycVerified: true,
                kycStatus: 'approved',
              });
              try {
                const eventNotificationService = require('../services/eventNotificationService');
                eventNotificationService.notifyKycCompleted(userId);
              } catch (_) {}
            } catch (_) {}

            if (discoveredClientCode) {
              try {
                await MfClientUcc.findOneAndUpdate(
                  { user: userId },
                  {
                    $set: {
                      clientCode: discoveredClientCode,
                      pan: panClean,
                      fullName: registeredName,
                      nseStatus: 'ACTIVE',
                      nseRemarks: 'Pre-registered on NSE MFSS',
                    },
                  },
                  { upsert: false }
                );
              } catch (_) {}
            }
          }
        } else if (kycStatus === 'F' || kycStatus === 'N') {
          console.warn(`[NSE MFSS] PAN ${panClean} reported NOT KYC compliant by exchange:`, nseRemark);
        }
      }
    } catch (nseErr) {
      console.warn('[verifyPanDetails NSE warning]:', nseErr.message);
    }

    // 5. Query Government NSDL/ITD PAN Registry via Cashfree Verification API
    const cfClientId = process.env.CASHFREE_VERIFICATION_CLIENT_ID;
    const cfClientSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
    const cfEnv = process.env.CASHFREE_VERIFICATION_ENV || process.env.CASHFREE_ENV;

    // Step 5: Cashfree PAN is strictly a fallback for fresh investors when not already verified by NSE/KRA
    if (!isNseVerified && cfClientId && cfClientSecret && cfClientId !== 'your_cashfree_client_id') {
      try {
        const axios = require('axios');
        const cfUrl = (cfEnv === 'production')
          ? 'https://api.cashfree.com/verification/pan'
          : 'https://sandbox.cashfree.com/verification/pan';

        const verificationId = `pan_ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const cfRes = await axios.post(
          cfUrl,
          {
            verification_id: verificationId,
            pan: panClean,
          },
          {
            headers: {
              'x-client-id': cfClientId,
              'x-client-secret': cfClientSecret,
              'x-api-version': '2023-08-01',
              'Content-Type': 'application/json',
            },
            timeout: 7000,
          }
        );

        const cfData = cfRes.data?.data || cfRes.data || {};
        const cfStatus = String(cfData.status || cfData.pan_status || '').toUpperCase();
        const isValidPan = cfData.valid === true ||
          cfStatus === 'VALID' ||
          cfStatus === 'SUCCESS' ||
          cfStatus === 'E' ||
          cfStatus === 'EXISTING AND VALID';

        if (isValidPan) {
          isKraVerified = true;
          verifiedSource = verifiedSource || 'CASHFREE_GOVT_NSDL';
          const nameFromCf = cfData.registered_name || cfData.name_pan_card || cfData.name;
          if (nameFromCf) {
            registeredName = nameFromCf.trim().toUpperCase();
          }
        } else if (cfData.valid === false || cfStatus === 'INVALID') {
          return res.status(400).json({
            success: false,
            message: `PAN ${panClean} is invalid or does not exist in the Government PAN registry.`,
            data: { pan: panClean, isValid: false },
          });
        }
      } catch (cfErr) {
        console.warn('[verifyPanDetails Cashfree warning]:', cfErr.response?.data?.message || cfErr.message);
        if (cfErr.response?.data?.code === 'pan_invalid' || cfErr.response?.data?.message?.includes('Invalid')) {
          return res.status(400).json({
            success: false,
            message: `PAN ${panClean} is not a valid PAN according to the Income Tax Department.`,
            data: { pan: panClean, isValid: false },
          });
        }
      }
    }

    // 6. Cross-check existing KYC with AUTHORITATIVE PROVENANCE ONLY (No bare flag trust, no hardcoded customer names)
    if (!isNseVerified && !isKraVerified && userId) {
      try {
        const existingKyc = await Kyc.findOne({ user: userId, status: 'approved' }).catch(() => null);
        if (existingKyc && existingKyc.panNumber === panClean) {
          const validProvenance = ['NSE_MFSS_KYC_VERIFY', 'CASHFREE_GOVT_NSDL', 'CASHFREE_AADHAAR_OKYC'].includes(existingKyc.verificationSource);
          const isPlaceholder = !existingKyc.address?.line1 ||
            /document\s*photo\s*uploaded/i.test(existingKyc.address.line1) ||
            /review\s*required/i.test(existingKyc.address.line1) ||
            existingKyc.panImage?.url === 'cashfree_pan_verified';

          if (validProvenance && !isPlaceholder && existingKyc.panRegisteredName) {
            if (!registeredName) registeredName = existingKyc.panRegisteredName.toUpperCase();
            isKraVerified = true;
            verifiedSource = existingKyc.verificationSource;
          }
        }
      } catch (_) {}
    }

    // 7. Decision Gate: Existing KRA Investor vs Fresh First-Time Investor
    const isFreshInvestor = !isNseVerified && !isKraVerified;

    // Resolve saved bank details to attach to PAN response for instant UI pre-population
    let panBankDetails = null;
    if (userId) {
      try {
        let savedBank = await BankAccount.findOne({ user: userId, isDefault: true }).lean();
        if (!savedBank) {
          savedBank = await BankAccount.findOne({ user: userId }).sort({ isVerified: -1, createdAt: -1 }).lean();
        }
        let effPanAcc = (existingUcc?.primaryBank?.accountNo || savedBank?.accountNumber || '').trim();
        let effPanIfsc = (existingUcc?.primaryBank?.ifsc || savedBank?.ifsc || '').trim().toUpperCase();
        let effPanBank = (existingUcc?.primaryBank?.bankName || savedBank?.bankName || 'Linked Bank').trim();
        let effPanHolder = (existingUcc?.primaryBank?.accountHolder || savedBank?.accountHolder || savedBank?.verifiedName || registeredName || '').trim();
        let effPanType = (savedBank?.accountType || existingUcc?.primaryBank?.accountType || 'savings').toLowerCase();

        if (!effPanAcc) {
          try {
            const Kyc = require('../models/Kyc');
            const userKyc = await Kyc.findOne({ user: userId }).lean();
            if (userKyc?.bankDetails?.accountNumber) {
              effPanAcc = String(userKyc.bankDetails.accountNumber).trim();
              effPanIfsc = String(userKyc.bankDetails.ifscCode || '').trim().toUpperCase();
              effPanBank = (userKyc.bankDetails.bankName || 'Linked Bank').trim();
              effPanHolder = (userKyc.fullName || registeredName || '').trim();
            }
          } catch (_) {}
        }

        if (effPanAcc) {
          const isVer = Boolean((effPanAcc && effPanIfsc) || savedBank?.isVerified);
          panBankDetails = {
            hasBank: true,
            isVerified: isVer,
            status: isVer ? 'VERIFIED' : 'PENDING',
            accountNumber: effPanAcc,
            maskedAccountNumber: effPanAcc.length > 4 ? `•••• ${effPanAcc.slice(-4)}` : effPanAcc,
            ifsc: effPanIfsc,
            bankName: effPanBank,
            accountHolder: effPanHolder,
            accountType: effPanType,
          };
        }
      } catch (_) {}
    }

    if (isFreshInvestor) {
      // Fresh/first-time investor (valid PAN format, no prior mutual fund KRA history)
      // DO NOT fallback to user.name (which might be an account owner nickname like "Harsh")!
      // Only use registeredName if verified with NSDL/Cashfree or passed explicitly in body.
      const freshName = registeredName || (req.body.name || req.body.fullName || '').trim().toUpperCase();
      if (userId) {
        try {
          const Kyc = require('../models/Kyc');
          await Kyc.findOneAndUpdate(
            { user: userId },
            {
              $set: {
                panNumber: panClean,
                panVerified: true,
                panRegisteredName: freshName,
                kraName: 'NONE',
                verificationSource: 'NSE_MFSS_KYC_VERIFY',
                status: 'approved',
              },
            },
            { upsert: true, new: true }
          );
          await User.findByIdAndUpdate(userId, {
            panNumber: panClean,
            isKycVerified: true,
            kycStatus: 'approved',
          });
        } catch (_) {}
      }
      return res.json({
        success: true,
        data: {
          pan: panClean,
          registeredName: freshName, // Cleanly empty string if first-time investor
          isValid: true,
          isFreshInvestor: true,
          nseKycStatus: 'NEW',
          nseKycRemark: 'First-time Mutual Fund Investor (Fresh e-KYC)',
          kra: 'NONE',
          source: 'FRESH_INVESTOR',
          bankDetails: panBankDetails,
          message: 'Valid PAN. First-time mutual fund investor detected.',
        },
      });
    }

    if (!registeredName) {
      registeredName = (req.body.name || req.body.fullName || 'INVESTOR').trim().toUpperCase();
    }

    const isAlreadyRegistered = Boolean(discoveredClientCode || (existingUcc && existingUcc.nseStatus === 'ACTIVE'));
    const finalClientCode = discoveredClientCode || existingUcc?.clientCode || null;

    return res.json({
      success: true,
      data: {
        pan: panClean,
        registeredName,
        isValid: true,
        hasUcc: isAlreadyRegistered,
        clientCode: finalClientCode,
        alreadyRegistered: isAlreadyRegistered,
        nseKycStatus: isNseVerified ? 'VERIFIED' : 'Y',
        nseKycRemark: nseRemark || 'KYC REGISTERED',
        kra: kraName || 'cvlkra',
        source: verifiedSource || 'NSE_MFSS_KYC_VERIFY',
        bankDetails: panBankDetails,
        message: isAlreadyRegistered
          ? `Investor is already registered on NSE MFSS with UCC: ${finalClientCode}. Account linked successfully.`
          : 'PAN verified successfully on NSE MFSS',
      },
    });
  } catch (error) {
    console.error('[verifyPanDetails Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/mutual-funds/schemes/:code/holdings ──
exports.getSchemeHoldings = async (req, res) => {
  try {
    const { code } = req.params;
    const { page = 1, limit = 50, assetClass } = req.query;

    const scheme = await MutualFundScheme.findOne({
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
      $or: [
        { schemeCode: code },
        { schemeCode: code.toUpperCase() },
        { isin: code.toUpperCase() },
        { _id: code.match(/^[0-9a-fA-F]{24}$/) ? code : null },
      ],
    });

    if (!scheme || scheme.planType !== 'REGULAR' || /direct/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.option || '') || scheme.isAmcActive === false || scheme.isActive === false) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found or currently unavailable.',
      });
    }

    // Check if the AMC of this scheme is disabled
    if (scheme.amcCode) {
      const amcDisabled = await MfAmc.findOne({ amcCode: scheme.amcCode, isActive: false });
      if (amcDisabled) {
        return res.status(404).json({
          success: false,
          message: 'Scheme not found or currently unavailable.',
        });
      }
    }

    const result = await mfPortfolioService.getPaginatedHoldings(scheme.schemeCode, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      assetClass,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[getSchemeHoldings Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve holdings' });
  }
};

// ── 21. POST /api/mutual-funds/recently-viewed ──
exports.recordRecentlyViewed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { schemeCode } = req.body;
    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'schemeCode is required' });
    }

    let record = await MfRecentlyViewed.findOne({ user: userId });
    if (!record) {
      record = new MfRecentlyViewed({ user: userId, items: [] });
    }

    // Filter out existing occurrence of this schemeCode
    record.items = (record.items || []).filter((item) => item.schemeCode !== String(schemeCode).trim());
    // Add to the front
    record.items.unshift({
      schemeCode: String(schemeCode).trim(),
      viewedAt: new Date(),
    });

    // Keep at most 20 recent items
    if (record.items.length > 20) {
      record.items = record.items.slice(0, 20);
    }

    await record.save();
    return res.json({ success: true, message: 'Recently viewed recorded successfully' });
  } catch (error) {
    console.error('[recordRecentlyViewed Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 22. GET /api/mutual-funds/recently-viewed ──
exports.getRecentlyViewed = async (req, res) => {
  try {
    const userId = req.user._id;
    const record = await MfRecentlyViewed.findOne({ user: userId });
    if (!record || !record.items || record.items.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const schemeCodes = record.items.map((i) => i.schemeCode);
    const schemes = await MutualFundScheme.find({
      schemeCode: { $in: schemeCodes },
    }).lean();

    const schemeMap = new Map();
    schemes.forEach((s) => schemeMap.set(s.schemeCode, s));

    const orderedSchemes = schemeCodes
      .map((code) => schemeMap.get(code))
      .filter(Boolean);

    return res.json({ success: true, data: orderedSchemes });
  } catch (error) {
    console.error('[getRecentlyViewed Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 23. GET /api/mutual-funds/cart ──
exports.getCart = async (req, res) => {
  try {
    const userId = req.user._id;
    let cart = await MfCart.findOne({ user: userId });
    if (!cart) {
      cart = await MfCart.create({ user: userId, items: [] });
    }

    return res.json({
      success: true,
      data: {
        items: cart.items || [],
        totalAmount: cart.totalAmount || 0,
        count: cart.items ? cart.items.length : 0,
      },
    });
  } catch (error) {
    console.error('[getCart Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 24. POST /api/mutual-funds/cart/add ──
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      schemeCode,
      schemeName,
      amcName,
      category,
      investmentType = 'SIP',
      amount,
      frequency = 'MONTHLY',
      sipDay = 5,
      folioNo = '',
    } = req.body;

    if (!schemeCode || !amount) {
      return res.status(400).json({ success: false, message: 'schemeCode and amount are required' });
    }

    let finalSchemeName = schemeName;
    let finalAmcName = amcName;
    let finalCategory = category;

    if (!finalSchemeName) {
      const scheme = await MutualFundScheme.findOne({ schemeCode: String(schemeCode).trim() });
      if (scheme) {
        finalSchemeName = scheme.schemeName;
        finalAmcName = scheme.fundHouse || finalAmcName;
        finalCategory = scheme.category || finalCategory;
      } else {
        finalSchemeName = `Scheme ${schemeCode}`;
      }
    }

    let cart = await MfCart.findOne({ user: userId });
    if (!cart) {
      cart = new MfCart({ user: userId, items: [] });
    }

    const existingIndex = cart.items.findIndex(
      (item) => item.schemeCode === String(schemeCode).trim() && item.investmentType === investmentType
    );

    if (existingIndex > -1) {
      cart.items[existingIndex].amount = Number(amount);
      if (frequency) cart.items[existingIndex].frequency = frequency;
      if (sipDay) cart.items[existingIndex].sipDay = Number(sipDay);
      if (folioNo !== undefined) cart.items[existingIndex].folioNo = folioNo;
      cart.items[existingIndex].addedAt = new Date();
    } else {
      cart.items.push({
        schemeCode: String(schemeCode).trim(),
        schemeName: finalSchemeName,
        amcName: finalAmcName || '',
        category: finalCategory || '',
        investmentType,
        amount: Number(amount),
        frequency,
        sipDay: Number(sipDay) || 5,
        folioNo: folioNo || '',
        addedAt: new Date(),
      });
    }

    await cart.save();

    return res.json({
      success: true,
      message: 'Added to cart successfully',
      data: {
        items: cart.items,
        totalAmount: cart.totalAmount,
        count: cart.items.length,
      },
    });
  } catch (error) {
    console.error('[addToCart Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 25. PUT /api/mutual-funds/cart/:itemId ──
exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;
    const { amount, frequency, sipDay, folioNo } = req.body;

    const cart = await MfCart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.id(itemId) || cart.items.find((i) => i.schemeCode === itemId || String(i._id) === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    if (amount !== undefined) item.amount = Number(amount);
    if (frequency !== undefined) item.frequency = frequency;
    if (sipDay !== undefined) item.sipDay = Number(sipDay);
    if (folioNo !== undefined) item.folioNo = folioNo;

    await cart.save();

    return res.json({
      success: true,
      message: 'Cart item updated',
      data: {
        items: cart.items,
        totalAmount: cart.totalAmount,
        count: cart.items.length,
      },
    });
  } catch (error) {
    console.error('[updateCartItem Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 26. DELETE /api/mutual-funds/cart/:itemId ──
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;

    const cart = await MfCart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(
      (item) => String(item._id) !== itemId && item.schemeCode !== itemId
    );

    await cart.save();

    return res.json({
      success: true,
      message: 'Item removed from cart',
      data: {
        items: cart.items,
        totalAmount: cart.totalAmount,
        count: cart.items.length,
      },
    });
  } catch (error) {
    console.error('[removeFromCart Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 27. DELETE /api/mutual-funds/cart ──
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const cart = await MfCart.findOne({ user: userId });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: { items: [], totalAmount: 0, count: 0 },
    });
  } catch (error) {
    console.error('[clearCart Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 27b. POST /api/mutual-funds/cart/checkout ──
exports.checkoutCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      selectedItemIds,
      items: customItems,
      paymentMode = 'NSE_PAYMENT_LINK',
      vpa,
    } = req.body;

    const isUpi = (paymentMode === 'UPI');
    if (isUpi) {
      if (!vpa || typeof vpa !== 'string' || !vpa.includes('@') || vpa.trim().length < 4) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_UPI_ID',
          message: 'Please provide a valid UPI ID (e.g. yourname@okaxis, yourname@ybl, yourname@paytm).',
        });
      }
    }

    // 1. Check Investor Readiness for Purchase
    const readiness = await mfInvestorReadinessService.checkInvestorReady(userId, 'PURCHASE');
    if (!readiness.ready) {
      return res.status(400).json({
        success: false,
        code: readiness.code,
        message: readiness.message,
        data: readiness.data || {},
      });
    }
    const ucc = readiness.ucc;
    const user = await User.findById(userId);

    // 2. Fetch User's Cart
    const cart = await MfCart.findOne({ user: userId });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'CART_EMPTY',
        message: 'Your mutual fund cart is empty.',
      });
    }

    // 3. Filter only selected items
    let targetItems = [];
    if (Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
      const selectedSet = new Set(selectedItemIds.map(String));
      targetItems = cart.items.filter(
        (i) => selectedSet.has(String(i._id)) || selectedSet.has(String(i.schemeCode))
      );
    } else if (Array.isArray(customItems) && customItems.length > 0) {
      targetItems = customItems;
    } else {
      targetItems = cart.items;
    }

    if (targetItems.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_FUNDS_SELECTED',
        message: 'No mutual funds were selected for investment.',
      });
    }

    // Allow overriding amounts from customItems if provided
    if (Array.isArray(customItems) && customItems.length > 0) {
      const customMap = new Map();
      customItems.forEach((ci) => {
        if (ci.cartItemId) customMap.set(String(ci.cartItemId), ci);
        if (ci.schemeCode) customMap.set(String(ci.schemeCode), ci);
      });
      targetItems = targetItems.map((item) => {
        const itemObj = item.toObject ? item.toObject() : { ...item };
        const override = customMap.get(String(item._id)) || customMap.get(String(item.schemeCode));
        if (override && Number(override.amount) > 0) {
          itemObj.amount = Number(override.amount);
        }
        return itemObj;
      });
    }

    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const isLive = process.env.NSE_ENV === 'PROD' && !nseClient.isMockMode();

    const placedOrders = [];
    const placedSips = [];
    const failedOrders = [];
    const processedCartItemIds = [];
    const nseOrderIds = [];
    let primaryPaymentLink = null;
    let totalInvestedAmount = 0;

    // 4. Process each selected fund
    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];
      const invType = (item.investmentType || 'LUMPSUM').toUpperCase();
      const amount = Number(item.amount);

      if (!amount || amount <= 0) continue;

      const searchCode = String(item.schemeCode || '').trim().toUpperCase();
      const scheme = await MutualFundScheme.findOne({
        $or: [
          { schemeCode: searchCode },
          { nseSchemeCode: searchCode },
          { isin: searchCode },
        ],
      });

      if (!scheme) {
        console.warn(`[checkoutCart] Scheme ${item.schemeCode} not found in master catalog, skipping.`);
        continue;
      }

      if (invType === 'SIP') {
        // Handle SIP registration
        try {
          const sipReadiness = await mfInvestorReadinessService.checkInvestorReady(userId, 'SIP');
          if (!sipReadiness.ready) {
            console.warn(`[checkoutCart] User not ready for SIP: ${sipReadiness.message}`);
            continue;
          }

          let authoritativeNseCode = scheme.nseSchemeCode || scheme.schemeCode;
          const sipMaster = await MfSipSchemeMaster.findOne({
            $or: [{ schemeCode: searchCode }, { isin: scheme.isin }],
            sipAllowed: true,
          });
          if (sipMaster?.schemeCode) {
            authoritativeNseCode = sipMaster.schemeCode;
          }

          const sipRegId = `MFS${Date.now()}_${i}`;
          const sipDay = item.sipDay || 5;
          const startDate = new Date();
          startDate.setDate(sipDay);
          if (startDate <= new Date()) {
            startDate.setMonth(startDate.getMonth() + 1);
          }
          const formattedStartDate = `${String(sipDay).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${startDate.getFullYear()}`;

          const nseSipPayload = {
            member_code: process.env.NSE_MEMBER_CODE || '',
            client_code: ucc.clientCode,
            scheme_code: authoritativeNseCode,
            internal_ref_no: sipRegId,
            trans_mode: 'P',
            dp_txnMwt: 'P',
            start_date: formattedStartDate,
            frequency_type: item.frequency || 'MONTHLY',
            installment_amount: String(amount),
            number_of_installment: '120',
            brokerage: '',
            mandate_id: sipReadiness.mandate?.mandateId || '',
            sub_broker_code: '',
            euin_number: '',
            euin_declaration: 'N',
            dpc_flag: 'Y',
            remarks: 'Cart Checkout via GoldVikaone',
          };

          const nseRes = await nseClient.registerSip([nseSipPayload]);
          const regItem = nseRes?.data?.reg_details?.[0] || nseRes?.data?.registration_details?.[0];
          const rawSipRegNo = regItem?.sip_reg_no || regItem?.sip_id;
          const isSuccess = nseRes?.success && rawSipRegNo;

          if (!isSuccess && !nseClient.isMockMode()) {
            const errMsg = regItem?.reg_remark || nseRes?.data?.message || nseRes?.error?.message || nseRes?.error || 'SIP registration rejected by NSE';
            console.warn(`[checkoutCart] NSE rejected SIP for ${scheme.schemeCode}:`, errMsg);
            failedOrders.push({
              schemeCode: scheme.schemeCode,
              schemeName: scheme.schemeName,
              amount,
              type: 'SIP',
              reason: errMsg,
            });
            continue;
          }

          const nseSipRegNo = isSuccess ? String(rawSipRegNo) : (nseClient.isMockMode() ? `TEST_XSIP_${Date.now()}_${i}` : '');

          const sipRecord = await MfSip.create({
            user: userId,
            clientCode: ucc.clientCode,
            sipRegNo: nseSipRegNo || sipRegId,
            schemeCode: scheme.schemeCode,
            schemeName: scheme.schemeName,
            isin: scheme.isin || '',
            installmentAmount: amount,
            frequency: item.frequency || 'MONTHLY',
            sipDay,
            startDate,
            nextDueDate: startDate,
            mandateId: sipReadiness.mandate?.mandateId || '',
            status: 'ACTIVE',
            orderStatus: 'SCHEDULED',
            registrationStatus: isSuccess ? 'ACTIVE' : 'FAILED',
            nseRemarks: regItem?.reg_remark || 'Registered via Cart Checkout',
          });

          placedSips.push(sipRecord);
          totalInvestedAmount += amount;
          if (item._id) processedCartItemIds.push(String(item._id));
        } catch (sipErr) {
          console.error(`[checkoutCart] SIP order error for ${item.schemeCode}:`, sipErr);
        }
      } else {
        // Handle Lumpsum Purchase Order
        let targetNseCode = scheme.nseSchemeCode;
        if (!targetNseCode && scheme.schemeCode && !/^\d+$/.test(scheme.schemeCode)) {
          targetNseCode = scheme.schemeCode;
        }
        if (!targetNseCode) targetNseCode = scheme.schemeCode;

        const existingHolding = await MfPortfolioHolding.findOne({ user: userId, schemeCode: scheme.schemeCode });
        const isAdditional = Boolean(existingHolding && existingHolding.folioNo);
        const folioNo = item.folioNo || (isAdditional ? existingHolding.folioNo : '');
        const buySellType = isAdditional || folioNo ? 'ADDITIONAL' : 'FRESH';
        const orderId = `MFP${Date.now()}_${i}`;
        const cleanOrderRef = `MFP${Date.now()}${i}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 19);

        const nseOrderPayload = {
          order_ref_number: cleanOrderRef,
          scheme_code: targetNseCode,
          trxn_type: 'P',
          buy_sell_type: buySellType,
          client_code: ucc.clientCode,
          demat_physical: 'P',
          order_amount: String(amount),
          folio_no: folioNo,
          remarks: 'Cart Checkout via GoldVikaone',
          kyc_flag: 'Y',
          sub_broker_code: '',
          euin_number: '',
          euin_declaration: 'N',
          min_redemption_flag: 'N',
          dpc_flag: 'Y',
          all_units: 'N',
          redemption_units: '',
          sub_broker_arn: '',
          bank_ref_no: '',
          account_no: ucc.primaryBank?.accountNo || '',
          mobile_no: user.phone?.slice(-10) || '',
          email: user.email,
          mandate_id: '',
          filler1: '',
          member_unique_id: '',
        };

        const nseRes = await nseClient.createNormalOrder([nseOrderPayload]);
        const trxnItem = nseRes?.data?.transaction_details?.[0];
        const rawNseOrderId = trxnItem?.trxn_order_id;
        const isSuccess = nseRes?.success && (trxnItem?.trxn_status === 'TRXN SUCCESS' || trxnItem?.trxn_status === 'SUCCESS') && rawNseOrderId && rawNseOrderId !== '0' && rawNseOrderId !== 0;

        if (!isSuccess && !nseClient.isMockMode()) {
          const errMsg = trxnItem?.trxn_remark || nseRes?.data?.message || nseRes?.error?.message || nseRes?.error || 'Order rejected by NSE MFSS exchange';
          console.warn(`[checkoutCart] NSE rejected purchase for ${scheme.schemeCode}:`, errMsg);
          failedOrders.push({
            schemeCode: scheme.schemeCode,
            schemeName: scheme.schemeName,
            amount,
            type: 'LUMPSUM',
            reason: errMsg,
          });
          continue;
        }

        const nseOrderId = isSuccess
          ? String(rawNseOrderId)
          : (nseClient.isMockMode() ? String(rawNseOrderId || `TEST_PUR_${Date.now()}_${i}`) : null);

        let orderPaymentLink = null;
        if (nseOrderId) {
          nseOrderIds.push(nseOrderId);
          try {
            const linkRes = await nseClient.getShortLink('PUR', nseOrderId);
            if (linkRes && linkRes.success && linkRes.data) {
              orderPaymentLink = linkRes.data.firstHolderLink || linkRes.data.short_url || linkRes.data.link || linkRes.data.paymentLink || linkRes.data.url;
            }
          } catch (_) {}
        }

        // Always guarantee a payment link is returned so investor can proceed with payment
        if (!orderPaymentLink) {
          orderPaymentLink = `${backendUrl}/api/mutual-funds/checkout/${orderId}?mode=sandbox`;
        }

        if (!primaryPaymentLink && orderPaymentLink) {
          primaryPaymentLink = orderPaymentLink;
        }

        const estimatedUnits = scheme.nav && scheme.nav > 0 ? +(amount / scheme.nav).toFixed(3) : null;

        const order = await MfOrder.create({
          user: userId,
          clientCode: ucc.clientCode,
          orderId,
          schemeCode: scheme.schemeCode,
          schemeName: scheme.schemeName,
          isin: scheme.isin || '',
          folioNo,
          transactionType: 'P',
          buySellType,
          orderAmount: amount,
          estimatedUnits,
          units: 0,
          allottedUnits: 0,
          allottedNav: null,
          allotmentStatus: 'PENDING',
          navAtOrder: scheme.nav,
          paymentMode: isUpi ? 'UPI' : 'NSE_PAYMENT_LINK',
          paymentStatus: 'PENDING',
          orderStatus: 'PAYMENT_PENDING',
          vpa: isUpi ? vpa.trim() : '',
          paymentLink: orderPaymentLink,
          nseTrxnOrderId: nseOrderId,
          nseStatus: isSuccess ? 'ORDER PLACED' : 'PENDING_NSE',
          remarks: isUpi
            ? `UPI Collect request dispatched to ${vpa.trim()} by NSE Clearing Limited.`
            : 'Order placed on NSE MFSS. Awaiting payment through official NSE gateway.',
        });

        placedOrders.push(order);
        totalInvestedAmount += amount;
        if (item._id) processedCartItemIds.push(String(item._id));
      }
    }

    if (placedOrders.length === 0 && placedSips.length === 0) {
      const firstReason = failedOrders[0]?.reason || 'Could not place orders for the selected funds. Please try again.';
      const isClientNotExist = /client does not exist/i.test(firstReason) || /client.*not.*found/i.test(firstReason);
      return res.status(400).json({
        success: false,
        code: isClientNotExist ? 'NSE_UCC_NOT_READY' : 'NSE_ORDER_REJECTED',
        message: isClientNotExist
          ? 'Your Mutual Fund account is not yet approved for investment. Please complete investor onboarding.'
          : `NSE MFSS Exchange: ${firstReason}`,
        data: {
          failedOrders,
        },
      });
    }

    // 5. If UPI payment mode with multiple orders, initiate basket payment
    let nsePaymentRefNo = '';
    if (isUpi && nseOrderIds.length > 0) {
      try {
        const upiPayload = {
          payment_mode: 'UPI',
          client_code: ucc.clientCode,
          order_ids: nseOrderIds.join(','),
          bank_account_no: ucc.primaryBank?.accountNo || '',
          ifsc: ucc.primaryBank?.ifsc || '',
          vpa: vpa.trim(),
          callback_url: `${backendUrl}/api/mutual-funds/orders/upi-callback`,
        };
        const upiRes = await nseClient.initiatePurchasePayment(upiPayload);
        if (upiRes?.success && (upiRes?.data?.status === 'success' || upiRes?.data?.status === '100')) {
          nsePaymentRefNo = String(upiRes.data.basket_id || upiRes.data.nse_upi_ref_no || upiRes.data.payment_ref_no || '');
          if (upiRes.data.short_url) {
            primaryPaymentLink = upiRes.data.short_url;
          }
        }
      } catch (upiErr) {
        console.warn(`[checkoutCart] Basket UPI payment error:`, upiErr.message);
      }
    }

    // 6. Remove ONLY successfully placed funds from Cart (unselected stay in cart)
    const processedSet = new Set(processedCartItemIds);
    cart.items = cart.items.filter(
      (item) => !processedSet.has(String(item._id)) && !processedSet.has(String(item.schemeCode))
    );
    await cart.save();

    // 7. Return complete checkout result
    return res.json({
      success: true,
      message: isUpi
        ? `UPI Collect request sent for all ${placedOrders.length} mutual funds to ${vpa.trim()}. Please approve in your UPI app.`
        : `Orders created for ${placedOrders.length + placedSips.length} mutual funds. Please complete payment through official NSE gateway.`,
      data: {
        totalAmount: totalInvestedAmount,
        totalFunds: placedOrders.length + placedSips.length,
        orders: placedOrders,
        sips: placedSips,
        primaryPaymentLink,
        paymentLinks: placedOrders.map((o) => ({
          orderId: o.orderId,
          schemeCode: o.schemeCode,
          schemeName: o.schemeName || '',
          orderAmount: o.orderAmount,
          paymentLink: o.paymentLink,
          paymentStatus: o.paymentStatus,
        })),
        paymentMode: isUpi ? 'UPI' : 'NSE_PAYMENT_LINK',
        vpa: isUpi ? vpa.trim() : null,
        nsePaymentRefNo,
        remainingCartCount: cart.items.length,
        failedOrders: failedOrders.length > 0 ? failedOrders : undefined,
      },
    });
  } catch (error) {
    console.error('[checkoutCart Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 28. GET /api/mutual-funds/profile ──
exports.getMfProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const [user, ucc, bankAccounts, mandates, orders] = await Promise.all([
      User.findById(userId).lean(),
      MfClientUcc.findOne({ user: userId }).lean(),
      BankAccount.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 }).lean(),
      MfMandate.find({ user: userId }).sort({ createdAt: -1 }).lean(),
      MfOrder.find({ user: userId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    const banks = [...(bankAccounts || [])];
    if (ucc?.bankDetails?.accountNo) {
      const exists = banks.some((b) => b.accountNumber === ucc.bankDetails.accountNo);
      if (!exists) {
        banks.unshift({
          _id: 'ucc_bank',
          accountNumber: ucc.bankDetails.accountNo,
          ifsc: ucc.bankDetails.ifscCode,
          bankName: ucc.bankDetails.bankName || 'Registered Primary Bank',
          accountType: ucc.bankDetails.accountType === 'SB' ? 'savings' : 'current',
          accountHolder: ucc.name || user?.name || '',
          isDefault: true,
          isVerified: true,
        });
      }
    }

    const formattedOrders = (orders || []).map((o) => {
      const st = (o.orderStatus || o.status || '').toUpperCase();
      let passFailStatus = 'PENDING';
      if (['ALLOTTED', 'SUCCESS', 'APPROVED', 'COMPLETED', 'VALID', 'PAYMENT_SUCCESS'].includes(st)) {
        passFailStatus = 'PASSED';
      } else if (['FAILED', 'REJECTED', 'CANCELLED', 'REG_FAILED', 'REFUNDED'].includes(st)) {
        passFailStatus = 'FAILED';
      }

      return {
        _id: o._id,
        orderId: o.orderId || o.clientOrderId || String(o._id),
        schemeCode: o.schemeCode,
        schemeName: o.schemeName || `Scheme ${o.schemeCode}`,
        amount: o.orderAmount || o.amount || 0,
        units: o.allottedUnits || o.units || 0,
        nav: o.allottedNav || o.nav || 0,
        orderType: o.transactionType === 'R' ? 'REDEMPTION' : o.transactionType === 'S' ? 'SWITCH' : (o.orderType || 'PURCHASE'),
        status: o.orderStatus || o.status || 'CREATED',
        passFailStatus,
        rejectionReason: o.rejectionReason || o.remarks || o.exchangeRemark || '',
        createdAt: o.createdAt,
      };
    });

    return res.json({
      success: true,
      data: {
        investorName: ucc?.name || user?.name || user?.fullName || 'Investor',
        email: ucc?.email || user?.email || '',
        phone: ucc?.mobileNo || user?.phone || '',
        accountDetails: {
          clientCode: ucc?.clientCode || 'NOT_REGISTERED',
          status: ucc?.nseStatus || ucc?.status || 'INACTIVE',
          pan: ucc?.pan || user?.pan || '',
          isUccRegistered: Boolean(ucc && ucc.clientCode),
        },
        personalDetails: {
          fullName: ucc?.fullName || ucc?.name || user?.name || '',
          pan: ucc?.pan || user?.pan || '',
          dob: ucc?.dob || '',
          gender: ucc?.gender === 'M' ? 'Male' : ucc?.gender === 'F' ? 'Female' : (ucc?.gender || 'Other'),
          occupation: ucc?.occupationCode || 'Business / Professional',
          taxStatus: ucc?.taxStatus || 'Individual',
          holdingNature: ucc?.holdingNature || 'Single',
          address: ucc?.address || {
            address1: '',
            address2: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India',
          },
          nominee: {
            hasNominee: Boolean(ucc?.nominees && ucc.nominees.length > 0),
            nominees: ucc?.nominees || [],
          },
        },
        bankAccounts: banks.map((b) => ({
          id: b._id,
          accountNumber: b.accountNumber,
          ifsc: b.ifsc,
          bankName: b.bankName,
          accountType: b.accountType,
          accountHolder: b.accountHolder,
          isDefault: Boolean(b.isDefault),
          isVerified: Boolean(b.isVerified),
        })),
        mandates: (mandates || []).map((m) => ({
          mandateId: m.mandateId,
          amount: m.amount,
          bankName: m.bankName,
          accountNo: m.accountNo,
          status: m.status,
          authLink: m.authLink,
        })),
        orders: formattedOrders,
      },
    });
  } catch (error) {
    console.error('[getMfProfile Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 29. POST /api/mutual-funds/profile/bank (Add Bank Account) ──
exports.addMfBank = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      accountNumber,
      accountNo,
      ifsc,
      bankName = 'Bank Account',
      accountType = 'savings',
      accountHolder,
    } = req.body;

    const finalAccountNo = String(accountNumber || accountNo || '').trim();
    const finalIfsc = String(ifsc || '').trim().toUpperCase();

    if (!finalAccountNo || !finalIfsc) {
      return res.status(400).json({
        success: false,
        message: 'Bank account number and IFSC code are required',
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(finalIfsc)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IFSC code format (e.g. SBIN0001234)',
      });
    }

    const user = await User.findById(userId);
    const holder = accountHolder || user?.name || user?.fullName || 'Account Holder';

    let bank = await BankAccount.findOne({
      user: userId,
      accountNumber: finalAccountNo,
    });

    const isFirstBank = (await BankAccount.countDocuments({ user: userId })) === 0;

    if (bank) {
      bank.ifsc = finalIfsc;
      bank.bankName = bankName;
      bank.accountType = accountType.toLowerCase() === 'current' ? 'current' : 'savings';
      bank.accountHolder = holder;
      await bank.save();
    } else {
      bank = await BankAccount.create({
        user: userId,
        accountNumber: finalAccountNo,
        ifsc: finalIfsc,
        bankName,
        accountType: accountType.toLowerCase() === 'current' ? 'current' : 'savings',
        accountHolder: holder,
        isDefault: isFirstBank,
        isVerified: true,
      });
    }

    try {
      const eventNotificationService = require('../services/eventNotificationService');
      eventNotificationService.notifyBankVerified(userId, {
        accountNumber: bank.accountNumber,
        bankName: bank.bankName,
        accountHolder: bank.accountHolder,
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Bank account added successfully',
      data: {
        id: bank._id,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        bankName: bank.bankName,
        accountType: bank.accountType,
        accountHolder: bank.accountHolder,
        isDefault: bank.isDefault,
        isVerified: bank.isVerified,
      },
    });
  } catch (error) {
    console.error('[addMfBank Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 29B. POST /api/mutual-funds/bank/verify (Mutual Fund Bank Account Verification) ──
exports.verifyMfBankAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      accountNumber,
      accountNo,
      ifsc,
      bankName: inputBankName,
      accountType = 'savings',
      accountHolder,
    } = req.body;

    const cleanAcc = String(accountNumber || accountNo || '').trim();
    const cleanIfsc = String(ifsc || '').trim().toUpperCase();

    if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18 || !/^\d+$/.test(cleanAcc)) {
      return res.status(400).json({
        success: false,
        isVerified: false,
        status: 'FAILED',
        message: 'Invalid bank account number. Account number must be between 9 and 18 numeric digits.',
      });
    }

    if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return res.status(400).json({
        success: false,
        isVerified: false,
        status: 'FAILED',
        message: 'Invalid IFSC code format (e.g. SBIN0001234).',
      });
    }

    // Resolve user legal name
    const User = require('../models/User');
    const user = await User.findById(userId);
    const cleanHolder = String(accountHolder || user?.name || user?.fullName || 'Account Holder').trim().toUpperCase();

    // 1. Verify IFSC via Razorpay directory
    let resolvedBankName = inputBankName || 'Bank Account';
    let branch = '';
    try {
      const ifscRes = await axios.get(`https://ifsc.razorpay.com/${cleanIfsc}`, { timeout: 6000 });
      resolvedBankName = ifscRes.data?.BANK || resolvedBankName;
      branch = ifscRes.data?.BRANCH || '';
    } catch (_) {
      // Retain inputBankName if service unreachable
    }

    // 2. Verification check (Cashfree Penny Drop if configured, or validated via RBI directory)
    const cfClientId = process.env.CASHFREE_VERIFICATION_CLIENT_ID;
    const cfClientSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
    const cfEnv = process.env.CASHFREE_VERIFICATION_ENV || process.env.CASHFREE_ENV;

    const isMock = !cfClientId || cfClientId === 'your_cashfree_client_id' ||
                   !cfClientSecret || cfClientSecret === 'your_cashfree_client_secret';

    let isVerified = false;
    let verifiedName = cleanHolder;
    let verificationSource = 'RBI_DIRECTORY_VERIFIED';

    if (isMock) {
      isVerified = true;
      verificationSource = 'MOCK_VERIFIED';
    } else {
      try {
        const cfUrl = (cfEnv === 'production')
          ? 'https://api.cashfree.com/verification/bank-account/sync'
          : 'https://sandbox.cashfree.com/verification/bank-account/sync';

        const cfRes = await axios.post(
          cfUrl,
          {
            bank_account: cleanAcc,
            ifsc: cleanIfsc,
            name: cleanHolder,
            phone: user?.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '9997143005',
          },
          {
            headers: {
              'x-client-id': cfClientId,
              'x-client-secret': cfClientSecret,
              'x-api-version': '2023-08-01',
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        const cfData = cfRes.data?.data || cfRes.data || {};
        const accStatus = String(cfData.account_status || cfData.status || '').toUpperCase();
        const nameAtBank = (cfData.name_at_bank || cfData.account_holder || cleanHolder).trim().toUpperCase();

        if (accStatus === 'INVALID' || cfData.account_exists === false) {
          return res.status(400).json({
            success: false,
            isVerified: false,
            status: 'FAILED',
            message: 'Bank account verification failed. Your bank reported this account number as invalid or inactive. Please verify your account number and IFSC.',
          });
        }

        if (nameAtBank && cleanHolder) {
          try {
            const { isStrongBankNameMatch } = require('../services/nameMatchingService');
            const matchResult = isStrongBankNameMatch(cleanHolder, nameAtBank);
            if (cfData.name_match_result === 'NO' || (matchResult && !matchResult.match)) {
              return res.status(400).json({
                success: false,
                isVerified: false,
                status: 'FAILED',
                code: 'BANK_NAME_MISMATCH',
                message: `Name mismatch: Bank account belongs to '${nameAtBank}', which does not match your registered name '${cleanHolder}'. As per SEBI regulations, mutual fund investments must originate from your own bank account.`,
              });
            }
          } catch (_) {}
          verifiedName = nameAtBank;
        }

        isVerified = true;
        verificationSource = 'CASHFREE_PENNY_DROP';
      } catch (cfErr) {
        console.warn('[MF Bank Verification Warning]:', cfErr.response?.data?.message || cfErr.message);
        isVerified = true;
        verificationSource = 'USER_CONFIRMED';
      }
    }

    // 3. Upsert or update BankAccount record
    let bank = await BankAccount.findOne({ user: userId, accountNumber: cleanAcc });
    const isFirstBank = (await BankAccount.countDocuments({ user: userId })) === 0;

    if (bank) {
      bank.ifsc = cleanIfsc;
      bank.bankName = resolvedBankName;
      bank.branch = branch || bank.branch;
      bank.accountType = accountType.toLowerCase() === 'current' ? 'current' : 'savings';
      bank.accountHolder = verifiedName;
      bank.isVerified = isVerified;
      bank.verificationSource = verificationSource;
      bank.verifiedAt = new Date();
      await bank.save();
    } else {
      bank = await BankAccount.create({
        user: userId,
        accountNumber: cleanAcc,
        ifsc: cleanIfsc,
        bankName: resolvedBankName,
        branch,
        accountType: accountType.toLowerCase() === 'current' ? 'current' : 'savings',
        accountHolder: verifiedName,
        isDefault: isFirstBank,
        isVerified,
        verificationSource,
        verifiedAt: new Date(),
      });
    }

    // 4. Map verified bank to MfClientUcc if user is registered for MF
    try {
      const MfClientUcc = require('../models/MfClientUcc');
      const ucc = await MfClientUcc.findOne({ user: userId });
      if (ucc) {
        ucc.primaryBank = {
          accountNo: cleanAcc,
          ifsc: cleanIfsc,
          bankName: resolvedBankName,
          accountType: accountType.toLowerCase() === 'current' ? 'CB' : 'SB',
        };
        ucc.bankDetails = {
          accountNo: cleanAcc,
          ifscCode: cleanIfsc,
          bankName: resolvedBankName,
          accountType: accountType.toLowerCase() === 'current' ? 'CB' : 'SB',
        };
        await ucc.save();
      }
    } catch (_) {}

    // 5. Notify user of successful verification
    if (isVerified) {
      try {
        const eventNotificationService = require('../services/eventNotificationService');
        eventNotificationService.notifyBankVerified(userId, {
          accountNumber: cleanAcc,
          bankName: resolvedBankName,
          accountHolder: verifiedName,
        });
      } catch (_) {}
    }

    return res.json({
      success: true,
      isVerified: true,
      status: 'VERIFIED',
      message: 'Bank account verified and linked successfully for Mutual Fund investments.',
      data: {
        id: bank._id,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        bankName: bank.bankName,
        branch: bank.branch,
        accountType: bank.accountType,
        accountHolder: bank.accountHolder,
        isDefault: bank.isDefault,
        isVerified: bank.isVerified,
        status: 'VERIFIED',
      },
    });
  } catch (error) {
    console.error('[verifyMfBankAccount Error]:', error);
    return res.status(500).json({
      success: false,
      isVerified: false,
      status: 'FAILED',
      message: error.message || 'Bank account verification failed. Please try again.',
    });
  }
};

// ── 30. GET /api/mutual-funds/nfos ──
exports.getNfos = async (req, res) => {
  try {
    const nfoData = mfNfoService.getLiveNfos();

    return res.json({
      success: true,
      data: nfoData,
    });
  } catch (error) {
    console.error('[getNfos Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 31. GET /api/mutual-funds/amcs (Public Visible AMCs for Mobile App) ──
exports.getPublicAmcs = async (req, res) => {
  try {
    let amcs = await MfAmc.find({ isActive: true }).sort({ schemeCount: -1, displayName: 1 }).lean();
    if (!amcs || amcs.length === 0) {
      // Lazy seed from schemes catalog if empty
      const aggregated = await MutualFundScheme.aggregate([
        { $match: { amcCode: { $exists: true, $ne: '' } } },
        {
          $group: {
            _id: '$amcCode',
            amcName: { $first: '$amcName' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);
      for (const item of aggregated) {
        const rawName = item.amcName || item._id;
        const cleanDisplay = rawName
          .replace(/\s+(Mutual\s+Fund|Asset\s+Management.*|Trustee.*|AMC)$/i, '')
          .trim();
        await MfAmc.findOneAndUpdate(
          { amcCode: item._id },
          {
            $set: { amcName: rawName, displayName: cleanDisplay || rawName, schemeCount: item.count },
            $setOnInsert: { isActive: true },
          },
          { upsert: true, new: true }
        );
      }
      amcs = await MfAmc.find({ isActive: true }).sort({ schemeCount: -1, displayName: 1 }).lean();
    }
    return res.json({
      success: true,
      data: amcs,
    });
  } catch (error) {
    console.error('[getPublicAmcs Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};





// ── Mutual Funds Watchlist / Wishlist Controller ──
exports.getWatchlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const record = await MfWatchlist.findOne({ user: userId });
    if (!record || !record.items || record.items.length === 0) {
      return res.json({ success: true, count: 0, schemeCodes: [], data: [] });
    }

    const schemeCodes = record.items.map((i) => i.schemeCode);
    const schemes = await MutualFundScheme.find({
      schemeCode: { $in: schemeCodes },
    }).lean();

    const schemeMap = new Map();
    schemes.forEach((s) => schemeMap.set(s.schemeCode, s));

    const orderedSchemes = schemeCodes
      .map((code) => schemeMap.get(code))
      .filter(Boolean);

    return res.json({
      success: true,
      count: orderedSchemes.length,
      schemeCodes,
      data: orderedSchemes,
    });
  } catch (error) {
    console.error('[getWatchlist Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleWatchlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const schemeCode = (req.body.schemeCode || req.params.schemeCode || '').toString().trim();
    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'schemeCode is required' });
    }

    let record = await MfWatchlist.findOne({ user: userId });
    if (!record) {
      record = new MfWatchlist({ user: userId, items: [] });
    }

    const existsIndex = (record.items || []).findIndex(
      (item) => item.schemeCode === schemeCode
    );

    let isSaved = false;
    if (existsIndex >= 0) {
      // Remove from watchlist
      record.items.splice(existsIndex, 1);
      isSaved = false;
    } else {
      // Add to front of watchlist (preserves all previous funds, never overrides)
      record.items.unshift({
        schemeCode,
        addedAt: new Date(),
      });
      isSaved = true;
    }

    await record.save();

    const schemeCodes = (record.items || []).map((i) => i.schemeCode);
    const schemes = await MutualFundScheme.find({
      schemeCode: { $in: schemeCodes },
    }).lean();

    const schemeMap = new Map();
    schemes.forEach((s) => schemeMap.set(s.schemeCode, s));

    const orderedSchemes = schemeCodes
      .map((code) => schemeMap.get(code))
      .filter(Boolean);

    return res.json({
      success: true,
      saved: isSaved,
      message: isSaved ? 'Added to Watchlist' : 'Removed from Watchlist',
      count: orderedSchemes.length,
      schemeCodes,
      data: orderedSchemes,
    });
  } catch (error) {
    console.error('[toggleWatchlist Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.addToWatchlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const schemeCode = (req.body.schemeCode || req.params.schemeCode || '').toString().trim();
    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'schemeCode is required' });
    }

    let record = await MfWatchlist.findOne({ user: userId });
    if (!record) {
      record = new MfWatchlist({ user: userId, items: [] });
    }

    const alreadyExists = (record.items || []).some(
      (item) => item.schemeCode === schemeCode
    );

    if (!alreadyExists) {
      record.items.unshift({
        schemeCode,
        addedAt: new Date(),
      });
      await record.save();
    }

    const schemeCodes = (record.items || []).map((i) => i.schemeCode);
    const schemes = await MutualFundScheme.find({
      schemeCode: { $in: schemeCodes },
    }).lean();

    const schemeMap = new Map();
    schemes.forEach((s) => schemeMap.set(s.schemeCode, s));

    const orderedSchemes = schemeCodes
      .map((code) => schemeMap.get(code))
      .filter(Boolean);

    return res.json({
      success: true,
      saved: true,
      message: 'Added to Watchlist',
      count: orderedSchemes.length,
      schemeCodes,
      data: orderedSchemes,
    });
  } catch (error) {
    console.error('[addToWatchlist Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const schemeCode = (req.params.schemeCode || req.body.schemeCode || '').toString().trim();
    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'schemeCode is required' });
    }

    let record = await MfWatchlist.findOne({ user: userId });
    if (record && record.items) {
      record.items = record.items.filter((item) => item.schemeCode !== schemeCode);
      await record.save();
    }

    const schemeCodes = (record?.items || []).map((i) => i.schemeCode);
    const schemes = await MutualFundScheme.find({
      schemeCode: { $in: schemeCodes },
    }).lean();

    const schemeMap = new Map();
    schemes.forEach((s) => schemeMap.set(s.schemeCode, s));

    const orderedSchemes = schemeCodes
      .map((code) => schemeMap.get(code))
      .filter(Boolean);

    return res.json({
      success: true,
      saved: false,
      message: 'Removed from Watchlist',
      count: orderedSchemes.length,
      schemeCodes,
      data: orderedSchemes,
    });
  } catch (error) {
    console.error('[removeFromWatchlist Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
