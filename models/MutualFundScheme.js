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
      default: 10.0,
    },
    navDate: {
      type: Date,
      default: Date.now,
    },
    cagr1Y: {
      type: Number,
      default: 0.0,
    },
    cagr3Y: {
      type: Number,
      default: 0.0,
    },
    cagr5Y: {
      type: Number,
      default: 0.0,
    },
    minPurchaseAmount: {
      type: Number,
      default: 1000,
    },
    minSipAmount: {
      type: Number,
      default: 500,
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
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Low to Moderate', 'Moderate', 'Moderately High', 'High', 'Very High'],
      default: 'Very High',
    },
    fundManager: {
      type: String,
      default: 'Senior Fund Manager',
    },
    aum: {
      type: Number, // In Crores INR
      default: 5000,
    },
    expenseRatio: {
      type: Number, // e.g. 0.75%
      default: 0.85,
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
