const express = require("express");
const router = express.Router();
const {
    createCoupon,
    getCouponsAdmin,
    updateCoupon,
    deleteCoupon,
    getCouponsUser,
    validateCoupon,
} = require("../controllers/couponController");
const { protect, authorize } = require("../middleware/authMiddleware");

// User routes (any logged-in user)
router.get("/", protect, getCouponsUser);
router.post("/validate", protect, validateCoupon);

// Admin-only routes
router.post("/create", protect, authorize("admin"), createCoupon);
router.get("/admin-list", protect, authorize("admin"), getCouponsAdmin);
router.put("/:id", protect, authorize("admin"), updateCoupon);
router.delete("/:id", protect, authorize("admin"), deleteCoupon);

module.exports = router;
