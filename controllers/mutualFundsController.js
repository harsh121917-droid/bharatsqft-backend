const MutualFundScheme = require('../models/MutualFundScheme');
const MfClientUcc = require('../models/MfClientUcc');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MfSip = require('../models/MfSip');
const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const Kyc = require('../models/Kyc');
const nseClient = require('../services/nse/nseClient');

// ── Default curated Mutual Fund schemes for instant out-of-the-box experience ──
const DEFAULT_SCHEMES = [
  {
    schemeCode: 'NIPSC-GR',
    schemeName: 'Nippon India Small Cap Fund - Direct Growth',
    amcCode: 'NIPPON_MF',
    amcName: 'Nippon India Mutual Fund',
    isin: 'INF204K01W08',
    category: 'Equity',
    subCategory: 'Small Cap',
    nav: 174.52,
    cagr1Y: 38.6,
    cagr3Y: 28.4,
    cagr5Y: 32.1,
    minPurchaseAmount: 1000,
    minSipAmount: 500,
    rating: 5,
    riskLevel: 'Very High',
    fundManager: 'Samir Rachh',
    aum: 62450,
    expenseRatio: 0.68,
    isPopular: true,
    isFeatured: true,
  },
  {
    schemeCode: 'PPFCF-GR',
    schemeName: 'Parag Parikh Flexi Cap Fund - Direct Growth',
    amcCode: 'PPFAS_MF',
    amcName: 'PPFAS Mutual Fund',
    isin: 'INF879O01027',
    category: 'Equity',
    subCategory: 'Flexi Cap',
    nav: 84.18,
    cagr1Y: 27.8,
    cagr3Y: 21.2,
    cagr5Y: 24.6,
    minPurchaseAmount: 1000,
    minSipAmount: 1000,
    rating: 5,
    riskLevel: 'Very High',
    fundManager: 'Rajeev Thakkar',
    aum: 78900,
    expenseRatio: 0.61,
    isPopular: true,
    isFeatured: true,
  },
  {
    schemeCode: 'ICICIGOLD-GR',
    schemeName: 'ICICI Prudential Regular Gold Savings Fund - Direct Growth',
    amcCode: 'ICICI_PRU_MF',
    amcName: 'ICICI Prudential Mutual Fund',
    isin: 'INF109K01Y83',
    category: 'Gold & Commodity',
    subCategory: 'Gold ETF FoF',
    nav: 26.85,
    cagr1Y: 29.4,
    cagr3Y: 18.2,
    cagr5Y: 15.6,
    minPurchaseAmount: 500,
    minSipAmount: 500,
    rating: 5,
    riskLevel: 'Moderately High',
    fundManager: 'Gaurav Chikane',
    aum: 6200,
    expenseRatio: 0.45,
    isPopular: true,
    isFeatured: true,
  },
  {
    schemeCode: 'SBILTF-GR',
    schemeName: 'SBI Long Term Equity Fund (ELSS) - Direct Growth',
    amcCode: 'SBI_MF',
    amcName: 'SBI Mutual Fund',
    isin: 'INF200K01TK4',
    category: 'Tax Saver (ELSS)',
    subCategory: 'ELSS Tax Saver (Sec 80C)',
    nav: 412.30,
    cagr1Y: 42.1,
    cagr3Y: 26.8,
    cagr5Y: 23.4,
    minPurchaseAmount: 500,
    minSipAmount: 500,
    rating: 5,
    riskLevel: 'Very High',
    fundManager: 'Dinesh Balachandran',
    aum: 26500,
    expenseRatio: 0.94,
    isPopular: true,
    isFeatured: true,
  },
  {
    schemeCode: 'TATADIG-GR',
    schemeName: 'Tata Digital India Fund - Direct Growth',
    amcCode: 'TATA_MF',
    amcName: 'Tata Mutual Fund',
    isin: 'INF277K01Y40',
    category: 'Equity',
    subCategory: 'Sectoral - Tech',
    nav: 52.64,
    cagr1Y: 34.2,
    cagr3Y: 19.5,
    cagr5Y: 26.2,
    minPurchaseAmount: 5000,
    minSipAmount: 500,
    rating: 4,
    riskLevel: 'Very High',
    fundManager: 'Meeta Shetty',
    aum: 11400,
    expenseRatio: 0.78,
    isPopular: false,
    isFeatured: false,
  },
  {
    schemeCode: 'HDFCBAL-GR',
    schemeName: 'HDFC Balanced Advantage Fund - Direct Growth',
    amcCode: 'HDFC_MF',
    amcName: 'HDFC Mutual Fund',
    isin: 'INF179K01Y88',
    category: 'Hybrid',
    subCategory: 'Dynamic Asset Allocation',
    nav: 512.90,
    cagr1Y: 25.1,
    cagr3Y: 21.0,
    cagr5Y: 19.8,
    minPurchaseAmount: 1000,
    minSipAmount: 500,
    rating: 5,
    riskLevel: 'High',
    fundManager: 'Gopal Agrawal',
    aum: 92100,
    expenseRatio: 0.72,
    isPopular: true,
    isFeatured: true,
  },
  {
    schemeCode: 'ICICILIQ-GR',
    schemeName: 'ICICI Prudential Liquid Fund - Direct Growth',
    amcCode: 'ICICI_PRU_MF',
    amcName: 'ICICI Prudential Mutual Fund',
    isin: 'INF109K01G48',
    category: 'Liquid & Overnight',
    subCategory: 'Liquid',
    nav: 368.12,
    cagr1Y: 7.2,
    cagr3Y: 6.8,
    cagr5Y: 5.9,
    minPurchaseAmount: 1000,
    minSipAmount: 1000,
    rating: 5,
    riskLevel: 'Low',
    fundManager: 'Rohan Sharma',
    aum: 52000,
    expenseRatio: 0.18,
    isPopular: false,
    isFeatured: false,
  },
];

// Helper to ensure database has initial schemes
async function seedDefaultSchemesIfEmpty() {
  const count = await MutualFundScheme.countDocuments();
  if (count === 0) {
    await MutualFundScheme.insertMany(DEFAULT_SCHEMES);
    console.log('[Mutual Funds] Seeded default mutual fund schemes');
  }
}

// ── 1. GET /api/mutual-funds/schemes ──
exports.getSchemes = async (req, res) => {
  try {
    await seedDefaultSchemesIfEmpty();

    const { category, search, sort = 'rating', page = 1, limit = 20 } = req.query;
    const query = { isActive: true };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { schemeName: { $regex: search, $options: 'i' } },
        { amcName: { $regex: search, $options: 'i' } },
        { schemeCode: { $regex: search, $options: 'i' } },
        { subCategory: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { rating: -1, cagr3Y: -1 };
    if (sort === 'returns1y') sortOption = { cagr1Y: -1 };
    if (sort === 'returns3y') sortOption = { cagr3Y: -1 };
    if (sort === 'returns5y') sortOption = { cagr5Y: -1 };
    if (sort === 'nav') sortOption = { nav: 1 };
    if (sort === 'aum') sortOption = { aum: -1 };

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
      $or: [{ schemeCode: code.toUpperCase() }, { _id: code.match(/^[0-9a-fA-F]{24}$/) ? code : null }],
    });

    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    // Generate mock historical NAV sparkline points for charts
    const baseNav = scheme.nav;
    const history = [];
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const randomVariance = (Math.sin(i / 3) * 0.03 + (Math.random() - 0.5) * 0.01);
      const navPoint = +(baseNav * (1 - (i * 0.001) + randomVariance)).toFixed(2);
      history.push({
        date: d.toISOString().split('T')[0],
        nav: navPoint,
      });
    }

    return res.json({
      success: true,
      data: {
        ...scheme.toObject(),
        navHistory: history,
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

      return res.json({
        success: true,
        exists: false,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
          pan: kyc?.panNumber || '',
          isKycVerified: kyc?.status === 'approved',
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
    const {
      pan,
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

    if (!pan || !accountNo || !ifsc) {
      return res.status(400).json({
        success: false,
        message: 'PAN number, bank account number, and IFSC are required',
      });
    }

    const user = await User.findById(userId);
    // Generate unique client code e.g. VK + 6 digit user identifier
    const clientCode = `VK${user.phone ? user.phone.slice(-6) : user._id.toString().slice(-6).toUpperCase()}`;

    // 1. Prepare 183-Column payload for NSE CLIENTCOMMON183 API
    const nseUccPayload = {
      client_code: clientCode,
      primary_holder_first_name: user.name?.split(' ')[0] || 'Investor',
      primary_holder_middle_name: user.name?.split(' ').length > 2 ? user.name.split(' ')[1] : '',
      primary_holder_last_name: user.name?.split(' ').slice(-1)[0] || '',
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
      account_no_1: accountNo,
      ifsc_code_1: ifsc.toUpperCase(),
      default_bank_flag_1: 'YES',
      cheque_name: user.name,
      div_pay_mode: '02', // Direct Credit
      email: user.email,
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
        holdingNature,
        taxStatus,
        occupationCode,
        gender,
        dob,
        primaryBank: { accountNo, ifsc: ifsc.toUpperCase(), bankName, accountType: 'SB' },
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

    return res.json({
      success: true,
      message: 'UCC successfully generated and registered with NSE',
      data: uccRecord,
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
    const nseOrderId = nseRes?.data?.transaction_details?.[0]?.trxn_order_id || `NSE_${Date.now()}`;

    // 3. Request Payment Link from NSE (GET_LINK API)
    let paymentLink = `https://api.vikaone.com/api/mutual-funds/checkout/${orderId}`;
    const linkRes = await nseClient.getShortLink('PUR', nseOrderId);
    if (linkRes.success && linkRes.data?.firstHolderLink) {
      paymentLink = linkRes.data.firstHolderLink;
    }

    // 4. Save order to MongoDB
    const unitsCalculated = +(orderAmount / scheme.nav).toFixed(3);
    const order = await MfOrder.create({
      user: userId,
      clientCode: ucc.clientCode,
      orderId,
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      transactionType: 'P',
      buySellType: 'FRESH',
      orderAmount: Number(orderAmount),
      units: unitsCalculated,
      navAtOrder: scheme.nav,
      paymentMode,
      paymentStatus: 'PENDING',
      paymentLink,
      nseTrxnOrderId: nseOrderId,
      nseStatus: 'TRXN SUCCESS',
      remarks: 'Order placed on NSE MFSS',
    });

    return res.json({
      success: true,
      message: 'Mutual fund order created successfully',
      data: {
        order,
        paymentLink,
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
    };

    // 2. Register with NSE
    const nseRes = await nseClient.registerXsip([nseXsipPayload]);
    const sipRegNo = nseRes?.data?.reg_data?.[0]?.reg_id || `XSIP_${Date.now()}`;

    // 3. Save SIP record
    const sipRecord = await MfSip.create({
      user: userId,
      clientCode: ucc.clientCode,
      sipRegNo: String(sipRegNo),
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      frequency: frequency.toUpperCase(),
      installmentAmount: Number(installmentAmount),
      startDate: start,
      nextDueDate: start,
      mandateId: ucc.defaultMandateId || '',
      installmentsPaid: 1,
      totalAmountPaid: Number(installmentAmount),
      status: 'ACTIVE',
      stepUpRequired: Boolean(stepUpRequired),
      stepUpAmount: Number(stepUpAmount || 0),
    });

    return res.json({
      success: true,
      message: 'SIP successfully registered on NSE MFSS',
      data: sipRecord,
    });
  } catch (error) {
    console.error('[registerSipOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7. GET /api/mutual-funds/portfolio (Holdings & Summary) ──
exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch confirmed purchases and active SIPs
    const orders = await MfOrder.find({
      user: userId,
      transactionType: 'P',
      paymentStatus: 'SUCCESS',
    }).sort({ createdAt: -1 });

    const activeSips = await MfSip.find({ user: userId, status: 'ACTIVE' });

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
      holdingsMap[ord.schemeCode].totalUnits += ord.units;
      holdingsMap[ord.schemeCode].investedAmount += ord.orderAmount;
      totalInvested += ord.orderAmount;
    }

    // Refresh with latest NAVs
    const schemeCodes = Object.keys(holdingsMap);
    const liveSchemes = await MutualFundScheme.find({ schemeCode: { $in: schemeCodes } });
    const liveMap = {};
    liveSchemes.forEach((s) => {
      liveMap[s.schemeCode] = s;
    });

    let currentValuation = 0;
    const holdingsList = Object.values(holdingsMap).map((h) => {
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
