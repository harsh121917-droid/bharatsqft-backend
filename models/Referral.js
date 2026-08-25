const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
    {
        referrer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        referredUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true, // each referred user can only have one referral record
            index: true,
        },
        referralCode: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        rewardPoints: {
            type: Number,
            default: 200,
        },
        rewardAmount: {
            type: Number,
            default: 50, // ₹50 cash / referral balance
        },
        refereeBonusPoints: {
            type: Number,
            default: 100, // Registration welcome points for new user
        },
        status: {
            type: String,
            enum: ["completed", "pending", "first_trade_completed"],
            default: "completed",
        },
        extra: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Referral", ReferralSchema);
