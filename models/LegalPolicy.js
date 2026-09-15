const mongoose = require("mongoose");

const LegalPolicySchema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            enum: [
                "help-support",
                "investor-agreement",
                "privacy-policy",
                "terms-conditions",
                "refund-cancellation"
            ]
        },
        title: {
            type: String,
            required: true
        },
        pdfUrl: {
            type: String,
            default: ""
        },
        content: {
            type: String,
            default: ""
        },
        version: {
            type: String,
            default: "1.0"
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        },
        // Dedicated fields for Help & Support
        supportEmail: {
            type: String,
            default: "support@vikaone.com"
        },
        supportPhone: {
            type: String,
            default: "+91 80000 12345"
        },
        supportWhatsapp: {
            type: String,
            default: "+91 80000 12345"
        },
        supportHours: {
            type: String,
            default: "Monday - Saturday: 9:30 AM - 7:00 PM IST"
        },
        officeAddress: {
            type: String,
            default: "Vikaone Realty Private Limited, Nariman Point, Mumbai, Maharashtra 400021"
        },
        faqs: [
            {
                question: { type: String, required: true },
                answer: { type: String, required: true }
            }
        ],
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("LegalPolicy", LegalPolicySchema);
