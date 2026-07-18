const express = require("express");
const router = express.Router();
const {
    getRate,
    getBalance,
    initiateBuy,
    verifyBuy,
    sellGold,
    getTransactions,
    updateRate,
} = require("../controllers/goldController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/rate", getRate);   // live rate — no auth needed (show on landing page too)

// ── User (auth required) ──────────────────────────────────────────────────────
router.use(protect);
router.get("/balance", getBalance);
router.post("/buy/initiate", initiateBuy);
router.post("/buy/verify", verifyBuy);
router.post("/sell", sellGold);
router.get("/transactions", getTransactions);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post("/rate", adminOnly, updateRate);  // POST to update rate

module.exports = router;
// Add to server.js: app.use("/api/gold", require("./routes/gold"));