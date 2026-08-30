const express = require("express");
const router = express.Router();
const {
    createScheme, updateScheme, deleteScheme, listAllSchemes,
    listSchemes, enrollScheme, payNextInstallment,
    myEnrollments, enrollmentDetail, cancelEnrollment,
    sendSchemeEnrollmentReminder, sendBulkSchemeReminders,
} = require("../controllers/schemeController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/admin/all", adminOnly, listAllSchemes);
router.get("/admin/enrollments/:id", adminOnly, enrollmentDetail);
router.post("/enrollments/:id/remind", adminOnly, sendSchemeEnrollmentReminder);
router.post("/admin/remind-all", adminOnly, sendBulkSchemeReminders);
router.post("/", adminOnly, createScheme);
router.put("/:id", adminOnly, updateScheme);
router.delete("/:id", adminOnly, deleteScheme);

// ── Customer & Common ──────────────────────────────────────────────────────────
router.get("/my", myEnrollments);
router.get("/my/:id", enrollmentDetail);
router.get("/enrollments/:id", enrollmentDetail);
router.post("/my/:id/cancel", cancelEnrollment);
router.post("/enrollments/:id/pay", payNextInstallment);
router.get("/", listSchemes);
router.post("/:id/enroll", enrollScheme);

module.exports = router;
// Add to server.js: app.use("/api/schemes", require("./routes/schemes"));