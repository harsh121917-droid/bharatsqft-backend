const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [150, "Title max 150 chars"],
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            maxlength: [5000, "Description max 5000 chars"],
        },
        location: {
            address: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            pincode: { type: String, trim: true },
        },
        price: {
            amount: { type: Number, required: [true, "Price is required"] },
            currency: { type: String, default: "INR" },
            label: { type: String, default: "" }, // e.g. "per month", "onwards"
        },
        propertyType: {
            type: String,
            enum: ["apartment", "villa", "plot", "commercial", "farmhouse", "penthouse", "other"],
            default: "apartment",
        },
        bhk: { type: String },  // "1BHK", "2BHK", "3BHK", "4BHK", "5BHK+"
        area: { type: Number },  // in sqft
        amenities: [{ type: String }], // ["Swimming Pool", "Gym", "Parking", ...]
        contact: {
            name: { type: String, trim: true },
            phone: { type: String, trim: true },
            email: { type: String, trim: true, lowercase: true },
        },
        status: {
            type: String,
            enum: ["published", "unpublished", "draft", "active", "inactive"],
            default: "published",
        },
        featured: {
            type: Boolean,
            default: true,
        },
        // SEO fields
        seo: {
            metaTitle: { type: String, trim: true },
            metaDescription: { type: String, trim: true },
            slug: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
        },
        // Brick Investment fields
        totalInvestmentRequired: { type: Number }, // total property valuation
        brickPrice: { type: Number, default: 0 },   // price per brick in INR
        totalBricks: { type: Number, default: 0 },   // total bricks available
        soldBricks: { type: Number, default: 0 },   // auto-updated on payment
        investmentEnabled: { type: Boolean, default: true }, // toggle on/off
        expectedAppreciation: { type: Number, default: 8 },  // % per year, capital growth
        expectedRentalYield: { type: Number, default: 3 },  // % per year, rental income
        targetXirr: { type: Number, default: 0 },          // % Target XIRR / IRR displayed on cards and details
        growthProjections: { type: String, trim: true, default: "" }, // Custom growth drivers & infrastructure narrative
        purchaseMode: {
            type: String,
            enum: ["both", "bricks", "direct"],
            default: "both",
        },

        // Media
        images: [{
            url: { type: String, default: "" },
            caption: { type: String, default: "" },
            isCover: { type: Boolean, default: false }
        }],
        youtubeUrl: { type: String, trim: true, default: "" },
        valuationReportUrl: { type: String, trim: true, default: "" },
        valuationReportTitle: { type: String, trim: true, default: "Valuation & Audit Report" },
        videos: [{ url: String, title: String }],
        documents: [{
            url: { type: String, default: "" },
            title: { type: String, default: "" },
            type: { type: String, default: "legal" },
            uploadedAt: { type: Date, default: Date.now }
        }],

        // SPV & Escrow Investor Protection (Screenshots 1-4 Feature)
        spvName: { type: String, trim: true, default: "VIKAONE REALTY SERIES 001 LLP" },
        spvEscrowBank: { type: String, trim: true, default: "ICICI Bank" },
        spvEscrowAccountNo: { type: String, trim: true, default: "705105000036" },
        spvEscrowIfsc: { type: String, trim: true, default: "ICIC0007051" },
        spvEscrowBranch: { type: String, trim: true, default: "ICICI Bank Ltd, Shop No 12,13,14, Ground Floor, B Block Market, South City II, Sohna Road, Gurgaon, Haryana - 122018" },
        spvEscrowCertificateUrl: { type: String, trim: true, default: "" },
        spvTrusteeName: { type: String, trim: true, default: "Universal Trusteeship Services Limited" },
        spvTrusteeAddress: { type: String, trim: true, default: "Premises No. 74, 7th Floor, Sakhar Bhavan, Nariman Point, Mumbai 400 021" },
        spvTrusteeCertificateUrl: { type: String, trim: true, default: "" },
        spvLiquidityPolicy: { type: String, default: "" },

    // ── Escrow customisation (empty = app default text) ──
    spvEscrowAccountName: { type: String, trim: true, default: "" },   // default: spvName
    spvEscrowAccountType: { type: String, trim: true, default: "" },   // default: "Current / Escrow Account"
    spvEscrowDivision: { type: String, trim: true, default: "" },      // default: "Escrow Division"
    spvEscrowNote: { type: String, trim: true, default: "" },          // "Certified: ..." line
    spvEscrowSafeguards: { type: String, default: "" },                // one bullet per line

    // ── Trustee customisation (empty = app default text) ──
    spvTrusteeShortName: { type: String, trim: true, default: "" },    // default: "Universal Trustee"
    spvTrusteeTagline: { type: String, trim: true, default: "" },      // default: "SEBI Registered Custodian & Trustee"
    spvTrusteeRegNo: { type: String, trim: true, default: "" },        // default: "SEBI Regn. No. IND000000570"
    spvTrusteeBeneficiaries: { type: String, trim: true, default: "" },// default: "All registered unit holders of <title>"
    spvTrusteeCertificateText: { type: String, default: "" },          // certificate paragraph
    spvTrusteeRoles: { type: String, default: "" },                    // one bullet per line

    // ── Schedule-a-call sheet customisation ──
    scheduleAdvisorTitle: { type: String, trim: true, default: "" },   // default: "Call with advisor"
    scheduleAdvisorSubtitle: { type: String, trim: true, default: "" },
    scheduleAdvisorImage: { type: String, trim: true, default: "" },
    scheduleTimeSlots: { type: String, trim: true, default: "" },      // comma separated, e.g. "10:00 AM, 11:00 AM"
    scheduleDaysAhead: { type: Number, default: 0 },                   // 0 = default 7 days

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

/* Auto-generate slug and sync price/totalInvestmentRequired */
PropertySchema.pre("save", function (next) {
    if (!this.seo) this.seo = {};
    if (!this.seo.slug && this.title) {
        this.seo.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 100);
    }
    if (!this.price) {
        this.price = { currency: "INR", label: "onwards" };
    }
    if (!this.price.amount && (this.totalInvestmentRequired || (this.brickPrice && this.totalBricks))) {
        this.price.amount = this.totalInvestmentRequired || (this.brickPrice * this.totalBricks);
    }
    if (!this.totalInvestmentRequired && this.price.amount) {
        this.totalInvestmentRequired = this.price.amount;
    }
    next();
});

module.exports = mongoose.model("Property", PropertySchema);