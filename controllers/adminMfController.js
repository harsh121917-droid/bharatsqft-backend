const MfClientUcc = require('../models/MfClientUcc');
const MfSip = require('../models/MfSip');
const MfOrder = require('../models/MfOrder');
const MfMandate = require('../models/MfMandate');
const MutualFundScheme = require('../models/MutualFundScheme');
const User = require('../models/User');

// ── 1. GET /api/admin/mutual-funds/overview ──
exports.getMfOverview = async (req, res) => {
  try {
    const [
      totalInvestors,
      activeSipsCount,
      pausedSipsCount,
      cancelledSipsCount,
      totalOrdersCount,
      successfulOrdersCount,
      pendingOrdersCount,
      activeSipVolumeAgg,
      totalSipPaidAgg,
      totalOrderPaidAgg,
      recentSips,
      recentOrders,
    ] = await Promise.all([
      MfClientUcc.countDocuments(),
      MfSip.countDocuments({ status: 'ACTIVE' }),
      MfSip.countDocuments({ status: 'PAUSED' }),
      MfSip.countDocuments({ status: 'CANCELLED' }),
      MfOrder.countDocuments(),
      MfOrder.countDocuments({ paymentStatus: 'SUCCESS' }),
      MfOrder.countDocuments({ paymentStatus: 'PENDING' }),

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
          pausedSipsCount,
          cancelledSipsCount,
          totalSips: activeSipsCount + pausedSipsCount + cancelledSipsCount,
          totalOrdersCount,
          successfulOrdersCount,
          pendingOrdersCount,
          monthlyVolume,
          totalSipPaid,
          totalLumpsumPaid,
          totalMfAum,
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

    if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be ACTIVE, PAUSED, or CANCELLED' });
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
