const Otp = require("../models/Otp");
const User = require("../models/User");
const { sendSms } = require("../services/smsService");

const OTP_EXPIRY_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/otp/send   body: { phone, purpose: "register" | "login" }
// ══════════════════════════════════════════════════════════════════════════════
exports.sendOtp = async (req, res, next) => {
    try {
        const { phone, purpose } = req.body;
        if (!phone || !/^[0-9+\-\s()]{7,15}$/.test(phone)) {
            return res.status(400).json({ success: false, message: "Valid phone number required" });
        }
        if (!["register", "login", "forgot_password"].includes(purpose)) {
            return res.status(400).json({ success: false, message: "purpose must be 'register', 'login', or 'forgot_password'" });
        }

        const existingUser = await User.findOne({ phone });
        if (purpose === "register" && existingUser) {
            return res.status(400).json({ success: false, message: "Phone already registered — try logging in instead" });
        }
        if (["login", "forgot_password"].includes(purpose) && !existingUser) {
            return res.status(404).json({ success: false, message: "No account found with this phone number" });
        }

        // Cooldown — stop someone spamming resend and burning SMS credits
        const recent = await Otp.findOne({ phone, purpose }).sort({ createdAt: -1 });
        if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
            const waitSec = Math.ceil(
                (RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - recent.createdAt.getTime())) / 1000
            );
            return res.status(429).json({ success: false, message: `Please wait ${waitSec}s before requesting another OTP` });
        }

        // ── Test number bypass ──────────────────────────────────────────
        // Set OTP_TEST_PHONE + OTP_TEST_CODE in .env to make ONE specific
        // number always receive the same fixed code, and skip the real SMS
        // send entirely (free, instant, no waiting on Arihant/DLT while
        // testing the rest of the app). Every other number behaves normally.
        const isTestPhone = process.env.OTP_TEST_PHONE && phone === process.env.OTP_TEST_PHONE;
        const code = isTestPhone ? (process.env.OTP_TEST_CODE || "123456") : generateCode();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await Otp.create({ phone, code, purpose, expiresAt });

        // Visible in your Render logs — lets you test the whole OTP flow
        // via curl/Postman before Arihant is fully wired up, without
        // needing direct DB access. The record is saved above regardless
        // of whether the SMS send below succeeds or fails.
        console.log(`[OTP] ${phone} (${purpose}): ${code}  — expires in ${OTP_EXPIRY_MINUTES}m${isTestPhone ? " [TEST NUMBER — SMS skipped]" : ""}`);

        if (!isTestPhone) {
            // Must match the DLT-approved Content Template EXACTLY (only the
            // {#num#} variable position changes) — any wording difference
            // here, even punctuation, causes the operator to silently drop
            // the message after Arihant's gateway has already accepted it.
            const message = `Dear Customer, Your OTP for VIKAONE is ${code} . Please do not share this OTP anyone. Regards, PAYVIKA INDIA`;
            await sendSms(phone, message);
        }

        res.json({ success: true, message: `OTP sent to ${phone}`, expiresInSeconds: OTP_EXPIRY_MINUTES * 60 });
    } catch (err) {
        console.error("sendOtp error:", err.message);
        res.status(502).json({ success: false, message: "Failed to send OTP. Please try again shortly." });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/otp/verify   body: { phone, purpose, code }
// Returns a short-lived verification token to be passed to register/login-phone.
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyOtp = async (req, res, next) => {
    try {
        const { phone, purpose, code } = req.body;
        if (!phone || !purpose || !code) {
            return res.status(400).json({ success: false, message: "phone, purpose and code are required" });
        }

        const otp = await Otp.findOne({ phone, purpose, verified: false }).sort({ createdAt: -1 });
        if (!otp) {
            return res.status(400).json({ success: false, message: "No pending OTP for this phone — request a new one" });
        }
        if (otp.expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ success: false, message: "OTP expired — request a new one" });
        }
        if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
            return res.status(429).json({ success: false, message: "Too many incorrect attempts — request a new OTP" });
        }

        if (otp.code !== String(code).trim()) {
            otp.attempts += 1;
            await otp.save();
            return res.status(400).json({
                success: false,
                message: `Incorrect OTP (${MAX_VERIFY_ATTEMPTS - otp.attempts} attempts left)`,
            });
        }

        otp.verified = true;
        await otp.save();

        res.json({
            success: true,
            message: "OTP verified",
            // Client passes this straight back to /api/auth/register-phone or
            // /api/auth/login-phone as `otpRecordId` to prove verification.
            otpRecordId: otp._id,
        });
    } catch (err) { next(err); }
};

// Internal helper used by authController — confirms a given otpRecordId is a
// real, verified, unexpired, unused OTP for this exact phone+purpose.
exports.consumeVerifiedOtp = async (phone, purpose, otpRecordId) => {
    const otp = await Otp.findOne({ _id: otpRecordId, phone, purpose, verified: true });
    if (!otp) return false;
    if (otp.expiresAt.getTime() < Date.now()) return false;
    await otp.deleteOne(); // single-use — consumed
    return true;
};