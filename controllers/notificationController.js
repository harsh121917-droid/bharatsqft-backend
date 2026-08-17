const NotificationLog = require("../models/NotificationLog");
const User = require("../models/User");
const { sendFcmMessage } = require("../config/firebase");

// @desc    Save/register user's FCM token
// @route   POST /api/notifications/fcm-token
// @access  Private (User)
exports.saveFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: "fcmToken is required" });
    }

    // Add token to user's fcmTokens array without duplicates
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { fcmTokens: fcmToken },
    });

    res.json({
      success: true,
      message: "FCM token saved successfully",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Send push notification (Broadcast or Specific User)
// @route   POST /api/notifications/send
// @access  Private (Admin)
exports.sendNotification = async (req, res, next) => {
  try {
    const { title, body, imageUrl, deepLink, targetType, targetUserId } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required for push notification",
      });
    }

    let fcmResult;
    let targetUserDoc = null;

    if (targetType === "user" && targetUserId) {
      targetUserDoc = await User.findById(targetUserId);
      if (!targetUserDoc) {
        return res.status(404).json({ success: false, message: "Target user not found" });
      }

      const tokens = targetUserDoc.fcmTokens || [];
      fcmResult = await sendFcmMessage({
        tokens,
        title,
        body,
        imageUrl,
        deepLink: deepLink || "home",
      });
    } else {
      // Broadcast to topic 'all_users'
      fcmResult = await sendFcmMessage({
        topic: "all_users",
        title,
        body,
        imageUrl,
        deepLink: deepLink || "home",
      });
    }

    // Create Notification Log entry in database
    const log = await NotificationLog.create({
      title,
      body,
      imageUrl: imageUrl || "",
      deepLink: deepLink || "home",
      targetType: targetType === "user" ? "user" : "all",
      targetUser: targetUserDoc ? targetUserDoc._id : null,
      sentBy: req.user?.name || "Admin",
      sentCount: fcmResult.sentCount || 0,
      successCount: fcmResult.successCount || 0,
      failureCount: fcmResult.failureCount || 0,
      status: fcmResult.simulated ? "simulated" : fcmResult.success ? "sent" : "failed",
    });

    res.json({
      success: true,
      message: fcmResult.simulated
        ? "Push notification processed (Simulation Mode — credentials not set)"
        : "Push notification dispatched successfully!",
      log,
      fcmResult,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get sent push notification history
// @route   GET /api/notifications/history
// @access  Private (Admin)
exports.getNotificationHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { body: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const total = await NotificationLog.countDocuments(query);
    const notifications = await NotificationLog.find(query)
      .populate("targetUser", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      count: notifications.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      notifications,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get notifications for user inbox
// @route   GET /api/notifications/my-notifications
// @access  Private (User)
exports.getUserNotifications = async (req, res, next) => {
  try {
    const notifications = await NotificationLog.find({
      $or: [
        { targetType: "all" },
        { targetUser: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    next(err);
  }
};
