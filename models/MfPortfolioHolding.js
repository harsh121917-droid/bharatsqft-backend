const mongoose = require('mongoose');

const MfPortfolioHoldingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientCode: {
      type: String,
      required: true,
      index: true,
    },
    schemeCode: {
      type: String,
      required: true,
      index: true,
    },
    schemeName: {
      type: String,
      required: true,
    },
    amcCode: {
      type: String,
      default: '',
    },
    amcName: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: 'Equity',
    },
    subCategory: {
      type: String,
      default: '',
    },
    planType: {
      type: String,
      enum: ['REGULAR'],
      default: 'REGULAR',
      required: true,
    },
    totalUnits: {
      type: Number,
      required: true,
      default: 0, // Confirmed allotted units only
    },
    availableUnits: {
      type: Number,
      default: 0, // Units currently unencumbered and available to redeem
    },
    pendingRedemptionUnits: {
      type: Number,
      default: 0, // Units in submitted/processing redemptions awaiting settlement
    },
    folioNo: {
      type: String,
      default: '',
    },
    units: {
      type: Number,
      default: 0,
    },
    investedAmount: {
      type: Number,
      required: true,
      default: 0, // Weighted cost basis
    },
    averageNav: {
      type: Number,
      default: null,
    },
    currentNav: {
      type: Number,
      default: null,
    },
    navDate: {
      type: Date,
      default: null,
    },
    currentValue: {
      type: Number,
      default: 0,
    },
    unrealizedProfitLoss: {
      type: Number,
      default: 0,
    },
    unrealizedReturnPct: {
      type: Number,
      default: 0,
    },
    holdingStatus: {
      type: String,
      enum: ['ACTIVE', 'CLOSED'],
      default: 'ACTIVE',
      index: true,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One holding record per user per scheme
MfPortfolioHoldingSchema.index({ user: 1, schemeCode: 1 }, { unique: true });

module.exports = mongoose.model('MfPortfolioHolding', MfPortfolioHoldingSchema);
