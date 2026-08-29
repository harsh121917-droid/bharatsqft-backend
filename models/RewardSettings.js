const mongoose = require("mongoose");

const RewardSettingsSchema = new mongoose.Schema(
    {
        registrationPoints: { type: Number, default: 100 },
        referralPoints: { type: Number, default: 200 },
        pointToWalletRate: { type: Number, default: 0.10 }, // 1 point = ₹0.10
        spinPoints: {
            type: [Number],
            default: [10, 20, 50, 100, 150, 200],
        },
        expiryEnabled: { type: Boolean, default: true },
        expiryType: {
            type: String,
            enum: ["never", "daily", "weekly", "monthly", "quarterly", "yearly", "custom_days"],
            default: "monthly",
        },
        expiryDays: { type: Number, default: 30 }, // default 30 days
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RewardSettings", RewardSettingsSchema);
