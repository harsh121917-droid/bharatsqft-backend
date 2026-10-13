const express = require("express");
const router  = express.Router();
const { createOrder, createTokenOrder, verifyPayment, getMyInvestments, handleRazorpayWebhook } = require("../controllers/paymentController");
const { protect, optionalProtect } = require("../middleware/authMiddleware");

// Webhook from Razorpay (public endpoint for Razorpay server-to-server callbacks)
router.post("/webhook", handleRazorpayWebhook);

router.post("/create-order",       protect, createOrder);
router.post("/create-token-order", optionalProtect, createTokenOrder);
router.post("/verify",             protect, verifyPayment);
router.get("/my",                  protect, getMyInvestments);

module.exports = router;