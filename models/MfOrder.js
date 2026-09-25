const mongoose = require('mongoose');

const MfOrderSchema = new mongoose.Schema(
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
    orderId: {
      type: String,
      required: true,
      unique: true,
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
    transactionType: {
      type: String,
      enum: ['P', 'R', 'S'], // P: Purchase, R: Redemption, S: Switch
      default: 'P',
    },
    redemptionUnits: {
      type: Number,
      default: 0,
    },
    allUnits: {
      type: Boolean,
      default: false,
    },
    targetSchemeCode: {
      type: String,
      default: '',
    },
    targetSchemeName: {
      type: String,
      default: '',
    },
    payoutStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING_AMC', 'PROCESSED', 'FAILED'],
      default: 'NOT_APPLICABLE',
    },
    payoutBank: {
      bankName: { type: String, default: '' },
      accountNo: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
    },
    buySellType: {
      type: String,
      enum: ['FRESH', 'ADDITIONAL'],
      default: 'FRESH',
    },
    orderAmount: {
      type: Number,
      required: true,
    },
    units: {
      type: Number,
      default: 0,
    },
    navAtOrder: {
      type: Number,
      default: 0,
    },
    paymentMode: {
      type: String,
      enum: ['UPI', 'NETBANKING', 'MANDATE', 'NEFT', 'WALLET', 'RAZORPAY'],
      default: 'UPI',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
    },
    razorpayOrderId: {
      type: String,
      default: '',
    },
    razorpayPaymentId: {
      type: String,
      default: '',
    },
    razorpaySignature: {
      type: String,
      default: '',
    },
    paymentLink: {
      type: String,
      default: '',
    },
    nseTrxnOrderId: {
      type: String,
      default: '',
    },
    nseStatus: {
      type: String,
      default: 'PENDING',
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfOrder', MfOrderSchema);
