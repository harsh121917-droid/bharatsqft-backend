const express = require("express");
const router = express.Router();
const { submitKyc, getMyKyc, initiateDigioKyc, verifyDigioKyc, initiateCashfreeOtp, verifyCashfreeOtp, verifyCashfreePan } = require("../controllers/kycController");
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

// Digio KYC endpoints
router.post("/digio/initiate", initiateDigioKyc);
router.post("/digio/verify/:kycId", verifyDigioKyc);

// Cashfree KYC endpoints
router.post("/cashfree/otp", initiateCashfreeOtp);
router.post("/cashfree/verify", verifyCashfreeOtp);
router.post("/cashfree/pan", verifyCashfreePan);

module.exports = router;