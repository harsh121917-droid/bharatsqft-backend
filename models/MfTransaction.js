const mongoose = require('mongoose');

const MfTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MfOrder',
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
    planType: {
      type: String,
      enum: ['REGULAR'],
      default: 'REGULAR',
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['PURCHASE', 'SIP_INSTALLMENT', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT', 'REVERSAL'],
      required: true,
      index: true,
    },
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },
    orderAmount: {
      type: Number,
      required: true,
    },
    units: {
      type: Number,
      required: true, // Positive for purchases/switch-in, negative for redemption/switch-out
    },
    nav: {
      type: Number,
      required: true,
    },
    navDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['CONFIRMED', 'SETTLED', 'REVERSED'],
      default: 'CONFIRMED',
      index: true,
    },
    externalReference: {
      type: String,
      default: null,
      sparse: true,
      index: true, // Exchange or RTA allotment statement reference number
    },
    fifoRemainingUnits: {
      type: Number,
      default: 0, // Remaining unredeemed units for FIFO capital gains tracking
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Idempotency guarantee: prevent duplicate transaction entry for the same order and transaction type
MfTransactionSchema.index({ order: 1, transactionType: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('MfTransaction', MfTransactionSchema);
