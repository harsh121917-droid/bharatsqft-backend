const mongoose = require('mongoose');

const MfSipSchema = new mongoose.Schema(
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
    sipRegNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sipRefNo: {
      type: String,
      default: '',
      index: true,
    },
    schemeCode: {
      type: String,
      required: true,
    },
    schemeName: {
      type: String,
      required: true,
    },
    frequency: {
      type: String,
      enum: ['MONTHLY', 'WEEKLY', 'DAILY', 'QUARTERLY'],
      default: 'MONTHLY',
    },
    installmentAmount: {
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    nextDueDate: {
      type: Date,
    },
    mandateId: {
      type: String,
      default: '',
    },
    installmentsPaid: {
      type: Number,
      default: 0,
    },
    totalAmountPaid: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'CANCELLED'],
      default: 'PENDING_PAYMENT',
    },
    stepUpRequired: {
      type: Boolean,
      default: false,
    },
    stepUpAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfSip', MfSipSchema);
