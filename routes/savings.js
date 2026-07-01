const express = require("express");
const router = express.Router();
const {
    getMySavings, createSaving, deposit,
    updateSaving, deleteSaving, getHistory,
} = require("../controllers/savingController");
const {
    initiateFirstPayment,
    verifyFirstPayment,
} = require("../controllers/savingPaymentController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.route("/").get(getMySavings).post(createSaving);
router.route("/:id").patch(updateSaving).delete(deleteSaving);
router.get("/:id/history", getHistory);
router.post("/:id/deposit", deposit);

// Razorpay — first payment per plan
router.post("/:id/pay/initiate", initiateFirstPayment);
router.post("/:id/pay/verify", verifyFirstPayment);

module.exports = router;