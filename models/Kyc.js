const mongoose = require("mongoose");

const KycSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        // Personal details
        fullName: { type: String, required: [true, "Full name is required"], trim: true },
        dob: { type: Date },
        address: {
            line1: { type: String, trim: true, default: "" },
            city: { type: String, trim: true, default: "" },
            state: { type: String, trim: true, default: "" },
            pincode: { type: String, trim: true, default: "" },
        },

        // PAN
        panNumber: {
            type: String,
            required: [true, "PAN number is required"],
            uppercase: true,
            trim: true,
            match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format"],
        },
        panImage: {
            url: { type: String, default: "cashfree_verified" },
            uploadedAt: { type: Date, default: Date.now },
        },

        // Aadhaar (Optional for PAN-only verification)
        aadhaarNumber: {
            type: String,
            trim: true,
            select: false, // sensitive — hide by default
        },
        aadhaarFront: {
            url: { type: String, default: "" },
            uploadedAt: { type: Date, default: Date.now },
        },
        aadhaarBack: {
            url: { type: String, default: "" },
            uploadedAt: { type: Date, default: Date.now },
        },

        // Bank details (for payouts / refunds)
        bankDetails: {
            accountHolderName: { type: String, trim: true },
            accountNumber: { type: String, trim: true },
            ifscCode: { type: String, trim: true, uppercase: true },
            bankName: { type: String, trim: true },
        },

        // Verification status
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "revoked"],
            default: "pending",
        },
        rejectionReason: { type: String, trim: true },
        revokedReason: { type: String, trim: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reviewedAt: { type: Date },
        revokedAt: { type: Date },

        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Kyc", KycSchema);