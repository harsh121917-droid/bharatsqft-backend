const express = require("express");
const router = express.Router();
const { getBalance, getTransactions, getTransactionDetail, getTransactionInvoice } = require("../controllers/silverController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Note: live silver rate comes from the existing GET /api/gold/rate endpoint —
// it already returns { gold, silver, copper } in one payload, no separate
// rate endpoint needed here.
router.get("/balance", getBalance);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionDetail);
router.get("/transactions/:id/invoice", getTransactionInvoice);

module.exports = router;
// Add to server.js: app.use("/api/silver", require("./routes/silver"));