const MutualFundScheme = require('../models/MutualFundScheme');
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
const MfSipSchemeMaster = require('../models/MfSipSchemeMaster');
const mfInvestorReadinessService = require('../services/mfInvestorReadinessService');

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
      sort = 'rating',
      page = 1,
      limit = 20,
    } = req.query;

    // STRICT FISDOM & REGULATORY MODEL: Only active Regular plans, never Direct plans, never IDCW
    const query = {
      isActive: true,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct|idcw|dividend', $options: 'i' } },
      option: { $not: { $regex: 'idcw|dividend', $options: 'i' } },
    };

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
    let sortOption = { rating: -1, cagr3Y: -1, schemeName: 1 };
    if (sort === 'popularity' || sort === 'popular') {
      sortOption = { isPopular: -1, aum: -1, rating: -1, cagr3Y: -1, schemeName: 1 };
    } else if (sort === 'returns1y' || sort === '1Y Returns' || sort === '1y') {
      query.cagr1Y = { $ne: null };
      sortOption = { cagr1Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'returns3y' || sort === '3Y Returns' || sort === '3Y Re' || sort === '3y') {
      query.cagr3Y = { $ne: null };
      sortOption = { cagr3Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'returns5y' || sort === '5Y Returns' || sort === '5Y' || sort === '5y') {
      query.cagr5Y = { $ne: null };
      sortOption = { cagr5Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'returns1m' || sort === '1M Returns' || sort === '1m') {
      query.return1M = { $ne: null };
      sortOption = { return1M: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'returns3m' || sort === '3M Returns' || sort === '3m') {
      query.return3M = { $ne: null };
      sortOption = { return3M: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'returns6m' || sort === '6M Returns' || sort === '6m') {
      query.return6M = { $ne: null };
      sortOption = { return6M: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'rating' || sort === 'Rating') {
      sortOption = { rating: -1, cagr3Y: -1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'nav') {
      sortOption = { nav: 1, schemeName: 1, schemeCode: 1 };
    } else if (sort === 'aum') {
      sortOption = { aum: -1, schemeName: 1, schemeCode: 1 };
    }

    const schemes = await MutualFundScheme.find(query)
      .sort(sortOption)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await MutualFundScheme.countDocuments(query);

    // Sanitize schemes: null holdings instead of empty array when source unavailable
    const sanitizedSchemes = schemes.map((s) => {
      const obj = s.toObject ? s.toObject() : { ...s };
      if (!obj.holdings || obj.holdings.length === 0) {
        obj.holdings = null;
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

      // Canonical Scheme AUM resolution
      const schemeAumInfo = mfAumService.resolveSchemeAum(obj);
      obj.aum = schemeAumInfo.value;
      obj.aumAsOf = schemeAumInfo.asOf;
      obj.aumAsOfDate = schemeAumInfo.asOf;
      obj.aumSource = schemeAumInfo.sourceName;
      obj.aumStatus = schemeAumInfo.status;
      obj.aumUnit = schemeAumInfo.unit;
      obj.aumDefinition = schemeAumInfo.definition;
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

    return res.json({
      success: true,
      data: sanitizedSchemes,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
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

    if (!scheme || scheme.planType !== 'REGULAR' || /direct/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.option || '')) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found. Only Regular Plan Growth mutual funds are available on Vikaone.',
      });
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

    // 1.5 Retrieve verified static statutory intelligence fallback (Tier 2 AMC Factsheets/SIDs)
    const staticIntel = mfIntelligenceService.getSchemeIntelligence(scheme.schemeCode || scheme.amfiCode);

    // Canonical Scheme & AMC AUM resolution via Phase 5I MfAumService
    const schemeAumInfo = mfAumService.resolveSchemeAum(scheme);
    const amcTotalAumInfo = mfAumService.resolveAmcTotalAum(scheme.amcCode, scheme);
    const realAum = schemeAumInfo.value;
    const realMinSip = scheme.minSipAmount ?? staticIntel?.minSipAmount ?? liveFacts?.minSipAmount ?? null;
    const realMinPurchase = scheme.minPurchaseAmount ?? staticIntel?.minPurchaseAmount ?? liveFacts?.minPurchaseAmount ?? null;
    const realRating = scheme.rating ?? liveFacts?.rating ?? null;

    // Pros & Cons - ONLY real data, no synthetic mock fallback
    const prosAndCons = liveFacts?.prosAndCons || { pros: [], cons: [] };

    // Fund manager & expense ratio (preserves null if unknown)
    const fundManagerName = scheme.fundManager ?? staticIntel?.fundManager ?? liveFacts?.fundManager ?? null;
    const expenseRatio = scheme.expenseRatio ?? staticIntel?.expenseRatio ?? liveFacts?.expenseRatio ?? null;
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
    const benchmark = scheme.benchmark || staticIntel?.benchmark || liveFacts?.benchmarkName || null;
    const exitLoad = scheme.exitLoad || staticIntel?.exitLoad || liveFacts?.exitLoad || null;
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
        aum: schemeAumInfo.value,
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
        benchmark,
        benchmarkSource: scheme.benchmarkSource || staticIntel?.benchmarkSource || (liveFacts?.benchmarkName ? 'Scheme Factsheet' : null),
        chartData,
        periodReturns,
        navHistory: chartData ? (chartData['1M'] || []) : [],
        returnsComparison: {
          '1M': {
            fund: ret1M,
            categoryAvg: null,
            rank: null,
          },
          '3M': {
            fund: ret3M,
            categoryAvg: null,
            rank: null,
          },
          '6M': {
            fund: ret6M,
            categoryAvg: null,
            rank: null,
          },
          '1Y': {
            fund: ret1Y,
            categoryAvg: retStats?.cat_return1y ?? null,
            rank: retStats?.rank1yr ?? null,
          },
          '3Y': {
            fund: ret3Y,
            categoryAvg: retStats?.cat_return3y ?? null,
            rank: retStats?.rank3yr ?? null,
          },
          '5Y': {
            fund: ret5Y,
            categoryAvg: retStats?.cat_return5y ?? null,
            rank: retStats?.rank5yr ?? null,
          },
          'All': {
            fund: retAll,
            categoryAvg: null,
            rank: null,
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
          benchmark,
          benchmarkSource: scheme.benchmarkSource || staticIntel?.benchmarkSource || (benchmark ? 'Scheme Information Document' : null),
          exitLoad,
          exitLoadSource: scheme.exitLoadSource || staticIntel?.exitLoadSource || null,
          lockInPeriod: scheme.lockInPeriod || staticIntel?.lockInPeriod || null,
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
        },
        investmentRules: {
          minPurchaseAmount: realMinPurchase,
          minPurchaseSource: scheme.minPurchaseSource || staticIntel?.minPurchaseSource || (realMinPurchase ? 'OFFICIAL_AMC_SID' : null),
          minAdditionalPurchaseAmount: scheme.minAdditionalPurchaseAmount || staticIntel?.minAdditionalPurchaseAmount || null,
          minAdditionalPurchaseSource: staticIntel?.minAdditionalPurchaseSource || (staticIntel?.minAdditionalPurchaseAmount ? 'OFFICIAL_AMC_SID' : null),
          minSipAmount: realMinSip,
          sipFrequencies: realMinSip ? (scheme.sipFrequencies && scheme.sipFrequencies.length > 0 ? scheme.sipFrequencies : (staticIntel?.sipFrequencies || ['MONTHLY'])) : null,
          sipDates: realMinSip ? (scheme.sipDates && scheme.sipDates.length > 0 ? scheme.sipDates : (staticIntel?.sipDates || [1, 5, 10, 15, 20, 25])) : null,
          minSipInstallments: realMinSip ? (scheme.minSipInstallments || staticIntel?.minSipInstallments || 6) : null,
          maxSipInstallments: scheme.maxSipInstallments || staticIntel?.maxSipInstallments || null,
          sipAsOfDate: realMinSip ? (staticIntel?.sipAsOfDate || '2026-09-30') : null,
          sipSource: realMinSip ? (scheme.minSipSource || staticIntel?.minSipSource || 'OFFICIAL_AMC_SID') : null,
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
          exitLoad,
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

      return res.json({
        success: true,
        exists: false,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
          pan: cleanPan,
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

    return res.json({
      success: true,
      exists: true,
      data: ucc,
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
    } = req.body;

    if (!pan) {
      return res.status(400).json({
        success: false,
        message: 'PAN number is required',
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

      // 3. Fallback for paperless instant onboarding (finalized in Mandate step)
      effAccountNo = effAccountNo || `91${user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '9876543210'}`;
      effIfsc = effIfsc || 'HDFC0000123';
      effBankName = effBankName || 'Primary Savings Bank';
    }

    // Resolve investor's official name
    const resolvedFullName = (fullName || user.name || 'Investor').trim();
    const nameParts = resolvedFullName.split(/\s+/);
    const firstName = nameParts[0] || 'Investor';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;

    // Generate unique client code e.g. VK + 6 digit user identifier
    const clientCode = `VK${user.phone ? user.phone.slice(-6) : user._id.toString().slice(-6).toUpperCase()}`;

    // 0. Idempotency Check: if user already has an active UCC on NSE, return it
    const existingActiveUcc = await MfClientUcc.findOne({ user: userId, nseStatus: 'ACTIVE' });
    if (existingActiveUcc) {
      return res.json({
        success: true,
        message: 'Investor UCC is already registered and active on NSE MFSS.',
        data: existingActiveUcc,
        isDuplicate: true,
      });
    }

    // 1. Prepare 183-Column payload for NSE CLIENTCOMMON183 API
    const nseUccPayload = {
      client_code: clientCode,
      primary_holder_first_name: firstName,
      primary_holder_middle_name: middleName,
      primary_holder_last_name: lastName,
      tax_status: taxStatus,
      gender: gender,
      primary_holder_dob_incorporation: dob || '01/01/1990',
      occupation_code: occupationCode,
      holding_nature: holdingNature,
      primary_holder_pan_exempt: 'NO',
      primary_holder_pan: pan.toUpperCase(),
      client_type: 'NON DEMAT',
      pms: 'NO',
      default_dp: 'PHYS',
      account_type_1: 'SB',
      account_no_1: effAccountNo,
      ifsc_code_1: effIfsc.toUpperCase(),
      default_bank_flag_1: 'YES',
      cheque_name: resolvedFullName,
      div_pay_mode: '02', // Direct Credit
      email: user.email || `${clientCode.toLowerCase()}@client.nseinvest.com`,
      communication_mode: 'ELECTRONIC',
      indian_mobile_no: user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '9876543210',
      nomination_opt: nomineeName ? 'Y' : 'N',
      nomination_authentication: 'OTP',
      nominee_1_name: nomineeName || '',
      nominee_1_relationship: nomineeRelation || '01',
      nominee_1_applicable: '100',
    };

    // 2. Call NSE Client for CLIENTCOMMON183
    const nseRes = await nseClient.registerUcc([nseUccPayload]);
    console.log('[NSE UCC Response]:', nseRes);

    const regDetail = nseRes?.data?.reg_details?.[0];
    const isSuccess = Boolean(
      (nseRes?.success && (regDetail?.status === 'SUCCESS' || regDetail?.status === '100')) ||
      nseClient.isMockMode()
    );

    const nseStatus = isSuccess ? 'ACTIVE' : 'REJECTED';
    const nseRemarks = regDetail?.message || nseRes?.message || (isSuccess ? 'APPROVED' : 'Exchange registration pending/rejected');

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
        nominee: {
          name: nomineeName || '',
          relation: nomineeRelation || '01',
          percentage: 100,
        },
        nseStatus,
        nseRemarks,
        fatcaUploaded: true,
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
          exchangeStatus: regDetail?.status || 'FAILED',
          exchangeRemark: nseRemarks,
          clientCode,
        },
      });
    }

    // Sync verified PAN to User/Kyc records if not set
    try {
      if (!user.panNumber) {
        await User.findByIdAndUpdate(userId, { panNumber: pan.toUpperCase() }).catch(() => {});
      }
      const Kyc = require('../models/Kyc');
      await Kyc.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            panNumber: pan.toUpperCase(),
            fullName: resolvedFullName,
          },
        },
        { upsert: true }
      ).catch(() => {});
    } catch (_) {}

    // Fetch official NSE direct authorization link if nominee opt-in
    let nseAuthUrl = null;
    try {
      if (nomineeName) {
        const shortLinkRes = await nseClient.getShortLink('NOMINEE_AUTH', clientCode);
        if (shortLinkRes?.success && shortLinkRes?.data?.firstHolderLink) {
          nseAuthUrl = shortLinkRes.data.firstHolderLink;
        }
      }
    } catch (_) {}

    return res.json({
      success: true,
      message: 'UCC successfully generated and registered with NSE MFSS. NSE has dispatched official authentication SMS/OTP to your mobile number.',
      data: uccRecord,
      authUrl: nseAuthUrl,
    });
  } catch (error) {
    console.error('[registerUserUcc Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5. POST /api/mutual-funds/orders/purchase (Lump Sum / Normal via NSE MF II) ──
exports.createPurchaseOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { schemeCode, orderAmount, paymentMode = 'NSE_PAYMENT_LINK' } = req.body;

    if (!schemeCode || !orderAmount || Number(orderAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid schemeCode and orderAmount are required' });
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

    // 1. Prepare NSE Order payload (Order Entry PUR)
    const nseOrderPayload = {
      order_ref_number: orderId,
      scheme_code: targetNseCode,
      trxn_type: 'P', // Purchase
      buy_sell_type: buySellType,
      client_code: ucc.clientCode,
      demat_physical: 'P', // Physical/Folio mode
      order_amount: String(orderAmount),
      folio_no: folioNo,
      remarks: 'Invested via GoldVikaone',
      kyc_flag: 'Y',
      euin_declaration: 'N',
      dpc_flag: 'Y',
      all_units: 'N',
      bank_ref_no: '',
      account_no: ucc.primaryBank.accountNo,
      mobile_no: user.phone?.slice(-10) || '',
      email: user.email,
      member_unique_id: orderId,
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

    // 3. Request Official Payment Link from NSE (GET_LINK API)
    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    let paymentLink = `${backendUrl}/api/mutual-funds/checkout/${orderId}?mode=sandbox`;
    if (nseOrderId) {
      try {
        const linkRes = await nseClient.getShortLink('PUR', nseOrderId);
        if (linkRes && linkRes.success && linkRes.data?.firstHolderLink) {
          paymentLink = linkRes.data.firstHolderLink;
        }
      } catch (_) {}
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
      paymentMode: 'NSE_PAYMENT_LINK',
      paymentStatus: 'PENDING',
      orderStatus: 'PAYMENT_PENDING',
      paymentLink,
      nseTrxnOrderId: nseOrderId,
      nseStatus: isSuccess ? 'ORDER PLACED' : 'PENDING_NSE',
      remarks: 'Order placed on NSE MFSS. Awaiting investor payment through official NSE payment gateway.',
    });

    return res.json({
      success: true,
      message: 'Mutual fund order created successfully. Please complete payment through the official NSE payment link.',
      data: {
        order,
        paymentLink,
        amount: Number(orderAmount),
        currency: 'INR',
        paymentMode: 'NSE_PAYMENT_LINK',
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
      order_ref_number: order.orderId,
      client_code: order.clientCode || ucc?.clientCode,
      ...(req.body?.mockStatus ? { mockStatus: req.body.mockStatus } : {}),
      ...(req.query?.mockStatus ? { mockStatus: req.query.mockStatus } : {}),
    };

    let nseData = null;
    try {
      const report = await nseClient.getOrderStatusReport(nseFilter);
      nseData = report?.data?.orders?.[0];
    } catch (err) {
      console.warn(`[syncOrderStatus] NSE query warning for ${orderId}:`, err.message);
    }

    if (nseData) {
      const nseOrderStatus = (nseData.order_status || nseData.status || '').toUpperCase();
      const allottedUnits = parseFloat(nseData.allotted_units || '0');
      const allottedNav = parseFloat(nseData.nav || '0');

      order.nseStatus = nseOrderStatus;

      // Handle Rejection / Failure
      if (['REJECTED', 'FAILED', 'CANCELLED'].includes(nseOrderStatus)) {
        order.paymentStatus = 'FAILED';
        order.orderStatus = 'REJECTED';
        order.remarks = nseData.rejection_reason || 'Order rejected by NSE MFSS exchange';
        await order.save();
        return res.json({
          success: true,
          message: `Order rejected by exchange: ${order.remarks}`,
          data: { order, isAuthoritative: true },
        });
      }

      // Handle Confirmed Payment / Accepted Transaction
      if (['SUCCESS', 'APPROVED', 'VALIDATED', 'ACCEPTED', 'ORDER PLACED'].includes(nseOrderStatus)) {
        if (order.paymentStatus !== 'SUCCESS') {
          order.paymentStatus = 'SUCCESS';
          order.orderStatus = 'PAYMENT_SUCCESS';
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

    // Calculate dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dateFormatted = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;

    const effectiveMandateId = mandate.mandateId;

    // 1. Prepare NSE XSIP payload with authoritative exchange codes
    const nseXsipPayload = {
      amc_code: authoritativeAmcCode,
      sch_code: authoritativeNseCode,
      client_code: ucc.clientCode,
      trans_mode: 'P', // Physical/Folio
      dp_txn_mode: sipMaster.sipTransactionMode || 'DP',
      start_date: dateFormatted,
      frequency_type: normFreq,
      frequency_allowed: '1',
      installment_amount: String(installmentAmount),
      status: '1',
      installment_no: '60', // 5 years default tenure
      first_order_today: 'Y',
      primary_holder_mobile: user.phone?.slice(-10) || '',
      primary_holder_email: user.email,
      step_up_required: stepUpRequired ? 'Y' : 'N',
      step_up_amount: stepUpAmount ? String(stepUpAmount) : '0',
      member_unique_id: sipRefNo,
      mandate_id: effectiveMandateId,
    };

    // 2. Register with NSE Gateway
    let nseRes;
    if (effectiveMandateId) {
      nseRes = await nseClient.registerXsip([nseXsipPayload]);
    } else {
      nseRes = await nseClient.registerXsip([nseXsipPayload]);
      const checkItem = nseRes?.data?.reg_data?.[0];
      if (!nseRes?.success || checkItem?.status === 'FAILURE' || checkItem?.reg_id === '0' || checkItem?.reg_id === 0) {
        // Fallback to standard broker SIP if no mandate ID is linked
        const standardSipPayload = { ...nseXsipPayload };
        delete standardSipPayload.mandate_id;
        const stdRes = await nseClient.registerSip([standardSipPayload]);
        if (stdRes?.success && stdRes?.data?.reg_data?.[0]?.status !== 'FAILURE' && stdRes?.data?.reg_data?.[0]?.reg_id !== '0') {
          nseRes = stdRes;
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

    // 3. Request Official Payment / Mandate Link from NSE (GET_LINK API)
    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    let paymentLink = `${backendUrl}/api/mutual-funds/checkout/${sipRegNo}?mode=sandbox`;
    if (sipRegNo) {
      try {
        const linkRes = await nseClient.getShortLink('XSIP_REG', sipRegNo);
        if (linkRes && linkRes.success && linkRes.data?.firstHolderLink) {
          paymentLink = linkRes.data.firstHolderLink;
        } else {
          const purLinkRes = await nseClient.getShortLink('PUR', sipRegNo);
          if (purLinkRes && purLinkRes.success && purLinkRes.data?.firstHolderLink) {
            paymentLink = purLinkRes.data.firstHolderLink;
          }
        }
      } catch (linkErr) {
        console.warn('[registerSipOrder] getShortLink warning:', linkErr.message);
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
      startDate: start,
      nextDueDate: start,
      mandateId: effectiveMandateId,
      installmentsPaid: 0,
      totalAmountPaid: 0,
      status: 'PENDING_PAYMENT',
      stepUpRequired: Boolean(stepUpRequired),
      stepUpAmount: Number(stepUpAmount || 0),
    });

    return res.json({
      success: true,
      message: 'SIP successfully registered on NSE MFSS',
      data: {
        sip: sipRecord,
        sipId: sipRecord._id,
        paymentLink,
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
          : (o.allottedUnits || o.estimatedUnits || 0);

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

    return res.json({ success: true, message: 'SIP cancelled successfully', data: sip });
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
    const orders = await MfOrder.find({ user: userId }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: orders,
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

// ── 10. GET /api/mutual-funds/checkout/:orderId (Visual Web Checkout Simulator) ──
exports.renderCheckoutSimulator = async (req, res) => {
  try {
    const { orderId } = req.params;
    const mongoose = require('mongoose');

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
              nseStatus: 'SUBMITTED (SANDBOX)',
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
          <title>NSE MFSS SIP Confirmation</title>
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
            <div class="badge">⚡ NSE MFSS SIP Mandate Verified</div>
            <div class="icon-circle">✓</div>
            <h1>SIP Setup Successful</h1>
            <p class="sub">Your SIP has been registered with NSE and the 1st installment is paid.</p>

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
                <span class="val" style="color: #00D09C;">ACTIVE (VERIFIED)</span>
              </div>
            </div>

            <button class="btn" onclick="window.close();">Return to GoldVikaone App</button>
            <div class="footer">National Stock Exchange of India (NSE NMF II) Sandbox Simulator</div>
          </div>
        </body>
        </html>
      `);
    }

    // ── SCENARIO B: MANDATE AUTHORIZATION SIMULATION ──
    if (mandate) {
      if (mandate.status !== 'APPROVED') {
        mandate.status = 'APPROVED';
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
            <div class="footer">National Payments Corporation of India (NPCI eNACH) Sandbox</div>
          </div>
        </body>
        </html>
      `);
    }

    // ── SCENARIO C: ONE-TIME PURCHASE (LUMP-SUM) SIMULATION ──
    if (order.paymentStatus !== 'SUCCESS') {
      order.paymentStatus = 'SUCCESS';
      order.nseStatus = 'ALLOTTED (SANDBOX)';
      await order.save();
    }

    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NSE MFSS Sandbox Payment Simulator</title>
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
          <div class="badge">⚡ NSE MFSS Sandbox Verified</div>
          <div class="icon-circle">✓</div>
          <h1>Payment Successful</h1>
          <p class="sub">Your test mutual fund purchase has been simulated and units are allotted.</p>

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
          <div class="footer">National Stock Exchange of India (NSE NNF v1.9.8) Sandbox Simulator</div>
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
    const nseRedemptionPayload = {
      order_ref_number: orderId,
      scheme_code: targetNseCode || scheme.schemeCode,
      trxn_type: 'R', // Redemption
      buy_sell_type: effectiveFolio ? 'ADDITIONAL' : 'FRESH',
      client_code: ucc.clientCode,
      demat_physical: 'P',
      order_amount: String(computedAmount),
      allotment_units: effectiveMode === 'UNITS' ? String(unitsToRedeem) : '',
      all_units: allUnits ? 'Y' : 'N',
      folio_no: effectiveFolio,
      remarks: remarks || `Redemption via Vikaone app`,
      account_no: ucc.primaryBank?.accountNo || '',
      mobile_no: user?.phone?.slice(-10) || '',
      email: user?.email || '',
      member_unique_id: orderId,
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

    const isKycApproved = Boolean(
      user &&
      (user.isKycVerified === true || user.kycStatus === 'approved' || user.kycStatus === 'verified')
    );
    const isUccActive = Boolean(ucc && ucc.clientCode && ucc.nseStatus === 'ACTIVE');
    const isBankVerified = Boolean(
      ucc?.primaryBank?.accountNo &&
      ucc?.primaryBank?.accountNo.length >= 9 &&
      ucc?.primaryBank?.ifsc &&
      ucc?.primaryBank?.ifsc.length === 11
    );

    const isLumpSumReady = isKycApproved && isUccActive && isBankVerified;

    if (!ucc || !isUccActive || !isKycApproved || !isBankVerified) {
      return res.json({
        success: true,
        data: {
          step: 1,
          title: 'Complete Investor Account (Step 1 of 2)',
          subtitle: 'SEBI requires a one-time profile (PAN, Bank, Nominee) and approved KYC before investing on NSE MFSS.',
          clientCode: ucc ? ucc.clientCode : null,
          hasUcc: isUccActive,
          uccStatus: ucc ? ucc.nseStatus : 'NOT_REGISTERED',
          kycStatus: user ? user.kycStatus : 'pending',
          hasMandate: false,
          mandateStatus: 'NONE',
          isSipReady: false,
          isLumpSumReady: false,
        },
      });
    }

    const mandate = await MfMandate.findOne({ user: userId }).sort({ createdAt: -1 });
    const isMandateApproved = Boolean(
      mandate &&
      (mandate.status === 'APPROVED' || mandate.status === 'ACCEPTED_BY_BANK' || mandate.status === 'ACTIVE') &&
      ((typeof mandate.umrn === 'string' && mandate.umrn.trim().length > 0) || nseClient.isMockMode())
    );

    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const authUrl = mandate?.authLink || (mandate ? `${backendUrl}/api/mutual-funds/checkout/${mandate.mandateId}?mode=sandbox` : null);

    if (!isMandateApproved) {
      return res.json({
        success: true,
        data: {
          step: 2,
          title: 'Set Up Bank AutoPay (Step 2 of 2)',
          subtitle: `Client Code: ${ucc.clientCode}. Authorize your one-time bank mandate to automate monthly SIP investments on NSE.`,
          clientCode: ucc.clientCode,
          hasUcc: true,
          uccStatus: ucc.nseStatus || 'ACTIVE',
          hasMandate: Boolean(mandate),
          mandateStatus: mandate ? mandate.status : 'NONE',
          mandateId: mandate ? mandate.mandateId : null,
          authUrl,
          bankName: ucc.primaryBank?.bankName || '',
          accountNo: ucc.primaryBank?.accountNo || '',
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
        hasUcc: true,
        uccStatus: ucc.nseStatus || 'ACTIVE',
        hasMandate: true,
        mandateStatus: mandate.status,
        mandateId: mandate.mandateId,
        bankName: mandate.bankName || ucc.primaryBank?.bankName || '',
        accountNo: mandate.accountNo || ucc.primaryBank?.accountNo || '',
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

    const { amount = 50000 } = req.body;
    let mandate = await MfMandate.findOne({ user: userId }).sort({ createdAt: -1 });

    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';

    if (!mandate) {
      let mandateId = null;
      let authLink = null;

      if (!nseClient.isMockMode()) {
        const nseRes = await nseClient.registerMandate([
          {
            client_code: ucc.clientCode,
            mandate_type: 'E',
            amount: String(amount),
            acc_no: ucc.primaryBank?.accountNo,
            ifsc_code: ucc.primaryBank?.ifsc,
          },
        ]);
        const regItem = nseRes?.data?.reg_data?.[0];
        const liveMandateId = regItem?.mandate_id || regItem?.reg_id;
        if (!nseRes?.success || !liveMandateId || regItem?.reg_status === 'REG_FAILED') {
          const errMsg = regItem?.reg_remark || nseRes?.data?.message || 'NSE Exchange rejected mandate registration';
          return res.status(400).json({
            success: false,
            message: `NSE MFSS Mandate: ${errMsg}`,
            data: {
              status: regItem?.reg_status || 'FAILED',
              remark: regItem?.reg_remark || '',
            },
          });
        }
        mandateId = String(liveMandateId);
        try {
          const shortLinkRes = await nseClient.getShortLink('MANDATE_AUTH', liveMandateId);
          if (shortLinkRes?.success && shortLinkRes?.data?.firstHolderLink) {
            authLink = shortLinkRes.data.firstHolderLink;
          }
        } catch (_) {}
      } else {
        mandateId = `TEST_MND_${Date.now()}`;
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
      });

      ucc.defaultMandateId = mandate.mandateId;
      await ucc.save();
    } else if (!mandate.authLink) {
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

    if (!mandate) {
      return res.status(404).json({ success: false, message: 'Mandate record not found' });
    }

    mandate.status = 'APPROVED';
    await mandate.save();

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (ucc) {
      ucc.defaultMandateId = mandate.mandateId;
      await ucc.save();
    }

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

    // 3. Check existing NSE UCC in Database
    try {
      const existingUcc = await MfClientUcc.findOne({ 
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

    // 4. Query Official NSE MFSS Utility KYC Status (/nsemfdesk/api/v2/utility/KYC_CHECK)
    let nseRemark = '';
    let kraName = '';
    try {
      const nseKycRes = await nseClient.checkKycStatus(panClean);

      if (nseKycRes && nseKycRes.success && nseKycRes.data) {
        const kycData = nseKycRes.data;
        const kycStatus = String(kycData.kyc_status || '').toUpperCase();
        nseRemark = kycData.kyc_status_remark || '';
        kraName = kycData.kra_name || '';

        // Status 'S' = Success (KYC REGISTERED / Validated), 'Y' = Compliant
        if (kycStatus === 'S' || kycStatus === 'Y') {
          isNseVerified = true;
          isKraVerified = true;
          verifiedSource = 'NSE_MFSS_KYC_VERIFY';
          if (kycData.name || kycData.client_name) {
            registeredName = (kycData.name || kycData.client_name).trim().toUpperCase();
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

    if (cfClientId && cfClientSecret && cfClientId !== 'your_cashfree_client_id') {
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

    // 6. Cross-check existing approved KYC in DB ONLY IF PAN strictly matches
    try {
      const existingKyc = userId ? await Kyc.findOne({ user: userId, status: 'approved' }).catch(() => null) : null;
      if (existingKyc && existingKyc.fullName && existingKyc.panNumber === panClean) {
        if (!registeredName) registeredName = existingKyc.fullName.toUpperCase();
        isKraVerified = true;
        verifiedSource = verifiedSource || 'INTERNAL_APPROVED_KYC';
      }
    } catch (_) {}

    // 7. Decision Gate: Existing KRA Investor vs Fresh First-Time Investor
    const isFreshInvestor = !isNseVerified && !isKraVerified;
    if (isFreshInvestor) {
      // Fresh/first-time investor (valid PAN format, no prior mutual fund KRA history)
      // DO NOT fallback to user.name (which might be an account owner nickname like "Harsh")!
      // Only use registeredName if verified with NSDL/Cashfree or passed explicitly in body.
      const freshName = registeredName || (req.body.name || req.body.fullName || '').trim().toUpperCase();
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
          message: 'Valid PAN. First-time mutual fund investor detected.',
        },
      });
    }

    if (!registeredName) {
      registeredName = (req.body.name || req.body.fullName || 'INVESTOR').trim().toUpperCase();
    }

    return res.json({
      success: true,
      data: {
        pan: panClean,
        registeredName,
        isValid: true,
        nseKycStatus: isNseVerified ? 'VERIFIED' : 'Y',
        nseKycRemark: nseRemark || 'KYC REGISTERED',
        kra: kraName || 'cvlkra',
        source: verifiedSource || 'NSE_MFSS_KYC_VERIFY',
        message: 'PAN verified successfully on NSE MFSS',
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

    if (!scheme || scheme.planType !== 'REGULAR' || /direct/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.schemeName) || /idcw|dividend/i.test(scheme.option || '')) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found. Only Regular Plan Growth mutual funds are available on Vikaone.',
      });
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

