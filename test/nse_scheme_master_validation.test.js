const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
require('dotenv').config();

// Models
const MutualFundScheme = require('../models/MutualFundScheme');
const MfOrder = require('../models/MfOrder');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfClientUcc = require('../models/MfClientUcc');
const User = require('../models/User');

// Services & Controllers
const nseClient = require('../services/nse/nseClient');
const mutualFundsController = require('../controllers/mutualFundsController');
const mfIdempotencyService = require('../services/mfIdempotencyService');

// Helper to simulate express req/res
function mockReqRes(body = {}, params = {}, query = {}) {
  const req = {
    user: null,
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

describe('NSE Scheme Master Validation & Production Purchase Fix (147944)', () => {
  let testUser;
  let testUcc;
  let bandhanScheme;
  let disabledScheme;
  let directScheme;
  let invalidIsinScheme;
  let unmappedScheme;
  let normalOrderCallCount = 0;
  let getLinkCallCount = 0;
  let lastNormalPayload = null;

  before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    nseClient.mockModeOverride = true;

    // Spy on nseClient calls
    const origCreateNormalOrder = nseClient.createNormalOrder.bind(nseClient);
    nseClient.createNormalOrder = async (orders) => {
      normalOrderCallCount++;
      lastNormalPayload = orders;
      return origCreateNormalOrder(orders);
    };

    const origGetShortLink = nseClient.getShortLink.bind(nseClient);
    nseClient.getShortLink = async (type, orderId) => {
      getLinkCallCount++;
      return origGetShortLink(type, orderId);
    };

    // Clean up previous test entities
    await User.deleteMany({ email: 'test_nse_scheme_fix@vikaone.test' });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_NSE_/ });

    // 1. Create Test Investor
    testUser = await User.create({
      name: 'NSE Test Investor',
      email: 'test_nse_scheme_fix@vikaone.test',
      phone: '9876543210',
      password: 'testPassword123',
      isActive: true,
      role: 'user',
    });

    // 2. Create UCC
    testUcc = await MfClientUcc.create({
      user: testUser._id,
      clientCode: 'VKNSEFIX01',
      pan: 'ABCDE9999F',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      taxStatus: 'RESIDENTIAL_INDIVIDUAL',
      primaryBank: {
        accountNo: '987654321098',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        accountType: 'SAVINGS',
        isDefault: true,
      },
    });

    // 3. Create Valid Bandhan Regular Growth Scheme (147944 mapped to ID340-GR)
    bandhanScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_NSE_147944',
      nseSchemeCode: 'ID340-GR',
      amfiCode: '147944',
      schemeName: 'BANDHAN Small Cap Fund - Regular Plan - Growth',
      isin: 'INF194KB1AJ8',
      amcCode: 'BANDHAN_MF',
      amcName: 'Bandhan Mutual Fund',
      planType: 'REGULAR',
      option: 'GROWTH',
      nav: 50.665,
      minPurchaseAmount: 1000,
      purchaseAllowed: true,
      isActive: true,
    });

    // 4. Create Disabled Scheme (purchaseAllowed = false)
    disabledScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_NSE_DISABLED',
      nseSchemeCode: 'DSBLD-GR',
      schemeName: 'Test Disabled Fund - Regular Plan - Growth',
      isin: 'INF999K01D01',
      amcCode: 'TEST_MF',
      planType: 'REGULAR',
      option: 'GROWTH',
      nav: 100.0,
      minPurchaseAmount: 1000,
      purchaseAllowed: false,
      isActive: true,
    });

    // 5. Create Direct Plan Scheme
    directScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_NSE_DIRECT',
      nseSchemeCode: 'DIR-GR',
      schemeName: 'BANDHAN Small Cap Fund - Direct Plan - Growth',
      isin: 'INF194KB1AK6',
      amcCode: 'BANDHAN_MF',
      planType: 'DIRECT',
      option: 'GROWTH',
      nav: 55.0,
      minPurchaseAmount: 1000,
      purchaseAllowed: true,
      isActive: true,
    });

    // 6. Create Invalid ISIN Scheme
    invalidIsinScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_NSE_BAD_ISIN',
      nseSchemeCode: 'BADISIN-GR',
      schemeName: 'Test Bad ISIN Fund - Regular Plan',
      isin: 'INVALID_ISIN',
      amcCode: 'TEST_MF',
      planType: 'REGULAR',
      option: 'GROWTH',
      nav: 100.0,
      minPurchaseAmount: 1000,
      purchaseAllowed: true,
      isActive: true,
    });

    // 7. Create Scheme with No NSE Mapping (Numeric AMFI code with no nseSchemeCode)
    unmappedScheme = await MutualFundScheme.create({
      schemeCode: '999999',
      schemeName: 'Unmapped AMFI Scheme - Regular Plan',
      isin: 'INF999K01UN1',
      amcCode: 'TEST_MF',
      planType: 'REGULAR',
      option: 'GROWTH',
      nav: 100.0,
      minPurchaseAmount: 1000,
      purchaseAllowed: true,
      isActive: true,
      // nseSchemeCode is undefined
    });
  });

  beforeEach(() => {
    normalOrderCallCount = 0;
    getLinkCallCount = 0;
    lastNormalPayload = null;
  });

  after(async () => {
    await User.deleteMany({ email: 'test_nse_scheme_fix@vikaone.test' });
    await MfClientUcc.deleteMany({ clientCode: 'VKNSEFIX01' });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_NSE_/ });
    await MutualFundScheme.deleteMany({ schemeCode: '999999' });
    await MfOrder.deleteMany({ clientCode: 'VKNSEFIX01' });
  });

  // ── 1. Unmapped Scheme (absent NSE mapping) -> Purchase blocked ──
  it('1. Scheme absent from NSE mapping (pure numeric AMFI code without nseSchemeCode) is blocked', async () => {
    const { req, res } = mockReqRes({
      schemeCode: unmappedScheme.schemeCode,
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.match(res.data.message, /currently unavailable for purchase through NSE/i);
    assert.equal(normalOrderCallCount, 0, 'Must NOT call NSE NORMAL order endpoint');
    assert.equal(getLinkCallCount, 0, 'Must NOT call NSE GET_LINK endpoint');
  });

  // ── 2. Disabled scheme -> Purchase blocked ──
  it('2. Disabled scheme (purchaseAllowed: false) is blocked before calling NSE', async () => {
    const { req, res } = mockReqRes({
      schemeCode: disabledScheme.schemeCode,
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.equal(normalOrderCallCount, 0, 'Must NOT call NSE NORMAL order endpoint');
    assert.equal(getLinkCallCount, 0, 'Must NOT call NSE GET_LINK endpoint');
  });

  // ── 3. Active exact scheme -> Purchase allowed ──
  it('3. Active exact scheme (Bandhan 147944 with ID340-GR) passes validation and is allowed', async () => {
    const { req, res } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode,
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.order);
    assert.ok(res.data.data.paymentLink);
  });

  // ── 4. Wrong ISIN -> Blocked ──
  it('4. Scheme with invalid/wrong ISIN format is blocked', async () => {
    const { req, res } = mockReqRes({
      schemeCode: invalidIsinScheme.schemeCode,
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.equal(normalOrderCallCount, 0);
  });

  // ── 5. Wrong plan/option -> Blocked ──
  it('5. Direct Plan scheme is strictly blocked', async () => {
    const { req, res } = mockReqRes({
      schemeCode: directScheme.schemeCode,
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.equal(normalOrderCallCount, 0);
  });

  // ── 6. Direct fallback impossible ──
  it('6. Direct plan is never used as fallback for Regular plan', async () => {
    // Attempt purchase of direct plan directly
    const { req, res } = mockReqRes({
      schemeCode: directScheme.schemeCode,
      orderAmount: 2000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.match(res.data.message, /Regular Plan/i);
    assert.equal(normalOrderCallCount, 0);
  });

  // ── 7. Invalid scheme never calls NORMAL ──
  it('7. Invalid scheme (non-existent scheme code) never calls NORMAL', async () => {
    const { req, res } = mockReqRes({
      schemeCode: 'NON_EXISTENT_999999',
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.data.code, 'NSE_SCHEME_UNAVAILABLE');
    assert.equal(normalOrderCallCount, 0);
  });

  // ── 8. Invalid scheme never generates GET_LINK ──
  it('8. Invalid scheme never calls GET_LINK or returns payment URL', async () => {
    const { req, res } = mockReqRes({
      schemeCode: 'NON_EXISTENT_999999',
      orderAmount: 5000,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(getLinkCallCount, 0);
    assert.equal(res.data?.data?.paymentLink, undefined);
  });

  // ── 9. Valid scheme reaches NORMAL with correct NSE code ──
  it('9. Valid scheme reaches NORMAL order entry with authoritative NSE code (ID340-GR)', async () => {
    const { req, res } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode, // AMFI code TEST_NSE_147944
      orderAmount: 7500,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(normalOrderCallCount, 1, 'NORMAL order endpoint must be called exactly once');
    assert.ok(lastNormalPayload, 'Payload must be sent to NSE');
    assert.equal(lastNormalPayload[0].scheme_code, 'ID340-GR', 'NSE order payload MUST use authoritative NSE scheme code ID340-GR');
    assert.equal(lastNormalPayload[0].trxn_type, 'P');
  });

  // ── 10. Accepted purchase generates NSE payment link ──
  it('10. Accepted purchase generates authentic NSE payment link', async () => {
    const { req, res } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode,
      orderAmount: 8500,
    });
    req.user = testUser;

    await mutualFundsController.createPurchaseOrder(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.data.data.paymentLink);
    assert.equal(res.data.data.paymentMode, 'NSE_PAYMENT_LINK');
  });

  // ── 11. ORDER_STATUS is authoritative ──
  it('11. ORDER_STATUS check authoritatively drives order payment status without Razorpay', async () => {
    const order = await MfOrder.findOne({ user: testUser._id, schemeCode: bandhanScheme.schemeCode, transactionType: 'P' });
    assert.ok(order);

    const { req, res } = mockReqRes({}, { orderId: order.orderId }, { mockStatus: 'SUCCESS' });
    req.user = testUser;

    await mutualFundsController.syncOrderStatus(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);

    const updated = await MfOrder.findOne({ orderId: order.orderId });
    assert.equal(updated.paymentStatus, 'SUCCESS');
    assert.equal(updated.orderStatus, 'PAYMENT_SUCCESS');
    assert.equal(updated.razorpayPaymentId, '', 'Zero Razorpay payment IDs');
  });

  // ── 12. Duplicate purchase remains idempotent ──
  it('12. Duplicate purchase within 45s is idempotent and does not create duplicate NSE order', async () => {
    // First call
    const { req: req1, res: res1 } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode,
      orderAmount: 12000,
    });
    req1.user = testUser;
    await mutualFundsController.createPurchaseOrder(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.equal(normalOrderCallCount, 1);

    // Immediate duplicate call with same scheme and amount
    const { req: req2, res: res2 } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode,
      orderAmount: 12000,
    });
    req2.user = testUser;
    await mutualFundsController.createPurchaseOrder(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.data.isDuplicate, true);
    assert.equal(normalOrderCallCount, 1, 'Must NOT invoke NSE NORMAL order second time');
  });

  // ── 13. Redemption still works ──
  it('13. Redemption works independently without Razorpay and uses targetNseCode', async () => {
    // 1. Confirm and allot units on a purchase order so portfolio has confirmed holdings
    const purchaseOrder = await MfOrder.findOne({
      user: testUser._id,
      schemeCode: bandhanScheme.schemeCode,
      transactionType: 'P',
    });
    if (purchaseOrder) {
      purchaseOrder.paymentStatus = 'SUCCESS';
      purchaseOrder.orderStatus = 'PAYMENT_SUCCESS';
      await purchaseOrder.save();

      await mfIdempotencyService.processAllotmentConfirmation({
        orderId: purchaseOrder.orderId,
        allottedUnits: 50.0,
        allottedNav: 50.665,
        rtaReferenceNo: 'RTA_TEST_ALLOT_13',
      });
    }

    const { req, res } = mockReqRes({
      schemeCode: bandhanScheme.schemeCode,
      redeemMode: 'UNITS',
      units: 10.0,
    });
    req.user = testUser;

    try {
      await mutualFundsController.createRedemptionOrder(req, res);
      if (res.statusCode !== 200 || !res.data?.success) {
        console.error('Test 13 Response Failure:', res.statusCode, JSON.stringify(res.data));
      }
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(normalOrderCallCount, 1);
      assert.equal(lastNormalPayload[0].trxn_type, 'R', 'Transaction type must be R (Redemption)');
      assert.equal(lastNormalPayload[0].scheme_code, 'ID340-GR', 'Redemption must use authoritative NSE scheme code');

      // Verify Section 11 invariant: availableUnits reduced to 40, pendingRedemptionUnits increased to 10
      const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: bandhanScheme.schemeCode });
      assert.equal(holding.totalUnits, 50.0);
      assert.equal(holding.pendingRedemptionUnits, 10.0);
      assert.equal(holding.availableUnits, 40.0);
    } catch (err) {
      console.error('Test 13 Caught Error:', err);
      throw err;
    }
  });

  // ── 14. Non-MF Razorpay modules remain unaffected ──
  it('14. Non-MF Razorpay modules remain unaffected and isolated', () => {
    const paymentGatewayService = require('../services/paymentGatewayService');
    assert.ok(paymentGatewayService);
    assert.equal(typeof paymentGatewayService.createRazorpayOrder, 'function');
    assert.equal(typeof paymentGatewayService.verifyRazorpaySignature, 'function');

    const ctrlCode = require('fs').readFileSync(require.resolve('../controllers/mutualFundsController'), 'utf8');
    assert.equal(ctrlCode.includes("require('../services/paymentGatewayService')"), false, 'Mutual Funds controller must not import paymentGatewayService');
    assert.equal(ctrlCode.includes("require('razorpay')"), false, 'Mutual Funds controller must not import Razorpay');
  });
});
