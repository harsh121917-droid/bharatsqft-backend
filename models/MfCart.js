const mongoose = require('mongoose');

const MfCartItemSchema = new mongoose.Schema(
  {
    schemeCode: {
      type: String,
      required: true,
      trim: true,
    },
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    amcName: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      default: '',
    },
    investmentType: {
      type: String,
      enum: ['SIP', 'LUMPSUM'],
      default: 'SIP',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    frequency: {
      type: String,
      enum: ['MONTHLY', 'WEEKLY', 'QUARTERLY'],
      default: 'MONTHLY',
    },
    sipDay: {
      type: Number,
      default: 5,
    },
    folioNo: {
      type: String,
      default: '',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const MfCartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: [MfCartItemSchema],
  },
  { timestamps: true }
);

// Virtual for total amount
MfCartSchema.virtual('totalAmount').get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((sum, item) => sum + (item.amount || 0), 0);
});

MfCartSchema.set('toJSON', { virtuals: true });
MfCartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('MfCart', MfCartSchema);
