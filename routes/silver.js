const express = require("express");
const router = express.Router();
const { getBalance, getTransactions, getTransactionDetail, getTransactionInvoice, initiateBuy, verifyBuy } = require("../controllers/silverController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/balance", getBalance);
router.post("/buy", initiateBuy);
router.post("/buy/initiate", initiateBuy);
router.post("/buy/verify", verifyBuy);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionDetail);
router.get("/transactions/:id/invoice", getTransactionInvoice);

module.exports = router;
