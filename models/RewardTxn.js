const mongoose = require("mongoose");

const RewardTxnSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: ["spin_win", "registration", "referral", "redeem"],
            required: true,
        },
        points: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        extra: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RewardTxn", RewardTxnSchema);
