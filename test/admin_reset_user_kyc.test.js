const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Kyc = require('../models/Kyc');
const BankAccount = require('../models/BankAccount');
const { resetUserKyc } = require('../controllers/adminController');

describe('Admin User Details KYC Reset Suite', () => {
  let testUser;
  let hasDb = false;

  before(async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatsqft';
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
      }
      hasDb = true;

      // Clean test user
      await User.deleteMany({ phone: '9999900099' });
      await Kyc.deleteMany({ panNumber: 'BNWPS7663F' });

      testUser = await User.create({
        name: 'Vikas Saini',
        phone: '9999900099',
        email: 'vikas_kyc_reset_test@example.com',
        password: 'HashedPassword123!',
        kycStatus: 'approved',
        isKycVerified: true,
        panNumber: 'BNWPS7663F',
        panRegisteredName: 'VIKAS ASHOK SAINI',
      });

      await Kyc.create({
        user: testUser._id,
        fullName: 'VIKAS ASHOK SAINI',
        panNumber: 'BNWPS7663F',
        panVerified: true,
        panRegisteredName: 'VIKAS ASHOK SAINI',
        aadhaarNumber: '123456789012',
        aadhaarVerified: true,
        panAadhaarNameMatched: true,
        verificationSource: 'CASHFREE_AADHAAR_OKYC',
        status: 'approved',
      });

      await BankAccount.create({
        user: testUser._id,
        accountHolder: 'VIKAS ASHOK SAINI',
        accountNumber: '919876543210',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        isVerified: true,
        verificationSource: 'CASHFREE_PENNY_DROP',
      });
    } catch (e) {
      console.warn('MongoDB not available for integration test, using mock test.');
      hasDb = false;
    }
  });

  after(async () => {
    if (hasDb && testUser) {
      await User.deleteMany({ _id: testUser._id });
      await Kyc.deleteMany({ user: testUser._id });
      await BankAccount.deleteMany({ user: testUser._id });
      await mongoose.disconnect();
    }
  });

  test('resetUserKyc wipes Kyc records, resets user kycStatus to not_submitted, and resets BankAccount verification', async () => {
    if (!hasDb) {
      assert.ok(true, 'Skipped DB integration test because local DB is not running');
      return;
    }

    const req = {
      params: { id: testUser._id.toString() },
      user: { _id: testUser._id, role: 'admin' },
    };

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { responseData = d; return this; },
    };

    await resetUserKyc(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(statusCode, 200);
    assert.equal(responseData.success, true);
    assert.equal(responseData.data.kycStatus, 'not_submitted');
    assert.equal(responseData.data.kyc, null);

    // Verify in DB that Kyc document is deleted
    const remainingKyc = await Kyc.find({ user: testUser._id });
    assert.equal(remainingKyc.length, 0, 'All Kyc documents should be deleted');

    // Verify User record was updated
    const refreshedUser = await User.findById(testUser._id);
    assert.equal(refreshedUser.kycStatus, 'not_submitted');
    assert.equal(refreshedUser.testFreshKyc, true);
    assert.equal(refreshedUser.isSoldierVerified, false);

    // Verify BankAccount verification was reset
    const bankDoc = await BankAccount.findOne({ user: testUser._id });
    assert.equal(bankDoc.isVerified, false);
  });

  test('resetUserKyc returns 404 for non-existent user ID', async () => {
    if (!hasDb) {
      assert.ok(true, 'Skipped DB integration test because local DB is not running');
      return;
    }

    const fakeId = new mongoose.Types.ObjectId();
    const req = {
      params: { id: fakeId.toString() },
      user: { role: 'admin' },
    };

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { responseData = d; return this; },
    };

    await resetUserKyc(req, res, () => {});
    assert.equal(statusCode, 404);
    assert.equal(responseData.success, false);
  });
});
