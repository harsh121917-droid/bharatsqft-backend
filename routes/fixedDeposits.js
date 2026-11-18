const express = require("express");
const router = express.Router();
const {
    getCompaniesAndSchemes,
    submitFdApplication,
    getMyFdApplications,
    getFdApplicationById,
    getBondsConfig,
} = require("../controllers/fixedDepositController");
const { protect } = require("../middleware/authMiddleware");

// Optional auth helper so public visitors can see companies & rates,
// but logged-in users get their KYC & profile prefilled!
const optionalAuth = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }
        if (token) {
            const jwt = require("jsonwebtoken");
            const User = require("../models/User");
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select("-password");
        }
    } catch (_) {}
    next();
};

// Public / Pre-fill endpoints
router.get("/companies", optionalAuth, getCompaniesAndSchemes);
router.get("/bonds", getBondsConfig);

// Authenticated user application endpoints
router.post("/apply", protect, submitFdApplication);
router.get("/my-applications", protect, getMyFdApplications);
router.get("/applications/:id", protect, getFdApplicationById);

module.exports = router;
