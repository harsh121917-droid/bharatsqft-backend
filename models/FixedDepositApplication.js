const mongoose = require("mongoose");

const FixedDepositApplicationSchema = new mongoose.Schema(
    {
        applicationId: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // ── 1. Company & Scheme Selection (IRIS Platform) ─────────────
        company: {
            type: String,
            required: true,
            enum: ["BAJAJ_FINANCE", "SHRIRAM_FINANCE", "MAHINDRA_FINANCE"],
        },
        companyName: {
            type: String,
            required: true,
            trim: true,
        },
        schemeName: {
            type: String,
            default: "Fixed Deposit Scheme",
            trim: true,
        },
        depositType: {
            type: String,
            required: true,
            enum: ["CUMULATIVE", "NON_CUMULATIVE"],
            default: "CUMULATIVE",
        },
        payoutFrequency: {
            type: String,
            enum: ["AT_MATURITY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"],
            default: "AT_MATURITY",
        },
        amount: {
            type: Number,
            required: true,
            min: 5000,
        },
        tenureMonths: {
            type: Number,
            required: true,
            min: 12,
            max: 120,
        },
        interestRate: {
            type: Number,
            required: true,
        },
        seniorCitizen: {
            type: Boolean,
            default: false,
        },
        womenInvestor: {
            type: Boolean,
            default: false,
        },
        maturityAmount: {
            type: Number,
            default: 0,
        },
        periodicPayoutAmount: {
            type: Number,
            default: 0,
        },
        autoRenewal: {
            type: String,
            enum: ["NO_RENEWAL", "PRINCIPAL_ONLY", "PRINCIPAL_AND_INTEREST"],
            default: "NO_RENEWAL",
        },

        // ── 2. Applicant Personal & KYC Details (IRIS Form) ───────────
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        panNumber: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
        },
        dob: {
            type: String, // yyyy-MM-dd
            required: true,
        },
        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
            default: "Male",
        },
        maritalStatus: {
            type: String,
            enum: ["Single", "Married", "Other"],
            default: "Married",
        },
        fatherOrSpouseName: {
            type: String,
            required: true,
            trim: true,
        },
        motherMaidenName: {
            type: String,
            trim: true,
            default: "",
        },
        occupation: {
            type: String,
            enum: ["Salaried", "Self-Employed", "Professional", "Business", "Retired", "Homemaker", "Student", "Other"],
            default: "Salaried",
        },
        annualIncome: {
            type: String,
            enum: ["Below 1 Lakh", "1 - 5 Lakhs", "5 - 10 Lakhs", "10 - 25 Lakhs", "Above 25 Lakhs"],
            default: "5 - 10 Lakhs",
        },
        isPep: {
            type: Boolean,
            default: false, // Politically Exposed Person
        },
        residentStatus: {
            type: String,
            enum: ["Resident Individual", "Non-Resident Indian (NRI)", "HUF"],
            default: "Resident Individual",
        },

        // ── 3. Contact & Address Details ─────────────────────────────
        mobileNumber: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        addressLine1: {
            type: String,
            required: true,
            trim: true,
        },
        addressLine2: {
            type: String,
            trim: true,
            default: "",
        },
        landmark: {
            type: String,
            trim: true,
            default: "",
        },
        city: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            required: true,
            trim: true,
        },
        pincode: {
            type: String,
            required: true,
            trim: true,
        },
        samePermanentAddress: {
            type: Boolean,
            default: true,
        },
        permanentAddressLine1: {
            type: String,
            trim: true,
            default: "",
        },
        permanentCity: {
            type: String,
            trim: true,
            default: "",
        },
        permanentState: {
            type: String,
            trim: true,
            default: "",
        },
        permanentPincode: {
            type: String,
            trim: true,
            default: "",
        },

        // ── 4. Bank Account Details (Interest Payout & Redemption) ───
        bankName: {
            type: String,
            required: true,
            trim: true,
        },
        accountNumber: {
            type: String,
            required: true,
            trim: true,
        },
        ifscCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
        },
        branchName: {
            type: String,
            trim: true,
            default: "",
        },
        accountType: {
            type: String,
            enum: ["Savings", "Current"],
            default: "Savings",
        },
        accountHolderName: {
            type: String,
            required: true,
            trim: true,
        },

        // ── 5. Nominee Details (Mandatory RBI Guideline) ─────────────
        hasNominee: {
            type: Boolean,
            default: true,
        },
        nomineeName: {
            type: String,
            trim: true,
            default: "",
        },
        nomineeRelation: {
            type: String,
            trim: true,
            default: "",
        },
        nomineeDob: {
            type: String,
            default: "",
        },
        isNomineeMinor: {
            type: Boolean,
            default: false,
        },
        guardianName: {
            type: String,
            trim: true,
            default: "",
        },
        guardianRelation: {
            type: String,
            trim: true,
            default: "",
        },
        guardianAddress: {
            type: String,
            trim: true,
            default: "",
        },
        nomineeAddress: {
            type: String,
            trim: true,
            default: "",
        },

        // ── 6. Tax & Declarations ────────────────────────────────────
        form15G15H: {
            type: Boolean,
            default: false,
        },
        declarationAccepted: {
            type: Boolean,
            default: true,
        },
        customerNotes: {
            type: String,
            trim: true,
            default: "",
        },

        // ── 7. IRIS Operational Tracking & Admin Processing ──────────
        status: {
            type: String,
            enum: ["SUBMITTED", "IN_REVIEW", "APPLIED_ON_IRIS", "APPROVED", "REJECTED", "CANCELLED"],
            default: "SUBMITTED",
        },
        irisApplicationNumber: {
            type: String,
            trim: true,
            default: "",
        },
        irisFolioNumber: {
            type: String,
            trim: true,
            default: "",
        },
        irisFDRNo: {
            type: String,
            trim: true,
            default: "",
        },
        adminRemarks: {
            type: String,
            trim: true,
            default: "",
        },
        appliedAtIrisAt: {
            type: Date,
        },
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        processedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Indexing for rapid queries in Admin Panel and user lookups
FixedDepositApplicationSchema.index({ user: 1, createdAt: -1 });
FixedDepositApplicationSchema.index({ status: 1 });
FixedDepositApplicationSchema.index({ company: 1 });
FixedDepositApplicationSchema.index({ panNumber: 1 });
FixedDepositApplicationSchema.index({ mobileNumber: 1 });

module.exports = mongoose.model("FixedDepositApplication", FixedDepositApplicationSchema);
