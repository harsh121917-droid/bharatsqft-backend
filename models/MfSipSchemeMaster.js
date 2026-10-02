const mongoose = require('mongoose');

/**
 * NSE MFSS SIP Scheme Master Model
 * Sourced directly from NSE Master Download (file_type: 'SIP')
 * Specification Reference: NSE_MF_WebfileStructure.pdf (Page 79-80)
 */
const MfSipSchemeMasterSchema = new mongoose.Schema(
  {
    amcCode: {
      type: String,
      trim: true,
      index: true,
    },
    amcName: {
      type: String,
      trim: true,
    },
    schemeCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    sipTransactionMode: {
      type: String,
      trim: true, // e.g. D = Demat, P = Physical
    },
    sipFrequency: {
      type: String,
      trim: true,
      index: true, // e.g. MONTHLY, QUARTERLY, WEEKLY, DAILY
    },
    sipDates: {
      type: String,
      trim: true, // e.g. "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28"
    },
    sipMinimumGap: {
      type: Number,
      default: null,
    },
    sipMaximumGap: {
      type: Number,
      default: null,
    },
    sipInstallmentGap: {
      type: Number,
      default: null,
    },
    sipStatus: {
      type: String,
      trim: true, // e.g. '1' = Active
    },
    minInstallmentAmount: {
      type: Number,
      default: null,
    },
    maxInstallmentAmount: {
      type: Number,
      default: null,
    },
    multiplierAmount: {
      type: Number,
      default: null,
    },
    minInstallmentNumbers: {
      type: Number,
      default: null,
    },
    maxInstallmentNumbers: {
      type: Number,
      default: null,
    },
    isin: {
      type: String,
      trim: true,
      index: true,
    },
    schemeType: {
      type: String,
      trim: true,
    },
    pauseFlag: {
      type: String,
      default: 'N',
      trim: true,
    },
    pauseMinInstallments: {
      type: Number,
      default: null,
    },
    pauseMaxInstallments: {
      type: Number,
      default: null,
    },
    pauseModificationCount: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

MfSipSchemeMasterSchema.index({ schemeCode: 1, sipFrequency: 1 }, { unique: false });
MfSipSchemeMasterSchema.index({ isin: 1, sipFrequency: 1 });

module.exports = mongoose.model('MfSipSchemeMaster', MfSipSchemeMasterSchema);
