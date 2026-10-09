const mongoose = require("mongoose");

const RewardCreditSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        amount: { type: Number, required: true },               // Original credit amount (₹)
        remainingAmount: { type: Number, required: true, min: 0 }, // Unspent amount (₹)
        creditedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true, index: true }, // Expiry timestamp
        isExpired: { type: Boolean, default: false, index: true },
        expiredAt: { type: Date },
        description: { type: String, default: "Reward Cash Bonus" },
        sourceType: {
            type: String,
            enum: ["signup_bonus", "festive_bonus", "referral_cash", "admin_credit", "cashback", "spin_win"],
            default: "admin_credit"
        },
        status: { type: String, enum: ["active", "expired", "exhausted"], default: "active", index: true },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        adminName: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RewardCredit", RewardCreditSchema);
