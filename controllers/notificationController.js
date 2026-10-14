const NotificationLog = require("../models/NotificationLog");
const User = require("../models/User");
const { sendFcmMessage } = require("../config/firebase");

// @desc    Save/register user's FCM token (Scattered by app: 'vikadrx' vs 'digigold')
// @route   POST /api/notifications/fcm-token
// @access  Private (User)
exports.saveFcmToken = async (req, res, next) => {
  try {
    const { fcmToken, app } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: "fcmToken is required" });
    }

    const targetApp = app === "vikadrx" || req.headers["x-app-source"] === "vikadrx" ? "vikadrx" : "digigold";
    const tokenField = targetApp === "vikadrx" ? "fcmTokensDrx" : "fcmTokens";

    // Keep at most 3 latest unique active tokens per user for this app
    const userDoc = await User.findById(req.user._id).select(`fcmTokens fcmTokensDrx`);
    let currentTokens = (userDoc?.[tokenField] || []).filter((t) => t !== fcmToken);
    currentTokens.unshift(fcmToken);
    if (currentTokens.length > 3) currentTokens = currentTokens.slice(0, 3);

    await User.findByIdAndUpdate(req.user._id, { [tokenField]: currentTokens });

    res.json({
      success: true,
      message: `FCM token saved successfully for [${targetApp}]`,
      app: targetApp,
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
    const { title, body, imageUrl, deepLink, targetType, targetUserId, app } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required for push notification",
      });
    }

    // Default to 'vikadrx' when dispatched from DRX Admin panel
    const targetApp = app === "digigold" ? "digigold" : "vikadrx";
    const tokenField = targetApp === "vikadrx" ? "fcmTokensDrx" : "fcmTokens";
    const defaultTopic = targetApp === "vikadrx" ? "vikadrx_all_users" : "all_users";

    let fcmResult;
    let targetUserDoc = null;

    if (targetType === "user" && targetUserId) {
      targetUserDoc = await User.findById(targetUserId);
      if (!targetUserDoc) {
        return res.status(404).json({ success: false, message: "Target user not found" });
      }

      const tokens = targetUserDoc[tokenField] || [];
      if (tokens.length > 0) {
        fcmResult = await sendFcmMessage({
          app: targetApp,
          tokens,
          title,
          body,
          imageUrl,
          deepLink: deepLink || "home",
        });
      } else {
        fcmResult = {
          success: true,
          simulated: false,
          sentCount: 0,
          successCount: 0,
          failureCount: 0,
          note: `User has not registered ${targetApp} device token yet. Notification recorded for in-app inbox.`,
        };
      }
    } else if (targetType === "kyc_verified") {
      // Broadcast to KYC verified users only
      const kycUsersWithTokens = await User.find({
        kycStatus: "approved",
        [`${tokenField}.0`]: { $exists: true },
      }).select(tokenField);

      const tokenSet = new Set();
      kycUsersWithTokens.forEach((u) => {
        (u[tokenField] || []).forEach((t) => {
          if (t && typeof t === "string" && t.trim().length > 10) {
            tokenSet.add(t.trim());
          }
        });
      });
      const kycTokens = Array.from(tokenSet);

      if (kycTokens.length > 0) {
        fcmResult = await sendFcmMessage({
          app: targetApp,
          tokens: kycTokens,
          title,
          body,
          imageUrl,
          deepLink: deepLink || "kyc",
        });
      } else {
        fcmResult = {
          success: true,
          simulated: false,
          sentCount: 0,
          successCount: 0,
          failureCount: 0,
          note: `No active FCM tokens found for KYC-verified ${targetApp} users. Recorded for in-app inbox.`,
        };
      }
    } else {
      // Broadcast to all users of target app:
      const allUsersWithTokens = await User.find({ [`${tokenField}.0`]: { $exists: true } }).select(tokenField);
      const tokenSet = new Set();
      allUsersWithTokens.forEach((u) => {
        (u[tokenField] || []).forEach((t) => {
          if (t && typeof t === "string" && t.trim().length > 10) {
            tokenSet.add(t.trim());
          }
        });
      });
      const allTokens = Array.from(tokenSet);

      if (allTokens.length > 0) {
        // Send directly to registered device tokens
        fcmResult = await sendFcmMessage({
          app: targetApp,
          tokens: allTokens,
          title,
          body,
          imageUrl,
          deepLink: deepLink || "home",
        });
      } else {
        // Fallback to topic broadcast if no individual device tokens exist
        fcmResult = await sendFcmMessage({
          app: targetApp,
          topic: defaultTopic,
          title,
          body,
          imageUrl,
          deepLink: deepLink || "home",
        });
      }
    }

    // Create Notification Log entry in database
    const resolvedTargetType =
      targetType === "user" ? "user" : targetType === "kyc_verified" ? "kyc_verified" : "all";

    const log = await NotificationLog.create({
      app: targetApp,
      title,
      body,
      imageUrl: imageUrl || "",
      deepLink: deepLink || "home",
      targetType: resolvedTargetType,
      targetUser: targetUserDoc ? targetUserDoc._id : null,
      sentBy: req.user?.name || "Admin",
      sentCount: fcmResult.sentCount || 0,
      successCount: fcmResult.successCount || 0,
      failureCount: fcmResult.failureCount || 0,
      status: fcmResult.simulated ? "simulated" : fcmResult.success ? "sent" : "failed",
    });

    let message = "Push notification dispatched successfully!";
    if (fcmResult.simulated) {
      message = fcmResult.note || "Push notification processed (Simulation Mode)";
    } else if (fcmResult.note) {
      message = fcmResult.note;
    }

    res.json({
      success: true,
      message,
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

    // Default to 'vikadrx' so DRX Admin never displays Gold notifications
    const appFilter = req.query.app !== undefined ? req.query.app : "vikadrx";

    const query = {};
    if (appFilter && appFilter !== "all") {
      query.app = appFilter;
    }

    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: "i" };
      query.$or = [{ title: searchRegex }, { body: searchRegex }];
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 40;
    const skip = (page - 1) * limit;

    const reqApp = req.query.app || (req.headers["x-app-source"] === "vikadrx" ? "vikadrx" : "vikadrx");

    let query;
    if (reqApp === "vikadrx") {
      // Vika DRX In-App Inbox:
      // Strictly only notifications tagged with 'vikadrx' or 'all'
      // Strictly exclude any Digi Gold deep links
      const orConditions = [
        { targetType: "all", app: { $in: ["vikadrx", "all"] } },
        { targetType: "user", targetUser: req.user._id, app: { $in: ["vikadrx", "all"] } },
      ];

      if (req.user && req.user.kycStatus === "approved") {
        orConditions.push({ targetType: "kyc_verified", app: { $in: ["vikadrx", "all"] } });
      }

      query = {
        $or: orConditions,
        deepLink: { $nin: ["buy_gold", "schemes", "gold", "silver", "jewellery"] },
      };
    } else {
      // Digi Gold In-App Inbox
      const orConditions = [
        { targetType: "all", app: { $in: ["digigold", "all"] } },
        { targetType: "user", targetUser: req.user._id, app: { $in: ["digigold", "all"] } },
      ];

      if (req.user && req.user.kycStatus === "approved") {
        orConditions.push({ targetType: "kyc_verified", app: { $in: ["digigold", "all"] } });
      }

      query = { $or: orConditions };
    }

    const total = await NotificationLog.countDocuments(query);
    const notifications = await NotificationLog.find(query)
      .select("title body imageUrl deepLink targetType targetUser createdAt app")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      notifications,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete notification log
// @route   DELETE /api/notifications/:id
// @access  Private (Admin)
exports.deleteNotificationLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    await NotificationLog.findByIdAndDelete(id);
    res.json({
      success: true,
      message: "Notification log deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};
