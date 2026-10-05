const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
require('dotenv').config();

// Models
const MutualFundScheme = require('../models/MutualFundScheme');
const MfOrder = require('../models/MfOrder');
const MfTransaction = require('../models/MfTransaction');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfClientUcc = require('../models/MfClientUcc');
const User = require('../models/User');

// Services & Controllers
const mfPortfolioEngine = require('../services/mfPortfolioEngine');
const mfIdempotencyService = require('../services/mfIdempotencyService');
const nseClient = require('../services/nse/nseClient');
const mutualFundsController = require('../controllers/mutualFundsController');

describe('VikaOne Payment, Add Investment & Redeem Lifecycle Tests', () => {
  let testUser;
  let testUcc;
  let testScheme;
  let testSchemeLocked;

  before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    // Set mock mode for NSE client during testing
    nseClient.mockModeOverride = true;

    // Clean up test data
    await User.deleteMany({ email: 'test_investor_p6@vikaone.test' });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_P6_/ });

    // 1. Create Test User
    testUser = await User.create({
      name: 'P6 Test Investor',
      email: 'test_investor_p6@vikaone.test',
      phone: '9988776655',
      password: 'testPassword123',
      isActive: true,
      role: 'user',
    });

    // 2. Create UCC with verified bank account
    testUcc = await MfClientUcc.create({
      user: testUser._id,
      clientCode: 'VKP6TEST01',
      pan: 'ABCDE1234F',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      taxStatus: 'RESIDENTIAL_INDIVIDUAL',
      primaryBank: {
        accountNo: '123456789012',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        accountType: 'SAVINGS',
        isDefault: true,
      },
    });

    // 3. Create Regular Scheme
    testScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_P6_REG_01',
      schemeName: 'VikaOne Active Growth Fund - Regular Plan',
      isin: 'INF999K01P61',
      amcCode: 'HDFC_MF',
      amcName: 'HDFC Mutual Fund',
      planType: 'REGULAR',
      nav: 100.0,
      minPurchaseAmount: 500,
      minAdditionalPurchaseAmount: 500,
      minRedemptionAmount: 500,
      minRedemptionUnits: 1.0,
      redemptionAllowed: true,
      purchaseAllowed: true,
    });

    // 4. Create Locked Scheme (e.g. ELSS lock-in)
    testSchemeLocked = await MutualFundScheme.create({
      schemeCode: 'TEST_P6_LOCKED_01',
      schemeName: 'VikaOne Tax Saver Fund - Regular Plan',
      isin: 'INF999K01L61',
      amcCode: 'HDFC_MF',
      amcName: 'HDFC Mutual Fund',
      planType: 'REGULAR',
      nav: 50.0,
      minPurchaseAmount: 500,
      redemptionAllowed: false,
    });
  });

  after(async () => {
    await User.deleteMany({ email: 'test_investor_p6@vikaone.test' });
    await MfClientUcc.deleteMany({ clientCode: 'VKP6TEST01' });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_P6_/ });
    await MfOrder.deleteMany({ user: testUser._id });
    await MfTransaction.deleteMany({ user: testUser._id });
    await MfPortfolioHolding.deleteMany({ user: testUser._id });
    nseClient.mockModeOverride = undefined;
  });

  // ── Helper to simulate Express req/res ──
  function mockReqRes(body = {}, params = {}, query = {}, user = testUser) {
    const req = {
      body,
      params,
      query,
      user,
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

  describe('1. Add Investment & Pure NSE MF II Payment Architecture', () => {
    it('1.1. createPurchaseOrder places order and returns official NSE payment link without Razorpay', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        orderAmount: 10000,
        paymentMode: 'NSE_PAYMENT_LINK',
      });

      await mutualFundsController.createPurchaseOrder(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.order);
      assert.equal(res.data.data.order.transactionType, 'P');
      assert.equal(res.data.data.order.orderAmount, 10000);
      assert.equal(res.data.data.order.paymentStatus, 'PENDING');
      assert.equal(res.data.data.order.paymentMode, 'NSE_PAYMENT_LINK');
      assert.equal(res.data.data.order.allotmentStatus, 'PENDING');
      assert.equal(res.data.data.order.allottedUnits, 0); // Strictly 0 units before allotment
      assert.ok(res.data.data.paymentLink);
      assert.equal(res.data.data.razorpayOrderId, undefined, 'Must not return razorpayOrderId');
      assert.equal(res.data.data.order.razorpayOrderId, '', 'Must not generate razorpayOrderId in order');
    });

    it('1.2. Idempotency: Duplicate purchase submission within 45s returns existing order without duplicate NSE order', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        orderAmount: 10000,
      });

      await mutualFundsController.createPurchaseOrder(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.data.isDuplicate, true);
      assert.ok(res.data.data.paymentLink);
    });

    it('1.3. syncOrderStatus authoritatively checks NSE status and confirms payment without Razorpay', async () => {
      const order = await MfOrder.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode, transactionType: 'P' });
      assert.ok(order);

      const { req, res } = mockReqRes({}, { orderId: order.orderId }, { mockStatus: 'SUCCESS' });
      await mutualFundsController.syncOrderStatus(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);

      const updated = await MfOrder.findOne({ orderId: order.orderId });
      assert.equal(updated.paymentStatus, 'SUCCESS');
      assert.equal(updated.orderStatus, 'PAYMENT_SUCCESS');
      assert.equal(updated.razorpayPaymentId, '', 'Must have zero Razorpay payment IDs');
    });

    it('1.4. syncOrderStatus accurately transitions order to REJECTED if NSE reports rejection', async () => {
      const tempOrder = await MfOrder.create({
        user: testUser._id,
        clientCode: testUcc.clientCode,
        orderId: `MFP_TEST_REJ_${Date.now()}`,
        schemeCode: testScheme.schemeCode,
        schemeName: testScheme.schemeName,
        transactionType: 'P',
        orderAmount: 1000,
        paymentStatus: 'PENDING',
        orderStatus: 'PAYMENT_PENDING',
        paymentMode: 'NSE_PAYMENT_LINK',
      });

      const { req, res } = mockReqRes({ mockStatus: 'REJECTED' }, { orderId: tempOrder.orderId });
      await mutualFundsController.syncOrderStatus(req, res);
      assert.equal(res.statusCode, 200);

      const rejectedOrder = await MfOrder.findOne({ orderId: tempOrder.orderId });
      assert.equal(rejectedOrder.paymentStatus, 'FAILED');
      assert.equal(rejectedOrder.orderStatus, 'REJECTED');
    });

    it('1.5. processAllotmentConfirmation allots authentic units and creates ledger entry', async () => {
      const order = await MfOrder.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode, transactionType: 'P', paymentStatus: 'SUCCESS' });

      const result = await mfIdempotencyService.processAllotmentConfirmation({
        orderId: order.orderId,
        allottedUnits: 100.0, // 100 units allotted at NAV 100
        allottedNav: 100.0,
        rtaReferenceNo: 'RTA_REF_ALLOT_001',
      });

      assert.equal(result.success, true);
      assert.equal(result.alreadyProcessed, false);

      // Verify MfTransaction created
      const txn = await MfTransaction.findOne({ order: order._id, transactionType: 'PURCHASE' });
      assert.ok(txn);
      assert.equal(txn.units, 100.0);
      assert.equal(txn.orderAmount, 10000);
      assert.equal(txn.status, 'CONFIRMED');

      // Verify Portfolio recalculation
      const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode });
      assert.ok(holding);
      assert.equal(holding.totalUnits, 100.0);
      assert.equal(holding.investedAmount, 10000);
      assert.equal(holding.availableUnits, 100.0);
      assert.equal(holding.pendingRedemptionUnits, 0);
    });
  });

  describe('2. Portfolio Redeem Implementation & Validations', () => {
    it('2.1. Validates and rejects redemption when requested units exceed available holdings', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 150.0, // Only 100 held
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.match(res.data.message, /exceed your available holdings/i);
    });

    it('2.2. Validates and rejects redemption for non-positive amount or units', async () => {
      const { req: req1, res: res1 } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 0,
      });
      await mutualFundsController.createRedemptionOrder(req1, res1);
      assert.equal(res1.statusCode, 400);

      const { req: req2, res: res2 } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'AMOUNT',
        amount: -500,
      });
      await mutualFundsController.createRedemptionOrder(req2, res2);
      assert.equal(res2.statusCode, 400);
    });

    it('2.3. Validates and rejects redemption on locked schemes (e.g. ELSS)', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testSchemeLocked.schemeCode,
        redeemMode: 'UNITS',
        units: 10,
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.data.message, /locked/i);
    });

    it('2.4. Validates and rejects redemption when user holds 0 units in a scheme', async () => {
      // Create a scheme where user holds zero units
      const emptyScheme = await MutualFundScheme.create({
        schemeCode: 'TEST_P6_EMPTY',
        schemeName: 'Empty Scheme Regular',
        planType: 'REGULAR',
        nav: 20,
      });

      const { req, res } = mockReqRes({
        schemeCode: emptyScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 5,
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.data.message, /0 units/i);
    });
  });

  describe('3. Redeem Execution by Units & Section 11 Invariant', () => {
    let redemptionOrderId;

    it('3.1. Successfully creates redemption order by units and records logical data', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 20.0, // Redeem 20 units out of 100
        folioNo: '12345/67',
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.order);

      const ord = res.data.data.order;
      redemptionOrderId = ord.orderId;
      assert.equal(ord.transactionType, 'R');
      assert.equal(ord.redeemMode, 'UNITS');
      assert.equal(ord.redemptionUnits, 20.0);
      assert.equal(ord.requestedUnits, 20.0);
      assert.equal(ord.orderAmount, 2000.0); // 20 units * 100 NAV
      assert.equal(ord.payoutBank.accountNo, '123456789012');
      assert.equal(ord.payoutBank.bankName, 'HDFC Bank');
      assert.equal(ord.payoutStatus, 'PENDING_AMC');
      assert.equal(ord.orderStatus, 'SUBMITTED');
    });

    it('3.2. Section 11 Invariant: Holding totalUnits remains 100, pendingRedemptionUnits becomes 20, availableUnits becomes 80', async () => {
      const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode });
      assert.ok(holding);
      assert.equal(holding.totalUnits, 100.0, 'Confirmed totalUnits must not be prematurely decreased!');
      assert.equal(holding.pendingRedemptionUnits, 20.0, 'Pending redemption units must be tracked!');
      assert.equal(holding.availableUnits, 80.0, 'Available units to redeem must reflect remaining units!');
    });

    it('3.3. Section 15: Idempotency prevents duplicate redemption submission', async () => {
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 20.0,
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.isDuplicate, true);
      assert.equal(res.data.data.order.orderId, redemptionOrderId);
    });

    it('3.4. Section 18: Pending redemption appears immediately in transaction history', async () => {
      const { req, res } = mockReqRes();
      await mutualFundsController.getTransactions(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.length >= 2);

      const pendingTxn = res.data.data.find((t) => t.transactionType === 'REDEMPTION');
      assert.ok(pendingTxn, 'Redemption must be visible immediately in transactions');
      assert.equal(pendingTxn.status, 'PROCESSING');
      assert.equal(pendingTxn.isPending, true);
      assert.equal(pendingTxn.schemeCode, testScheme.schemeCode);
      assert.equal(pendingTxn.units, -20.0);
    });
  });

  describe('4. Redeem Execution by Amount', () => {
    it('4.1. Successfully creates redemption order by amount', async () => {
      // Available units = 80 (since 20 are pending). Available value = 80 * 100 = 8000.
      const { req, res } = mockReqRes({
        schemeCode: testScheme.schemeCode,
        redeemMode: 'AMOUNT',
        amount: 3000.0, // Redeem ₹3,000 (which is 30 units at NAV 100)
      });

      await mutualFundsController.createRedemptionOrder(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);

      const ord = res.data.data.order;
      assert.equal(ord.transactionType, 'R');
      assert.equal(ord.redeemMode, 'AMOUNT');
      assert.equal(ord.orderAmount, 3000.0);
      assert.equal(ord.requestedAmount, 3000.0);
      assert.equal(ord.redemptionUnits, 30.0);

      // Verify updated portfolio available units: 100 - (20 + 30) = 50
      const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode });
      assert.equal(holding.totalUnits, 100.0);
      assert.equal(holding.pendingRedemptionUnits, 50.0);
      assert.equal(holding.availableUnits, 50.0);
    });
  });

  describe('5. Authoritative Settlement Lifecycle & Portfolio Reconciliation', () => {
    it('5.1. processRedemptionSettlement permanently updates holding units, cost basis, and records settled ledger transaction', async () => {
      try {
        const redOrder = await MfOrder.findOne({
          user: testUser._id,
          schemeCode: testScheme.schemeCode,
          transactionType: 'R',
          redeemMode: 'UNITS',
        });
        assert.ok(redOrder);

        const result = await mfIdempotencyService.processRedemptionSettlement({
          orderId: redOrder.orderId,
          finalSettledAmount: 2000.0,
          allottedNav: 100.0,
          rtaReferenceNo: 'RTA_SETTLE_RED_001',
        });

        assert.equal(result.success, true);
        assert.equal(result.alreadyProcessed, false);

        // Verify MfTransaction created for settled redemption
        const txn = await MfTransaction.findOne({ order: redOrder._id, transactionType: 'REDEMPTION' });
        assert.ok(txn);
        assert.equal(txn.units, -20.0);
        assert.equal(txn.orderAmount, 2000.0);
        assert.equal(txn.status, 'SETTLED');

        // Verify portfolio holdings after settlement
        const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode });
        console.log('Holding after settlement:', {
          totalUnits: holding.totalUnits,
          pendingRedemptionUnits: holding.pendingRedemptionUnits,
          availableUnits: holding.availableUnits,
          investedAmount: holding.investedAmount
        });
        assert.equal(holding.totalUnits, 80.0, 'Confirmed totalUnits must now be 80!');
        assert.equal(holding.investedAmount, 8000.0, 'Invested cost basis reduced proportionally');
        // The other 30-unit redemption is still pending, so available is 80 - 30 = 50
        assert.equal(holding.availableUnits, 50.0);
      } catch (err) {
        console.error('[5.1 Failure Details]:', err.message, err.actual, err.expected);
        throw err;
      }
    });

    it('5.2. Duplicate settlement call is idempotent and safe', async () => {
      const redOrder = await MfOrder.findOne({
        user: testUser._id,
        schemeCode: testScheme.schemeCode,
        transactionType: 'R',
        redeemMode: 'UNITS',
      });

      const result = await mfIdempotencyService.processRedemptionSettlement({
        orderId: redOrder.orderId,
        finalSettledAmount: 2000.0,
        allottedNav: 100.0,
      });

      assert.equal(result.success, true);
      assert.equal(result.alreadyProcessed, true);
      assert.equal(result.isDuplicate, true);
    });
  });

  describe('6. Non-MF Isolation & Regression Verification', () => {
    it('6.1. Shared paymentGatewayService remains available and intact for non-MF modules', () => {
      const paymentGatewayService = require('../services/paymentGatewayService');
      assert.ok(paymentGatewayService);
      assert.equal(typeof paymentGatewayService.resolveGateway, 'function');
      assert.equal(typeof paymentGatewayService.createRazorpayOrder, 'function');
      assert.equal(typeof paymentGatewayService.verifyRazorpaySignatureWithFallback, 'function');
      assert.equal(typeof paymentGatewayService.verifyRazorpaySignature, 'function');
    });

    it('6.2. Mutual Fund controller does not import or expose Razorpay dependencies', () => {
      const ctrlCode = require('fs').readFileSync(require.resolve('../controllers/mutualFundsController'), 'utf8');
      assert.equal(ctrlCode.includes("require('../services/paymentGatewayService')"), false, 'Must not require paymentGatewayService');
      assert.equal(ctrlCode.includes("require('razorpay')"), false, 'Must not require razorpay directly');
    });
  });
});
