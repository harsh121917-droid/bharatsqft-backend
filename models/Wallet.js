const mongoose = require("mongoose");

// ─── Wallet (one per user) ────────────────────────────────────────────────────
const WalletSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        balance: { type: Number, default: 0, min: 0 },       // available ₹
        lockedBalance: { type: Number, default: 0 },         // ₹ already-in-balance, held for pending withdrawal payout
        pendingCredit: { type: Number, default: 0 },         // ₹ NOT yet in balance, from a sell awaiting release
        totalAdded: { type: Number, default: 0 },            // lifetime ₹ added
        totalWithdrawn: { type: Number, default: 0 },        // lifetime ₹ withdrawn
    },
    { timestamps: true }
);

// ─── Wallet Transaction & Ledger ──────────────────────────────────────────────
const WalletTxnSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        txnId: { type: String, unique: true, sparse: true, uppercase: true }, // e.g. TXN-WAL-84920193-F8A2
        entryType: { type: String, enum: ["credit", "debit"], required: true, default: "credit" }, // Credit (+) or Debit (-)
        type: {
            type: String,
            enum: [
                "add",           // user added money to wallet via PG or admin credit
                "deduct",        // admin or system manual deduction
                "gold_buy",      // deducted for gold purchase
                "gold_sell",     // credited from gold sale
                "silver_buy",    // deducted for silver purchase
                "silver_sell",   // credited from silver sale
                "copper_buy",    // deducted for copper purchase
                "copper_sell",   // credited from copper sale
                "withdraw",      // withdrawn to bank
                "refund",        // refund on failed purchase / cancelled order
                "coin_redeem",   // coin delivery payment
                "manual_credit", // manual admin credit
                "manual_debit",  // manual admin debit
            ],
            required: true
        },
        amount: { type: Number, required: true },
        balanceBefore: { type: Number, required: true, default: 0 },
        balanceAfter: { type: Number, required: true, default: 0 },
        reason: { type: String, default: "" }, // Reason/Remarks (e.g., "Refund", "Manual Correction", "Deposit")
        note: { type: String, default: "" },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        adminName: { type: String, default: "" }, // e.g., "Super Admin (ID: 64a...)" or admin's name
        status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        goldTxnId: { type: mongoose.Schema.Types.ObjectId, ref: "GoldTransaction" },
        silverTxnId: { type: mongoose.Schema.Types.ObjectId, ref: "SilverTransaction" },
        copperTxnId: { type: mongoose.Schema.Types.ObjectId, ref: "CopperTransaction" },
    },
    { timestamps: true }
);

// Auto-populate txnId, entryType, and reason before saving
WalletTxnSchema.pre("save", function (next) {
    if (!this.txnId) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.txnId = `TXN-WAL-${Date.now().toString().slice(-8)}-${rand}`;
    }
    if (!this.entryType) {
        const creditTypes = ["add", "gold_sell", "silver_sell", "copper_sell", "refund", "manual_credit"];
        this.entryType = creditTypes.includes(this.type) ? "credit" : "debit";
    }
    if (!this.reason && this.note) {
        this.reason = this.note;
    }
    next();
});

module.exports = {
    Wallet: mongoose.model("Wallet", WalletSchema),
    WalletTxn: mongoose.model("WalletTxn", WalletTxnSchema),
};