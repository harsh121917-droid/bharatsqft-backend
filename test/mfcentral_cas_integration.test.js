const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const User = require('../models/User');
const Kyc = require('../models/Kyc');
const MfClientUcc = require('../models/MfClientUcc');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfCentralCasRequest = require('../models/MfCentralCasRequest');
const MfExternalHolding = require('../models/MfExternalHolding');
const mfCentralController = require('../controllers/mfCentralController');

const mockReqRes = (options = {}) => {
  const req = {
    user: options.user || null,
    body: options.body || {},
    query: options.query || {},
    params: options.params || {},
    method: options.method || 'POST',
    ...options.extra,
  };

  const res = {
    statusCode: 200,
    body: null,
    sentText: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(text) {
      this.sentText = text;
      return this;
    },
  };

  return { req, res };
};

describe('MFCentral CAS Integration Tests', () => {
  let testUser;
  let testUserNoPan;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    }

    // Clean any prior test artifacts
    await User.deleteMany({ email: /^test_mfc_user_/ });
    await MfCentralCasRequest.deleteMany({ clientRefNo: /^CAS_TEST_/ });
    await MfExternalHolding.deleteMany({ pan: 'ABCDE9999F' });

    testUser = await User.create({
      name: 'MFCentral Investor',
      email: `test_mfc_user_${Date.now()}@test.com`,
      phone: '9876543210',
      password: 'password123',
      role: 'user',
    });

    await Kyc.create({
      user: testUser._id,
      panNumber: 'ABCDE9999F',
      status: 'approved',
    });

    testUserNoPan = await User.create({
      name: 'No PAN User',
      email: `test_mfc_user_nopan_${Date.now()}@test.com`,
      phone: '9876543211',
      password: 'password123',
      role: 'user',
    });

    // Create an internal holding for testUser
    await MfPortfolioHolding.deleteMany({ user: testUser._id });
    await MfPortfolioHolding.create({
      user: testUser._id,
      clientCode: 'VK001',
      schemeCode: '100001',
      schemeName: 'Vikaone In-App Growth Fund',
      amcName: 'Vikaone AMC',
      planType: 'REGULAR',
      totalUnits: 100,
      investedAmount: 50000,
      currentNav: 600,
      currentValue: 60000,
      holdingStatus: 'ACTIVE',
    });
  });

  after(async () => {
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await Kyc.deleteMany({ user: testUser._id });
      await MfCentralCasRequest.deleteMany({ user: testUser._id });
      await MfExternalHolding.deleteMany({ user: testUser._id });
      await MfPortfolioHolding.deleteMany({ user: testUser._id });
    }
    if (testUserNoPan) {
      await User.deleteOne({ _id: testUserNoPan._id });
    }
    await mongoose.disconnect();
  });

  it('1. initiateCas without PAN returns 400 PAN_REQUIRED', async () => {
    const { req, res } = mockReqRes({
      user: testUserNoPan,
      body: { casType: 'SUMMARY' },
    });

    await mfCentralController.initiateCas(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'PAN_REQUIRED');
  });

  it('2. initiateCas with valid PAN initiates CAS session and returns authUrl', async () => {
    const { req, res } = mockReqRes({
      user: testUser,
      body: { casType: 'SUMMARY' },
    });

    await mfCentralController.initiateCas(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.clientRefNo);
    assert.ok(res.body.data.reqId);
    assert.ok(res.body.data.authUrl);
    assert.ok(res.body.data.authUrl.includes('mfcentral.com'));

    const saved = await MfCentralCasRequest.findOne({ clientRefNo: res.body.data.clientRefNo });
    assert.ok(saved);
    assert.equal(saved.status, 'PENDING_OTP');
    assert.equal(saved.pan, 'ABCDE9999F');
  });

  it('3. handleCasCallback successfully imports folios and stores MfExternalHolding records', async () => {
    const clientRefNo = `CAS_TEST_${Date.now()}`;
    const casReq = await MfCentralCasRequest.create({
      user: testUser._id,
      clientRefNo,
      reqId: `REQ_${Date.now()}`,
      pan: 'ABCDE9999F',
      mobile: '9876543210',
      status: 'PENDING_OTP',
    });

    const { req, res } = mockReqRes({
      method: 'POST',
      body: {
        clientRefNo,
        status: 'success',
        type: 'summary',
      },
    });

    await mfCentralController.handleCasCallback(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.summary.totalSchemes > 0);
    assert.ok(res.body.data.summary.totalCurrentValue > 0);

    const updatedReq = await MfCentralCasRequest.findById(casReq._id);
    assert.equal(updatedReq.status, 'COMPLETED');
    assert.ok(updatedReq.completedAt);

    // Verify MfExternalHolding entries
    const externalHoldings = await MfExternalHolding.find({ user: testUser._id });
    assert.ok(externalHoldings.length >= 3, 'Expected at least 3 imported external mutual fund holdings');
    for (const h of externalHoldings) {
      assert.equal(h.source, 'MFCENTRAL_CAS');
      assert.equal(h.holdingStatus, 'ACTIVE');
      assert.ok(h.currentValue > 0);
      assert.ok(h.units > 0);
    }
  });

  it('4. getConsolidatedPortfolio computes accurate total across internal and external holdings', async () => {
    const { req, res } = mockReqRes({
      user: testUser,
    });

    await mfCentralController.getConsolidatedPortfolio(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const { consolidated, breakdown, holdings } = res.body.data;
    assert.ok(consolidated);
    assert.ok(breakdown.vikaone);
    assert.ok(breakdown.external);

    // Internal was 60,000 currentValue, 50,000 costValue
    assert.equal(breakdown.vikaone.currentValue, 60000);
    assert.equal(breakdown.vikaone.investedAmount, 50000);

    // External holds ~247,500.5
    assert.ok(breakdown.external.currentValue > 200000);

    // Consolidated sum must match sum of internal and external
    const expectedCurrent = Math.round((breakdown.vikaone.currentValue + breakdown.external.currentValue) * 100) / 100;
    assert.equal(consolidated.totalCurrentValue, expectedCurrent);
    assert.equal(holdings.internal.length, 1);
    assert.ok(holdings.external.length >= 3);
  });

  it('5. getExternalHoldings returns external folios for user', async () => {
    const { req, res } = mockReqRes({
      user: testUser,
    });

    await mfCentralController.getExternalHoldings(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.totalHoldings >= 3);
  });

  it('6. handleCasCallback failure marks request as FAILED', async () => {
    const failRefNo = `CAS_TEST_FAIL_${Date.now()}`;
    await MfCentralCasRequest.create({
      user: testUser._id,
      clientRefNo: failRefNo,
      reqId: `REQ_FAIL_${Date.now()}`,
      pan: 'ABCDE9999F',
      status: 'PENDING_OTP',
    });

    const { req, res } = mockReqRes({
      method: 'POST',
      body: {
        clientRefNo: failRefNo,
        status: 'error',
        message: 'Investor cancelled OTP',
      },
    });

    await mfCentralController.handleCasCallback(req, res);
    assert.equal(res.statusCode, 400);

    const updated = await MfCentralCasRequest.findOne({ clientRefNo: failRefNo });
    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.failureReason, 'Investor cancelled OTP');
  });

  it('7. getCasStatus returns request state and summary', async () => {
    const statusRefNo = `CAS_TEST_STATUS_${Date.now()}`;
    await MfCentralCasRequest.create({
      user: testUser._id,
      clientRefNo: statusRefNo,
      reqId: `REQ_STATUS_${Date.now()}`,
      pan: 'ABCDE9999F',
      status: 'COMPLETED',
      summary: { totalSchemes: 2, totalCurrentValue: 50000 },
    });

    const { req, res } = mockReqRes({
      user: testUser,
      params: { reqId: statusRefNo },
    });

    await mfCentralController.getCasStatus(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.status, 'COMPLETED');
    assert.equal(res.body.data.summary.totalSchemes, 2);
  });
});
