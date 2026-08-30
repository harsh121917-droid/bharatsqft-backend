const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");
const sipController = require("../controllers/sipController");

// All SIP routes require user authentication
router.use(protect);

// Customer SIP endpoints
router.post("/create", sipController.createSip);
router.post("/create-autopay", sipController.createAutoPaySip);
router.post("/verify-autopay", sipController.verifyAutoPaySip);
router.get("/my", sipController.getMySips);
router.get("/:id", sipController.getSipDetail);
router.post("/:id/pay", sipController.payInstallment);
router.post("/:id/toggle-status", sipController.toggleSipStatus);
router.post("/:id/cancel", sipController.cancelSip);

// Admin SIP endpoints
router.get("/admin/all", adminOnly, sipController.getAdminSips);
router.post("/:id/remind", adminOnly, sipController.sendSipReminder);
router.post("/admin/remind-all", adminOnly, sipController.sendBulkSipReminders);

module.exports = router;
