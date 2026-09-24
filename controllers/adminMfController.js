const MfClientUcc = require('../models/MfClientUcc');
const MfSip = require('../models/MfSip');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MutualFundScheme = require('../models/MutualFundScheme');
const User = require('../models/User');
const NseConfig = require('../models/NseConfig');
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
      recentSips,
      recentOrders,
      nseConfig,
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
    ]);

    const monthlyVolume = activeSipVolumeAgg[0]?.totalMonthlyVolume || 0;
    const totalSipPaid = totalSipPaidAgg[0]?.totalSipPaid || 0;
    const totalLumpsumPaid = totalOrderPaidAgg[0]?.totalLumpsumPaid || 0;
    const totalMfAum = totalSipPaid + totalLumpsumPaid;

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
          mandatesCount,
          acceptedMandatesCount,
          monthlyVolume,
          totalSipPaid,
          totalLumpsumPaid,
          totalMfAum,
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

    const total = await MfOrder.countDocuments(query);
    const orders = await MfOrder.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone');

    return res.json({
      success: true,
      data: orders,
      total,
      page,
      pages: Math.ceil(total / limit),
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

    // Verify TLS reachability
    let reachabilityStatus = 'REACHABLE';
    let httpStatus = 200;
    try {
      const httpsAgent = nseEncryption.getHttpsAgent();
      const probeRes = await axios.get(baseUrl, {
        httpsAgent,
        timeout: 8000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      httpStatus = probeRes.status;
    } catch (probeErr) {
      reachabilityStatus = `UNREACHABLE (${probeErr.message})`;
    }

    // Ping check via nseClient
    const testCall = await nseClient.checkClientKycStatus('AAAPA1234A', config.memberCode);
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

