const express = require("express");
const router = express.Router();
const {
    getRate,
    getBalance,
    initiateBuy,
    verifyBuy,
    sellGold,
    getTransactions,
    getTransactionDetail,
    getTransactionInvoice,
    updateRate,
    giftAsset,
    getHistory,
} = require("../controllers/goldController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/rate", getRate);   // live rate — no auth needed (show on landing page too)
router.get("/history", getHistory);

// ── User (auth required) ──────────────────────────────────────────────────────
router.use(protect);
router.get("/balance", getBalance);
router.post("/buy/initiate", initiateBuy);
router.post("/buy/verify", verifyBuy);
router.post("/sell", sellGold);
router.post("/gift", giftAsset);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionDetail);
router.get("/transactions/:id/invoice", getTransactionInvoice);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post("/rate", adminOnly, updateRate);  // POST to update rate

module.exports = router;
// Add to server.js: app.use("/api/gold", require("./routes/gold"));