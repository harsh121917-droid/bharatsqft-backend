const mongoose = require("mongoose");

const SavingSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["daily", "monthly"], required: true },
        targetAmount: { type: Number, required: true, min: 1 },
        amountPerCycle: { type: Number, required: true, min: 1 },
        targetProperty: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
        savedAmount: { type: Number, default: 0 },
        lastCycleDate: { type: Date, default: null },
        cycles: [{
            date: { type: Date, default: Date.now },
            amount: { type: Number, required: true },
            note: { type: String, default: "" },
        }],
        isActive: { type: Boolean, default: true },
        estimatedCyclesToGoal: { type: Number, default: null },

        // Razorpay first-payment tracking
        firstPaymentDone: { type: Boolean, default: false },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
    },
    { timestamps: true }
);

SavingSchema.pre("save", function (next) {
    const remaining = this.targetAmount - this.savedAmount;
    if (remaining <= 0) {
        this.estimatedCyclesToGoal = 0;
    } else if (this.amountPerCycle > 0) {
        this.estimatedCyclesToGoal = Math.ceil(remaining / this.amountPerCycle);
    }
    next();
});

module.exports = mongoose.model("Saving", SavingSchema);