const mongoose = require('mongoose');

const HoldingItemSchema = new mongoose.Schema(
  {
    securityName: {
      type: String,
      required: true,
      trim: true,
    },
    isin: {
      type: String,
      trim: true,
      default: null,
    },
    sector: {
      type: String,
      trim: true,
      default: 'Diversified',
    },
    assetClass: {
      type: String,
      trim: true,
      enum: ['Equity', 'Debt', 'Sovereign', 'Cash & Cash Equivalents', 'Derivatives', 'Commodity', 'Other'],
      default: 'Equity',
    },
    quantity: {
      type: Number,
      default: null,
    },
    marketValue: {
      type: Number,
      default: null,
    },
    weightPercent: {
      type: Number,
      required: true,
    },
    weightSource: {
      type: String,
      enum: [
        'OFFICIAL_AMC_DISCLOSURE',
        'DERIVED_FROM_MARKET_VALUE_AND_TOTAL_NET_ASSETS',
        'STATUTORY_MONTHLY_DISCLOSURE',
        'AUTHORIZED_LICENSED_PROVIDER',
      ],
      default: 'OFFICIAL_AMC_DISCLOSURE',
    },
    asOfDate: {
      type: Date,
      required: true,
    },
    sourceName: {
      type: String,
      trim: true,
      default: null,
    },
    sourceDocument: {
      type: String,
      trim: true,
      default: null,
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    sourceType: {
      type: String,
      enum: ['AMC_MONTHLY_PORTFOLIO', 'STATUTORY_PORTFOLIO_STATEMENT', 'FACTSHEET', 'LICENSED_PROVIDER'],
      default: 'AMC_MONTHLY_PORTFOLIO',
    },
  },
  { _id: false }
);

const MfSchemePortfolioSnapshotSchema = new mongoose.Schema(
  {
    schemeCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    isin: {
      type: String,
      required: true,
      trim: true,
      index: true,
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
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    planType: {
      type: String,
      enum: ['REGULAR', 'DIRECT'],
      default: 'REGULAR',
      index: true,
    },
    option: {
      type: String,
      enum: ['GROWTH', 'IDCW', 'BONUS'],
      default: 'GROWTH',
      index: true,
    },
    asOfDate: {
      type: Date,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    sourceDocument: {
      type: String,
      trim: true,
      default: null,
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    sourceType: {
      type: String,
      enum: ['AMC_MONTHLY_PORTFOLIO', 'STATUTORY_PORTFOLIO_STATEMENT', 'FACTSHEET', 'LICENSED_PROVIDER'],
      default: 'AMC_MONTHLY_PORTFOLIO',
    },
    holdingsAvailable: {
      type: Boolean,
      default: true,
    },
    isPartial: {
      type: Boolean,
      default: false,
    },
    totalHoldingsCount: {
      type: Number,
      default: null,
    },
    displayedCount: {
      type: Number,
      default: null,
    },
    portfolioStatus: {
      type: String,
      enum: [
        'SOURCE_AVAILABLE_AND_VERIFIED',
        'SOURCE_AVAILABLE_BUT_PARSER_FAILED',
        'SOURCE_PARTIAL',
        'SOURCE_NOT_AVAILABLE',
        'VERIFIED',
        'SOURCE_UNAVAILABLE',
      ],
      default: 'SOURCE_AVAILABLE_AND_VERIFIED',
    },
    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
    holdings: {
      type: [HoldingItemSchema],
      default: [],
    },
    ingestedAt: {
      type: Date,
      default: Date.now,
    },
    parserVersion: {
      type: String,
      default: 'v1.0.0',
    },
    checksum: {
      type: String,
      default: null,
    },
    totalPortfolioNetAssets: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index to guarantee database integrity
MfSchemePortfolioSnapshotSchema.index(
  { schemeCode: 1, isin: 1, planType: 1, option: 1, asOfDate: 1 },
  { unique: true }
);

module.exports = mongoose.model('MfSchemePortfolioSnapshot', MfSchemePortfolioSnapshotSchema);
