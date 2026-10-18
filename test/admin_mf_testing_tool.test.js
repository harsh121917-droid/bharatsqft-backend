const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
require('dotenv').config();

// Models
const User = require('../models/User');
const Kyc = require('../models/Kyc');
const MfClientUcc = require('../models/MfClientUcc');
const MfMandate = require('../models/MfMandate');
const MfOrder = require('../models/MfOrder');
const MfSip = require('../models/MfSip');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const BankAccount = require('../models/BankAccount');
const MfAuditLog = require('../models/MfAuditLog');

// Admin Controller
const adminMfController = require('../controllers/adminMfController');

function mockReqRes(body = {}, params = {}, query = {}, user = null) {
  const req = {
    user: user || { _id: new mongoose.Types.ObjectId(), name: 'Super Admin', email: 'admin@vikaone.com' },
    body,
    params,
    query,
  };
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return { req, res };
}

describe('Admin MF Testing & Sandbox Reset Tools', () => {
  let testUser;
  const testPhone = '9998887766';
  const testEmail = 'sandboxtest@payvika.com';
  const testClientCode = 'SBX' + Date.now().toString().slice(-5);

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    // Clean any residual test data
    await User.deleteMany({ phone: testPhone });

    testUser = await User.create({
      name: 'Sandbox Tester',
      email: testEmail,
      phone: testPhone,
      password: 'password123',
      role: 'user',
    });
  });

  after(async () => {
    if (testUser) {
      await User.deleteMany({ _id: testUser._id });
      await MfClientUcc.deleteMany({ user: testUser._id });
      await Kyc.deleteMany({ user: testUser._id });
      await BankAccount.deleteMany({ user: testUser._id });
      await MfOrder.deleteMany({ user: testUser._id });
      await MfMandate.deleteMany({ user: testUser._id });
      await MfSip.deleteMany({ user: testUser._id });
      await MfPortfolioHolding.deleteMany({ user: testUser._id });
      await MfAuditLog.deleteMany({ user: testUser._id });
    }
  });

  it('1. Inspect empty MF test user returns clean initial state', async () => {
    const { req, res } = mockReqRes({}, {}, { query: testPhone });
    await adminMfController.inspectMfTestingUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.summary.hasUcc, false);
    assert.equal(res.data.data.summary.hasKyc, false);
    assert.equal(res.data.data.summary.bankCount, 0);
    assert.equal(res.data.data.summary.phone, testPhone);
  });

  it('2. Inspect resolves user by +91 phone prefix, email, and ObjectId', async () => {
    // By +91 phone
    const reqRes1 = mockReqRes({}, {}, { query: `+91${testPhone}` });
    await adminMfController.inspectMfTestingUser(reqRes1.req, reqRes1.res);
    assert.equal(reqRes1.res.statusCode, 200);
    assert.equal(reqRes1.res.data.data.user.phone, testPhone);

    // By Email
    const reqRes2 = mockReqRes({}, {}, { query: testEmail });
    await adminMfController.inspectMfTestingUser(reqRes2.req, reqRes2.res);
    assert.equal(reqRes2.res.statusCode, 200);
    assert.equal(reqRes2.res.data.data.user.email, testEmail);

    // By Mongo ObjectId
    const reqRes3 = mockReqRes({}, {}, { query: String(testUser._id) });
    await adminMfController.inspectMfTestingUser(reqRes3.req, reqRes3.res);
    assert.equal(reqRes3.res.statusCode, 200);
    assert.equal(reqRes3.res.data.data.user._id.toString(), String(testUser._id));
  });

  it('3. Inspect returns 404 for unknown user', async () => {
    const { req, res } = mockReqRes({}, {}, { query: '0000000000' });
    await adminMfController.inspectMfTestingUser(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.data.success, false);
  });

  it('4. Populating UCC, KYC, Bank, and Orders is faithfully reflected in inspection diagnostics', async () => {
    // Populate test records
    await MfClientUcc.create({
      user: testUser._id,
      clientCode: testClientCode,
      pan: 'ABCDE1234F',
      fullName: 'SANDBOX TESTER',
      dob: '01/01/1990',
      primaryBank: {
        accountNo: '1234567890',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
      nseStatus: 'ACTIVE',
    });

    await Kyc.create({
      user: testUser._id,
      panNumber: 'ABCDE1234F',
      panRegisteredName: 'SANDBOX TESTER',
      panVerified: true,
      verificationSource: 'MOCK_TEST_VERIFIED',
      status: 'approved',
    });

    await BankAccount.create({
      user: testUser._id,
      accountHolder: 'SANDBOX TESTER',
      accountNumber: '1234567890',
      ifsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      isVerified: true,
      isDefault: true,
    });

    await MfOrder.create({
      user: testUser._id,
      clientCode: testClientCode,
      orderId: 'ORD_TEST_991',
      schemeCode: '145139',
      schemeName: 'Bandhan Small Cap Fund',
      orderAmount: 1000,
      status: 'ORDER_PLACED',
    });

    // Inspect again
    const { req, res } = mockReqRes({}, {}, { query: testPhone });
    await adminMfController.inspectMfTestingUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.summary.hasUcc, true);
    assert.equal(res.data.data.summary.clientCode, testClientCode);
    assert.equal(res.data.data.summary.hasKyc, true);
    assert.equal(res.data.data.summary.kycVerified, true);
    assert.equal(res.data.data.summary.bankCount, 1);
    assert.equal(res.data.data.summary.ordersCount, 1);
  });

  it('5. Reset User MF Testing Data clears selected UCC, Orders, and KYC records', async () => {
    const { req, res } = mockReqRes({
      query: testPhone,
      clearUcc: true,
      clearOrders: true,
      clearMandates: true,
      clearHoldings: true,
      clearKyc: true,
      clearBank: false,
      adminReason: 'Unit testing sandbox reset',
    });

    await adminMfController.resetMfTestingUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.uccDeleted, 1);
    assert.equal(res.data.data.ordersDeleted, 1);
    assert.equal(res.data.data.kycReset, true);

    // Verify in database
    const uccCheck = await MfClientUcc.findOne({ user: testUser._id });
    assert.equal(uccCheck, null);

    const orderCheck = await MfOrder.findOne({ user: testUser._id });
    assert.equal(orderCheck, null);

    const kycCheck = await Kyc.findOne({ user: testUser._id });
    assert.equal(kycCheck, null);

    // Bank should remain because clearBank was false
    const bankCheck = await BankAccount.findOne({ user: testUser._id });
    assert.notEqual(bankCheck, null);

    // Verify MfAuditLog was recorded
    const audit = await MfAuditLog.findOne({
      user: testUser._id,
      event: 'ADMIN_RESET_TEST_USER',
    });
    assert.notEqual(audit, null);
    assert.equal(audit.source, 'ADMIN_MF_TESTING_TOOL');
  });

  it('6. cleanUserMfData works with phone number as userId parameter', async () => {
    // Re-create a test UCC
    await MfClientUcc.create({
      user: testUser._id,
      clientCode: 'CLN' + Date.now().toString().slice(-5),
      pan: 'ABCDE1234F',
      fullName: 'SANDBOX TESTER',
      dob: '01/01/1990',
      primaryBank: {
        accountNo: '1234567890',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
      nseStatus: 'ACTIVE',
    });

    const { req, res } = mockReqRes({}, { userId: testPhone });
    await adminMfController.cleanUserMfData(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.uccDeleted, 1);
  });

  it('7. generateNewClientCode generates fresh sequential client code and updates User', async () => {
    const { req, res } = mockReqRes({ query: testPhone });
    await adminMfController.generateNewClientCode(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.match(res.data.data.newClientCode, /^VK\d{6}$/);

    const updatedUser = await User.findById(testUser._id);
    assert.equal(updatedUser.mfClientCode, res.data.data.newClientCode);
    assert.equal(updatedUser.mfClientCodeAttempt, 1);
  });

  it('8. generateNewClientCode supports custom client code (e.g. VK088818)', async () => {
    const customCode = 'VK088818';
    const { req, res } = mockReqRes({ query: testPhone, customClientCode: customCode });
    await adminMfController.generateNewClientCode(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.newClientCode, customCode);

    const updatedUser = await User.findById(testUser._id);
    assert.equal(updatedUser.mfClientCode, customCode);
  });

  it('9. resetMfTestingUser with generateNewClientCode: true clears records and rotates client code', async () => {
    const { req, res } = mockReqRes({
      query: testPhone,
      clearUcc: true,
      generateNewClientCode: true,
      adminReason: 'Rotate client code on reset',
    });
    await adminMfController.resetMfTestingUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.notEqual(res.data.data.newClientCode, null);
    assert.match(res.data.data.newClientCode, /^VK/);
  });
});
