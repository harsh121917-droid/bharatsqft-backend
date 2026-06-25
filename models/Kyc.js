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
        dob: { type: Date, required: [true, "Date of birth is required"] },
        address: {
            line1: { type: String, required: [true, "Address is required"], trim: true },
            city: { type: String, required: true, trim: true },
            state: { type: String, required: true, trim: true },
            pincode: { type: String, required: true, trim: true },
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
            url: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now },
        },

        // Aadhaar
        aadhaarNumber: {
            type: String,
            required: [true, "Aadhaar number is required"],
            trim: true,
            match: [/^\d{12}$/, "Aadhaar must be 12 digits"],
            select: false, // sensitive — hide by default
        },
        aadhaarFront: {
            url: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now },
        },
        aadhaarBack: {
            url: { type: String, required: true },
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
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        rejectionReason: { type: String, trim: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reviewedAt: { type: Date },

        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Kyc", KycSchema);