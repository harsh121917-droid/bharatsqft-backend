const mongoose = require('mongoose');

const MfSystematicPlanSchema = new mongoose.Schema(
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
    planType: {
      type: String,
      enum: ['STP', 'SWP'],
      required: true,
      index: true,
    },
    regNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceSchemeCode: {
      type: String,
      required: true,
      index: true,
    },
    sourceSchemeName: {
      type: String,
      required: true,
    },
    targetSchemeCode: {
      type: String,
      default: '', // For STP
    },
    targetSchemeName: {
      type: String,
      default: '', // For STP
    },
    frequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'],
      default: 'MONTHLY',
    },
    amount: {
      type: Number,
      required: true,
    },
    units: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    nextExecutionDate: {
      type: Date,
    },
    tenureMonths: {
      type: Number,
      default: 36,
    },
    installmentsCompleted: {
      type: Number,
      default: 0,
    },
    totalAmountTransferred: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    nseRegistrationId: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfSystematicPlan', MfSystematicPlanSchema);
