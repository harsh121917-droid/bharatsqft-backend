const mongoose = require('mongoose');

const MfExternalHoldingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    casRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MfCentralCasRequest',
      required: true,
      index: true,
    },
    pan: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    amcCode: {
      type: String,
      default: '',
      trim: true,
    },
    amcName: {
      type: String,
      required: true,
      trim: true,
    },
    folioNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    schemeCode: {
      type: String,
      default: '',
      trim: true,
    },
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    isin: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      index: true,
    },
    rta: {
      type: String,
      enum: ['CAMS', 'KFINTECH', 'OTHER'],
      default: 'CAMS',
    },
    planType: {
      type: String,
      enum: ['REGULAR', 'DIRECT', 'UNKNOWN'],
      default: 'REGULAR',
    },
    optionType: {
      type: String,
      enum: ['GROWTH', 'IDCW_REINVEST', 'IDCW_PAYOUT', 'UNKNOWN'],
      default: 'GROWTH',
    },
    units: {
      type: Number,
      required: true,
      default: 0,
    },
    nav: {
      type: Number,
      default: 0,
    },
    navDate: {
      type: Date,
      default: null,
    },
    costValue: {
      type: Number,
      default: 0,
    },
    currentValue: {
      type: Number,
      required: true,
      default: 0,
    },
    unrealizedGain: {
      type: Number,
      default: 0,
    },
    unrealizedGainPct: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      default: 'MFCENTRAL_CAS',
    },
    holdingStatus: {
      type: String,
      enum: ['ACTIVE', 'REDEEMED'],
      default: 'ACTIVE',
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

MfExternalHoldingSchema.index({ user: 1, folioNumber: 1, isin: 1 }, { unique: true });

module.exports = mongoose.model('MfExternalHolding', MfExternalHoldingSchema);
