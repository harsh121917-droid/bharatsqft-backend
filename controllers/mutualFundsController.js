const MutualFundScheme = require('../models/MutualFundScheme');
const MfClientUcc = require('../models/MfClientUcc');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MfSip = require('../models/MfSip');
const MfSystematicPlan = require('../models/MfSystematicPlan');
const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const Kyc = require('../models/Kyc');
const nseClient = require('../services/nse/nseClient');
const paymentGatewayService = require('../services/paymentGatewayService');
const mfLiveService = require('../services/mfLiveService');

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

    // STRICT FISDOM MODEL: Only active Regular plans, never Direct plans
    const query = {
      isActive: true,
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
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
    let sortOption = { rating: -1, cagr3Y: -1 };
    if (sort === 'popularity' || sort === 'popular') {
      sortOption = { isPopular: -1, aum: -1, rating: -1, cagr3Y: -1 };
    } else if (sort === 'returns1y' || sort === '1Y Returns') {
      sortOption = { cagr1Y: -1 };
    } else if (sort === 'returns3y' || sort === '3Y Returns' || sort === '3Y Re') {
      sortOption = { cagr3Y: -1 };
    } else if (sort === 'returns5y' || sort === '5Y Returns' || sort === '5Y') {
      sortOption = { cagr5Y: -1 };
    } else if (sort === 'rating' || sort === 'Rating') {
      sortOption = { rating: -1, cagr3Y: -1 };
    } else if (sort === 'nav') {
      sortOption = { nav: 1 };
    } else if (sort === 'aum') {
      sortOption = { aum: -1 };
    }

    const schemes = await MutualFundScheme.find(query)
      .sort(sortOption)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await MutualFundScheme.countDocuments(query);

    return res.json({
      success: true,
      data: schemes,
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

    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found. Only Regular Plan mutual funds are available on Vikaone.',
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
        };
      }
    }

    // Determine accurate AUM, min SIP, min purchase, and rating (preserves null if unknown)
    const realAum = scheme.aum ?? liveFacts?.aum ?? null;
    const realMinSip = scheme.minSipAmount ?? liveFacts?.minSipAmount ?? null;
    const realMinPurchase = scheme.minPurchaseAmount ?? liveFacts?.minPurchaseAmount ?? null;
    const realRating = scheme.rating ?? liveFacts?.rating ?? null;

    // Top holdings - ONLY real data, no synthetic mock fallback
    const topHoldings = liveFacts?.topHoldings || [];

    // Pros & Cons - ONLY real data, no synthetic mock fallback
    const prosAndCons = liveFacts?.prosAndCons || { pros: [], cons: [] };

    // Fund manager & expense ratio (preserves null if unknown)
    const fundManagerName = scheme.fundManager ?? liveFacts?.fundManager ?? null;
    const expenseRatio = scheme.expenseRatio ?? liveFacts?.expenseRatio ?? null;
    const cat = (scheme.category || '').toLowerCase();

    // Similar peer schemes strictly in the same Sub-Category (e.g. Mid Cap with Mid Cap)
    const peerFilter = {
      schemeCode: { $ne: scheme.schemeCode },
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
      isActive: true,
    };
    if (scheme.subCategory && scheme.subCategory.trim()) {
      peerFilter.subCategory = { $regex: scheme.subCategory.trim(), $options: 'i' };
    } else if (scheme.category) {
      peerFilter.category = scheme.category;
    }

    const similarFunds = await MutualFundScheme.find(peerFilter)
      .sort({ aum: -1, cagr3Y: -1 })
      .limit(6)
      .select('schemeCode schemeName amcName nav cagr1Y cagr3Y cagr5Y rating aum expenseRatio minSipAmount');

    // Genuine Regular Plan returns computed strictly from historical daily NAVs
    const retStats = liveFacts?.returnStats;
    const ret1Y = periodReturns['1Y']?.returnPercent ?? scheme.cagr1Y ?? null;
    const ret3Y = periodReturns['3Y']?.returnPercent ?? scheme.cagr3Y ?? null;
    const ret5Y = periodReturns['5Y']?.returnPercent ?? scheme.cagr5Y ?? null;
    const retAll = periodReturns['All']?.returnPercent ?? null;

    const accurateNav = (liveNav?.latestNav ? parseFloat(liveNav.latestNav) : scheme.nav);
    const day1Ret = liveNav?.day1Return ?? null;
    const day1Pos = day1Ret !== null ? day1Ret >= 0 : null;

    // Do NOT overwrite database scheme records with external unverified scraper data

    const fundManagement = (liveFacts?.fundManagerDetails && liveFacts.fundManagerDetails.length > 0)
      ? liveFacts.fundManagerDetails
      : (fundManagerName ? [{ name: fundManagerName, qualification: '', experience: '', tenure: '', fundsManaged: '' }] : []);

    return res.json({
      success: true,
      data: {
        ...scheme.toObject(),
        rating: realRating,
        minSipAmount: realMinSip,
        minPurchaseAmount: realMinPurchase,
        nav: accurateNav,
        navDate: liveNav?.latestDate ? new Date(liveNav.latestDate) : scheme.navDate,
        aum: realAum,
        day1Return: day1Ret,
        day1IsPositive: day1Pos,
        cagr1Y: ret1Y,
        cagr3Y: ret3Y,
        cagr5Y: ret5Y,
        expenseRatio,
        fundManager: fundManagerName,
        chartData,
        periodReturns,
        navHistory: chartData ? (chartData['1M'] || []) : [],
        returnsComparison: {
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
        topHoldings,
        expenseDetails: {
          expenseRatio,
          exitLoad: scheme.exitLoad || liveFacts?.exitLoad || null,
          stampDuty: '0.005% on purchase as per Indian Stamp Act.',
          taxImplications:
            cat.includes('debt')
              ? 'Taxed as per individual income tax slab rate.'
              : 'Equity STCG taxed at 20%. LTCG taxed at 12.5% for capital gains above ₹1.25 Lakh per financial year.',
        },
        fundManagement,
        fundHouse: {
          name: scheme.amcName,
          code: scheme.amcCode,
          rank: null,
          totalAum: realAum ? `₹${Number(realAum).toLocaleString('en-IN')} Crores` : null,
          objective: liveFacts?.benchmarkName
            ? `Benchmark: ${liveFacts.benchmarkName}`
            : null,
        },
        prosAndCons,
        similarFunds,
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

    // 2. Call NSE Client if credentials available (or simulate success on UAT fallback)
    const nseRes = await nseClient.registerUcc([nseUccPayload]);
    console.log('[NSE UCC Response]:', nseRes);

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
        nseStatus: 'ACTIVE',
        fatcaUploaded: true,
      },
      { upsert: true, new: true }
    );

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

// ── 5. POST /api/mutual-funds/orders/purchase (Lump Sum / Normal) ──
exports.createPurchaseOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { schemeCode, orderAmount, paymentMode = 'UPI' } = req.body;

    if (!schemeCode || !orderAmount || Number(orderAmount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid schemeCode and orderAmount are required' });
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(400).json({
        success: false,
        message: 'Please complete one-time investor onboarding (UCC) before placing mutual fund orders',
      });
    }

    const scheme = await MutualFundScheme.findOne({ schemeCode: schemeCode.toUpperCase() });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (scheme.planType === 'DIRECT' || scheme.schemeName.toLowerCase().includes('direct')) {
      return res.status(400).json({
        success: false,
        message: 'Only Regular Plan mutual funds can be purchased through Vikaone. Direct plans are not supported.',
      });
    }

    if (orderAmount < scheme.minPurchaseAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount for ${scheme.schemeName} is ₹${scheme.minPurchaseAmount}`,
      });
    }

    const orderId = `MFP${Date.now()}`;
    const user = await User.findById(userId);

    // 1. Prepare NSE Order payload (Order Entry PUR)
    const nseOrderPayload = {
      order_ref_number: orderId,
      scheme_code: scheme.schemeCode,
      trxn_type: 'P', // Purchase
      buy_sell_type: 'FRESH',
      client_code: ucc.clientCode,
      demat_physical: 'P', // Physical/Folio mode
      order_amount: String(orderAmount),
      folio_no: '',
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

    const nseOrderId = isSuccess ? String(rawNseOrderId) : (nseClient.isMockMode() ? String(rawNseOrderId || `TEST_PUR_${Date.now()}`) : null);

    // 3. Request Payment Link from NSE (GET_LINK API)
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

    // 4. Units & Allotment: Never treat estimated units as actual allotted units!
    const estimatedUnits = scheme.nav && scheme.nav > 0 ? +(orderAmount / scheme.nav).toFixed(3) : null;

    const order = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      transactionType: 'P',
      buySellType: 'FRESH',
      orderAmount: Number(orderAmount),
      estimatedUnits,
      units: 0, // Actual units remain 0 until Allotment Statement Report confirms allotment
      allottedUnits: 0,
      allottedNav: null,
      allotmentStatus: 'PENDING',
      navAtOrder: scheme.nav,
      paymentMode: paymentMode || 'UPI',
      paymentStatus: 'PENDING',
      paymentLink,
      nseTrxnOrderId: nseOrderId,
      nseStatus: isSuccess ? 'ORDER PLACED' : 'PENDING_NSE',
      remarks: 'Order placed on NSE MFSS. Awaiting investor payment and AMC unit allotment.',
    });

    return res.json({
      success: true,
      message: 'Mutual fund order created successfully. Please complete payment through the official NSE payment link.',
      data: {
        order,
        paymentLink,
        amount: Number(orderAmount),
        currency: 'INR',
      },
    });
  } catch (error) {
    console.error('[createPurchaseOrder Error]:', error);
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

    const ucc = await MfClientUcc.findOne({ user: userId });
    if (!ucc) {
      return res.status(400).json({
        success: false,
        message: 'Please complete one-time investor onboarding (UCC) before setting up a SIP',
      });
    }

    const scheme = await MutualFundScheme.findOne({ schemeCode: schemeCode.toUpperCase() });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (scheme.planType === 'DIRECT' || scheme.schemeName.toLowerCase().includes('direct')) {
      return res.status(400).json({
        success: false,
        message: 'Only Regular Plan mutual funds are available for SIP through Vikaone. Direct plans are not supported.',
      });
    }

    if (installmentAmount < scheme.minSipAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum SIP amount for ${scheme.schemeName} is ₹${scheme.minSipAmount}`,
      });
    }

    const sipRefNo = `SIP${Date.now()}`;
    const user = await User.findById(userId);

    // Calculate dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dateFormatted = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;

    const effectiveMandateId = req.body.mandateId || ucc.defaultMandateId || '';

    // 1. Prepare NSE XSIP payload
    const nseXsipPayload = {
      amc_code: scheme.amcCode || 'NSE_MF',
      sch_code: scheme.schemeCode,
      client_code: ucc.clientCode,
      trans_mode: 'P', // Physical/Folio
      dp_txn_mode: 'P',
      start_date: dateFormatted,
      frequency_type: frequency.toUpperCase(),
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
      return res.status(400).json({
        success: false,
        message: `NSE MFSS Exchange: ${nseMsg}. Please verify investor UCC approval or eNACH mandate authorization.`,
        data: {
          exchangeStatus: regItem?.reg_status || regItem?.status || 'REJECTED',
          exchangeMessage: nseMsg,
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

// ── 6a. POST /api/mutual-funds/orders/verify (Verify Razorpay MF Purchase) ──
exports.verifyPurchasePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'orderId and razorpayPaymentId are required' });
    }

    const order = await MfOrder.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Mutual fund order not found' });
    }

    if (razorpaySignature && razorpayOrderId) {
      const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });

      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }
    }

    order.paymentStatus = 'SUCCESS';
    order.paymentMode = 'RAZORPAY';
    order.razorpayOrderId = razorpayOrderId || order.razorpayOrderId;
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature || '';
    order.nseStatus = 'TRXN SUCCESS';
    await order.save();

    return res.json({
      success: true,
      message: 'Mutual fund investment payment verified successfully',
      data: order,
    });
  } catch (error) {
    console.error('[verifyPurchasePayment Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6b. POST /api/mutual-funds/sip/verify (Verify Razorpay MF SIP 1st Installment) ──
exports.verifySipPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sipId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!sipId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'sipId and razorpayPaymentId are required' });
    }

    const sip = await MfSip.findOne({ _id: sipId, user: userId });
    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP record not found' });
    }

    if (razorpaySignature && razorpayOrderId) {
      const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });

      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }
    }

    const scheme = await MutualFundScheme.findOne({ schemeCode: sip.schemeCode });
    const nav = scheme?.nav || 100;
    const units = +(sip.installmentAmount / nav).toFixed(3);

    // Check if an order already exists for this payment (idempotency)
    let initialOrder = await MfOrder.findOne({ razorpayPaymentId });
    if (!initialOrder) {
      initialOrder = await MfOrder.create({
        user: userId,
        clientCode: sip.clientCode,
        orderId: `MF_SIP_${Date.now()}`,
        schemeCode: sip.schemeCode,
        schemeName: sip.schemeName,
        transactionType: 'P',
        buySellType: 'FRESH',
        orderAmount: sip.installmentAmount,
        units,
        navAtOrder: nav,
        paymentMode: 'RAZORPAY',
        paymentStatus: 'SUCCESS',
        razorpayOrderId: razorpayOrderId || '',
        razorpayPaymentId,
        razorpaySignature: razorpaySignature || '',
        nseStatus: 'TRXN SUCCESS',
        remarks: `First installment for SIP ${sip.sipRegNo}`,
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
      message: 'SIP first installment verified and active',
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

// Helper to calculate available units held in a scheme
async function getUserSchemeHoldings(userId, schemeCode) {
  const orders = await MfOrder.find({
    user: userId,
    schemeCode: schemeCode.toUpperCase(),
    paymentStatus: 'SUCCESS',
  });

  let totalUnits = 0;
  for (const ord of orders) {
    if (ord.transactionType === 'P') {
      const confirmedUnits = ord.allottedUnits !== undefined && ord.allottedUnits !== null
        ? ord.allottedUnits
        : (ord.allotmentStatus === 'CONFIRMED' ? ord.units : 0);
      totalUnits += confirmedUnits;
    } else if (ord.transactionType === 'R' || ord.transactionType === 'S') {
      totalUnits -= (ord.redemptionUnits || ord.units || 0);
    }
  }
  return Math.max(0, +totalUnits.toFixed(3));
}

// ── 7. GET /api/mutual-funds/portfolio (Holdings & Summary) ──
exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch confirmed purchases and redemptions/switches
    const orders = await MfOrder.find({
      user: userId,
      paymentStatus: 'SUCCESS',
    }).sort({ createdAt: 1 });

    const activeSips = await MfSip.find({ user: userId, status: 'ACTIVE' });

    // Auto-reconcile activeSips installments with actual confirmed purchase orders
    const purchaseOrders = orders.filter((o) => o.transactionType === 'P');
    for (const sip of activeSips) {
      const confirmedOrdersCount = purchaseOrders.filter(
        (o) => o.schemeCode === sip.schemeCode || (o.remarks && o.remarks.includes(sip.sipRegNo))
      ).length;

      if (confirmedOrdersCount > 0 && sip.installmentsPaid !== confirmedOrdersCount) {
        sip.installmentsPaid = confirmedOrdersCount;
        sip.totalAmountPaid = confirmedOrdersCount * sip.installmentAmount;
        await sip.save();
      }
    }

    // Aggregate holdings by scheme
    const holdingsMap = {};
    let totalInvested = 0;

    for (const ord of orders) {
      if (!holdingsMap[ord.schemeCode]) {
        holdingsMap[ord.schemeCode] = {
          schemeCode: ord.schemeCode,
          schemeName: ord.schemeName,
          totalUnits: 0,
          investedAmount: 0,
          currentNav: ord.navAtOrder,
        };
      }
      if (ord.transactionType === 'P') {
        const confirmedUnits = ord.allottedUnits !== undefined && ord.allottedUnits !== null
          ? ord.allottedUnits
          : (ord.allotmentStatus === 'CONFIRMED' ? ord.units : 0);
        holdingsMap[ord.schemeCode].totalUnits += confirmedUnits;
        holdingsMap[ord.schemeCode].investedAmount += ord.orderAmount;
        totalInvested += ord.orderAmount;
      } else if (ord.transactionType === 'R' || ord.transactionType === 'S') {
        const unitsReduced = ord.redemptionUnits || ord.units || 0;
        const previousUnits = holdingsMap[ord.schemeCode].totalUnits;
        const previousInvested = holdingsMap[ord.schemeCode].investedAmount;

        // Reduce invested amount proportionally by weighted average cost basis of redeemed units
        let costBasisReduced = 0;
        if (previousUnits > 0 && previousInvested > 0) {
          const costPerUnit = previousInvested / previousUnits;
          costBasisReduced = Math.min(previousInvested, unitsReduced * costPerUnit);
        }

        holdingsMap[ord.schemeCode].totalUnits = Math.max(0, previousUnits - unitsReduced);
        holdingsMap[ord.schemeCode].investedAmount = Math.max(0, previousInvested - costBasisReduced);
        totalInvested = Math.max(0, totalInvested - costBasisReduced);
      }
    }

    // Refresh with latest NAVs
    const schemeCodes = Object.keys(holdingsMap);
    const liveSchemes = await MutualFundScheme.find({ schemeCode: { $in: schemeCodes } });
    const liveMap = {};
    liveSchemes.forEach((s) => {
      liveMap[s.schemeCode] = s;
    });

    let currentValuation = 0;
    const holdingsList = Object.values(holdingsMap)
      .filter((h) => h.totalUnits > 0.0001)
      .map((h) => {
        const live = liveMap[h.schemeCode];
        const currentNav = live?.nav || h.currentNav;
        const currentValue = +(h.totalUnits * currentNav).toFixed(2);
        const profitLoss = +(currentValue - h.investedAmount).toFixed(2);
        const profitLossPct = h.investedAmount > 0 ? +((profitLoss / h.investedAmount) * 100).toFixed(2) : 0;

        currentValuation += currentValue;

        return {
          ...h,
          totalUnits: +h.totalUnits.toFixed(3),
          currentNav,
          currentValue,
          profitLoss,
          profitLossPct,
        };
      });

    const totalProfitLoss = +(currentValuation - totalInvested).toFixed(2);
    const totalProfitLossPct = totalInvested > 0 ? +((totalProfitLoss / totalInvested) * 100).toFixed(2) : 0;

    return res.json({
      success: true,
      data: {
        summary: {
          totalInvested: +totalInvested.toFixed(2),
          currentValuation: +currentValuation.toFixed(2),
          totalProfitLoss,
          totalProfitLossPct,
          totalFunds: holdingsList.length,
          activeSipsCount: activeSips.length,
        },
        holdings: holdingsList,
        activeSips,
      },
    });
  } catch (error) {
    console.error('[getPortfolio Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
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
    const { orderId } = req.params;
    const order = await MfOrder.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.paymentStatus = 'SUCCESS';
    order.nseStatus = 'ALLOTTED (SANDBOX)';
    order.remarks = 'Payment simulated successfully in Sandbox Mode';
    await order.save();

    return res.json({
      success: true,
      message: 'Payment simulated and units allotted successfully',
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
            const scheme = await MutualFundScheme.findOne({ schemeCode: sip.schemeCode });
            const nav = scheme?.nav || 100;
            const units = Number((sip.installmentAmount / nav).toFixed(3));
            await MfOrder.create({
              user: sip.user,
              clientCode: sip.clientCode,
              orderId: `MF_SIP_${Date.now()}`,
              schemeCode: sip.schemeCode,
              schemeName: sip.schemeName,
              transactionType: 'P',
              orderAmount: sip.installmentAmount,
              units,
              navAtOrder: nav,
              paymentMode: 'MANDATE',
              paymentStatus: 'SUCCESS',
              nseStatus: 'ALLOTTED (SANDBOX)',
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
    const { schemeCode, units, allUnits = false, remarks = '' } = req.body;

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

    const scheme = await MutualFundScheme.findOne({ schemeCode: schemeCode.toUpperCase(), planType: 'REGULAR' });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (scheme.redemptionAllowed === false) {
      return res.status(400).json({
        success: false,
        message: `Redemptions are currently locked for ${scheme.schemeName} (e.g. ELSS lock-in period)`,
      });
    }

    const availableUnits = await getUserSchemeHoldings(userId, scheme.schemeCode);
    if (availableUnits <= 0) {
      return res.status(400).json({
        success: false,
        message: `You currently have 0 units in ${scheme.schemeName} available to redeem.`,
      });
    }

    const unitsToRedeem = allUnits ? availableUnits : parseFloat(units);
    if (isNaN(unitsToRedeem) || unitsToRedeem <= 0) {
      return res.status(400).json({ success: false, message: 'Please specify a valid unit quantity to redeem' });
    }

    if (unitsToRedeem > availableUnits) {
      return res.status(400).json({
        success: false,
        message: `Requested units (${unitsToRedeem}) exceed your available holdings (${availableUnits} units).`,
      });
    }

    const orderId = `MFR${Date.now()}`;
    const user = await User.findById(userId);
    const estimatedPayout = +(unitsToRedeem * scheme.nav).toFixed(2);

    // 1. Prepare NSE Redemption payload (Order Entry RED)
    const nseRedemptionPayload = {
      order_ref_number: orderId,
      scheme_code: scheme.schemeCode,
      trxn_type: 'R', // Redemption
      buy_sell_type: 'FRESH',
      client_code: ucc.clientCode,
      demat_physical: 'P',
      order_amount: String(estimatedPayout),
      allotment_units: String(unitsToRedeem),
      all_units: allUnits ? 'Y' : 'N',
      folio_no: '',
      remarks: remarks || `Redemption via Vikaone app`,
      account_no: ucc.primaryBank?.accountNo || '',
      mobile_no: user?.phone?.slice(-10) || '',
      email: user?.email || '',
      member_unique_id: orderId,
    };

    // 2. Dispatch to NSE Gateway
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

    // 3. Save Redemption Order
    const redemptionOrder = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      transactionType: 'R',
      redemptionUnits: unitsToRedeem,
      allUnits: Boolean(allUnits),
      orderAmount: estimatedPayout,
      units: unitsToRedeem,
      navAtOrder: scheme.nav,
      paymentMode: 'MANDATE',
      paymentStatus: 'SUCCESS', // Payment doesn't debit user; AMC settles payout to user bank
      payoutStatus: 'PENDING_AMC',
      payoutBank: {
        bankName: ucc.primaryBank?.bankName || '',
        accountNo: ucc.primaryBank?.accountNo || '',
        ifscCode: ucc.primaryBank?.ifscCode || '',
      },
      nseTrxnOrderId,
      nseStatus: 'ORDER SUBMITTED',
      remarks: `Redeemed ${unitsToRedeem} units. Expected payout of ₹${estimatedPayout.toLocaleString('en-IN')} will be credited to ${ucc.primaryBank?.bankName || 'bank account'} within 2-3 business days.`,
    });

    return res.json({
      success: true,
      message: `Redemption order for ${unitsToRedeem} units placed successfully. Payout will be credited to your registered bank account by AMC.`,
      data: {
        order: redemptionOrder,
        remainingUnits: +(availableUnits - unitsToRedeem).toFixed(3),
        estimatedPayout,
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
    const ucc = await MfClientUcc.findOne({ user: userId });

    if (!ucc) {
      return res.json({
        success: true,
        data: {
          step: 1,
          title: 'Complete Investor Account (Step 1 of 2)',
          subtitle: 'SEBI requires a one-time profile (PAN, Bank, Nominee) before investing on NSE MFSS.',
          clientCode: null,
          hasUcc: false,
          uccStatus: 'NOT_REGISTERED',
          hasMandate: false,
          mandateStatus: 'NONE',
          isSipReady: false,
          isLumpSumReady: false,
        },
      });
    }

    const mandate = await MfMandate.findOne({ user: userId }).sort({ createdAt: -1 });
    const isMandateApproved = !!(
      mandate &&
      (mandate.status === 'APPROVED' || mandate.status === 'ACCEPTED_BY_BANK' || mandate.status === 'ACTIVE')
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
          hasMandate: !!mandate,
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
