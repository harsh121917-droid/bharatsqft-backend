const mongoose = require('mongoose');

const PortfolioHoldingItemSchema = new mongoose.Schema(
  {
    securityName: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: function () {
        return this.securityName;
      },
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
      enum: [
        'EQUITY',
        'DEBT',
        'GOVERNMENT_SECURITY',
        'MONEY_MARKET',
        'REPO',
        'REVERSE_REPO',
        'TREPS',
        'CASH',
        'CASH_EQUIVALENT',
        'ETF',
        'MUTUAL_FUND',
        'DERIVATIVE',
        'REIT_INVIT',
        'GOLD',
        'OTHER',
        'NET_CURRENT_ASSETS',
        'Equity',
        'Debt',
        'Sovereign',
        'Cash & Cash Equivalents',
        'Derivatives',
        'Commodity',
        'Other',
      ],
      default: 'EQUITY',
    },
    sourceAssetClass: {
      type: String,
      trim: true,
      default: null,
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
      default: null,
    },
    sourceWeightText: {
      type: String,
      trim: true,
      default: null,
    },
    weightDisplay: {
      type: String,
      trim: true,
      default: null,
    },
    weightRank: {
      type: Number,
      default: null,
    },
    sourceRowNumber: {
      type: Number,
      default: null,
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
    rating: {
      type: String,
      trim: true,
      default: null,
    },
    maturityDate: {
      type: Date,
      default: null,
    },
    coupon: {
      type: Number,
      default: null,
    },
    sourceOrder: {
      type: Number,
      default: null,
    },
    sourceRow: {
      type: Number,
      default: null,
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

const MutualFundPortfolioSnapshotSchema = new mongoose.Schema(
  {
    schemeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MutualFundScheme',
      default: null,
    },
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
    portfolioAsOf: {
      type: Date,
      required: true,
      index: true,
      default: function () {
        return this.asOfDate;
      },
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
    sourceDocumentId: {
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
    sourceHash: {
      type: String,
      default: null,
    },
    checksum: {
      type: String,
      default: null,
    },
    parserVersion: {
      type: String,
      default: 'v1.0.0',
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
        'COMPLETE_VERIFIED',
        'PARTIAL_SOURCE',
        'SOURCE_AVAILABLE_AND_VERIFIED',
        'SOURCE_AVAILABLE_BUT_PARSER_FAILED',
        'SOURCE_PARTIAL',
        'SOURCE_NOT_AVAILABLE',
        'SOURCE_UNAVAILABLE',
        'IDENTITY_UNRESOLVED',
        'PARSER_FAILED',
        'VALIDATION_FAILED',
        'STALE',
        'VERIFIED',
      ],
      default: 'COMPLETE_VERIFIED',
    },
    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
    totalPortfolioPositions: {
      type: Number,
      default: null,
    },
    equitySecurityCount: {
      type: Number,
      default: 0,
    },
    debtSecurityCount: {
      type: Number,
      default: 0,
    },
    moneyMarketCount: {
      type: Number,
      default: 0,
    },
    repoCount: {
      type: Number,
      default: 0,
    },
    cashEquivalentCount: {
      type: Number,
      default: 0,
    },
    derivativePositionCount: {
      type: Number,
      default: 0,
    },
    otherPositionCount: {
      type: Number,
      default: 0,
    },
    holdings: {
      type: [PortfolioHoldingItemSchema],
      default: [],
    },
    ingestedAt: {
      type: Date,
      default: Date.now,
    },
    totalPortfolioNetAssets: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index
MutualFundPortfolioSnapshotSchema.index(
  { schemeCode: 1, isin: 1, planType: 1, option: 1, asOfDate: 1 },
  { unique: true }
);

const modelName = 'MutualFundPortfolioSnapshot';
module.exports =
  mongoose.models[modelName] ||
  mongoose.model(modelName, MutualFundPortfolioSnapshotSchema, 'mfschemeportfoliosnapshots');
