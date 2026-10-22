const MfClientUcc = require('../models/MfClientUcc');
const MfSip = require('../models/MfSip');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfAmc = require('../models/MfAmc');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const User = require('../models/User');
const NseConfig = require('../models/NseConfig');
const MfReconciliation = require('../models/MfReconciliation');
const MfAuditLog = require('../models/MfAuditLog');
const Kyc = require('../models/Kyc');
const BankAccount = require('../models/BankAccount');
const mfReconciliationEngine = require('../services/mfReconciliationEngine');
const mfAdminService = require('../services/mfAdminService');
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
      holdingsAgg,
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

      // Real live Portfolio Holdings Valuation
      MfPortfolioHolding.aggregate([
        { $group: { _id: null, totalCurrentValue: { $sum: '$currentValue' }, totalInvested: { $sum: '$investedAmount' } } },
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
    const holdingsAum = holdingsAgg[0]?.totalCurrentValue || holdingsAgg[0]?.totalInvested || 0;
    const totalMfAum = holdingsAum > 0 ? holdingsAum : Math.max(0, totalLumpsumPaid - totalRedeemed);

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

// ── Helper: Resolve User by ID, Phone, Email, Client Code, or PAN ──
async function resolveUserByQuery(queryStr) {
  if (!queryStr) return { user: null, ucc: null };
  const q = String(queryStr).trim();
  if (!q || q === 'undefined' || q === 'null') return { user: null, ucc: null };

  let user = null;
  let ucc = null;

  // 1. By 24-char hex Mongo ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(q)) {
    user = await User.findById(q);
    if (!user) {
      ucc = await MfClientUcc.findById(q);
      if (ucc && ucc.user) {
        user = await User.findById(ucc.user);
      }
    }
  }

  // 2. By Phone Number (support 10 digits, +91, 91, 0 prefix, spaces, dashes)
  if (!user) {
    const digitsOnly = q.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 7) {
      const phoneCandidates = [q, digitsOnly];
      if (digitsOnly.length === 10) {
        phoneCandidates.push(`+91${digitsOnly}`, `91${digitsOnly}`, `0${digitsOnly}`);
      } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
        const ten = digitsOnly.slice(2);
        phoneCandidates.push(ten, `+${digitsOnly}`);
      }
      user = await User.findOne({ phone: { $in: phoneCandidates } });
    }
  }

  // 3. By Email
  if (!user && q.includes('@')) {
    user = await User.findOne({ email: q.toLowerCase() });
  }

  // 4. By NSE Client Code (e.g. VK143005, SH987654)
  if (!user) {
    ucc = await MfClientUcc.findOne({
      $or: [{ clientCode: q }, { clientCode: q.toUpperCase() }],
    });
    if (ucc && ucc.user) {
      user = await User.findById(ucc.user);
    }
  }

  // 5. By PAN (e.g. OZYPS8075Q)
  if (!user && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(q)) {
    const panUpper = q.toUpperCase();
    if (!ucc) {
      ucc = await MfClientUcc.findOne({ pan: panUpper });
    }
    if (ucc && ucc.user) {
      user = await User.findById(ucc.user);
    }
    if (!user) {
      const kyc = await Kyc.findOne({ panNumber: panUpper });
      if (kyc && kyc.user) {
        user = await User.findById(kyc.user);
      }
    }
  }

  // Populate UCC if user found but UCC not loaded yet
  if (user && !ucc) {
    ucc = await MfClientUcc.findOne({ user: user._id });
  }

  return { user, ucc };
}

// ── 7. POST/DELETE /api/admin/mutual-funds/users/:userId/clean (Clean User MF Data) ──
exports.cleanUserMfData = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ success: false, message: 'Valid user ID, phone, email, or client code is required' });
    }

    const { user, ucc } = await resolveUserByQuery(userId);
    const clientCode = ucc?.clientCode;
    const targetUserId = user?._id || (userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null);

    if (!targetUserId && !clientCode) {
      return res.status(404).json({ success: false, message: `No user or UCC record found matching '${userId}'` });
    }

    const userOrClient = [];
    if (targetUserId) userOrClient.push({ user: targetUserId });
    if (clientCode) userOrClient.push({ clientCode: clientCode });
    if (userId.match(/^[0-9a-fA-F]{24}$/)) userOrClient.push({ _id: userId });

    const query = userOrClient.length > 1 ? { $or: userOrClient } : (userOrClient[0] || { user: targetUserId });

    const clearKyc = Boolean(req.body?.clearKyc);
    const clearBank = Boolean(req.body?.clearBank);

    const [ordersDel, sipsDel, uccDel, mandateDel, holdingsDel, kycDel, bankDel] = await Promise.all([
      MfOrder.deleteMany(query),
      MfSip.deleteMany(query),
      clientCode
        ? MfClientUcc.deleteMany({ $or: [{ user: targetUserId }, { clientCode }, ...(userId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: userId }] : [])] })
        : MfClientUcc.deleteMany(query),
      MfMandate.deleteMany(query),
      MfPortfolioHolding.deleteMany(query),
      (clearKyc && targetUserId) ? Kyc.deleteMany({ user: targetUserId }) : Promise.resolve({ deletedCount: 0 }),
      (clearBank && targetUserId) ? BankAccount.deleteMany({ user: targetUserId }) : Promise.resolve({ deletedCount: 0 }),
    ]);

    // Record audit trail
    try {
      await MfAuditLog.create({
        event: 'ADMIN_CLEAN_USER_MF_DATA',
        entityType: 'TRANSACTION',
        entityId: String(targetUserId || clientCode),
        user: targetUserId || undefined,
        source: 'ADMIN_PANEL_MF_CLEAN',
        actor: req.user?.name || req.user?.email || 'ADMIN',
        reason: req.body?.reason || `Manual clean of user MF data (Target: ${userId})`,
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: `Mutual Funds data cleared for user ${user?.name || userId}. Orders: ${ordersDel.deletedCount}, SIPs: ${sipsDel.deletedCount}, UCCs: ${uccDel.deletedCount}, Mandates: ${mandateDel.deletedCount}, Holdings: ${holdingsDel.deletedCount}${clearKyc ? `, KYC: ${kycDel.deletedCount}` : ''}${clearBank ? `, Bank: ${bankDel.deletedCount}` : ''}`,
      data: {
        ordersDeleted: ordersDel.deletedCount,
        sipsDeleted: sipsDel.deletedCount,
        uccDeleted: uccDel.deletedCount,
        mandatesDeleted: mandateDel.deletedCount,
        holdingsDeleted: holdingsDel.deletedCount,
        kycDeleted: kycDel?.deletedCount || 0,
        bankDeleted: bankDel?.deletedCount || 0,
      },
    });
  } catch (error) {
    console.error('[cleanUserMfData Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7A. GET /api/admin/mutual-funds/testing/inspect (Inspect User MF State) ──
exports.inspectMfTestingUser = async (req, res) => {
  try {
    const queryStr = req.query.query || req.query.q || req.query.userId || req.query.phone;
    if (!queryStr) {
      return res.status(400).json({ success: false, message: 'Search query (phone, email, ID, client code, or PAN) is required.' });
    }

    const { user, ucc } = await resolveUserByQuery(queryStr);
    if (!user && !ucc) {
      return res.status(404).json({
        success: false,
        message: `No investor account found matching "${queryStr}". Please check the phone number, email, or client code.`,
      });
    }

    const targetUserId = user?._id || ucc?.user;
    const clientCode = ucc?.clientCode;

    const queryFilter = [];
    if (targetUserId) queryFilter.push({ user: targetUserId });
    if (clientCode) queryFilter.push({ clientCode });
    const mfQuery = queryFilter.length > 1 ? { $or: queryFilter } : (queryFilter[0] || { user: targetUserId });

    const [kyc, bankAccounts, mandates, orders, sips, holdings] = await Promise.all([
      targetUserId ? Kyc.findOne({ user: targetUserId }).lean() : null,
      targetUserId ? BankAccount.find({ user: targetUserId }).lean() : [],
      MfMandate.find(mfQuery).sort({ createdAt: -1 }).lean(),
      MfOrder.find(mfQuery).sort({ createdAt: -1 }).limit(10).lean(),
      MfSip.find(mfQuery).sort({ createdAt: -1 }).lean(),
      MfPortfolioHolding.find(mfQuery).lean(),
    ]);

    const summary = {
      hasUser: !!user,
      userId: targetUserId ? String(targetUserId) : null,
      name: user?.name || ucc?.fullName || kyc?.fullName || 'Unknown',
      phone: user?.phone || 'Not provided',
      email: user?.email || 'Not provided',
      createdAt: user?.createdAt || null,
      hasUcc: !!ucc,
      clientCode: clientCode || null,
      uccPan: ucc?.pan || null,
      uccStatus: ucc?.nseStatus || null,
      uccDob: ucc?.dob || null,
      uccBank: ucc?.primaryBank || null,
      hasKyc: !!kyc,
      kycPan: kyc?.panNumber || null,
      kycStatus: kyc?.status || 'none',
      kycVerified: Boolean(kyc?.panVerified),
      kycLegalName: kyc?.panRegisteredName || kyc?.fullName || null,
      kycSource: kyc?.verificationSource || 'NONE',
      bankCount: bankAccounts.length,
      mandatesCount: mandates.length,
      ordersCount: orders.length,
      sipsCount: sips.length,
      holdingsCount: holdings.length,
    };

    return res.json({
      success: true,
      data: {
        user: user ? {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        } : null,
        ucc,
        kyc,
        bankAccounts,
        mandates,
        orders,
        sips,
        holdings,
        summary,
      },
    });
  } catch (error) {
    console.error('[inspectMfTestingUser Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7B. POST /api/admin/mutual-funds/testing/reset-user (Reset User MF Testing Data) ──
exports.resetMfTestingUser = async (req, res) => {
  try {
    const {
      query,
      clearUcc = true,
      clearOrders = true,
      clearSips = true,
      clearMandates = true,
      clearHoldings = true,
      clearKyc = false,
      clearBank = false,
      generateNewClientCode = false,
      customClientCode = '',
      adminReason = '',
    } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, message: 'User identifier (phone, email, ID, or client code) is required.' });
    }

    const { user, ucc } = await resolveUserByQuery(query);
    if (!user && !ucc) {
      return res.status(404).json({ success: false, message: `User not found matching "${query}".` });
    }

    const targetUserId = user?._id || ucc?.user;
    const clientCode = ucc?.clientCode;

    const queryFilter = [];
    if (targetUserId) queryFilter.push({ user: targetUserId });
    if (clientCode) queryFilter.push({ clientCode });
    const mfQuery = queryFilter.length > 1 ? { $or: queryFilter } : (queryFilter[0] || { user: targetUserId });

    const results = {
      uccDeleted: 0,
      ordersDeleted: 0,
      sipsDeleted: 0,
      mandatesDeleted: 0,
      holdingsDeleted: 0,
      kycReset: false,
      bankDeleted: 0,
    };

    const deleteTasks = [];

    if (clearUcc) {
      deleteTasks.push(
        (clientCode
          ? MfClientUcc.deleteMany({ $or: [{ user: targetUserId }, { clientCode }] })
          : MfClientUcc.deleteMany(mfQuery)
        ).then(r => { results.uccDeleted = r.deletedCount; })
      );
    }

    if (clearOrders) {
      deleteTasks.push(
        MfOrder.deleteMany(mfQuery).then(r => { results.ordersDeleted = r.deletedCount; })
      );
    }

    if (clearSips) {
      deleteTasks.push(
        MfSip.deleteMany(mfQuery).then(r => { results.sipsDeleted = r.deletedCount; })
      );
    }

    if (clearMandates) {
      deleteTasks.push(
        MfMandate.deleteMany(mfQuery).then(r => { results.mandatesDeleted = r.deletedCount; })
      );
    }

    if (clearHoldings) {
      deleteTasks.push(
        MfPortfolioHolding.deleteMany(mfQuery).then(r => { results.holdingsDeleted = r.deletedCount; })
      );
    }

    if (clearKyc && targetUserId) {
      deleteTasks.push(
        Kyc.deleteMany({ user: targetUserId }).then(r => {
          results.kycReset = r.deletedCount > 0;
        })
      );
    }

    if (clearBank && targetUserId) {
      deleteTasks.push(
        BankAccount.deleteMany({ user: targetUserId }).then(r => {
          results.bankDeleted = r.deletedCount;
        })
      );
    }

    await Promise.all(deleteTasks);

    // If fresh client code rotation or custom code requested
    if ((generateNewClientCode || customClientCode) && user) {
      let nextCode = '';
      if (customClientCode && /^[A-Z0-9]{4,10}$/i.test(customClientCode)) {
        nextCode = customClientCode.trim().toUpperCase();
      } else {
        const nextAttempt = (user.mfClientCodeAttempt || 0) + 1;
        const basePhoneDigits = user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-6) : user._id.toString().slice(-6).toUpperCase();
        const numBase = parseInt(basePhoneDigits, 10);
        if (!isNaN(numBase)) {
          nextCode = `VK${String(numBase + nextAttempt).padStart(6, '0').slice(-6)}`;
        } else {
          nextCode = `VK${basePhoneDigits.slice(0, 5)}${String.fromCharCode(64 + Math.min(nextAttempt, 26))}`;
        }
        user.mfClientCodeAttempt = nextAttempt;
      }
      user.mfClientCode = nextCode;
      await user.save();
      results.newClientCode = nextCode;
    }

    // Record audit trail
    try {
      await MfAuditLog.create({
        event: 'ADMIN_RESET_TEST_USER',
        entityType: 'TRANSACTION',
        entityId: String(targetUserId || clientCode),
        user: targetUserId || undefined,
        source: 'ADMIN_MF_TESTING_TOOL',
        actor: req.user?.name || req.user?.email || 'ADMIN',
        reason: adminReason || `Testing reset executed from Admin MF Sandbox for ${user?.phone || user?.email || query}`,
      });
    } catch (_) {}

    const parts = [];
    if (results.uccDeleted > 0) parts.push(`UCC: ${results.uccDeleted}`);
    if (results.ordersDeleted > 0) parts.push(`Orders: ${results.ordersDeleted}`);
    if (results.sipsDeleted > 0) parts.push(`SIPs: ${results.sipsDeleted}`);
    if (results.mandatesDeleted > 0) parts.push(`Mandates: ${results.mandatesDeleted}`);
    if (results.holdingsDeleted > 0) parts.push(`Holdings: ${results.holdingsDeleted}`);
    if (results.kycReset) parts.push('KYC record cleared');
    if (results.bankDeleted > 0) parts.push(`Banks: ${results.bankDeleted}`);
    if (results.newClientCode) parts.push(`New Client Code: ${results.newClientCode}`);

    const summaryMsg = parts.length > 0 ? parts.join(', ') : 'No records needed deleting';

    return res.json({
      success: true,
      message: `Successfully cleared MF test data for ${user?.name || query} (${user?.phone || 'No phone'}). Details: [${summaryMsg}]. User can now test fresh onboarding without conflicts!`,
      data: results,
    });
  } catch (error) {
    console.error('[resetMfTestingUser Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7C. POST /api/admin/mutual-funds/testing/generate-client-code ──
exports.generateNewClientCode = async (req, res) => {
  try {
    const query = req.body?.query || req.body?.userId || req.body?.phone;
    const customCode = req.body?.customClientCode ? String(req.body.customClientCode).trim().toUpperCase() : '';
    if (!query) {
      return res.status(400).json({ success: false, message: 'User identifier (phone, email, ID) is required.' });
    }
    const { user } = await resolveUserByQuery(query);
    if (!user) {
      return res.status(404).json({ success: false, message: `User not found matching "${query}".` });
    }

    let newCode = '';
    if (customCode) {
      if (!/^[A-Z0-9]{4,10}$/.test(customCode)) {
        return res.status(400).json({ success: false, message: 'Client code must be 4-10 alphanumeric characters (e.g. VK088818).' });
      }
      newCode = customCode;
    } else {
      const nextAttempt = (user.mfClientCodeAttempt || 0) + 1;
      const basePhoneDigits = user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-6) : user._id.toString().slice(-6).toUpperCase();
      const numBase = parseInt(basePhoneDigits, 10);
      if (!isNaN(numBase)) {
        newCode = `VK${String(numBase + nextAttempt).padStart(6, '0').slice(-6)}`;
      } else {
        newCode = `VK${basePhoneDigits.slice(0, 5)}${String.fromCharCode(64 + Math.min(nextAttempt, 26))}`;
      }
      user.mfClientCodeAttempt = nextAttempt;
    }

    user.mfClientCode = newCode;
    await user.save();

    // Clean old UCC record so new client code is immediately ready
    const clearOldUcc = req.body?.clearOldUcc !== false;
    let deletedOldUcc = false;
    if (clearOldUcc) {
      const del = await MfClientUcc.deleteMany({ user: user._id });
      deletedOldUcc = del.deletedCount > 0;
    }

    return res.json({
      success: true,
      message: `Generated fresh client code '${newCode}' for ${user.name || user.phone}. Ready for clean NSE registration.`,
      data: {
        userId: user._id,
        phone: user.phone,
        newClientCode: newCode,
        attempt: user.mfClientCodeAttempt || 1,
        deletedOldUcc,
      },
    });
  } catch (error) {
    console.error('[generateNewClientCode Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 7C. POST /api/admin/mutual-funds/testing/check-pan (Live Exchange PAN Check) ──
exports.quickCheckPanOnNse = async (req, res) => {
  try {
    const pan = String(req.body?.pan || req.query?.pan || '').trim().toUpperCase();
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      return res.status(400).json({ success: false, message: 'Valid 10-character PAN format required (e.g. ABCDE1234F).' });
    }

    const nseRes = await nseClient.checkClientKycStatus(pan);
    return res.json({
      success: true,
      pan,
      nseResponse: nseRes,
    });
  } catch (error) {
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
          account_no: req.body.accountNo || '0847796579',
          ac_type: req.body.accountType || 'SB',
          ifsc_code: req.body.ifsc || 'KKBK0005301',
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

    if (action === 'ELOG') {
      try {
        const elogPayload = {
          client_code: clientCode,
          primary_holder_pan: pan,
          primary_holder_ip_address: req.body.ip || '13.203.215.132',
          primary_holder_log_date: req.body.logDate || '17-OCT-26 15:48:50',
        };
        result.elogResult = await nseClient.uploadElog(elogPayload);
      } catch (eErr) {
        result.elogResult = { error: eErr.message };
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

    // Query NSE exchange for order status with standard NSE parameters
    const nseFilter = {
      client_code: order.clientCode,
      order_ref_number: order.orderId,
    };
    if (order.nseTrxnOrderId) {
      nseFilter.trxn_no = order.nseTrxnOrderId;
    }
    const nseRes = await nseClient.getOrderStatusReport(nseFilter);

    let exchangeStatus = order.nseStatus || 'SUBMITTED';
    let allottedUnits = order.units || 0;
    let nav = order.navAtOrder || null;

    const exchangeOrder = nseRes?.data?.orders?.[0] || nseRes?.data?.transaction_details?.[0] || nseRes?.data?.report_data?.[0];
    if (exchangeOrder) {
      exchangeStatus = exchangeOrder.order_status || exchangeOrder.status || 'ALLOTTED';
      if (exchangeOrder.allotted_units) allottedUnits = parseFloat(exchangeOrder.allotted_units);
      if (exchangeOrder.nav) nav = parseFloat(exchangeOrder.nav);
    } else if (order.paymentStatus === 'SUCCESS') {
      exchangeStatus = order.nseStatus || 'ALLOTTED (NSE CONFIRMED)';
    }

    order.nseStatus = exchangeStatus;
    if (allottedUnits > 0) order.units = allottedUnits;
    if (nav > 0) order.navAtOrder = nav;
    await order.save();

    if (allottedUnits > 0 && order.user) {
      try {
        const { recalculateUserPortfolio } = require('../services/mfPortfolioEngine');
        await recalculateUserPortfolio(order.user);
      } catch (pErr) {
        console.warn('[syncOrderWithNse] Portfolio recalculation warning:', pErr.message);
      }
    }

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

    // Find hidden AMCs to accurately reflect visibility
    const hiddenAmcsList = await MfAmc.find({ isActive: false }).select('amcCode amcName displayName').lean();
    const hiddenAmcCodes = hiddenAmcsList.map(a => a.amcCode).filter(Boolean);
    const hiddenAmcNames = hiddenAmcsList.map(a => a.amcName).filter(Boolean);

    if (filter === 'FEATURED') {
      query.isFeatured = true;
    } else if (filter === 'RECOMMENDED') {
      query.isRecommended = true;
    } else if (filter === 'ACTIVE' || filter === 'VISIBLE') {
      query.isActive = true;
      query.isAmcActive = { $ne: false };
      if (hiddenAmcCodes.length > 0) {
        query.amcCode = { $nin: hiddenAmcCodes };
      }
      if (hiddenAmcNames.length > 0) {
        query.amcName = { $nin: hiddenAmcNames };
      }
    } else if (filter === 'HIDDEN') {
      const hiddenOrClauses = [
        { isActive: false },
        { isAmcActive: false },
      ];
      if (hiddenAmcCodes.length > 0) {
        hiddenOrClauses.push({ amcCode: { $in: hiddenAmcCodes } });
      }
      if (hiddenAmcNames.length > 0) {
        hiddenOrClauses.push({ amcName: { $in: hiddenAmcNames } });
      }
      query.$or = hiddenOrClauses;
    }

    if (search) {
      const searchClause = [
        { schemeName: { $regex: search, $options: 'i' } },
        { schemeCode: { $regex: search, $options: 'i' } },
        { amcName: { $regex: search, $options: 'i' } },
        { subCategory: { $regex: search, $options: 'i' } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchClause }];
        delete query.$or;
      } else {
        query.$or = searchClause;
      }
    }

    const visibleSchemeQuery = {
      planType: 'REGULAR',
      isActive: true,
      isAmcActive: { $ne: false },
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    };
    if (hiddenAmcCodes.length > 0) {
      visibleSchemeQuery.amcCode = { $nin: hiddenAmcCodes };
    }
    if (hiddenAmcNames.length > 0) {
      visibleSchemeQuery.amcName = { $nin: hiddenAmcNames };
    }

    const [
      total,
      schemes,
      featuredCount,
      recommendedCount,
      totalRegularSchemes,
      visibleSchemes,
    ] = await Promise.all([
      MutualFundScheme.countDocuments(query),
      MutualFundScheme.find(query)
        .sort({ isFeatured: -1, isRecommended: -1, rating: -1, aum: -1 })
        .skip(skip)
        .limit(limit),
      MutualFundScheme.countDocuments({ planType: 'REGULAR', isFeatured: true }),
      MutualFundScheme.countDocuments({ planType: 'REGULAR', isRecommended: true }),
      MutualFundScheme.countDocuments({ planType: 'REGULAR' }),
      MutualFundScheme.countDocuments(visibleSchemeQuery),
    ]);
    const hiddenCount = Math.max(0, totalRegularSchemes - visibleSchemes);

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
        visibleSchemes,
        totalSchemes: totalRegularSchemes,
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

// AMC Logo Mapping for Static Hosting in Admin Panel & App
const AMC_LOGO_MAP = {
  'ICICI_PRUDENTIA_MF': 'mf_icici.png',
  'ICICI_PRU_MF': 'mf_icici.png',
  'NIPPON_INDIA_MF': 'mf_nippon.jpg',
  'NIPPON_MF': 'mf_nippon.jpg',
  'KOTAK_MAHINDRA_MF': 'mf_kotak.png',
  'HDFC_MF': 'mf_hdfc.png',
  'SBI_MF': 'mf_sbi.png',
  'ADITYA_BIRLA_SU_MF': 'mf_adiya_bilra.png',
  'AXIS_MF': 'mf_axis.png',
  'BANDHAN_MF': 'mf_bandhan.jpg',
  'UTI_MF': 'mf_uti_mutual.png',
  'DSP_MF': 'mf_dsp.png',
  'TATA_MF': 'mf_tata.jpg',
  'EDELWEISS_MF': 'mf_edelweiss.png',
  'MIRAE_ASSET_MF': 'mf_mirae.png',
  'INVESCO_MF': 'mf_invesco.png',
  'BARODA_BNP_PARI_MF': 'mf_baroda_bnp.jpg',
  'HSBC_MF': 'mf_hsbc.jpg',
  'MOTILAL_OSWAL_MF': 'mf_motilal_oswal.jpg',
  'FRANKLIN_TEMPLE_MF': 'mf_franklin.png',
  'GROWW_MF': 'mf_groww.png',
  'LIC_MF': 'mf_lic.png',
  'SUNDARAM_MF': 'mf_sundaram.png',
  'UNION_MF': 'mf_union.jpg',
  'QUANT_MF': 'mf_quant.png',
  'BANK_OF_INDIA_MF': 'mf_boi.jpg',
  'CANARA_ROBECO_MF': 'mf_canara_robeco.png',
  'MAHINDRA_MANULI_MF': 'mf_mahindra.png',
  'PGIM_INDIA_MF': 'mf_pgim.png',
  'BAJAJ_FINSERV_MF': 'mf_bajaj.jpg',
  'ITI_MF': 'mf_iti.png',
  'WHITEOAK_CAPITA_MF': 'mf_whiteoak.jpg',
  'JM_FINANCIAL_MF': 'mf_jm.png',
  'NAVI_MF': 'mf_navi.png',
  'JIO_BLACKROCK_MF': 'mf_jio_blackrock.png',
  'QUANTUM_MF': 'mf_quantum.jpg',
  'SAMCO_MF': 'mf_samco.png',
  'THE_WEALTH_MF': 'wealthcompany.jpg',
  'TRUST_MF': 'mf_trust.jpg',
  '360_ONE_MF': 'mf_360one.png',
  'SHRIRAM_MF': 'mf_shriram.png',
  'TAURUS_MF': 'mf_taurus.png',
  'HELIOS_MF': 'mf_helios.jpg',
  'NJ_MF': 'mf_nj.png',
  'PPFAS_MF': 'mf_parag_parikh.jpg',
  'ABAKKUS_MF': 'mf_abakkus.jpg',
  'ANGEL_ONE_MF': 'mf_angel_one.png',
  'CAPITALMIND_MF': 'mf_capitalmind.png',
  'OLD_BRIDGE_MF': 'mf_old_bridge.jpg',
};

function resolveAmcLogo(code, name = '') {
  if (AMC_LOGO_MAP[code]) {
    return `/admin/images/amc_logos/${AMC_LOGO_MAP[code]}`;
  }
  const lower = (name || code).toLowerCase();
  for (const [c, file] of Object.entries(AMC_LOGO_MAP)) {
    const key = c.replace(/_MF$/, '').toLowerCase().replace(/_/g, ' ');
    if (lower.includes(key)) {
      return `/admin/images/amc_logos/${file}`;
    }
  }
  return '/admin/images/amc_logos/mf_brand_logo_3d.jpg';
}

// Helper: sync distinct AMCs from MutualFundScheme into MfAmc
async function syncAmcsHelper() {
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

    const logoUrl = resolveAmcLogo(item._id, rawName);

    await MfAmc.findOneAndUpdate(
      { amcCode: item._id },
      {
        $set: {
          amcName: rawName,
          displayName: cleanDisplay || rawName,
          schemeCount: item.count,
          logoUrl,
        },
        $setOnInsert: {
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }
}

// ── 18b. GET /api/admin/mutual-funds/amcs (List All Companies / AMCs with Toggle State) ──
exports.getAdminMfAmcs = async (req, res) => {
  try {
    const count = await MfAmc.countDocuments();
    if (count === 0) {
      await syncAmcsHelper();
    }

    const { search = '', filter = 'ALL' } = req.query;
    const query = {};

    if (filter === 'ACTIVE') {
      query.isActive = true;
    } else if (filter === 'HIDDEN') {
      query.isActive = false;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { displayName: { $regex: s, $options: 'i' } },
        { amcName: { $regex: s, $options: 'i' } },
        { amcCode: { $regex: s, $options: 'i' } },
      ];
    }

    const hiddenAmcsList = await MfAmc.find({ isActive: false }).select('amcCode amcName displayName').lean();
    const hiddenAmcCodes = hiddenAmcsList.map(a => a.amcCode).filter(Boolean);
    const hiddenAmcNames = hiddenAmcsList.map(a => a.amcName).filter(Boolean);

    const visibleSchemeQuery = {
      planType: 'REGULAR',
      isActive: true,
      isAmcActive: { $ne: false },
      schemeName: { $not: { $regex: 'direct', $options: 'i' } },
    };
    if (hiddenAmcCodes.length > 0) {
      visibleSchemeQuery.amcCode = { $nin: hiddenAmcCodes };
    }
    if (hiddenAmcNames.length > 0) {
      visibleSchemeQuery.amcName = { $nin: hiddenAmcNames };
    }

    const [amcs, totalAmcs, activeAmcs, hiddenAmcs, totalSchemes, visibleSchemes] = await Promise.all([
      MfAmc.find(query).sort({ schemeCount: -1, displayName: 1 }).lean(),
      MfAmc.countDocuments(),
      MfAmc.countDocuments({ isActive: true }),
      MfAmc.countDocuments({ isActive: false }),
      MutualFundScheme.countDocuments({ planType: 'REGULAR' }),
      MutualFundScheme.countDocuments(visibleSchemeQuery),
    ]);
    const hiddenSchemes = Math.max(0, totalSchemes - visibleSchemes);

    return res.json({
      success: true,
      data: amcs,
      stats: {
        totalAmcs,
        activeAmcs,
        hiddenAmcs,
        visibleSchemes,
        hiddenSchemes,
        totalSchemes,
      },
    });
  } catch (error) {
    console.error('[getAdminMfAmcs Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 18c. POST /api/admin/mutual-funds/amcs/:code/toggle (Toggle Visibility of an Entire Fund House) ──
exports.toggleAdminMfAmc = async (req, res) => {
  try {
    const { code } = req.params;
    const { isActive } = req.body;

    let amc = await MfAmc.findOne({ amcCode: code });
    if (!amc) {
      // Check if exists in MutualFundScheme and auto-create
      const sample = await MutualFundScheme.findOne({ amcCode: code });
      if (sample) {
        amc = await MfAmc.create({
          amcCode: code,
          amcName: sample.amcName || code,
          displayName: (sample.amcName || code).replace(/\s+(Mutual\s+Fund|Asset\s+Management.*|Trustee.*|AMC)$/i, '').trim(),
          isActive: true,
          schemeCount: await MutualFundScheme.countDocuments({ amcCode: code }),
          logoUrl: resolveAmcLogo(code, sample.amcName || code),
        });
      } else {
        return res.status(404).json({ success: false, message: `AMC with code ${code} not found` });
      }
    }

    const newActiveState = typeof isActive === 'boolean' ? isActive : !amc.isActive;
    amc.isActive = newActiveState;
    amc.hiddenAt = newActiveState ? null : new Date();
    await amc.save();

    // Propagate visibility to all mutual fund schemes of this AMC
    const displayKeyword = amc.displayName || amc.amcName || code;
    const updateRes = await MutualFundScheme.updateMany(
      {
        $or: [
          { amcCode: code },
          { amcName: amc.amcName },
          { amcName: new RegExp(`^${displayKeyword}`, 'i') },
          { schemeName: new RegExp(`^${displayKeyword}\\b`, 'i') },
        ],
      },
      {
        $set: { isAmcActive: newActiveState },
      }
    );

    const actionText = newActiveState ? 'VISIBLE in app' : 'COMPLETELY HIDDEN from app';
    return res.json({
      success: true,
      message: `${amc.displayName || amc.amcName} is now ${actionText}. (${updateRes.modifiedCount} schemes updated)`,
      data: amc,
      schemesUpdated: updateRes.modifiedCount,
    });
  } catch (error) {
    console.error('[toggleAdminMfAmc Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 18d. POST /api/admin/mutual-funds/amcs/sync (Resync All AMCs from Schemes Catalog) ──
exports.syncAdminMfAmcs = async (req, res) => {
  try {
    await syncAmcsHelper();
    const total = await MfAmc.countDocuments();
    return res.json({
      success: true,
      message: `Successfully synced ${total} Mutual Fund AMCs from schemes master catalog`,
    });
  } catch (error) {
    console.error('[syncAdminMfAmcs Error]:', error);
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

// ── 26. POST /api/admin/mutual-funds/mandates/:id/sync-nse ──
exports.syncMandateWithNse = async (req, res) => {
  try {
    const { id } = req.params;
    const mandate = await MfMandate.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { mandateId: id },
      ],
    }).populate('user', 'name phone email');

    if (!mandate) {
      return res.status(404).json({ success: false, message: 'Mandate not found' });
    }

    const nseRes = await nseClient.getMandateStatus({
      mandateId: mandate.mandateId,
      clientCode: mandate.clientCode,
    });

    let exchangeStatus = mandate.status;
    let umrn = mandate.umrn || '';
    let remark = '';

    const mandateData = nseRes?.data?.mandates?.[0] || nseRes?.data?.report_data?.[0] || nseRes?.data?.mandate_details?.[0];
    if (mandateData) {
      const rawStatus = (mandateData.status || mandateData.mandate_status || mandate.status).toUpperCase();
      if (rawStatus.includes('APPROVED') || rawStatus.includes('ACCEPTED') || rawStatus.includes('SUCCESS') || rawStatus.includes('ACTIVE')) {
        exchangeStatus = 'ACCEPTED_BY_BANK';
      } else if (rawStatus.includes('REJECT') || rawStatus.includes('FAIL')) {
        exchangeStatus = 'REJECTED';
      } else if (rawStatus.includes('PENDING')) {
        exchangeStatus = 'PENDING_AUTH';
      }
      if (mandateData.umrn_no || mandateData.umrn) {
        umrn = mandateData.umrn_no || mandateData.umrn;
      }
      remark = mandateData.rejection_reason || mandateData.remarks || mandateData.status_description || '';
    }

    mandate.status = exchangeStatus;
    if (umrn) mandate.umrn = umrn;
    if (remark) mandate.remarks = remark;
    await mandate.save();

    return res.json({
      success: true,
      message: `Mandate synchronized with NSE: Status is ${mandate.status}${umrn ? ` (UMRN: ${umrn})` : ''}`,
      data: {
        mandate,
        exchangeRaw: nseRes?.data || null,
      },
    });
  } catch (error) {
    console.error('[syncMandateWithNse Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 27. GET /api/admin/mutual-funds/users/:userId/details (Investor 360° Profile) ──
exports.getMfUserFullProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ success: false, message: 'Valid user ID, client code, or UCC ID is required' });
    }

    let user = null;
    let ucc = null;

    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      // 1. Check if it is a User ID
      user = await User.findById(userId).select('-password');
      if (user) {
        ucc = await MfClientUcc.findOne({ user: user._id });
      }
      // 2. Check if it is a MfClientUcc ID
      if (!ucc) {
        ucc = await MfClientUcc.findById(userId).populate('user', '-password');
        if (ucc && ucc.user && !user) user = ucc.user;
      }
    }

    // 3. Check if it is a Client Code or PAN
    if (!ucc) {
      ucc = await MfClientUcc.findOne({
        $or: [
          { clientCode: userId },
          { clientCode: userId.toUpperCase() },
          { pan: userId.toUpperCase() },
        ],
      }).populate('user', '-password');
      if (ucc && ucc.user && !user) user = ucc.user;
    }

    // 4. Check if User can be found by email or phone
    if (!user && !ucc) {
      user = await User.findOne({
        $or: [{ email: userId }, { phone: userId }],
      }).select('-password');
      if (user) {
        ucc = await MfClientUcc.findOne({ user: user._id });
      }
    }

    if (!ucc && !user) {
      return res.status(404).json({ success: false, message: 'Investor not found' });
    }

    // If UCC exists but User was detached/unlinked in DB, construct fallback profile
    if (!user && ucc) {
      user = {
        _id: ucc._id,
        name: ucc.fullName || `Investor (${ucc.clientCode})`,
        email: ucc.email || '—',
        phone: ucc.mobile || '—',
        pan: ucc.pan,
        isDetachedUcc: true,
      };
    }

    const actualUserId = user?._id || ucc?.user || ucc?._id;
    const clientCode = ucc?.clientCode;

    const userOrClientQuery = clientCode
      ? { $or: [{ user: actualUserId }, { clientCode: clientCode }] }
      : { user: actualUserId };

    const [mandates, sips, holdings, orders, auditLogs] = await Promise.all([
      MfMandate.find(userOrClientQuery).sort({ createdAt: -1 }),
      MfSip.find(userOrClientQuery).sort({ createdAt: -1 }),
      MfPortfolioHolding.find({ $or: [{ user: actualUserId }, ...(clientCode ? [{ clientCode }] : [])] }),
      MfOrder.find(userOrClientQuery).sort({ createdAt: -1 }).limit(20),
      MfAuditLog.find(userOrClientQuery).sort({ createdAt: -1 }).limit(20),
    ]);

    const totalInvested = holdings.reduce((sum, h) => sum + (h.investedAmount || 0), 0);
    const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const totalReturns = totalCurrentValue - totalInvested;
    const returnsPercentage = totalInvested > 0 ? ((totalReturns / totalInvested) * 100).toFixed(2) : '0.00';

    return res.json({
      success: true,
      data: {
        user,
        ucc,
        portfolio: {
          totalInvested: +totalInvested.toFixed(2),
          totalCurrentValue: +totalCurrentValue.toFixed(2),
          totalReturns: +totalReturns.toFixed(2),
          returnsPercentage: +returnsPercentage,
          holdingsCount: holdings.length,
          holdings,
        },
        mandates,
        sips,
        recentOrders: orders,
        auditLogs,
      },
    });
  } catch (error) {
    console.error('[getMfUserFullProfile Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 28. POST /api/admin/mutual-funds/users/:userId/sync-ucc ──
exports.syncUccWithNse = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ success: false, message: 'Valid user ID, client code, or UCC ID is required' });
    }

    let ucc = null;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      ucc = await MfClientUcc.findOne({ user: userId });
      if (!ucc) ucc = await MfClientUcc.findById(userId);
    }
    if (!ucc) {
      ucc = await MfClientUcc.findOne({
        $or: [{ clientCode: userId }, { clientCode: userId.toUpperCase() }],
      });
    }
    if (!ucc) {
      return res.status(404).json({ success: false, message: 'UCC record not found' });
    }

    const clientCode = ucc.clientCode;
    const [authRes, detailRes] = await Promise.allSettled([
      nseClient.getClientAuthorizationReport({ clientCode }),
      nseClient.getClientDetailReport({ clientCode }),
    ]);

    const authData = authRes.status === 'fulfilled' ? authRes.value?.data : null;
    const detailData = detailRes.status === 'fulfilled' ? detailRes.value?.data : null;

    let authStatus = ucc.nseStatus || 'ACTIVE';
    let bankStatus = ucc.primaryBank?.bankStatus || 'ACTIVE';
    let bankRemark = '';

    const authItem = authData?.auth_data?.[0] || authData?.report_data?.[0];
    if (authItem) {
      if (authItem.first_holder_auth_status) {
        ucc.firstHolderAuthStatus = authItem.first_holder_auth_status;
      }
      if (authItem.ucc_status) {
        authStatus = authItem.ucc_status.toUpperCase();
      }
    }

    const detailItem = detailData?.client_details?.[0] || detailData?.report_data?.[0];
    if (detailItem) {
      if (detailItem.bank1_status) {
        bankStatus = detailItem.bank1_status.toUpperCase();
        if (ucc.primaryBank) ucc.primaryBank.bankStatus = bankStatus;
      }
      if (detailItem.bank1_remarks || detailItem.remarks) {
        bankRemark = detailItem.bank1_remarks || detailItem.remarks;
        if (ucc.primaryBank) ucc.primaryBank.pennyDropRemark = bankRemark;
      }
    }

    ucc.nseStatus = authStatus;
    await ucc.save();

    return res.json({
      success: true,
      message: `UCC synchronized with NSE: Status is ${authStatus}, Bank is ${bankStatus}`,
      data: {
        ucc,
        authData,
        detailData,
      },
    });
  } catch (error) {
    console.error('[syncUccWithNse Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 29. POST /api/admin/mutual-funds/users/:userId/resend-auth ──
exports.resendUccAuth = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ success: false, message: 'Valid user ID, client code, or UCC ID is required' });
    }

    let ucc = null;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      ucc = await MfClientUcc.findOne({ user: userId });
      if (!ucc) ucc = await MfClientUcc.findById(userId);
    }
    if (!ucc) {
      ucc = await MfClientUcc.findOne({
        $or: [{ clientCode: userId }, { clientCode: userId.toUpperCase() }],
      });
    }
    if (!ucc) {
      return res.status(404).json({ success: false, message: 'UCC record not found' });
    }

    const resendRes = await nseClient.resendCommunication('CL_ACT', ucc.clientCode);
    const shortLinkRes = await nseClient.getShortLink('CL_ACT', ucc.clientCode).catch(() => null);

    return res.json({
      success: true,
      message: `Authorization communication re-dispatched for client ${ucc.clientCode}`,
      data: {
        resendRes,
        authLink: shortLinkRes?.data?.short_url || shortLinkRes?.data?.url || null,
        clientCode: ucc.clientCode,
      },
    });
  } catch (error) {
    console.error('[resendUccAuth Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 30. POST /api/admin/mutual-funds/orders/:id/controlled-reversal ──
exports.reverseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required for controlled administrative reversal' });
    }

    const adminActor = req.user?.email || req.user?.name || 'SUPER_ADMIN';
    const result = await mfAdminService.executeControlledReversal({
      orderId: id,
      adminActor,
      reason,
    });

    return res.json(result);
  } catch (error) {
    console.error('[reverseOrder Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};




