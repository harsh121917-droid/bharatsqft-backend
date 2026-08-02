const express = require("express");
const router = express.Router();
const {
    getRewardBalance,
    spinWheel,
    redeemPoints,
    getRewardHistory,
} = require("../controllers/rewardController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/balance", getRewardBalance);
router.post("/spin", spinWheel);
router.post("/redeem", redeemPoints);
router.get("/history", getRewardHistory);

module.exports = router;
