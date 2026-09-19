const mongoose = require('mongoose');

const MfMandateSchema = new mongoose.Schema(
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
    mandateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    umrn: {
      type: String,
      default: '',
    },
    amount: {
      type: Number,
      default: 50000,
    },
    mandateType: {
      type: String,
      enum: ['E', 'X'], // E: eNACH, X: Physical/Scan
      default: 'E',
    },
    accountNo: {
      type: String,
      required: true,
    },
    ifsc: {
      type: String,
      required: true,
    },
    bankName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'APPROVED',
    },
    authLink: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfMandate', MfMandateSchema);
