const mongoose = require("mongoose");

const SipInstallmentSchema = new mongoose.Schema({
    installmentNo: { type: Number, required: true },
    amount: { type: Number, required: true },
    ratePerGram: { type: Number, required: true },
    grams: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["wallet", "razorpay", "upi", "auto"], default: "wallet" },
    txnId: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
});

const SipSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        goalCategory: {
            type: String,
            enum: ["baby", "travel", "wedding", "festival", "home", "education", "wealth", "custom"],
            default: "wealth",
        },
        goalTitle: {
            type: String,
            default: "Wealth Building",
        },
        metal: {
            type: String,
            enum: ["gold", "silver", "copper"],
            default: "gold",
            required: true,
        },
        frequency: {
            type: String,
            enum: ["daily", "weekly", "monthly", "quarterly", "yearly"],
            default: "monthly",
            required: true,
        },
        installmentAmount: {
            type: Number,
            required: true,
            min: [1, "Minimum SIP installment is ₹1"],
        },
        durationMonths: {
            type: Number,
            required: true,
            min: 1,
        },
        totalCycles: {
            type: Number,
            required: true,
        },
        cyclesCompleted: {
            type: Number,
            default: 0,
        },
        totalInvested: {
            type: Number,
            default: 0,
        },
        totalGrams: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["active", "paused", "completed", "cancelled"],
            default: "active",
            index: true,
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        nextDueDate: {
            type: Date,
            required: true,
        },
        completedAt: {
            type: Date,
        },
        isAutopay: { type: Boolean, default: false },
        razorpayPlanId: { type: String, default: "" },
        razorpaySubscriptionId: { type: String, default: "" },
        razorpayPaymentId: { type: String, default: "" },
        razorpaySignature: { type: String, default: "" },
        installments: [SipInstallmentSchema],
    },
    {
        timestamps: true,
    }
);

// Helper method to compute next due date based on frequency
SipSchema.methods.calculateNextDueDate = function (fromDate = new Date()) {
    const next = new Date(fromDate);
    switch (this.frequency) {
        case "daily":
            next.setDate(next.getDate() + 1);
            break;
        case "weekly":
            next.setDate(next.getDate() + 7);
            break;
        case "monthly":
            next.setMonth(next.getMonth() + 1);
            break;
        case "quarterly":
            next.setMonth(next.getMonth() + 3);
            break;
        case "yearly":
            next.setFullYear(next.getFullYear() + 1);
            break;
        default:
            next.setMonth(next.getMonth() + 1);
    }
    return next;
};

module.exports = mongoose.model("Sip", SipSchema);
