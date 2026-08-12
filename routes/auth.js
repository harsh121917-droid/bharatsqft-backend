const express = require("express");
const router  = express.Router();
const { register, login, getMe, updatePassword, registerWithOtp, loginWithOtp, verifyCredentials, updateProfile, resetPassword, initiateForgotPassword } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register",         register);
router.post("/login",            login);
router.post("/verify-credentials", verifyCredentials);
router.post("/register-phone",   registerWithOtp);
router.post("/login-phone",      loginWithOtp);
router.post("/reset-password",   resetPassword);
router.post("/forgot-password/initiate", initiateForgotPassword);
router.get( "/me",               protect, getMe);
router.patch("/update-password", protect, updatePassword);
router.patch("/update-profile",  protect, updateProfile);

module.exports = router;