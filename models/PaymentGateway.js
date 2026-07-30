const mongoose = require("mongoose");

// One document per (name, mode) pair — e.g. razorpay+live, razorpay+demo,
// cashfree+live, cashfree+demo, cashfree_payout+live, cashfree_payout+demo.
// Admin enters real keys here via the admin panel; nothing is hardcoded
// in .env anymore for these.
const PaymentGatewaySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            enum: ["razorpay", "cashfree", "cashfree_payout"],
            required: true,
        },
        mode: { type: String, enum: ["live", "demo"], required: true },

        // Razorpay
        keyId: { type: String },
        keySecret: { type: String },

        // Cashfree (payments) / Cashfree Payout — same shape, different creds
        clientId: { type: String },
        clientSecret: { type: String },

        isActive: { type: Boolean, default: true },
        isDefault: { type: Boolean, default: false }, // used when request omits gateway/mode
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

// One config per (name, mode) — upsert on that pair instead of duplicating
PaymentGatewaySchema.index({ name: 1, mode: 1 }, { unique: true });

module.exports = mongoose.model("PaymentGateway", PaymentGatewaySchema);