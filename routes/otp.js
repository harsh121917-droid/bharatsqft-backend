const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp } = require("../controllers/otpController");

// No auth required — this IS the auth step (used before register/login)
router.post("/send", sendOtp);
router.post("/verify", verifyOtp);

module.exports = router;
// Add to server.js: app.use("/api/otp", require("./routes/otp"));