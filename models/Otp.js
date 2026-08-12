const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema(
    {
        phone: { type: String, required: true, index: true },
        code: { type: String, required: true },          // 6-digit code (stored plain — short-lived, low value target)
        purpose: { type: String, enum: ["register", "login", "forgot_password"], required: true },
        verified: { type: Boolean, default: false },
        attempts: { type: Number, default: 0 },           // wrong-guess counter, capped
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

// Auto-delete expired OTP docs — keeps the collection clean, no cron needed
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", OtpSchema);