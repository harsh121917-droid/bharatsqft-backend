const express = require("express");
const router = express.Router();
const {
    createCoupon,
    getCouponsAdmin,
    updateCoupon,
    deleteCoupon,
    getCouponsUser,
    validateCoupon,
    toggleCouponActive,
} = require("../controllers/couponController");
const { protect, adminOnly, optionalProtect } = require("../middleware/authMiddleware");

// User routes (app users)
router.get("/", optionalProtect, getCouponsUser);
router.post("/validate", optionalProtect, validateCoupon);

// Admin-only routes
router.get("/admin-list", protect, adminOnly, getCouponsAdmin);
router.get("/admin", protect, adminOnly, getCouponsAdmin);
router.post("/create", protect, adminOnly, createCoupon);
router.post("/", protect, adminOnly, createCoupon);
router.put("/:id", protect, adminOnly, updateCoupon);
router.patch("/:id", protect, adminOnly, updateCoupon);
router.patch("/:id/toggle-active", protect, adminOnly, toggleCouponActive);
router.put("/:id/toggle-active", protect, adminOnly, toggleCouponActive);
router.delete("/:id", protect, adminOnly, deleteCoupon);

module.exports = router;
