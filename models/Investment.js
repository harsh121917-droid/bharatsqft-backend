const mongoose = require("mongoose");

const InvestmentSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
        },
        bricks: {
            type: Number,
            required: true,
            min: 1,
        },
        pricePerBrick: {
            type: Number,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        // Razorpay fields
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        status: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded"],
            default: "pending",
        },
        // ownership percentage
        ownershipPercent: {
            type: Number,
        },
    },
    { timestamps: true }
);

/* Auto-calculate ownership % before save */
InvestmentSchema.pre("save", async function (next) {
    if (this.isModified("bricks")) {
        const Property = mongoose.model("Property");
        const prop = await Property.findById(this.property);
        if (prop && prop.totalBricks) {
            this.ownershipPercent = +((this.bricks / prop.totalBricks) * 100).toFixed(4);
        }
    }
    next();
});

module.exports = mongoose.model("Investment", InvestmentSchema);