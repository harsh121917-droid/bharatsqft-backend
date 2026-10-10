const express = require("express");
const router = express.Router();
const {
  getPublicBusinessOpportunities,
  getBusinessCategories,
  getPublicBusinessOpportunityById,
  submitBusinessLead,
  getAllBusinessForAdmin,
  getBusinessByIdForAdmin,
  createBusinessOpportunity,
  updateBusinessOpportunity,
  toggleBusinessStatus,
  deleteBusinessOpportunity,
} = require("../controllers/businessController");
const { protect, authorize } = require("../middleware/authMiddleware");

/* ==================== PUBLIC ROUTES ==================== */
router.get("/", getPublicBusinessOpportunities);
router.get("/categories", getBusinessCategories);
router.get("/:id", getPublicBusinessOpportunityById);
router.post("/:id/enquire", submitBusinessLead);

/* ==================== ADMIN ROUTES ==================== */
router.get("/admin/all", protect, authorize("admin"), getAllBusinessForAdmin);
router.get("/admin/:id", protect, authorize("admin"), getBusinessByIdForAdmin);
router.post("/admin", protect, authorize("admin"), createBusinessOpportunity);
router.put("/admin/:id", protect, authorize("admin"), updateBusinessOpportunity);
router.patch("/admin/:id/toggle-status", protect, authorize("admin"), toggleBusinessStatus);
router.delete("/admin/:id", protect, authorize("admin"), deleteBusinessOpportunity);

module.exports = router;
