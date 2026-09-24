const mongoose = require('mongoose');

const NseConfigSchema = new mongoose.Schema(
  {
    env: {
      type: String,
      enum: ['UAT', 'PROD'],
      default: process.env.NSE_ENV || 'UAT',
    },
    memberCode: {
      type: String,
      default: process.env.NSE_MEMBER_CODE || '1031616',
      trim: true,
    },
    loginUserId: {
      type: String,
      default: process.env.NSE_LOGIN_USER_ID || 'ADMIN',
      trim: true,
    },
    apiSecret: {
      type: String,
      default: process.env.NSE_API_SECRET || '',
      trim: true,
    },
    licenseKey: {
      type: String,
      default: process.env.NSE_MEMBER_LICENSE_KEY || '',
      trim: true,
    },
    mockMode: {
      type: Boolean,
      default: process.env.NSE_MOCK_MODE !== 'false',
    },
    lastTestedAt: {
      type: Date,
    },
    lastStatus: {
      type: String,
      default: 'NOT_CHECKED',
    },
    lastLatencyMs: {
      type: Number,
      default: 0,
    },
    lastResponse: {
      type: String,
      default: '',
    },
    lastError: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

NseConfigSchema.statics.getEffectiveConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      env: process.env.NSE_ENV || 'UAT',
      memberCode: process.env.NSE_MEMBER_CODE || '1031616',
      loginUserId: process.env.NSE_LOGIN_USER_ID || 'ADMIN',
      apiSecret: process.env.NSE_API_SECRET || '',
      licenseKey: process.env.NSE_MEMBER_LICENSE_KEY || '',
      mockMode: process.env.NSE_MOCK_MODE !== 'false',
    });
  }
  return config;
};

module.exports = mongoose.model('NseConfig', NseConfigSchema);
