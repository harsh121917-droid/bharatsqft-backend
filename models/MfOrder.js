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
    redeemMode: {
      type: String,
      enum: ['UNITS', 'AMOUNT'],
      default: 'UNITS',
    },
    requestedUnits: {
      type: Number,
      default: null,
    },
    requestedAmount: {
      type: Number,
      default: null,
    },
    redemptionUnits: {
      type: Number,
      default: 0,
    },
    allUnits: {
      type: Boolean,
      default: false,
    },
    folioNo: {
      type: String,
      default: '',
    },
    isin: {
      type: String,
      default: '',
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
    estimatedUnits: {
      type: Number,
      default: null,
    },
    allottedUnits: {
      type: Number,
      default: 0,
    },
    allottedNav: {
      type: Number,
      default: null,
    },
    allotmentDate: {
      type: Date,
      default: null,
    },
    orderStatus: {
      type: String,
      enum: [
        'CREATED',
        'PAYMENT_PENDING',
        'PAYMENT_SUCCESS',
        'SUBMITTED',
        'PROCESSING',
        'ALLOTTED',
        'PARTIALLY_ALLOTTED',
        'FAILED',
        'REJECTED',
        'CANCELLED',
        'REFUNDED',
      ],
      default: 'CREATED',
      index: true,
    },
    planType: {
      type: String,
      enum: ['REGULAR'],
      default: 'REGULAR',
      required: true,
    },
    allotmentStatus: {
      type: String,
      enum: ['PENDING', 'ALLOTTED', 'PARTIALLY_ALLOTTED', 'REJECTED', 'NOT_APPLICABLE'],
      default: 'PENDING',
      index: true,
    },
    estimatedPayout: {
      type: Number,
      default: null,
    },
    finalSettledAmount: {
      type: Number,
      default: null,
    },
    settlementDate: {
      type: Date,
      default: null,
    },
    rtaReferenceNo: {
      type: String,
      default: null,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    units: {
      type: Number,
      default: 0, // Strictly 0 until verified via Exchange Allotment Statement Report
    },
    navAtOrder: {
      type: Number,
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ['NSE_PAYMENT_LINK', 'UPI', 'NETBANKING', 'MANDATE', 'NEFT', 'WALLET', 'RAZORPAY', 'DIRECT_AMC_PAYOUT'],
      default: 'NSE_PAYMENT_LINK',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
    },
    // DEPRECATED: Historical Razorpay fields retained for backward compatibility with legacy DB records.
    // New MF purchases strictly use NSE MF II payment links.
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
    nsePaymentRefNo: {
      type: String,
      default: '',
    },
    nsePaymentStatus: {
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
