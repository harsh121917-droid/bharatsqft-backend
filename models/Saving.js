const mongoose = require("mongoose");

const SavingSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // "daily" = fixed amount saved every day
        // "monthly" = fixed amount saved every month
        type: {
            type: String,
            enum: ["daily", "monthly"],
            required: true,
        },
        // target amount user wants to save (e.g. for a brick)
        targetAmount: {
            type: Number,
            required: true,
            min: [1, "Target must be > 0"],
        },
        // amount saved per cycle (per day or per month)
        amountPerCycle: {
            type: Number,
            required: true,
            min: [1, "Amount per cycle must be > 0"],
        },
        // optional: which property they are saving toward
        targetProperty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null,
        },
        // total accumulated so far
        savedAmount: {
            type: Number,
            default: 0,
        },
        // last date a cycle was recorded
        lastCycleDate: {
            type: Date,
            default: null,
        },
        // array of cycle logs: { date, amount, note }
        cycles: [
            {
                date: { type: Date, default: Date.now },
                amount: { type: Number, required: true },
                note: { type: String, default: "" },
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
        // auto-computed: estimated cycles to reach target
        estimatedCyclesToGoal: {
            type: Number,
            default: null,
        },
    },
    { timestamps: true }
);

// auto-compute estimatedCyclesToGoal before save
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