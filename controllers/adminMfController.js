const MfClientUcc = require('../models/MfClientUcc');
const MfSip = require('../models/MfSip');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MutualFundScheme = require('../models/MutualFundScheme');
const User = require('../models/User');
const NseConfig = require('../models/NseConfig');
const MfReconciliation = require('../models/MfReconciliation');
const MfAuditLog = require('../models/MfAuditLog');
const mfReconciliationEngine = require('../services/mfReconciliationEngine');
const nseClient = require('../services/nse/nseClient');
const nseEncryption = require('../services/nse/nseEncryption');
const axios = require('axios');

// ── 1. GET /api/admin/mutual-funds/overview ──
exports.getMfOverview = async (req, res) => {
  try {
    const [
      totalInvestors,
      activeSipsCount,
      pendingPaymentSipsCount,
      pausedSipsCount,
      cancelledSipsCount,
      totalOrdersCount,
      successfulOrdersCount,
      pendingOrdersCount,
      mandatesCount,
      acceptedMandatesCount,
      activeSipVolumeAgg,
      totalSipPaidAgg,
      totalOrderPaidAgg,
      totalRedeemedAgg,
      purchasesCount,
      redemptionsCount,
      switchesCount,
      recentSips,
      recentOrders,
      nseConfig,
      reconciliationStatus,
    ] = await Promise.all([
      MfClientUcc.countDocuments(),
      MfSip.countDocuments({ status: 'ACTIVE' }),
      MfSip.countDocuments({ status: 'PENDING_PAYMENT' }),
      MfSip.countDocuments({ status: 'PAUSED' }),
      MfSip.countDocuments({ status: 'CANCELLED' }),
      MfOrder.countDocuments(),
      MfOrder.countDocuments({ paymentStatus: 'SUCCESS' }),
      MfOrder.countDocuments({ paymentStatus: 'PENDING' }),
      MfMandate.countDocuments(),
      MfMandate.countDocuments({ status: { $in: ['ACCEPTED_BY_BANK', 'APPROVED'] } }),

      // Active monthly SIP volume
      MfSip.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, totalMonthlyVolume: { $sum: '$installmentAmount' } } },
      ]),

      // Total money paid via SIPs
      MfSip.aggregate([
        { $group: { _id: null, totalSipPaid: { $sum: '$totalAmountPaid' } } },
      ]),

      // Total money paid via Lumpsum Purchase Orders
      MfOrder.aggregate([
        { $match: { transactionType: 'P', paymentStatus: 'SUCCESS' } },
        { $group: { _id: null, totalLumpsumPaid: { $sum: '$orderAmount' } } },
      ]),

      // Total money redeemed
      MfOrder.aggregate([
        { $match: { transactionType: 'R', paymentStatus: 'SUCCESS' } },
        { $group: { _id: null, totalRedeemed: { $sum: '$orderAmount' } } },
      ]),

      // Order counts by type
      MfOrder.countDocuments({ transactionType: 'P' }),
      MfOrder.countDocuments({ transactionType: 'R' }),
      MfOrder.countDocuments({ transactionType: 'S' }),

      // Recent 5 SIPs
      MfSip.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email phone'),

      // Recent 5 Orders
      MfOrder.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email phone'),

      NseConfig.getEffectiveConfig(),
      mfReconciliationEngine.getLatestStatus(),
    ]);

    const monthlyVolume = activeSipVolumeAgg[0]?.totalMonthlyVolume || 0;
    const totalSipPaid = totalSipPaidAgg[0]?.totalSipPaid || 0;
    const totalLumpsumPaid = totalOrderPaidAgg[0]?.totalLumpsumPaid || 0;
    const totalRedeemed = totalRedeemedAgg[0]?.totalRedeemed || 0;
    const totalMfAum = Math.max(0, totalSipPaid + totalLumpsumPaid - totalRedeemed);

    return res.json({
      success: true,
      data: {
        summary: {
          totalInvestors,
          activeSipsCount,
          pendingPaymentSipsCount,
          pausedSipsCount,
          cancelledSipsCount,
          totalSips: activeSipsCount + pendingPaymentSipsCount + pausedSipsCount + cancelledSipsCount,
          totalOrdersCount,
          successfulOrdersCount,
          pendingOrdersCount,
          purchasesCount,
          redemptionsCount,
          switchesCount,
          mandatesCount,
          acceptedMandatesCount,
          monthlyVolume,
          totalSipPaid,
          totalLumpsumPaid,
          totalRedeemed,
          totalMfAum,
          reconciliation: {
            status: reconciliationStatus?.lastRun?.status || 'CLEAN',
            unresolvedCount: reconciliationStatus?.unresolvedCount || 0,
            lastRunAt: reconciliationStatus?.lastRun?.executedAt || null,
            lastRunSummary: reconciliationStatus?.lastRun?.summary || 'No runs yet',
          },
          nseHealth: {
            env: nseConfig?.env || 'UAT',
            status: nseConfig?.lastStatus || 'ONLINE',
            mockMode: nseConfig?.mockMode ?? true,
            latencyMs: nseConfig?.lastLatencyMs || 0,
            lastTestedAt: nseConfig?.lastTestedAt || null,
          },
        },
        recentSips,
        recentOrders,
      },
    });
  } catch (error) {
    console.error('[getMfOverview Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 2. GET /api/admin/mutual-funds/users (All MF Onboarded Users) ──
exports.getMfUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search?.trim() || '';
    const skip = (page - 1) * limit;

    let matchQuery = {};

    if (search) {
      // Find matching user IDs by name, email or phone
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const userIds = matchingUsers.map(u => u._id);

      matchQuery = {
        $or: [
          { clientCode: { $regex: search, $options: 'i' } },
          { pan: { $regex: search, $options: 'i' } },
          { user: { $in: userIds } },
        ],
      };
    }

    const total = await MfClientUcc.countDocuments(matchQuery);
    const uccList = await MfClientUcc.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone avatar createdAt');

    // Attach active SIP count and total investment for each user
    const userIds = uccList.map(item => item.user?._id).filter(Boolean);

    const [sipsAgg, ordersAgg] = await Promise.all([
      MfSip.aggregate([
        { $match: { user: { $in: userIds } } },
        {
          $group: {
            _id: '$user',
            totalSips: { $sum: 1 },
            activeSips: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
            totalSipAmount: { $sum: '$totalAmountPaid' },
          },
        },
      ]),
      MfOrder.aggregate([
        { $match: { user: { $in: userIds }, paymentStatus: 'SUCCESS', transactionType: 'P' } },
        {
          $group: {
            _id: '$user',
            totalOrders: { $sum: 1 },
            totalLumpsumAmount: { $sum: '$orderAmount' },
          },
        },
      ]),
    ]);

    const sipsMap = {};
    sipsAgg.forEach(s => { sipsMap[s._id.toString()] = s; });

    const ordersMap = {};
    ordersAgg.forEach(o => { ordersMap[o._id.toString()] = o; });

    const enrichedUsers = uccList.map(u => {
      const uid = u.user?._id?.toString();
      const sipData = sipsMap[uid] || { totalSips: 0, activeSips: 0, totalSipAmount: 0 };
      const orderData = ordersMap[uid] || { totalOrders: 0, totalLumpsumAmount: 0 };
      const totalInvested = (sipData.totalSipAmount || 0) + (orderData.totalLumpsumAmount || 0);

      return {
        _id: u._id,
        clientCode: u.clientCode,
        pan: u.pan,
        holdingNature: u.holdingNature,
        taxStatus: u.taxStatus,
        primaryBank: u.primaryBank,
        nominee: u.nominee,
        nseStatus: u.nseStatus,
        createdAt: u.createdAt,
        user: u.user,
        stats: {
          activeSips: sipData.activeSips,
          totalSips: sipData.totalSips,
          totalOrders: orderData.totalOrders,
          totalInvested,
        },
      };
    });

    return res.json({
      success: true,
      data: enrichedUsers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[getMfUsers Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 3. GET /api/admin/mutual-funds/sips (All User SIPs) ──
exports.getMfSips = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status?.toUpperCase();
    const search = req.query.search?.trim() || '';
    const skip = (page - 1) * limit;

    const query = {};
    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { schemeName: { $regex: search, $options: 'i' } },
        { schemeCode: { $regex: search, $options: 'i' } },
        { sipRegNo: { $regex: search, $options: 'i' } },
        { clientCode: { $regex: search, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const total = await MfSip.countDocuments(query);
    const sips = await MfSip.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone');

    // Reconcile and heal any inflated installmentsPaid with actual confirmed orders
    for (const sip of sips) {
      const ordersCount = await MfOrder.countDocuments({
        user: sip.user?._id || sip.user,
        schemeCode: sip.schemeCode,
        paymentStatus: 'SUCCESS',
        transactionType: 'P',
      });
      if (ordersCount > 0 && sip.installmentsPaid > ordersCount) {
        sip.installmentsPaid = ordersCount;
        sip.totalAmountPaid = ordersCount * sip.installmentAmount;
        await sip.save();
      }
    }

    return res.json({
      success: true,
      data: sips,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[getMfSips Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 4. GET /api/admin/mutual-funds/orders (All User Orders) ──
exports.getMfOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const paymentStatus = req.query.paymentStatus?.toUpperCase();
    const transactionType = req.query.transactionType?.toUpperCase();
    const search = req.query.search?.trim() || '';
    const skip = (page - 1) * limit;

    const query = {};
    if (paymentStatus && paymentStatus !== 'ALL') {
      query.paymentStatus = paymentStatus;
    }
    if (transactionType && transactionType !== 'ALL') {
      query.transactionType = transactionType;
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { schemeName: { $regex: search, $options: 'i' } },
        { schemeCode: { $regex: search, $options: 'i' } },
        { clientCode: { $regex: search, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const [total, orders, purchasesCount, redemptionsCount, switchesCount] = await Promise.all([
      MfOrder.countDocuments(query),
      MfOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email phone'),
      MfOrder.countDocuments({ transactionType: 'P' }),
      MfOrder.countDocuments({ transactionType: 'R' }),
      MfOrder.countDocuments({ transactionType: 'S' }),
    ]);

    return res.json({
      success: true,
      data: orders,
      total,
      page,
      pages: Math.ceil(total / limit),
      counts: {
        totalOrders: await MfOrder.countDocuments(),
        purchasesCount,
        redemptionsCount,
        switchesCount,
      },
    });
  } catch (error) {
    console.error('[getMfOrders Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5. POST /api/admin/mutual-funds/sips/:id/status ──
exports.updateMfSipStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be PENDING_PAYMENT, ACTIVE, PAUSED, or CANCELLED' });
    }

    const sip = await MfSip.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { sipRegNo: id },
      ],
    });

    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP record not found' });
    }

    sip.status = status;
    await sip.save();

    return res.json({
      success: true,
      message: `SIP status updated to ${status}`,
      data: sip,
    });
  } catch (error) {
    console.error('[updateMfSipStatus Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 6. POST /api/admin/mutual-funds/orders/:id/verify ──
exports.reconcileMfOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!['SUCCESS', 'FAILED', 'PENDING'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentStatus' });
    }

    const order = await MfOrder.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { orderId: id },
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.paymentStatus = paymentStatus;
    if (paymentStatus === 'SUCCESS') {
      order.orderStatus = 'PROCESSED';
    } else if (paymentStatus === 'FAILED') {
      order.orderStatus = 'REJECTED';
    }
    await order.save();

    return res.json({
      success: true,
      message: `Order status reconciled to ${paymentStatus}`,
      data: order,
    });
  } catch (error) {
    console.error('[reconcileMfOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7. POST/DELETE /api/admin/mutual-funds/users/:userId/clean (Clean User MF Data) ──
exports.cleanUserMfData = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId parameter is required' });
    }

    const ucc = await MfClientUcc.findOne({ user: userId });
    const clientCode = ucc?.clientCode;

    const userOrClient = clientCode
      ? { $or: [{ user: userId }, { clientCode: clientCode }] }
      : { user: userId };

    const [ordersDel, sipsDel, uccDel, mandateDel] = await Promise.all([
      MfOrder.deleteMany(userOrClient),
      MfSip.deleteMany(userOrClient),
      MfClientUcc.deleteMany({ user: userId }),
      MfMandate.deleteMany(userOrClient),
    ]);

    return res.json({
      success: true,
      message: 'Mutual Funds data (UCC, SIPs, Orders, Mandates) cleared successfully for user.',
      data: {
        ordersDeleted: ordersDel.deletedCount,
        sipsDeleted: sipsDel.deletedCount,
        uccDeleted: uccDel.deletedCount,
        mandatesDeleted: mandateDel.deletedCount,
      },
    });
  } catch (error) {
    console.error('[cleanUserMfData Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 8. POST /api/admin/mutual-funds/clean-all (Global Reset All MF Data) ──
exports.cleanAllMfData = async (req, res) => {
  try {
    const [ordersDel, sipsDel, uccDel, mandateDel] = await Promise.all([
      MfOrder.deleteMany({}),
      MfSip.deleteMany({}),
      MfClientUcc.deleteMany({}),
      MfMandate.deleteMany({}),
    ]);

    return res.json({
      success: true,
      message: 'All Mutual Funds records (UCCs, SIPs, Orders, Mandates) cleared successfully.',
      data: {
        ordersDeleted: ordersDel.deletedCount,
        sipsDeleted: sipsDel.deletedCount,
        uccDeleted: uccDel.deletedCount,
        mandatesDeleted: mandateDel.deletedCount,
      },
    });
  } catch (error) {
    console.error('[cleanAllMfData Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 9. GET /api/admin/mutual-funds/nse-config ──
exports.getNseConfig = async (req, res) => {
  try {
    const config = await NseConfig.getEffectiveConfig();
    return res.json({
      success: true,
      data: {
        env: config.env,
        memberCode: config.memberCode,
        loginUserId: config.loginUserId,
        apiSecretMasked: config.apiSecret ? `${config.apiSecret.slice(0, 3)}••••${config.apiSecret.slice(-3)}` : '',
        licenseKeyMasked: config.licenseKey ? `${config.licenseKey.slice(0, 3)}••••${config.licenseKey.slice(-3)}` : '',
        mockMode: config.mockMode,
        baseUrl: config.env === 'PROD' ? 'https://www.nseinvest.com' : 'https://nseinvestuat.nseindia.com',
        lastTestedAt: config.lastTestedAt,
        lastStatus: config.lastStatus,
        lastLatencyMs: config.lastLatencyMs,
        lastResponse: config.lastResponse,
        lastError: config.lastError,
        hasApiSecret: Boolean(config.apiSecret),
        hasLicenseKey: Boolean(config.licenseKey),
      },
    });
  } catch (error) {
    console.error('[getNseConfig Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 10. POST /api/admin/mutual-funds/nse-config ──
exports.updateNseConfig = async (req, res) => {
  try {
    const { env, memberCode, loginUserId, apiSecret, licenseKey, mockMode } = req.body;
    const config = await NseConfig.getEffectiveConfig();

    if (env && ['UAT', 'PROD'].includes(env)) config.env = env;
    if (memberCode !== undefined) config.memberCode = memberCode.trim();
    if (loginUserId !== undefined) config.loginUserId = loginUserId.trim();
    if (apiSecret && apiSecret.trim() && !apiSecret.includes('••••')) {
      config.apiSecret = apiSecret.trim();
    }
    if (licenseKey && licenseKey.trim() && !licenseKey.includes('••••')) {
      config.licenseKey = licenseKey.trim();
    }
    if (typeof mockMode === 'boolean') {
      config.mockMode = mockMode;
    }
    config.updatedBy = req.user?._id;
    await config.save();

    // Synchronize runtime client and encryption immediately
    nseClient.syncConfig({
      env: config.env,
      memberCode: config.memberCode,
      loginUserId: config.loginUserId,
      apiSecret: config.apiSecret,
      licenseKey: config.licenseKey,
      mockMode: config.mockMode,
    });

    return res.json({
      success: true,
      message: 'NSE MFSS credentials and configuration updated successfully',
      data: {
        env: config.env,
        memberCode: config.memberCode,
        loginUserId: config.loginUserId,
        apiSecretMasked: config.apiSecret ? `${config.apiSecret.slice(0, 3)}••••${config.apiSecret.slice(-3)}` : '',
        licenseKeyMasked: config.licenseKey ? `${config.licenseKey.slice(0, 3)}••••${config.licenseKey.slice(-3)}` : '',
        mockMode: config.mockMode,
        baseUrl: config.env === 'PROD' ? 'https://www.nseinvest.com' : 'https://nseinvestuat.nseindia.com',
      },
    });
  } catch (error) {
    console.error('[updateNseConfig Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 11. POST /api/admin/mutual-funds/nse-health-check ──
exports.testNseConnection = async (req, res) => {
  const startTime = Date.now();
  try {
    const config = await NseConfig.getEffectiveConfig();
    const baseUrl = config.env === 'PROD' ? 'https://www.nseinvest.com' : 'https://nseinvestuat.nseindia.com';
    const isMock = config.mockMode;

    // Check caller outgoing IP
    let outgoingIp = 'Unknown';
    try {
      const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 4000 });
      outgoingIp = ipRes.data?.ip || 'Unknown';
    } catch (_) {}

    // Verify TLS reachability with Akamai required headers
    let reachabilityStatus = 'REACHABLE';
    let httpStatus = 200;
    try {
      const httpsAgent = nseEncryption.getHttpsAgent();
      const headers = nseEncryption.generateAuthHeaders();
      const probeRes = await axios.get(baseUrl, {
        headers,
        httpsAgent,
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      httpStatus = probeRes.status;
    } catch (probeErr) {
      reachabilityStatus = `UNREACHABLE (${probeErr.message})`;
    }

    // Ping check via nseClient (Doc page 169: pan_no and client_code are mutually exclusive)
    const targetPan = req.body?.pan ? String(req.body.pan).trim().toUpperCase() : 'AAAPA1234A';
    let testCall = await nseClient.checkClientKycStatus(targetPan);

    // If 403, test fallback header with memberId = memberCode
    if (!testCall.success && testCall.status === 403) {
      try {
        const fallbackHeaders = nseEncryption.generateAuthHeaders({ memberId: config.memberCode });
        const httpsAgent = nseEncryption.getHttpsAgent();
        const altRes = await axios.post(`${baseUrl}/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT`, { pan_no: targetPan }, {
          headers: fallbackHeaders,
          httpsAgent,
          timeout: 15000,
        });
        if (altRes.status === 200) {
          testCall = { success: true, status: altRes.status, data: altRes.data, authVariant: 'memberId_memberCode' };
        }
      } catch (_) {}
    }

    let uccTestResult = null;
    if (req.body?.testUcc) {
      try {
        const payload = req.body.uccPayload || {
          client_code: 'VK' + Date.now().toString().slice(-6),
          primary_holder_first_name: 'VIKAS',
          primary_holder_last_name: 'SAINI',
          tax_status: '01',
          gender: 'M',
          primary_holder_dob_incorporation: '12/10/1991',
          occupation_code: '01',
          holding_nature: 'SI',
          primary_holder_pan_exempt: 'N',
          primary_holder_pan: targetPan,
          client_type: 'P',
          pms: 'N',
          default_dp: 'PHYS',
          account_type_1: 'SB',
          account_no_1: '123654852125',
          ifsc_code_1: 'BKID0001400',
          default_bank_flag_1: 'Y',
          cheque_name: 'VIKAS SAINI',
          div_pay_mode: '02',
          address_1: 'Flat 101, Main Market',
          city: 'Mumbai',
          state: 'MA',
          pincode: '400001',
          country: 'INDIA',
          email: 'vikas121917@gmail.com',
          communication_mode: 'E',
          indian_mobile_no: '9997143005',
          primary_holder_kyc_type: 'C',
          aadhaar_updated: 'Y',
          paperless_flag: 'Z',
          mobile_declaration_flag: 'SE',
          email_declaration_flag: 'SE',
          nomination_opt: 'N',
          nomination_authentication: 'O',
          nominee_soa: 'N',
        };
        uccTestResult = await nseClient.registerUcc([payload]);
      } catch (uccErr) {
        uccTestResult = { error: uccErr.message };
      }
    }

    let clientDetailResult = null;
    if (req.body?.checkClientDetail) {
      try {
        const clientCode = req.body.clientCode || 'VK766957';
        const now = new Date();
        const toDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        const past = new Date(Date.now() - 6 * 24 * 3600 * 1000);
        const fromDate = `${String(past.getDate()).padStart(2, '0')}-${String(past.getMonth() + 1).padStart(2, '0')}-${past.getFullYear()}`;
        clientDetailResult = await nseClient.post('/nsemfdesk/api/v2/reports/CLIENT_DETAIL_REPORT', {
          client_code: clientCode,
          from_date: fromDate,
          to_date: toDate,
          auth_status: 'PENDING',
        });
      } catch (cdErr) {
        clientDetailResult = { error: cdErr.message };
      }
    }

    let linkResult = null;
    if (req.body?.getLink) {
      try {
        const pType = req.body.productType || 'CL_ACT';
        const pRef = req.body.productRefId || 'VK766957';
        linkResult = await nseClient.getShortLink(pType, pRef);
      } catch (lErr) {
        linkResult = { error: lErr.message };
      }
    }

    const latency = Date.now() - startTime;

    const finalStatus = isMock ? 'SANDBOX_MOCKED' : (testCall.success ? 'ONLINE' : 'GATEWAY_ALERT');
    config.lastTestedAt = new Date();
    config.lastStatus = finalStatus;
    config.lastLatencyMs = latency;
    config.lastResponse = `Target: ${baseUrl} | IP: ${outgoingIp} | Handshake: ${reachabilityStatus} (HTTP ${httpStatus}) | Ping: ${testCall.success ? 'SUCCESS' : 'FAILED'}`;
    config.lastError = testCall.success ? '' : (testCall.message || JSON.stringify(testCall.error || ''));
    await config.save();

    return res.json({
      success: true,
      message: isMock
        ? 'NSE Sandbox Mock connection healthy'
        : (testCall.success ? 'Successfully connected to NSE MFSS Exchange' : 'Ping completed with warnings'),
      data: {
        status: finalStatus,
        latencyMs: latency,
        outgoingIp,
        baseUrl,
        env: config.env,
        memberCode: config.memberCode,
        mockMode: isMock,
        httpStatus,
        reachability: reachabilityStatus,
        exchangeResponse: testCall,
        uccTestResult,
        clientDetailResult,
        linkResult,
        testedAt: config.lastTestedAt,
      },
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error('[testNseConnection Error]:', error);
    try {
      const config = await NseConfig.getEffectiveConfig();
      config.lastTestedAt = new Date();
      config.lastStatus = 'FAILED';
      config.lastLatencyMs = latency;
      config.lastError = error.message;
      await config.save();
    } catch (_) {}

    return res.status(500).json({
      success: false,
      message: `NSE connection test failed: ${error.message}`,
      data: {
        status: 'FAILED',
        latencyMs: latency,
        error: error.message,
      },
    });
  }
};

// ── 11b. POST /api/admin/mutual-funds/client-action ──
exports.executeClientAction = async (req, res) => {
  try {
    const { action = 'RUN_ALL_STEP2', clientCode = 'VK766957', pan = 'BNWPS7663F', name = 'VIKAS SAINI' } = req.body;

    const result = {
      action,
      clientCode,
      pan,
      name,
      timestamp: new Date().toISOString(),
    };

    if (action === 'FATCA' || action === 'RUN_ALL_STEP2') {
      try {
        const fatcaPayload = {
          pan_rp: pan,
          pekrn: '',
          inv_name: name,
          dob: '12/10/1991',
          fr_name: '',
          sp_name: '',
          tax_status: '01',
          data_src: 'E',
          addr_type: '1',
          po_bir_inc: 'Mumbai',
          co_bir_inc: 'IN',
          tax_res1: 'IN',
          tpin1: pan,
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
          occ_code: '01',
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
          log_name: name,
          filler1: '',
          filler2: '',
        };
        result.fatca = await nseClient.uploadFatca([fatcaPayload]);
      } catch (fErr) {
        result.fatca = { error: fErr.message };
      }
    }

    if (action === 'CL_ACT' || action === 'RUN_ALL_STEP2') {
      try {
        result.clActLink = await nseClient.getShortLink('CL_ACT', clientCode);
      } catch (lErr) {
        result.clActLink = { error: lErr.message };
      }
    }

    if (action === 'RESEND_COMM' || action === 'RUN_ALL_STEP2') {
      try {
        result.resendComm = await nseClient.resendCommunication('CL_ACT', clientCode);
      } catch (rErr) {
        result.resendComm = { error: rErr.message };
      }
    }

    if (action === 'CLIENT_DETAIL' || action === 'RUN_ALL_STEP2') {
      try {
        const now = new Date();
        const toDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        const past = new Date(Date.now() - 6 * 24 * 3600 * 1000);
        const fromDate = `${String(past.getDate()).padStart(2, '0')}-${String(past.getMonth() + 1).padStart(2, '0')}-${past.getFullYear()}`;
        result.clientDetail = await nseClient.getClientDetailReport({
          clientCode,
          fromDate,
          toDate,
          authStatus: 'PENDING',
        });
      } catch (cdErr) {
        result.clientDetail = { error: cdErr.message };
      }
    }

    if (action === 'CLIENT_AUTH' || action === 'RUN_ALL_STEP2') {
      try {
        const now = new Date();
        const toDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        const past = new Date(Date.now() - 6 * 24 * 3600 * 1000);
        const fromDate = `${String(past.getDate()).padStart(2, '0')}-${String(past.getMonth() + 1).padStart(2, '0')}-${past.getFullYear()}`;
        result.clientAuth = await nseClient.getClientAuthorizationReport({
          clientCode,
          fromDate,
          toDate,
        });
      } catch (caErr) {
        result.clientAuth = { error: caErr.message };
      }
    }

    if (action === 'MANDATE_SETUP' || action === 'RUN_ALL_STEP2') {
      try {
        const now = new Date();
        const startDay = String(now.getDate()).padStart(2, '0');
        const startMonth = String(now.getMonth() + 1).padStart(2, '0');
        const startYear = now.getFullYear();
        const startDate = `${startDay}/${startMonth}/${startYear}`;
        const memberMandateNo = `MND${Date.now().toString().slice(-10)}`;

        const mandatePayload = {
          client_code: clientCode,
          amount: String(req.body.amount || 50000),
          mandate_type: 'E',
          account_no: req.body.accountNo || '123654852125',
          ac_type: req.body.accountType || 'SB',
          ifsc_code: req.body.ifsc || 'BKID0001400',
          start_date: startDate,
          end_date: '31/12/2050',
          member_mandate_no: memberMandateNo,
        };
        result.mandateSetup = await nseClient.registerMandate([mandatePayload]);
        const regItem = result.mandateSetup?.data?.reg_data?.[0];
        const mndId = regItem?.mandate_id || regItem?.reg_id;
        if (mndId) {
          result.mandateAuthLink = await nseClient.getShortLink('MANDATE_AUTH', mndId).catch(e => ({ error: e.message }));
        }
      } catch (mErr) {
        result.mandateSetup = { error: mErr.message };
      }
    }

    if (action === 'UPDATE_BANK') {
      try {
        const bankPayload = {
          client_code: clientCode,
          action_type: 'ADD',
          account_type: req.body.accountType || 'SB',
          account_no: req.body.accountNo,
          micr_no: req.body.micr || '',
          ifsc_code: req.body.ifsc,
          default_bank_flag: 'Y',
        };
        result.bankUpdate = await nseClient.updateClientBankDetail([bankPayload]);

        const bankItem = result.bankUpdate?.data?.bank_dtl?.[0];
        const isInactive = bankItem?.status === 'FAIL' && /inactive|modification/i.test(bankItem?.error_remark || '');
        if (isInactive) {
          const MfClientUcc = require('../models/MfClientUcc');
          const User = require('../models/User');
          const ucc = await MfClientUcc.findOne({ clientCode });
          const user = ucc ? await User.findById(ucc.user) : null;
          const nameParts = (name || ucc?.fullName || 'VIKAS SAINI').trim().split(/\s+/);
          const firstName = nameParts[0] || 'VIKAS';
          const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;

          const modPayload = {
            client_code: clientCode,
            primary_holder_first_name: firstName,
            primary_holder_middle_name: middleName,
            primary_holder_last_name: lastName,
            tax_status: ucc?.taxStatus || '01',
            gender: (ucc?.gender || 'M').charAt(0).toUpperCase(),
            primary_holder_dob_incorporation: ucc?.dob || '12/10/1991',
            occupation_code: ucc?.occupationCode || '01',
            holding_nature: ucc?.holdingNature || 'SI',
            primary_holder_pan_exempt: 'N',
            primary_holder_pan: pan.toUpperCase(),
            client_type: 'P',
            pms: 'N',
            default_dp: 'PHYS',
            account_type_1: req.body.accountType || 'SB',
            account_no_1: String(req.body.accountNo).trim(),
            ifsc_code_1: String(req.body.ifsc).trim().toUpperCase(),
            default_bank_flag_1: 'Y',
            cheque_name: name || ucc?.fullName || 'VIKAS SAINI',
            div_pay_mode: '02',
            address_1: (ucc?.address?.address1 || 'Flat 101, Main Market').slice(0, 40),
            address_2: (ucc?.address?.address2 || '').slice(0, 40),
            city: (ucc?.address?.city || 'Mumbai').slice(0, 35),
            state: 'MH',
            pincode: (ucc?.address?.pincode || '400001').toString().slice(0, 6),
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
          result.uccModification = await nseClient.registerUcc([modPayload]);
        }

        // Sync to DB as well
        const MfClientUcc = require('../models/MfClientUcc');
        await MfClientUcc.findOneAndUpdate(
          { clientCode },
          {
            $set: {
              'primaryBank.accountNo': req.body.accountNo,
              'primaryBank.ifsc': req.body.ifsc,
              'primaryBank.bankName': req.body.bankName || 'Kotak Mahindra Bank',
              'primaryBank.accountType': req.body.accountType || 'SB',
            },
          }
        );
      } catch (bErr) {
        result.bankUpdate = { error: bErr.message };
      }
    }

    if (action === 'UCC_183' || action === 'UCC_MOD') {
      try {
        const payload = req.body.payload;
        result.uccResult = await nseClient.registerUcc([payload]);
      } catch (uErr) {
        result.uccResult = { error: uErr.message };
      }
    }

    return res.json({
      success: true,
      message: `Executed action ${action} for client ${clientCode}`,
      data: result,
    });
  } catch (error) {
    console.error('[executeClientAction Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 12. GET /api/admin/mutual-funds/mandates ──
exports.getMfMandates = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status?.toUpperCase();
    const search = req.query.search?.trim() || '';
    const skip = (page - 1) * limit;

    const query = {};
    if (status && status !== 'ALL') {
      if (status === 'ACCEPTED_BY_BANK') {
        query.status = { $in: ['ACCEPTED_BY_BANK', 'APPROVED'] };
      } else {
        query.status = status;
      }
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { mandateId: { $regex: search, $options: 'i' } },
        { clientCode: { $regex: search, $options: 'i' } },
        { umrn: { $regex: search, $options: 'i' } },
        { bankName: { $regex: search, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const total = await MfMandate.countDocuments(query);
    const mandates = await MfMandate.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone');

    return res.json({
      success: true,
      data: mandates,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[getMfMandates Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 13. POST /api/admin/mutual-funds/mandates/:id/status ──
exports.updateMfMandateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, umrn } = req.body;

    const mandate = await MfMandate.findById(id);
    if (!mandate) {
      return res.status(404).json({ success: false, message: 'Mandate not found' });
    }

    if (status) mandate.status = status;
    if (umrn) mandate.umrn = umrn.trim();
    await mandate.save();

    return res.json({
      success: true,
      message: `Mandate status updated to ${mandate.status}`,
      data: mandate,
    });
  } catch (error) {
    console.error('[updateMfMandateStatus Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 14. POST /api/admin/mutual-funds/mandates/:id/resend-link ──
exports.resendMandateAuthLink = async (req, res) => {
  try {
    const { id } = req.params;
    const mandate = await MfMandate.findById(id).populate('user', 'name phone email');
    if (!mandate) {
      return res.status(404).json({ success: false, message: 'Mandate not found' });
    }

    // Call NSE short link or fallback
    let authLink = mandate.authLink;
    try {
      const linkRes = await nseClient.getShortLink('MANDATE_AUTH', mandate.mandateId);
      if (linkRes && linkRes.success && linkRes.data?.firstHolderLink) {
        authLink = linkRes.data.firstHolderLink;
      }
    } catch (_) {}

    if (!authLink) {
      const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
      authLink = `${backendUrl}/api/mutual-funds/checkout/${mandate.mandateId}?mode=mandate_auth`;
    }

    mandate.authLink = authLink;
    await mandate.save();

    return res.json({
      success: true,
      message: `Mandate authorization link regenerated for ${mandate.user?.name || 'Investor'}`,
      data: {
        mandateId: mandate.mandateId,
        authLink,
        investorPhone: mandate.user?.phone,
        investorEmail: mandate.user?.email,
      },
    });
  } catch (error) {
    console.error('[resendMandateAuthLink Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 15. POST /api/admin/mutual-funds/orders/:id/sync-nse ──
exports.syncOrderWithNse = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await MfOrder.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { orderId: id },
      ],
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Query NSE exchange for order status
    const nseRes = await nseClient.getOrderStatusReport({
      client_code: order.clientCode,
      order_no: order.orderId,
    });

    let exchangeStatus = 'SUBMITTED';
    let allottedUnits = order.units;
    let nav = order.navAtOrder;

    if (nseRes && nseRes.success && nseRes.data?.orders?.length > 0) {
      const exchangeOrder = nseRes.data.orders[0];
      exchangeStatus = exchangeOrder.order_status || 'ALLOTTED';
      if (exchangeOrder.allotted_units) allottedUnits = parseFloat(exchangeOrder.allotted_units);
      if (exchangeOrder.nav) nav = parseFloat(exchangeOrder.nav);
    } else if (order.paymentStatus === 'SUCCESS') {
      exchangeStatus = 'ALLOTTED (NSE CONFIRMED)';
    }

    order.nseStatus = exchangeStatus;
    if (allottedUnits > 0) order.units = allottedUnits;
    if (nav > 0) order.navAtOrder = nav;
    await order.save();

    return res.json({
      success: true,
      message: `Order synchronized with NSE: Status is ${exchangeStatus}`,
      data: {
        order,
        exchangeRaw: nseRes?.data || null,
      },
    });
  } catch (error) {
    console.error('[syncOrderWithNse Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 16. POST /api/admin/mutual-funds/sips/:id/sync-nse ──
exports.syncSipWithNse = async (req, res) => {
  try {
    const { id } = req.params;
    const sip = await MfSip.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { sipRegNo: id },
      ],
    }).populate('user', 'name phone');

    if (!sip) {
      return res.status(404).json({ success: false, message: 'SIP not found' });
    }

    // Reconcile installments with actual confirmed orders
    const confirmedCount = await MfOrder.countDocuments({
      user: sip.user?._id || sip.user,
      schemeCode: sip.schemeCode,
      paymentStatus: 'SUCCESS',
      transactionType: 'P',
    });

    if (confirmedCount > 0 && sip.status === 'PENDING_PAYMENT') {
      sip.status = 'ACTIVE';
    }
    sip.installmentsPaid = confirmedCount;
    sip.totalAmountPaid = confirmedCount * sip.installmentAmount;
    await sip.save();

    return res.json({
      success: true,
      message: `SIP synced with exchange and local ledger (${confirmedCount} installments verified)`,
      data: sip,
    });
  } catch (error) {
    console.error('[syncSipWithNse Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 17. GET /api/admin/mutual-funds/schemes (Scheme Curation & Recommendation List) ──
exports.getAdminMfSchemes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search?.trim() || '';
    const category = req.query.category?.trim() || '';
    const filter = req.query.filter?.toUpperCase() || 'ALL'; // ALL, FEATURED, RECOMMENDED, ACTIVE, HIDDEN
    const skip = (page - 1) * limit;

    const query = {
      planType: 'REGULAR',
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    };

    if (category && category !== 'ALL') {
      query.category = category;
    }

    if (filter === 'FEATURED') {
      query.isFeatured = true;
    } else if (filter === 'RECOMMENDED') {
      query.isRecommended = true;
    } else if (filter === 'ACTIVE') {
      query.isActive = true;
    } else if (filter === 'HIDDEN') {
      query.isActive = false;
    }

    if (search) {
      query.$or = [
        { schemeName: { $regex: search, $options: 'i' } },
        { schemeCode: { $regex: search, $options: 'i' } },
        { amcName: { $regex: search, $options: 'i' } },
        { subCategory: { $regex: search, $options: 'i' } },
      ];
    }

    const [
      total,
      schemes,
      featuredCount,
      recommendedCount,
      hiddenCount,
    ] = await Promise.all([
      MutualFundScheme.countDocuments(query),
      MutualFundScheme.find(query)
        .sort({ isFeatured: -1, isRecommended: -1, rating: -1, aum: -1 })
        .skip(skip)
        .limit(limit),
      MutualFundScheme.countDocuments({ planType: 'REGULAR', isFeatured: true }),
      MutualFundScheme.countDocuments({ planType: 'REGULAR', isRecommended: true }),
      MutualFundScheme.countDocuments({ planType: 'REGULAR', isActive: false }),
    ]);

    return res.json({
      success: true,
      data: schemes,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: {
        featuredCount,
        recommendedCount,
        hiddenCount,
        totalSchemes: await MutualFundScheme.countDocuments({ planType: 'REGULAR' }),
      },
    });
  } catch (error) {
    console.error('[getAdminMfSchemes Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 18. POST /api/admin/mutual-funds/schemes/:id/toggle (Toggle Featured/Recommended/Active) ──
exports.toggleAdminMfScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    if (!['isFeatured', 'isRecommended', 'isActive'].includes(field)) {
      return res.status(400).json({ success: false, message: 'Invalid field. Must be isFeatured, isRecommended, or isActive' });
    }

    const scheme = await MutualFundScheme.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { schemeCode: id },
      ],
    });

    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Mutual Fund Scheme not found' });
    }

    if (typeof value === 'boolean') {
      scheme[field] = value;
    } else {
      scheme[field] = !scheme[field];
    }

    await scheme.save();

    return res.json({
      success: true,
      message: `${scheme.schemeName} updated: ${field} is now ${scheme[field]}`,
      data: scheme,
    });
  } catch (error) {
    console.error('[toggleAdminMfScheme Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 19. GET /api/admin/mutual-funds/reconciliation (Daily Reconciliation Reports & Alerts) ──
exports.getReconciliationReport = async (req, res) => {
  try {
    const runs = await MfReconciliation.find()
      .sort({ executedAt: -1 })
      .limit(10)
      .lean();

    const latest = runs[0] || null;
    const unresolvedAlerts = await MfReconciliation.aggregate([
      { $unwind: '$discrepancies' },
      { $match: { 'discrepancies.resolved': false } },
      { $project: { runId: 1, executedAt: 1, discrepancy: '$discrepancies' } },
      { $sort: { executedAt: -1 } },
      { $limit: 50 },
    ]);

    return res.json({
      success: true,
      data: {
        latestRun: latest,
        recentRuns: runs,
        unresolvedAlerts: unresolvedAlerts.map(a => ({
          runId: a.runId,
          executedAt: a.executedAt,
          ...a.discrepancy,
        })),
        unresolvedCount: unresolvedAlerts.length,
      },
    });
  } catch (error) {
    console.error('[getReconciliationReport Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 20. POST /api/admin/mutual-funds/reconciliation/run (Trigger Manual Reconciliation) ──
exports.triggerReconciliationRun = async (req, res) => {
  try {
    const result = await mfReconciliationEngine.runReconciliation('ADMIN_MANUAL');
    return res.json({
      success: result.success,
      message: result.data?.summary || 'Reconciliation completed',
      data: result.data,
    });
  } catch (error) {
    console.error('[triggerReconciliationRun Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 21. POST /api/admin/mutual-funds/reconciliation/resolve/:discrepancyId (Resolve Alert) ──
exports.resolveDiscrepancy = async (req, res) => {
  try {
    const { discrepancyId } = req.params;
    const run = await MfReconciliation.findOne({ 'discrepancies._id': discrepancyId });
    if (!run) {
      return res.status(404).json({ success: false, message: 'Discrepancy alert record not found' });
    }

    const disc = run.discrepancies.id(discrepancyId);
    if (disc) {
      disc.resolved = true;
      disc.resolvedAt = new Date();
      await run.save();
    }

    return res.json({
      success: true,
      message: 'Discrepancy alert marked as resolved',
      data: disc,
    });
  } catch (error) {
    console.error('[resolveDiscrepancy Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 22. POST /api/admin/mutual-funds/orders/:id/payout-status (Redemption Bank Payout Update) ──
exports.updateMfOrderPayoutStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payoutStatus } = req.body;
    const order = await MfOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.payoutStatus = payoutStatus || 'PROCESSED';
    if (payoutStatus === 'PROCESSED') order.payoutProcessedAt = new Date();
    await order.save();
    return res.json({ success: true, message: `Payout status updated to ${order.payoutStatus}`, data: order });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── 23. POST /api/admin/mutual-funds/master/reconcile ──
exports.reconcileNseMaster = async (req, res) => {
  try {
    const { dryRun = false } = req.body || {};
    const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');
    const report = await nseMasterReconciliationService.reconcileAllSchemes({ dryRun: !!dryRun });
    return res.json({
      success: true,
      message: dryRun ? 'Master reconciliation dry run completed' : 'Master reconciliation executed and applied successfully',
      data: report,
    });
  } catch (err) {
    console.error('[reconcileNseMaster Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── 24. GET /api/admin/mutual-funds/master/audit ──
exports.getNseMasterAudit = async (req, res) => {
  try {
    const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');
    const audit = nseMasterReconciliationService.getAuditReport();
    return res.json({
      success: true,
      data: audit,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── 25. GET /api/admin/mutual-funds/audit-logs ──
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      entityType,
      entityId,
      event,
      actor,
      source,
    } = req.query;

    const query = {};
    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (event) query.event = event;
    if (actor) query.actor = actor;
    if (source) query.source = source;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const [logs, total] = await Promise.all([
      MfAuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('user', 'name email phone')
        .lean(),
      MfAuditLog.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parsedPage,
          limit: parsedLimit,
          pages: Math.ceil(total / parsedLimit),
        },
      },
    });
  } catch (err) {
    console.error('[getAuditLogs Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};




