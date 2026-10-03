const mongoose = require('mongoose');

const MutualFundSchemeSchema = new mongoose.Schema(
  {
    schemeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    amcCode: {
      type: String,
      trim: true,
      index: true,
    },
    amcName: {
      type: String,
      trim: true,
    },
    isin: {
      type: String,
      trim: true,
      index: true,
    },
    nseSchemeCode: {
      type: String,
      trim: true,
      index: true,
    },
    amfiCode: {
      type: String,
      trim: true,
      index: true,
    },
    rtaSchemeCode: {
      type: String,
      trim: true,
    },
    amcSchemeCode: {
      type: String,
      trim: true,
    },
    rtaAgentCode: {
      type: String,
      trim: true, // e.g. CAMS, KFINTECH
    },
    planType: {
      type: String,
      enum: ['REGULAR', 'DIRECT', 'UNKNOWN'],
      default: 'UNKNOWN',
      index: true,
    },
    rawPlanCode: {
      type: String,
      default: null,
      trim: true,
    },
    option: {
      type: String,
      enum: ['GROWTH', 'IDCW', 'BONUS'],
      default: 'GROWTH',
      index: true,
    },
    dividendType: {
      type: String,
      enum: ['PAYOUT', 'REINVESTMENT', 'NONE'],
      default: 'NONE',
    },
    category: {
      type: String,
      enum: ['Equity', 'Debt', 'Hybrid', 'Gold & Commodity', 'Tax Saver (ELSS)', 'Liquid & Overnight', 'Index'],
      default: 'Equity',
      index: true,
    },
    subCategory: {
      type: String,
      trim: true,
    },
    nav: {
      type: Number,
      default: null,
    },
    navDate: {
      type: Date,
      default: null,
    },
    navSource: {
      type: String,
      default: null,
      trim: true,
    },
    navUpdatedAt: {
      type: Date,
      default: null,
    },
    return1M: {
      type: Number,
      default: null,
    },
    return3M: {
      type: Number,
      default: null,
    },
    return6M: {
      type: Number,
      default: null,
    },
    cagr1Y: {
      type: Number,
      default: null,
    },
    cagr3Y: {
      type: Number,
      default: null,
    },
    cagr5Y: {
      type: Number,
      default: null,
    },
    returnsCalculatedAt: {
      type: Date,
      default: null,
    },
    returnsMethodology: {
      type: String,
      default: null,
      trim: true,
    },
    returnsSource: {
      type: String,
      default: null,
      trim: true,
    },
    minPurchaseAmount: {
      type: Number,
      default: null,
    },
    addPurchaseAmount: {
      type: Number,
      default: null,
    },
    maxPurchaseAmount: {
      type: Number,
      default: null,
    },
    purchaseAmountMultiplier: {
      type: Number,
      default: null,
    },
    purchaseCutoffTime: {
      type: String,
      default: null,
      trim: true,
    },
    minSipAmount: {
      type: Number,
      default: null,
    },
    maxSipAmount: {
      type: Number,
      default: null,
    },
    sipMultiplierAmount: {
      type: Number,
      default: null,
    },
    sipFrequency: {
      type: String,
      default: null,
      trim: true,
    },
    sipDates: {
      type: String,
      default: null,
      trim: true,
    },
    minSipInstallments: {
      type: Number,
      default: null,
    },
    maxSipInstallments: {
      type: Number,
      default: null,
    },
    sipAllowed: {
      type: Boolean,
      default: true,
    },
    purchaseAllowed: {
      type: Boolean,
      default: true,
    },
    redemptionAllowed: {
      type: Boolean,
      default: true,
    },
    redemptionCutoffTime: {
      type: String,
      default: null,
      trim: true,
    },
    minRedemptionQty: {
      type: Number,
      default: null,
    },
    minRedemptionAmount: {
      type: Number,
      default: null,
    },
    stpAllowed: {
      type: Boolean,
      default: false,
    },
    swpAllowed: {
      type: Boolean,
      default: false,
    },
    switchAllowed: {
      type: Boolean,
      default: false,
    },
    exitLoad: {
      type: String,
      default: null,
      trim: true,
    },
    exitLoadFlag: {
      type: String,
      default: null,
      trim: true,
    },
    exitLoadSource: {
      type: String,
      default: null,
      trim: true,
    },
    lockInPeriod: {
      type: Number,
      default: null,
    },
    benchmarkName: {
      type: String,
      default: null,
      trim: true,
    },
    benchmark: {
      type: String,
      default: null,
      trim: true,
    },
    benchmarkSource: {
      type: String,
      default: null,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    ratingProvider: {
      type: String,
      default: null,
      trim: true,
    },
    ratingAsOfDate: {
      type: Date,
      default: null,
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Low to Moderate', 'Moderate', 'Moderately High', 'High', 'Very High', null],
      default: null,
    },
    riskometer: {
      type: String,
      trim: true,
      default: null,
    },
    riskometerAsOfDate: {
      type: Date,
      default: null,
    },
    inceptionDate: {
      type: Date,
      default: null,
    },
    fundManager: {
      type: String,
      default: null,
    },
    fundManagerRole: {
      type: String,
      default: null,
      trim: true,
    },
    fundManagerAsOfDate: {
      type: Date,
      default: null,
    },
    aum: {
      type: Number, // In Crores INR
      default: null,
    },
    aumAsOfDate: {
      type: Date,
      default: null,
    },
    aumSource: {
      type: String,
      default: null,
      trim: true,
    },
    expenseRatio: {
      type: Number, // e.g. 0.75%
      default: null,
    },
    expenseRatioAsOfDate: {
      type: Date,
      default: null,
    },
    expenseRatioSource: {
      type: String,
      default: null,
      trim: true,
    },
    holdings: {
      type: [
        {
          name: { type: String, trim: true },
          weight: { type: Number },
          sector: { type: String, trim: true },
          asOfDate: { type: Date, default: null },
          source: { type: String, trim: true, default: null },
        },
      ],
      default: [],
    },
    holdingsAsOfDate: {
      type: Date,
      default: null,
    },
    holdingsSource: {
      type: String,
      default: null,
      trim: true,
    },
    minSipSource: {
      type: String,
      default: null,
      trim: true,
    },
    minPurchaseSource: {
      type: String,
      default: null,
      trim: true,
    },
    dataProvenance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isRecommended: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MutualFundScheme', MutualFundSchemeSchema);
