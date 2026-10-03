const mongoose = require('mongoose');

const MfAuditLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['ORDER', 'SIP', 'MANDATE', 'HOLDING', 'TRANSACTION', 'CAPITAL_GAIN', 'RECONCILIATION'],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    source: {
      type: String,
      required: true, // e.g. 'RAZORPAY_WEBHOOK', 'NSE_ALLOTMENT_FEED', 'USER_ACTION', 'ADMIN_RESOLVER'
    },
    externalReference: {
      type: String,
      default: null,
      index: true,
    },
    actor: {
      type: String,
      default: 'SYSTEM',
    },
    reason: {
      type: String,
      default: '',
    },
    idempotencyKey: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfAuditLog', MfAuditLogSchema);
