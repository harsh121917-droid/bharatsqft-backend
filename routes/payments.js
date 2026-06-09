const express = require("express");
const router  = express.Router();
const { createOrder, verifyPayment, getMyInvestments } = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

router.post("/create-order", protect, createOrder);
router.post("/verify",       protect, verifyPayment);
router.get("/my",            protect, getMyInvestments);

module.exports = router;