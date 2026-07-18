const mongoose = require("mongoose");

// ─── Gold Balance (per user) ───────────────────────────────────────────────
const GoldBalanceSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        totalGrams: { type: Number, default: 0, min: 0 },      // total 24K grams owned
        investedAmt: { type: Number, default: 0 },              // total ₹ spent on gold
        lockedGrams: { type: Number, default: 0 },              // grams locked in SIP / pending sell
    },
    { timestamps: true }
);

// ─── Gold Rate (admin updates / cron syncs) ────────────────────────────────
const GoldRateSchema = new mongoose.Schema(
    {
        buyRate: { type: Number, required: true },   // ₹/g user pays
        sellRate: { type: Number, required: true },   // ₹/g user gets
        change24h: { type: Number, default: 0 },
        changePct: { type: Number, default: 0 },
        source: { type: String, default: "manual" }, // manual | mmtc | safegold
        purity: { type: String, default: "24K" },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// ─── Gold Transaction ──────────────────────────────────────────────────────
const GoldTransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["buy", "sell", "sip_buy", "gift"], required: true },
        grams: { type: Number, required: true },          // grams bought/sold
        ratePerGram: { type: Number, required: true },          // rate locked at time of txn
        goldValue: { type: Number, required: true },          // grams × rate
        gstAmt: { type: Number, default: 0 },              // 3% GST on buy
        totalAmt: { type: Number, required: true },          // goldValue + gstAmt
        status: { type: String, enum: ["pending", "success", "failed", "processing"], default: "pending" },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        // For sell
        bankAccountId: { type: String },
        payoutId: { type: String },
        payoutStatus: { type: String },
        // For SIP
        sipPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "GoldSip" },
        note: { type: String },
    },
    { timestamps: true }
);

// ─── Gold SIP Plan ─────────────────────────────────────────────────────────
const GoldSipSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        frequency: { type: String, enum: ["daily", "weekly", "monthly"], required: true },
        amountPerCycle: { type: Number, required: true },   // ₹ per cycle
        isActive: { type: Boolean, default: true },
        nextDueDate: { type: Date },
        totalInvested: { type: Number, default: 0 },
        totalGrams: { type: Number, default: 0 },
        cyclesCompleted: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = {
    GoldBalance: mongoose.model("GoldBalance", GoldBalanceSchema),
    GoldRate: mongoose.model("GoldRate", GoldRateSchema),
    GoldTransaction: mongoose.model("GoldTransaction", GoldTransactionSchema),
    GoldSip: mongoose.model("GoldSip", GoldSipSchema),
};