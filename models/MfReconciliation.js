const mongoose = require('mongoose');

const MfReconciliationSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    executedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    executedBy: {
      type: String,
      enum: ['CRON_NIGHTLY', 'ADMIN_MANUAL'],
      default: 'CRON_NIGHTLY',
    },
    totalOrdersChecked: {
      type: Number,
      default: 0,
    },
    totalSipsChecked: {
      type: Number,
      default: 0,
    },
    mismatchesCount: {
      type: Number,
      default: 0,
    },
    discrepancies: [
      {
        refId: { type: String, required: true },
        type: {
          type: String,
          enum: ['ORDER', 'SIP', 'PAYMENT', 'EXCHANGE', 'ALLOTMENT', 'HOLDING', 'SETTLEMENT'],
          default: 'ORDER',
          required: true,
        },
        discrepancyStatus: {
          type: String,
          enum: ['MATCHED', 'MISMATCH', 'MISSING_LOCAL', 'MISSING_EXTERNAL', 'DUPLICATE', 'PENDING_REVIEW', 'RESOLVED'],
          default: 'MISMATCH',
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: { type: String, default: '' },
        schemeCode: { type: String, default: '' },
        schemeName: { type: String, default: '' },
        amount: { type: Number, default: 0 },
        units: { type: Number, default: 0 },
        vikaoneStatus: { type: String, default: '' },
        nseStatus: { type: String, default: '' },
        description: { type: String, default: '' },
        resolved: { type: Boolean, default: false },
        resolvedAt: { type: Date },
        resolvedBy: { type: String, default: null },
        resolutionReason: { type: String, default: '' },
        autoResolved: { type: Boolean, default: false },
      },
    ],
    status: {
      type: String,
      enum: ['CLEAN', 'DISCREPANCIES_FOUND', 'FAILED'],
      default: 'CLEAN',
      index: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    summary: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfReconciliation', MfReconciliationSchema);
