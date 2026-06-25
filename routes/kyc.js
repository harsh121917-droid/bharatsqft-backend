const express = require("express");
const router = express.Router();
const { submitKyc, getMyKyc } = require("../controllers/kycController");
const { protect } = require("../middleware/authMiddleware");
const { uploadKycDocs } = require("../middleware/uploadMiddleware");

router.use(protect);

// Submit / resubmit KYC (multipart: panImage, aadhaarFront, aadhaarBack)
router.post("/submit", (req, res, next) => {
    uploadKycDocs(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        submitKyc(req, res, next);
    });
});

// Get my KYC status
router.get("/me", getMyKyc);

module.exports = router;