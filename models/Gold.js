const mongoose = require("mongoose");

// ─── Atomic Counter (for short sequential invoice numbers) ─────────────────
const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },   // counter name, e.g. "gold_invoice"
    seq: { type: Number, default: 0 },
});
const Counter = mongoose.model("Counter", CounterSchema);

// Generic — usable by any metal's transaction schema (gold, silver, ...)
async function nextInvoiceNoFor(counterName, prefix) {
    const year = new Date().getFullYear();
    const counterId = `${counterName}_${year}`;
    const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return `${prefix}-${year}-${String(counter.seq).padStart(6, "0")}`; // e.g. INV-2026-000123
}

async function nextInvoiceNo() {
    return nextInvoiceNoFor("gold_invoice", "INV");
}

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
        buyRate: { type: Number, required: true },   // ₹/g user pays (gold)
        sellRate: { type: Number, required: true },   // ₹/g user gets (gold)
        change24h: { type: Number, default: 0 },
        changePct: { type: Number, default: 0 },
        silverBuyRate: { type: Number, default: 0 },
        silverSellRate: { type: Number, default: 0 },
        silverChange24h: { type: Number, default: 0 },
        silverChangePct: { type: Number, default: 0 },
        platinumBuyRate: { type: Number, default: 0 },
        platinumSellRate: { type: Number, default: 0 },
        platinumChangePct: { type: Number, default: 0 },
        palladiumBuyRate: { type: Number, default: 0 },
        palladiumSellRate: { type: Number, default: 0 },
        palladiumChangePct: { type: Number, default: 0 },
        copperBuyRate: { type: Number, default: 0 },
        copperSellRate: { type: Number, default: 0 },
        copperChangePct: { type: Number, default: 0 },
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
        invoiceNo: { type: String, unique: true, sparse: true }, // short human-friendly ref, e.g. INV-2026-000123
        type: { type: String, enum: ["buy", "sell", "sip_buy", "gift", "redeem"], required: true },
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
        isReferralRedeemed: { type: Boolean, default: false },
        note: { type: String },
    },
    { timestamps: true }
);

// Auto-assign a short sequential invoice number on first save
GoldTransactionSchema.pre("save", async function (next) {
    if (this.isNew && !this.invoiceNo) {
        this.invoiceNo = await nextInvoiceNo();
    }
    next();
});


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

// ─── Coin Redemption Order ──────────────────────────────────────────────────
const CoinOrderSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        coinId: { type: String, required: true },       // catalog id, e.g. "gold-1g"
        coinName: { type: String, required: true },
        metal: { type: String, enum: ["gold", "silver"], required: true },
        grams: { type: Number, required: true },
        makingChargePct: { type: Number, default: 0 },
        goldValue: { type: Number, required: true },     // grams × rate at redemption
        makingCharge: { type: Number, default: 0 },
        totalValue: { type: Number, required: true },    // goldValue + makingCharge (deducted from digital gold)
        ratePerGram: { type: Number, required: true },
        goldTxnId: { type: mongoose.Schema.Types.ObjectId, ref: "GoldTransaction" },
        addressLine: { type: String, required: true },
        pincode: { type: String, required: true },
        phone: { type: String, required: true },
        status: { type: String, enum: ["placed", "processing", "shipped", "delivered", "cancelled"], default: "placed" },
    },
    { timestamps: true }
);

module.exports = {
    GoldBalance: mongoose.model("GoldBalance", GoldBalanceSchema),
    GoldRate: mongoose.model("GoldRate", GoldRateSchema),
    GoldTransaction: mongoose.model("GoldTransaction", GoldTransactionSchema),
    GoldSip: mongoose.model("GoldSip", GoldSipSchema),
    CoinOrder: mongoose.model("CoinOrder", CoinOrderSchema),
    nextInvoiceNoFor,
};