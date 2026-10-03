const mongoose = require('mongoose');

const MfCapitalGainSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    redemptionOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MfOrder',
      required: true,
      index: true,
    },
    purchaseTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MfTransaction',
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
    category: {
      type: String,
      default: 'Equity',
    },
    planType: {
      type: String,
      enum: ['REGULAR'],
      default: 'REGULAR',
    },
    unitsRedeemed: {
      type: Number,
      required: true,
    },
    purchaseDate: {
      type: Date,
      required: true,
    },
    redemptionDate: {
      type: Date,
      required: true,
      index: true,
    },
    holdingDays: {
      type: Number,
      required: true,
    },
    purchaseNav: {
      type: Number,
      required: true,
    },
    redemptionNav: {
      type: Number,
      required: true,
    },
    purchaseCost: {
      type: Number,
      required: true,
    },
    redemptionProceeds: {
      type: Number,
      required: true,
    },
    realizedGain: {
      type: Number,
      required: true, // proceeds - cost
    },
    gainType: {
      type: String,
      enum: ['STCG', 'LTCG'],
      required: true,
      index: true,
    },
    financialYear: {
      type: String,
      required: true,
      index: true, // e.g. "2026-2027"
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfCapitalGain', MfCapitalGainSchema);
