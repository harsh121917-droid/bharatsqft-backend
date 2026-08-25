const mongoose = require("mongoose");
const { nextInvoiceNoFor } = require("./Gold");

// ─── Copper Balance (per user) ──────────────────────────────────────────────
const CopperBalanceSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        totalGrams: { type: Number, default: 0, min: 0 },      // total 999 pure copper grams owned
        investedAmt: { type: Number, default: 0 },              // total ₹ spent on copper
        lockedGrams: { type: Number, default: 0 },              // grams locked pending sell
    },
    { timestamps: true }
);

// ─── Copper Transaction ─────────────────────────────────────────────────────
const CopperTransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        invoiceNo: { type: String, unique: true, sparse: true }, // e.g. CPR-2026-000123
        type: { type: String, enum: ["buy", "sell", "sip_buy", "gift", "redeem"], required: true },
        grams: { type: Number, required: true },
        ratePerGram: { type: Number, required: true },
        copperValue: { type: Number, required: true },          // grams × rate
        gstAmt: { type: Number, default: 0 },                    // 3% GST on buy
        totalAmt: { type: Number, required: true },              // copperValue + gstAmt
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
CopperTransactionSchema.pre("save", async function (next) {
    if (this.isNew && !this.invoiceNo) {
        this.invoiceNo = await nextInvoiceNoFor("copper_invoice", "CPR");
    }
    next();
});

module.exports = {
    CopperBalance: mongoose.model("CopperBalance", CopperBalanceSchema),
    CopperTransaction: mongoose.model("CopperTransaction", CopperTransactionSchema),
};
