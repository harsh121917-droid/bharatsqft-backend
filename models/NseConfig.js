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
      default: process.env.NSE_MEMBER_CODE || '',
      trim: true,
    },
    loginUserId: {
      type: String,
      default: process.env.NSE_LOGIN_USER_ID || '',
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
      default: process.env.NODE_ENV === 'test',
    },
    mfDataSource: {
      type: String,
      enum: ['TIGZIG', 'LEGACY'],
      default: 'TIGZIG',
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

let cachedDataSource = null;
let lastCacheTime = 0;

NseConfigSchema.statics.getMfDataSource = async function () {
  const now = Date.now();
  if (cachedDataSource && (now - lastCacheTime < 10000)) {
    return cachedDataSource;
  }
  try {
    const config = await this.findOne().select('mfDataSource').lean();
    cachedDataSource = config?.mfDataSource || 'TIGZIG';
    lastCacheTime = now;
    return cachedDataSource;
  } catch (_) {
    return cachedDataSource || 'TIGZIG';
  }
};

NseConfigSchema.statics.invalidateCache = function () {
  cachedDataSource = null;
  lastCacheTime = 0;
};

NseConfigSchema.statics.getEffectiveConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      env: process.env.NSE_ENV || 'UAT',
      memberCode: process.env.NSE_MEMBER_CODE || '',
      loginUserId: process.env.NSE_LOGIN_USER_ID || '',
      apiSecret: process.env.NSE_API_SECRET || '',
      licenseKey: process.env.NSE_MEMBER_LICENSE_KEY || '',
      mockMode: process.env.NODE_ENV === 'test',
      mfDataSource: 'TIGZIG',
    });
  }
  return config;
};

module.exports = mongoose.model('NseConfig', NseConfigSchema);
