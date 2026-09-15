const express = require("express");
const router = express.Router();
const {
    getAllPolicies,
    getPolicyBySlug,
    adminUpdatePolicy,
    adminUploadPolicyPdf
} = require("../controllers/policyController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { uploadDoc } = require("../middleware/uploadMiddleware");

// ── Public Routes (Mobile App & Web Viewers) ─────────────────
router.get("/", getAllPolicies);
router.get("/:slug", getPolicyBySlug);

// ── Admin Management Routes (Protected) ──────────────────────
router.put("/:slug", protect, authorize("admin"), adminUpdatePolicy);
router.post(
    "/:slug/upload-pdf",
    protect,
    authorize("admin"),
    uploadDoc,
    adminUploadPolicyPdf
);

module.exports = router;
