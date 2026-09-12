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
        videos: [{ url: String, title: String }],
        documents: [{ url: String, title: String, type: String }],

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