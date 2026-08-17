const express = require("express");
const router = express.Router();
const {
  saveFcmToken,
  sendNotification,
  getNotificationHistory,
  getUserNotifications,
} = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/authMiddleware");

// User routes
router.post("/fcm-token", protect, saveFcmToken);
router.get("/my-notifications", protect, getUserNotifications);

// Admin routes
router.post("/send", protect, authorize("admin"), sendNotification);
router.get("/history", protect, authorize("admin"), getNotificationHistory);

module.exports = router;
