process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
require('dotenv').config();

const mfController = require('../controllers/mutualFundsController');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSipSchemeMaster = require('../models/MfSipSchemeMaster');
const MfClientUcc = require('../models/MfClientUcc');
const MfMandate = require('../models/MfMandate');
const MfSip = require('../models/MfSip');
const User = require('../models/User');
const Kyc = require('../models/Kyc');
const BankAccount = require('../models/BankAccount');

describe('Mutual Funds SIP Frequency (Daily, Weekly, Monthly) Tests', () => {
  let testUser;
  let testUcc;
  let testMandate;
  const timestamp = Date.now();

  before(async () => {
    const nseClient = require('../services/nse/nseClient');
    nseClient.mockModeOverride = true;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    testUser = await User.create({
      name: `Test User ${timestamp}`,
      email: `testuser_${timestamp}@example.com`,
      phone: `999${String(timestamp).slice(-7)}`,
      password: 'password123',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    const pan = 'ABCDE1234F';

    testUcc = await MfClientUcc.create({
      user: testUser._id,
      clientCode: `VKFREQ_${timestamp}`.slice(0, 10),
      fullName: testUser.name,
      pan,
      nseStatus: 'ACTIVE',
      defaultMandateId: `MND_${timestamp}`,
      primaryBank: {
        accountNo: '110058166003',
        ifsc: 'CNRB0019354',
        bankName: 'Canara Bank',
        accountType: 'SB',
      },
    });

    await Kyc.create({
      user: testUser._id,
      panNumber: pan,
      fullName: testUser.name,
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
    });

    await BankAccount.create({
      user: testUser._id,
      accountHolder: testUser.name,
      accountNumber: '110058166003',
      ifsc: 'CNRB0019354',
      bankName: 'Canara Bank',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: testUser.name.toUpperCase(),
    });

    testMandate = await MfMandate.create({
      user: testUser._id,
      clientCode: testUcc.clientCode,
      mandateId: `MND_${timestamp}`,
      status: 'APPROVED',
      umrn: `UMRN_${timestamp}`,
      amount: 50000,
      accountNo: '110058166003',
      ifsc: 'CNRB0019354',
      bankName: 'Canara Bank',
    });
  });

  after(async () => {
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await Kyc.deleteMany({ user: testUser._id });
      await BankAccount.deleteMany({ user: testUser._id });
    }
    if (testUcc) await MfClientUcc.deleteOne({ _id: testUcc._id });
    if (testMandate) await MfMandate.deleteOne({ _id: testMandate._id });
    await MfSip.deleteMany({ user: testUser?._id });
    await mongoose.disconnect();
  });

  test('1. getSchemeSipOptions returns accurate supported frequencies for TRUSTMF (Weekly, Monthly)', async () => {
    let statusCode = 200;
    let resData = null;
    const req = { params: { code: '152940' } };
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await mfController.getSchemeSipOptions(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resData?.success, true);
    assert.ok(Array.isArray(resData?.data?.supportedFrequencies));
    assert.ok(resData.data.supportedFrequencies.includes('WEEKLY'));
    assert.ok(resData.data.supportedFrequencies.includes('MONTHLY'));
    assert.strictEqual(resData.data.supportedFrequencies.includes('DAILY'), false);
  });

  test('2. getSchemeDetail includes supportedFrequencies and sipOptions in investmentRules', async () => {
    let statusCode = 200;
    let resData = null;
    const req = { params: { code: '152940' } };
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await mfController.getSchemeDetail(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resData?.success, true);
    const rules = resData?.data?.investmentRules;
    assert.ok(Array.isArray(rules?.supportedFrequencies));
    assert.ok(rules.supportedFrequencies.includes('WEEKLY'));
    assert.ok(Array.isArray(rules?.sipOptions));
  });

  test('3. Registering DAILY SIP on a scheme that only supports Weekly/Monthly is rejected with SIP_FREQUENCY_NOT_SUPPORTED', async () => {
    let statusCode = 200;
    let resData = null;
    const req = {
      user: testUser,
      body: {
        schemeCode: '152940',
        installmentAmount: 1000,
        frequency: 'DAILY',
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await mfController.registerSipOrder(req, res);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(resData?.success, false);
    assert.strictEqual(resData?.code, 'SIP_FREQUENCY_NOT_SUPPORTED');
  });

  test('4. Registering WEEKLY SIP on TRUSTMF (supported) succeeds and persists WEEKLY frequency', async () => {
    let statusCode = 200;
    let resData = null;
    const req = {
      user: testUser,
      body: {
        schemeCode: '152940',
        installmentAmount: 1000,
        frequency: 'WEEKLY',
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        firstOrderToday: true,
      },
    };
    const res = {
      status(c) { statusCode = c; return this; },
      json(d) { resData = d; return this; },
    };

    await mfController.registerSipOrder(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resData?.success, true);
    assert.strictEqual(resData?.data?.sip?.frequency, 'WEEKLY');
  });
});
