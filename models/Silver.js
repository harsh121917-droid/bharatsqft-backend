const mongoose = require("mongoose");
const { nextInvoiceNoFor } = require("./Gold");

// ─── Silver Balance (per user) ──────────────────────────────────────────────
const SilverBalanceSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        totalGrams: { type: Number, default: 0, min: 0 },      // total 999 silver grams owned
        investedAmt: { type: Number, default: 0 },              // total ₹ spent on silver
        lockedGrams: { type: Number, default: 0 },              // grams locked pending sell
    },
    { timestamps: true }
);

// ─── Silver Transaction ─────────────────────────────────────────────────────
const SilverTransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        invoiceNo: { type: String, unique: true, sparse: true }, // e.g. SLV-2026-000123
        type: { type: String, enum: ["buy", "sell", "gift", "redeem"], required: true },
        grams: { type: Number, required: true },
        ratePerGram: { type: Number, required: true },
        silverValue: { type: Number, required: true },          // grams × rate
        gstAmt: { type: Number, default: 0 },                    // 3% GST on buy
        totalAmt: { type: Number, required: true },              // silverValue + gstAmt
        status: { type: String, enum: ["pending", "success", "failed", "processing"], default: "pending" },
        isReferralRedeemed: { type: Boolean, default: false },
        couponCode: { type: String },
        couponBonus: { type: Number, default: 0 },
        couponDiscount: { type: Number, default: 0 },
        isCouponApplied: { type: Boolean, default: false },
        note: { type: String },
    },
    { timestamps: true }
);

// Auto-assign a short sequential invoice number on first save
SilverTransactionSchema.pre("save", async function (next) {
    if (this.isNew && !this.invoiceNo) {
        this.invoiceNo = await nextInvoiceNoFor("silver_invoice", "SLV");
    }
    next();
});

module.exports = {
    SilverBalance: mongoose.model("SilverBalance", SilverBalanceSchema),
    SilverTransaction: mongoose.model("SilverTransaction", SilverTransactionSchema),
};