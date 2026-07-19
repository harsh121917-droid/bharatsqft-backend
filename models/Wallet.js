const mongoose = require("mongoose");

// ─── Wallet (one per user) ────────────────────────────────────────────────────
const WalletSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        balance: { type: Number, default: 0, min: 0 },       // available ₹
        lockedBalance: { type: Number, default: 0 },               // ₹ locked (pending sell payout)
        totalAdded: { type: Number, default: 0 },               // lifetime ₹ added
        totalWithdrawn: { type: Number, default: 0 },               // lifetime ₹ withdrawn
    },
    { timestamps: true }
);

// ─── Wallet Transaction ────────────────────────────────────────────────────────
const WalletTxnSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: {
            type: String,
            enum: [
                "add",          // user added money to wallet via Razorpay
                "gold_buy",     // deducted for gold purchase
                "gold_sell",    // credited from gold sale (locked first)
                "withdraw",     // withdrawn to bank
                "refund",       // refund on failed gold buy
            ],
            required: true
        },
        amount: { type: Number, required: true },
        balanceBefore: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        goldTxnId: { type: mongoose.Schema.Types.ObjectId, ref: "GoldTransaction" },
        note: { type: String },
    },
    { timestamps: true }
);

module.exports = {
    Wallet: mongoose.model("Wallet", WalletSchema),
    WalletTxn: mongoose.model("WalletTxn", WalletTxnSchema),
};