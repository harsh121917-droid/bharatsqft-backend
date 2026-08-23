const express = require("express");
const router = express.Router();
const {
    getWallet,
    initiateAdd,
    verifyAdd,
    buyGoldFromWallet,
    sellGoldToWallet,
    buySilverFromWallet,
    sellSilverToWallet,
    buyCopperFromWallet,
    sellCopperToWallet,
    initiateWithdraw,
} = require("../controllers/walletController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all routes require auth

router.get("/", getWallet);
router.post("/add/initiate", initiateAdd);
router.post("/add/verify", verifyAdd);
router.post("/buy-gold", buyGoldFromWallet);
router.post("/sell-gold", sellGoldToWallet);
router.post("/buy-silver", buySilverFromWallet);
router.post("/sell-silver", sellSilverToWallet);
router.post("/buy-copper", buyCopperFromWallet);
router.post("/sell-copper", sellCopperToWallet);
router.post("/withdraw/initiate", initiateWithdraw);

module.exports = router;
// Add to server.js: app.use("/api/wallet", require("./routes/wallet"));