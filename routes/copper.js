const express = require("express");
const router = express.Router();
const { getBalance, getTransactions, getTransactionDetail, getTransactionInvoice } = require("../controllers/copperController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Live copper rates come from GET /api/gold/rate (which returns gold, silver, copper in one payload)
router.get("/balance", getBalance);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionDetail);
router.get("/transactions/:id/invoice", getTransactionInvoice);

module.exports = router;
