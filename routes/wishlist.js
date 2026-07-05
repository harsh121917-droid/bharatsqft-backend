const express = require("express");
const router = express.Router();
const {
    getWishlist, addToWishlist, removeFromWishlist, checkWishlist,
    adminGetAll, adminByProperty, adminByUser, adminStats,
} = require("../controllers/wishlistController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect);

// ── User routes ──────────────────────────────────────────────────────────────
router.get("/", getWishlist);
router.post("/:propertyId", addToWishlist);
router.delete("/:propertyId", removeFromWishlist);
router.get("/check/:propertyId", checkWishlist);

// ── Admin routes (role=admin required) ───────────────────────────────────────
router.get("/admin/stats", adminOnly, adminStats);
router.get("/admin/all", adminOnly, adminGetAll);
router.get("/admin/by-property", adminOnly, adminByProperty);
router.get("/admin/by-user", adminOnly, adminByUser);

module.exports = router;
// In server.js: app.use("/api/wishlist", require("./routes/wishlist"));