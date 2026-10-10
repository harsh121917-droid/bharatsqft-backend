const mongoose = require("mongoose");

const BusinessOpportunitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Business title is required"],
      trim: true,
      maxlength: [200, "Title max 200 chars"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Warehouses & Logistics",
        "Petrol Pumps",
        "Dairy Farms",
        "Hotels & Hospitality",
        "CBG (Compressed Biogas) Plants",
        "Other Business Opportunities",
      ],
      default: "Other Business Opportunities",
    },
    location: {
      address: { type: String, trim: true, default: "" },
      city: { type: String, required: [true, "City is required"], trim: true },
      state: { type: String, required: [true, "State is required"], trim: true },
      pincode: { type: String, trim: true, default: "" },
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [8000, "Description max 8000 chars"],
    },
    // Financial Metrics
    minInvestmentAmount: {
      type: Number,
      required: [true, "Minimum investment amount is required"],
      min: [0, "Minimum investment cannot be negative"],
    },
    totalProjectCost: {
      type: Number,
      required: [true, "Total project cost is required"],
      min: [0, "Total project cost cannot be negative"],
    },
    investmentTenure: {
      type: String,
      required: [true, "Investment tenure is required"],
      trim: true,
      default: "3 Years", // e.g. "3 Years", "5 Years", "36 Months"
    },
    expectedReturns: {
      type: String,
      required: [true, "Expected returns/income is required"],
      trim: true,
      default: "18% - 24% p.a.", // e.g. "18% - 24% p.a.", "21% Target IRR"
    },
    payoutFrequency: {
      type: String,
      enum: ["Monthly", "Quarterly", "Bi-Annually", "Annually", "At Exit", "Flexible"],
      default: "Monthly",
    },
    highlights: [
      {
        type: String,
        trim: true,
      },
    ],
    // Media & Visual Assets
    images: [
      {
        url: { type: String, default: "" },
        caption: { type: String, default: "" },
        isCover: { type: Boolean, default: false },
      },
    ],
    // Documents & Reports
    documents: [
      {
        url: { type: String, default: "" },
        title: { type: String, default: "" },
        type: { type: String, default: "project_report" }, // e.g. "teasor", "pitch_deck", "legal", "dpr"
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    valuationReportUrl: { type: String, trim: true, default: "" },
    valuationReportTitle: { type: String, trim: true, default: "Project Valuation & DPR Report" },
    // SPV / Entity Info
    spvName: {
      type: String,
      trim: true,
      default: "",
    },
    // Status & Visibility
    status: {
      type: String,
      enum: ["active", "upcoming", "funded", "closed", "inactive"],
      default: "active",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    enquiriesCount: {
      type: Number,
      default: 0,
    },
    contact: {
      name: { type: String, trim: true, default: "Investment Desk" },
      phone: { type: String, trim: true, default: "+91 98765 43210" },
      email: { type: String, trim: true, default: "invest@vikadrx.com" },
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Virtual helper for primary cover image
BusinessOpportunitySchema.virtual("coverImage").get(function () {
  if (this.images && this.images.length > 0) {
    const cover = this.images.find((img) => img.isCover);
    return cover ? cover.url : this.images[0].url;
  }
  return "";
});

BusinessOpportunitySchema.set("toJSON", { virtuals: true });
BusinessOpportunitySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("BusinessOpportunity", BusinessOpportunitySchema);
