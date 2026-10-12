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
        // Category: "brick" (Fractional Bricks), "estate" (Pre-Launch Estates), "savings" (Savings Location Opportunity)
        listingCategory: {
            type: String,
            enum: ["brick", "estate", "savings"],
            default: "brick",
            index: true,
        },
        // Estate workflow status: "available", "funded", "exited"
        estateStatus: {
            type: String,
            enum: ["available", "funded", "exited"],
            default: "available",
            index: true,
        },
        // Brick workflow status: "available", "invested", "exited"
        brickStatus: {
            type: String,
            enum: ["available", "invested", "exited"],
            default: "available",
            index: true,
        },

        // Pre-Launch / Estate specific fields (Screenshots 1-5)
        tagline: { type: String, trim: true, default: "" }, // e.g. "Iconic Living For Icons", "Rise Above the Ordinary"
        minAmount: { type: Number, default: 500000 },       // min investment (e.g. 500000 -> ₹5 Lakh)
        potentialRoi: { type: String, trim: true, default: "40%-45%" }, // e.g. "40%-45%"
        expectedTenure: { type: String, trim: true, default: "2-3 Years" }, // e.g. "2-3 Years"
        fundedPercentage: { type: Number, default: 0, min: 0, max: 100 }, // e.g. 29
        dealSize: { type: String, trim: true, default: "" }, // e.g. "10.69 Cr"
        pricePerSqFt: { type: Number, default: 0 },         // e.g. 18500 -> ₹18,500
        reraApproved: { type: Boolean, default: true },

        // DRX / Per Annum Academy Video
        academyVideo: {
            title: { type: String, trim: true, default: "Understand the basics of fractional real estate." },
            duration: { type: String, trim: true, default: "1:19" },
            videoUrl: { type: String, trim: true, default: "" },
            thumbnailUrl: { type: String, trim: true, default: "" }
        },

        // About Developer
        developerDetails: {
            name: { type: String, trim: true, default: "" },
            description: { type: String, trim: true, default: "" },
            learnMoreUrl: { type: String, trim: true, default: "" },
            projectsCompleted: { type: String, trim: true, default: "36" },
            sqFtDeveloped: { type: String, trim: true, default: "2,00,00,000" },
            avgAppreciation: { type: String, trim: true, default: "40%" }
        },

        // About Project (Screenshot 2-4)
        aboutProject: {
            title: { type: String, trim: true, default: "" },
            description: { type: String, trim: true, default: "" },
            mapImageUrl: { type: String, trim: true, default: "" },
            locationAddress: { type: String, trim: true, default: "" },
        },

        // Project Documents (Screenshot 3-4)
        estateDocuments: [{
            title: { type: String, trim: true },
            fileUrl: { type: String, trim: true },
            fileType: { type: String, trim: true, default: "pdf" }
        }],

        // Pre-Launch Units (Screenshot 1: Units(2) Tab)
        estateUnits: [{
            unitName: { type: String, trim: true, default: "Unit 1" },
            unitCode: { type: String, trim: true, default: "Unit no. A-3203" },
            areaSqFt: { type: String, trim: true, default: "2690 sq. ft." },
            description: { type: String, trim: true, default: "" },
            features: [{ type: String, trim: true }],
            unitCost: { type: String, trim: true, default: "5.41 Cr" },
            initialPayment: { type: String, trim: true, default: "19587559" },
            minContribution: { type: String, trim: true, default: "500000" }
        }],

        // How it works flow (Screenshot 5)
        howItWorks: {
            academyTitle: { type: String, trim: true, default: "Learn about payment plan." },
            academyDuration: { type: String, trim: true, default: "0:51" },
            academyVideoUrl: { type: String, trim: true, default: "" },
            steps: [{
                stepNumber: { type: Number, default: 1 },
                title: { type: String, trim: true },
                description: { type: String, trim: true }
            }]
        },

        // Strategy (e.g. Capital Growth + Prime Location, Trusted Developer, World class Lifestyle Amenities)
        strategy: {
            title: { type: String, trim: true, default: "Capital Growth" },
            subtitle: { type: String, trim: true, default: "High appreciation potential due to market trends." },
            features: [{
                title: { type: String, trim: true },
                description: { type: String, trim: true }
            }]
        },

        // Construction Linked Payment Plan timeline milestones
        paymentPlan: [{
            date: { type: String, trim: true },
            title: { type: String, trim: true },
            subtitle: { type: String, trim: true },
            accountDetails: { type: String, trim: true }
        }],

        // Why [City] Real Estate? (3 numbered reasons)
        cityWhyPoints: {
            cityName: { type: String, trim: true, default: "Gurgaon" },
            points: [{
                title: { type: String, trim: true },
                description: { type: String, trim: true }
            }]
        },

        // Exit Options
        exitOptions: {
            title: { type: String, trim: true, default: "LLP sells the property" },
            description: { type: String, trim: true, default: "Upon successful sale of the property, you'll receive payment post the deduction of brokerage, and taxes." }
        },

        // Call Your Advisor
        advisor: {
            name: { type: String, trim: true, default: "Neeraj Vishwakarma" },
            phone: { type: String, trim: true, default: "+91 9876543210" },
            title: { type: String, trim: true, default: "Call us now!" },
            subtitle: { type: String, trim: true, default: "Neeraj Vishwakarma is here for you anytime you need help." },
            imageUrl: { type: String, trim: true, default: "" }
        },

        // Savings Opportunity metadata (for location-based opportunities: Goa, Mumbai, Pune, etc.)
        savingsOpportunity: {
            city: { type: String, trim: true, default: "" },
            tagline: { type: String, trim: true, default: "" },
            code: { type: String, trim: true, default: "" },
            iconName: { type: String, trim: true, default: "apartment" },
            accentColor: { type: String, trim: true, default: "#2563EB" },
            displayOrder: { type: Number, default: 0 }
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
        valuationReportTitle: { type: String, trim: true, default: "Certified Valuation & Audit Report" },
        valuationReportDate: { type: String, trim: true, default: "" },
        valuationAuthority: { type: String, trim: true, default: "Independent RICS & IBBI Registered Valuer" },
        valuationMethodology: { type: String, trim: true, default: "Discounted Cash Flow (DCF) + Comparable Sales Approach" },
        valuationSummary: { type: String, trim: true, default: "" },
        reraNumber: { type: String, trim: true, default: "" },
        videos: [{ url: String, title: String }],
        documents: [{
            url: { type: String, default: "" },
            title: { type: String, default: "" },
            type: { type: String, default: "legal" },
            uploadedAt: { type: Date, default: Date.now }
        }],

        // SPV & Escrow Investor Protection (Screenshots 1-4 Feature)
        spvName: { type: String, trim: true, default: "VIKADRX REALTY SERIES 001 LLP" },
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