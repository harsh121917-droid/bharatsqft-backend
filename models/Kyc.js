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
        fullName: { type: String, trim: true, default: "Account Holder" },
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
            uppercase: true,
            trim: true,
            default: "PHOTO_SUBMITTED",
            validate: {
                validator: function (v) {
                    if (!v || v === "PHOTO_SUBMITTED" || v === "PENDING_VERIFICATION" || v === "NOT_PROVIDED") return true;
                    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
                },
                message: "Invalid PAN format",
            },
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

        // Soldier / Armed Forces & Police Verification (Veer Jawan Scheme)
        soldierDetails: {
            isSoldier: { type: Boolean, default: false },
            soldierIdNumber: { type: String, trim: true },
            serviceBranch: { type: String, trim: true }, // Army, Navy, Air Force, Police, CRPF, etc.
            soldierIdCardUrl: { type: String, default: "" },
            status: {
                type: String,
                enum: ["not_submitted", "pending", "approved", "rejected"],
                default: "not_submitted",
            },
            rejectionReason: { type: String, trim: true },
            submittedAt: { type: Date },
            reviewedAt: { type: Date },
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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