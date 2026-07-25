const mongoose = require("mongoose");

// ─── Scheme Plan (created by admin, e.g. "11+1 Gold Scheme") ───────────────
const GoldSchemeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },              // "11+1 Gold Savings Scheme"
        metal: { type: String, enum: ["gold", "silver"], default: "gold" },
        description: { type: String, default: "" },
        durationMonths: { type: Number, required: true },     // e.g. 11 (installments customer pays)
        benefits: { type: [String], default: [] },            // e.g. ["No making charges", "24K 99.9% pure gold"]
        bonusMonths: { type: Number, default: 1 },            // e.g. 1 (free installment worth of gold on maturity)
        minAmount: { type: Number, required: true },          // min monthly installment ₹
        maxAmount: { type: Number, default: 0 },              // 0 = no cap
        active: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

// ─── Scheme Enrollment (customer's active/completed subscription) ─────────
const SchemeEnrollmentSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        scheme: { type: mongoose.Schema.Types.ObjectId, ref: "GoldScheme", required: true },
        schemeName: { type: String, required: true },          // snapshot, in case admin edits/deletes plan later
        metal: { type: String, enum: ["gold", "silver"], default: "gold" }, // snapshot from scheme at enroll time
        monthlyAmount: { type: Number, required: true },
        durationMonths: { type: Number, required: true },       // snapshot from scheme at enroll time
        bonusMonths: { type: Number, required: true },
        installmentsPaid: { type: Number, default: 0 },
        totalGoldGrams: { type: Number, default: 0 },           // grams credited so far (incl. bonus) — despite the name, holds silver grams too when metal === "silver"
        totalInvested: { type: Number, default: 0 },            // ₹ actually paid by customer (excl. bonus)
        payments: [
            {
                installmentNo: Number,
                amount: Number,
                ratePerGram: Number,
                grams: Number,
                isBonus: { type: Boolean, default: false },
                goldTxnId: { type: mongoose.Schema.Types.ObjectId }, // points at a GoldTransaction or SilverTransaction depending on `metal`
                paidAt: { type: Date, default: Date.now },
            },
        ],
        status: {
            type: String,
            enum: ["active", "completed", "cancelled"],
            default: "active",
        },
        startedAt: { type: Date, default: Date.now },
        completedAt: { type: Date },
        nextDueAt: { type: Date }, // informational only — no auto-charge, customer pays manually
    },
    { timestamps: true }
);

module.exports = {
    GoldScheme: mongoose.model("GoldScheme", GoldSchemeSchema),
    SchemeEnrollment: mongoose.model("SchemeEnrollment", SchemeEnrollmentSchema),
};