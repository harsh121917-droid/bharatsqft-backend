const express = require("express");
const router = express.Router();
const { getBalance, getTransactions, getTransactionDetail, getTransactionInvoice, initiateBuy, verifyBuy } = require("../controllers/copperController");
const { getHistory } = require("../controllers/goldController");
const { protect } = require("../middleware/authMiddleware");

router.get("/history", (req, res, next) => {
    if (!req.query.symbol) req.query.symbol = "COPPER";
    return getHistory(req, res, next);
});

router.use(protect);

router.get("/balance", getBalance);
router.post("/buy", initiateBuy);
router.post("/buy/initiate", initiateBuy);
router.post("/buy/verify", verifyBuy);
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionDetail);
router.get("/transactions/:id/invoice", getTransactionInvoice);

module.exports = router;
