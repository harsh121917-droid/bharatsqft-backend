const express = require("express");
const router = express.Router();
const { getCoins, redeemCoin, getCoinOrders } = require("../controllers/coinController");
const { protect } = require("../middleware/authMiddleware");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/", getCoins);   // catalog with live prices — no auth needed

// ── User (auth required) ──────────────────────────────────────────────────────
router.use(protect);
router.post("/redeem", redeemCoin);
router.get("/orders", getCoinOrders);

module.exports = router;
// Add to server.js: app.use("/api/coins", require("./routes/coins"));