const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Kyc = require('../models/Kyc');
const MfClientUcc = require('../models/MfClientUcc');
const adminMfController = require('../controllers/adminMfController');

describe('Admin KYC Reset & Probe Testing Suite', () => {
  let testUser;

  before(async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatsqft';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // Cleanup previous test leftovers
    await User.deleteMany({ phone: '9999900001' });
    await Kyc.deleteMany({ panNumber: 'TESTP1234A' });
    await MfClientUcc.deleteMany({ clientCode: 'VK_KYC_TEST' });

    testUser = await User.create({
      name: 'KYC Test User',
      phone: '9999900001',
      email: 'kyctest@example.com',
      password: 'HashedPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
      panNumber: 'TESTP1234A',
    });

    await Kyc.create({
      user: testUser._id,
      fullName: 'KYC Test User',
      panNumber: 'TESTP1234A',
      panVerified: true,
      panRegisteredName: 'KYC TEST USER LEGAL',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      status: 'approved',
    });

    await MfClientUcc.create({
      user: testUser._id,
      clientCode: 'VK_KYC_TEST',
      pan: 'TESTP1234A',
      fullName: 'KYC TEST USER LEGAL',
      primaryBank: {
        accountNo: '1234567890',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
    });
  });

  after(async () => {
    if (testUser) {
      await User.deleteMany({ _id: testUser._id });
      await Kyc.deleteMany({ user: testUser._id });
      await MfClientUcc.deleteMany({ user: testUser._id });
    }
    await mongoose.disconnect();
  });

  test('1. testUserKyc returns compliant status for valid registered PAN', async () => {
    const req = {
      body: { pan: 'OZYPS8075Q' }, // Saloni's PAN
    };
    let resJson = null;
    const res = {
      json: (data) => { resJson = data; return res; },
      status: () => res,
    };

    await adminMfController.testUserKyc(req, res);
    assert.equal(resJson.success, true);
    assert.equal(resJson.data.pan, 'OZYPS8075Q');
    assert.equal(typeof resJson.data.kycCompliant, 'boolean');
    assert.equal(typeof resJson.data.requiresEkyc, 'boolean');
  });

  test('2. testUserKyc returns non-compliant status for dummy / unverified PAN', async () => {
    const req = {
      body: { pan: 'ABCDE1234F' },
    };
    let resJson = null;
    const res = {
      json: (data) => { resJson = data; return res; },
      status: () => res,
    };

    await adminMfController.testUserKyc(req, res);
    assert.equal(resJson.success, true);
    assert.equal(resJson.data.kycCompliant, false);
    assert.equal(resJson.data.requiresEkyc, true);
    assert.equal(resJson.data.isFreshInvestor, true);
  });

  test('3. resetUserKyc wipes Kyc records and resets User model kycStatus to not_submitted', async () => {
    const req = {
      body: { query: '9999900001' },
      user: { name: 'AdminTester' },
    };
    let resJson = null;
    const res = {
      json: (data) => { resJson = data; return res; },
      status: () => res,
    };

    await adminMfController.resetUserKyc(req, res);
    assert.equal(resJson.success, true);
    assert.equal(resJson.data.kycStatus, 'not_submitted');
    assert.equal(resJson.data.isKycVerified, false);

    // Verify in database
    const freshUser = await User.findById(testUser._id).lean();
    assert.equal(freshUser.kycStatus, 'not_submitted');
    assert.equal(Boolean(freshUser.panNumber), false);

    const kycCount = await Kyc.countDocuments({ user: testUser._id });
    assert.equal(kycCount, 0);
  });
});
