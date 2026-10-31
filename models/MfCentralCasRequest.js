const mongoose = require('mongoose');

const MfCentralCasRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientRefNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reqId: {
      type: String,
      index: true,
      default: '',
    },
    pan: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['INITIATED', 'PENDING_OTP', 'COMPLETED', 'FAILED', 'EXPIRED'],
      default: 'INITIATED',
      index: true,
    },
    casType: {
      type: String,
      enum: ['SUMMARY', 'TRANSACTIONS'],
      default: 'SUMMARY',
    },
    fromDate: {
      type: String,
      default: '',
    },
    toDate: {
      type: String,
      default: '',
    },
    authUrl: {
      type: String,
      default: '',
    },
    redirectUrl: {
      type: String,
      default: '',
    },
    summary: {
      totalFolios: { type: Number, default: 0 },
      totalSchemes: { type: Number, default: 0 },
      totalCurrentValue: { type: Number, default: 0 },
      totalCostValue: { type: Number, default: 0 },
      totalUnrealizedGain: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
    },
    failureReason: {
      type: String,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfCentralCasRequest', MfCentralCasRequestSchema);
