const mongoose = require("mongoose");

const BankAccountSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        accountHolder: { type: String, required: true, trim: true },
        accountNumber: { type: String, required: true },
        ifsc: { type: String, required: true, uppercase: true, trim: true },
        bankName: { type: String, required: true },
        accountType: { type: String, enum: ["savings", "current"], default: "savings" },
        isDefault: { type: Boolean, default: false },
        isVerified: { type: Boolean, default: false },
        // Razorpay contact/fund account IDs for payouts
        razorpayContactId: { type: String },
        razorpayFundAccountId: { type: String },
    },
    { timestamps: true }
);

module.exports = mongoose.model("BankAccount", BankAccountSchema);