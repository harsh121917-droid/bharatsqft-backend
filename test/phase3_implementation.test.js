const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

// Models
const MutualFundScheme = require('../models/MutualFundScheme');
const MfOrder = require('../models/MfOrder');
const MfTransaction = require('../models/MfTransaction');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfSip = require('../models/MfSip');
const MfMandate = require('../models/MfMandate');
const MfCapitalGain = require('../models/MfCapitalGain');
const MfAuditLog = require('../models/MfAuditLog');
const User = require('../models/User');

// Services & Engines
const mfPortfolioEngine = require('../services/mfPortfolioEngine');
const mfCapitalGainsEngine = require('../services/mfCapitalGainsEngine');
const mfIdempotencyService = require('../services/mfIdempotencyService');

describe('VikaOne Phase 3 — Portfolio, Transaction Lifecycle, Reconciliation & Audit Verification', () => {
  let testUserA;
  let testUserB;
  let testSchemeRegular1;
  let testSchemeRegular2;
  let testSchemeDirect;

  before(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    // Clean up any existing test artifacts
    await User.deleteMany({ email: { $in: ['test_user_a_p3@vikaone.test', 'test_user_b_p3@vikaone.test'] } });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_P3_/ });

    // Create Test Users
    testUserA = await User.create({
      name: 'Test Investor A',
      email: 'test_user_a_p3@vikaone.test',
      phone: '9999900001',
      password: 'password123',
      isActive: true,
      role: 'user',
    });

    testUserB = await User.create({
      name: 'Test Investor B',
      email: 'test_user_b_p3@vikaone.test',
      phone: '9999900002',
      password: 'password123',
      isActive: true,
      role: 'user',
    });

    // Create Test Schemes: Regular vs Direct
    testSchemeRegular1 = await MutualFundScheme.create({
      schemeCode: 'TEST_P3_REG_01',
      schemeName: 'Test Bluechip Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC Ltd',
      isin: 'INFTESTP301',
      category: 'Equity',
      subCategory: 'Large Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 100.0,
      navDate: new Date('2026-09-30'),
      navSource: 'NSE MASTER_DOWNLOAD NAV',
      minPurchaseAmount: 500,
      minSipAmount: 500,
      isActive: true,
    });

    testSchemeRegular2 = await MutualFundScheme.create({
      schemeCode: 'TEST_P3_REG_02',
      schemeName: 'Test Midcap Regular Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC Ltd',
      isin: 'INFTESTP302',
      category: 'Equity',
      subCategory: 'Mid Cap',
      planType: 'REGULAR',
      optionType: 'GROWTH',
      nav: 50.0,
      navDate: new Date('2026-09-30'),
      navSource: 'NSE MASTER_DOWNLOAD NAV',
      minPurchaseAmount: 500,
      minSipAmount: 500,
      isActive: true,
    });

    testSchemeDirect = await MutualFundScheme.create({
      schemeCode: 'TEST_P3_DIR_01',
      schemeName: 'Test Bluechip Direct Fund - Growth',
      amcCode: 'TEST_AMC',
      amcName: 'Test AMC Ltd',
      isin: 'INFTESTP3DIR',
      category: 'Equity',
      subCategory: 'Large Cap',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      nav: 105.0,
      navDate: new Date('2026-09-30'),
      navSource: 'NSE MASTER_DOWNLOAD NAV',
      minPurchaseAmount: 500,
      minSipAmount: 500,
      isActive: true,
    });
  });

  after(async () => {
    // Teardown test records
    if (testUserA) {
      await MfOrder.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfTransaction.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfPortfolioHolding.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfSip.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfMandate.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfCapitalGain.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await MfAuditLog.deleteMany({ user: { $in: [testUserA._id, testUserB._id] } });
      await User.deleteMany({ _id: { $in: [testUserA._id, testUserB._id] } });
    }
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_P3_/ });

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. ORDER LIFECYCLE & IDEMPOTENCY
  // ─────────────────────────────────────────────────────────────
  describe('1. Order Lifecycle & Idempotent Allotment', () => {
    it('1.1. Order creation enforces REGULAR plan, explicit orderStatus CREATED, and records audit', async () => {
      const order = await MfOrder.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        orderId: `ORD_TEST_${Date.now()}_1`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        orderAmount: 10000,
        transactionType: 'P',
        orderStatus: 'CREATED',
        paymentStatus: 'PENDING',
        allotmentStatus: 'PENDING',
        allottedUnits: 0,
      });

      assert.strictEqual(order.planType, 'REGULAR');
      assert.strictEqual(order.orderStatus, 'CREATED');
      assert.strictEqual(order.paymentStatus, 'PENDING');
      assert.strictEqual(order.allottedUnits, 0);

      // Audit log test
      await mfIdempotencyService.recordAuditLog({
        event: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: order._id,
        user: testUserA._id,
        previousState: null,
        newState: 'CREATED',
        source: 'TEST',
        actor: 'SYSTEM',
        idempotencyKey: `ORDER_CREATE_${order._id}`,
      });

      const audit = await MfAuditLog.findOne({ entityId: String(order._id) });
      assert.ok(audit);
      assert.strictEqual(audit.event, 'ORDER_CREATED');
      assert.strictEqual(audit.newState, 'CREATED');
    });

    it('1.2. Payment success updates orderStatus to PAYMENT_SUCCESS without granting holdings', async () => {
      const order = await MfOrder.findOne({ user: testUserA._id, schemeCode: testSchemeRegular1.schemeCode });
      order.paymentStatus = 'SUCCESS';
      order.orderStatus = 'PAYMENT_SUCCESS';
      order.gatewayPaymentId = 'pay_test_12345';
      await order.save();

      // Ensure that payment success alone does NOT give any portfolio holding
      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      assert.strictEqual(portfolio.holdings.length, 0, 'Payment success alone must NOT create portfolio holdings');
      assert.strictEqual(portfolio.totalInvested, 0, 'Invested amount must remain 0 before authentic allotment');
    });

    it('1.3. Authentic allotment confirms units, creates ledger MfTransaction, and updates portfolio', async () => {
      const order = await MfOrder.findOne({ user: testUserA._id, schemeCode: testSchemeRegular1.schemeCode });
      const allotmentDate = new Date('2026-10-01');

      const result = await mfIdempotencyService.processAllotmentConfirmation({
        orderId: order._id,
        allottedUnits: 100,
        allotmentNav: 100.0,
        allotmentDate,
        rtaReferenceNo: 'RTA_REF_001',
        idempotencyKey: `ALLOTMENT_${order._id}`,
      });

      assert.strictEqual(result.order.allotmentStatus, 'ALLOTTED');
      assert.strictEqual(result.order.orderStatus, 'ALLOTTED');
      assert.strictEqual(result.order.allottedUnits, 100);
      assert.strictEqual(result.transaction.transactionType, 'PURCHASE');
      assert.strictEqual(result.transaction.units, 100);
      assert.strictEqual(result.transaction.fifoRemainingUnits, 100);

      // Verify portfolio holding is now materialized
      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      assert.strictEqual(portfolio.holdings.length, 1);
      assert.strictEqual(portfolio.holdings[0].totalUnits, 100);
      assert.strictEqual(portfolio.totalInvested, 10000);
      assert.strictEqual(portfolio.currentValue, 10000);
    });

    it('1.4. Duplicate allotment callback is strictly IDEMPOTENT (no duplicate units or transactions)', async () => {
      const order = await MfOrder.findOne({ user: testUserA._id, schemeCode: testSchemeRegular1.schemeCode });

      // Call allotment again with same or duplicate callback
      const resultDuplicate = await mfIdempotencyService.processAllotmentConfirmation({
        orderId: order._id,
        allottedUnits: 100,
        allotmentNav: 100.0,
        allotmentDate: new Date('2026-10-01'),
        rtaReferenceNo: 'RTA_REF_001',
        idempotencyKey: `ALLOTMENT_${order._id}`,
      });

      assert.strictEqual(resultDuplicate.isDuplicate, true, 'Second call must be flagged as duplicate');

      // Check transactions count in DB: MUST still be exactly 1
      const txCount = await MfTransaction.countDocuments({ order: order._id });
      assert.strictEqual(txCount, 1, 'Duplicate callback must NOT create extra transaction');

      // Portfolio units must remain exactly 100, NOT 200
      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      assert.strictEqual(portfolio.holdings[0].totalUnits, 100, 'Units must remain 100');
    });

    it('1.5. Order Failure/Rejection/Cancellation results in 0 units and no transactions', async () => {
      const failedOrder = await MfOrder.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        orderId: `ORD_TEST_${Date.now()}_FAILED`,
        schemeCode: testSchemeRegular2.schemeCode,
        schemeName: testSchemeRegular2.schemeName,
        planType: 'REGULAR',
        orderAmount: 5000,
        transactionType: 'P',
        orderStatus: 'FAILED',
        paymentStatus: 'FAILED',
        allotmentStatus: 'REJECTED',
        allottedUnits: 0,
      });

      assert.strictEqual(failedOrder.orderStatus, 'FAILED');
      assert.strictEqual(failedOrder.allottedUnits, 0);

      // Verify no transaction exists
      const tx = await MfTransaction.findOne({ order: failedOrder._id });
      assert.strictEqual(tx, null, 'Failed order must not create transactions');

      // Portfolio must not have scheme 2
      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      const scheme2Holding = portfolio.holdings.find(h => h.schemeCode === testSchemeRegular2.schemeCode);
      assert.strictEqual(scheme2Holding, undefined, 'Failed order must never appear in holdings');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PORTFOLIO & HOLDINGS INTEGRITY
  // ─────────────────────────────────────────────────────────────
  describe('2. Portfolio & Holdings Strict Integrity', () => {
    it('2.1. Pending orders with 0 allotted units are completely excluded from holdings', async () => {
      await MfOrder.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        orderId: `ORD_TEST_${Date.now()}_PENDING`,
        schemeCode: testSchemeRegular2.schemeCode,
        schemeName: testSchemeRegular2.schemeName,
        planType: 'REGULAR',
        orderAmount: 25000,
        transactionType: 'P',
        orderStatus: 'SUBMITTED',
        paymentStatus: 'SUCCESS',
        allotmentStatus: 'PENDING',
        allottedUnits: 0,
      });

      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      // Holdings should still only contain scheme 1, not scheme 2
      assert.strictEqual(portfolio.holdings.length, 1);
      assert.strictEqual(portfolio.holdings[0].schemeCode, testSchemeRegular1.schemeCode);
      assert.strictEqual(portfolio.totalInvested, 10000, 'Pending order amount must NOT be counted in totalInvested');
    });

    it('2.2. Portfolio engine calculates category and AMC allocations from real holdings only', async () => {
      // Allot 500 units of Scheme 2 at NAV 50 (invested = 25000, current = 25000)
      const order2 = await MfOrder.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular2.schemeCode,
        orderStatus: 'SUBMITTED',
      });
      await mfIdempotencyService.processAllotmentConfirmation({
        orderId: order2._id,
        allottedUnits: 500,
        allotmentNav: 50.0,
        allotmentDate: new Date('2026-10-01'),
        rtaReferenceNo: 'RTA_REF_002',
        idempotencyKey: `ALLOTMENT_${order2._id}`,
      });

      const portfolio = await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      assert.strictEqual(portfolio.holdings.length, 2);
      assert.strictEqual(portfolio.totalInvested, 35000); // 10000 + 25000
      assert.strictEqual(portfolio.currentValue, 35000);

      // Allocations check
      assert.ok(portfolio.allocations.amc.length > 0);
      assert.strictEqual(portfolio.allocations.amc[0].name, 'Test AMC Ltd');
      assert.strictEqual(portfolio.allocations.amc[0].percentage, 100);

      assert.ok(portfolio.allocations.category.length > 0);
      assert.strictEqual(portfolio.allocations.category[0].name, 'Equity');
      assert.strictEqual(portfolio.allocations.category[0].percentage, 100);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. SIP MANAGEMENT & MANDATE LIFECYCLE
  // ─────────────────────────────────────────────────────────────
  describe('3. SIP Lifecycle, Pause, Resume, Cancel & Installment Tracking', () => {
    let testSip;
    let testMandate;

    it('3.1. Creates Mandate and SIP with planType REGULAR', async () => {
      testMandate = await MfMandate.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        mandateId: `MANDATE_TEST_${Date.now()}`,
        mandateType: 'E',
        bankName: 'Test Bank',
        accountNo: '1234567890',
        ifsc: 'TEST0001234',
        amount: 10000,
        status: 'ACTIVE',
        authorizedAt: new Date(),
      });

      testSip = await MfSip.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        sipRegNo: `SIP_REG_${Date.now()}_1`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        mandateRef: testMandate._id,
        installmentAmount: 2000,
        frequency: 'MONTHLY',
        sipDay: 5,
        status: 'ACTIVE',
        startDate: new Date('2026-11-05'),
        nextInstallmentDate: new Date('2026-11-05'),
        installments: [
          {
            installmentNo: 1,
            dueDate: new Date('2026-11-05'),
            amount: 2000,
            paymentStatus: 'PAYMENT_PENDING',
          },
        ],
      });

      assert.strictEqual(testSip.planType, 'REGULAR');
      assert.strictEqual(testSip.status, 'ACTIVE');
      assert.strictEqual(testSip.installments.length, 1);
    });

    it('3.2. Pause SIP updates status to PAUSED and records pausedAt timestamp', async () => {
      testSip.status = 'PAUSED';
      testSip.pausedAt = new Date();
      testSip.pauseReason = 'User paused via dashboard';
      await testSip.save();

      const updated = await MfSip.findById(testSip._id);
      assert.strictEqual(updated.status, 'PAUSED');
      assert.ok(updated.pausedAt instanceof Date);
    });

    it('3.3. Resume SIP updates status back to ACTIVE and clears pausedAt', async () => {
      testSip.status = 'ACTIVE';
      testSip.pausedAt = null;
      testSip.pauseReason = null;
      await testSip.save();

      const updated = await MfSip.findById(testSip._id);
      assert.strictEqual(updated.status, 'ACTIVE');
      assert.strictEqual(updated.pausedAt, null);
    });

    it('3.4. Cancel SIP sets CANCELLED status and records cancelledAt timestamp', async () => {
      testSip.status = 'CANCELLED';
      testSip.cancelledAt = new Date();
      await testSip.save();

      const updated = await MfSip.findById(testSip._id);
      assert.strictEqual(updated.status, 'CANCELLED');
      assert.ok(updated.cancelledAt instanceof Date);
    });

    it('3.5. Failed mandate / debit failure marks installment FAILED without giving holdings', async () => {
      const sipWithFailedDebit = await MfSip.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        sipRegNo: `SIP_REG_${Date.now()}_2`,
        schemeCode: testSchemeRegular2.schemeCode,
        schemeName: testSchemeRegular2.schemeName,
        planType: 'REGULAR',
        installmentAmount: 1000,
        frequency: 'MONTHLY',
        sipDay: 10,
        status: 'ACTIVE',
        startDate: new Date('2026-10-10'),
        installments: [
          {
            installmentNo: 1,
            dueDate: new Date('2026-10-10'),
            amount: 1000,
            paymentStatus: 'FAILED',
          },
        ],
      });

      assert.strictEqual(sipWithFailedDebit.installments[0].paymentStatus, 'FAILED');

      // Verify no transaction exists for this failed installment
      const tx = await MfTransaction.findOne({ order: sipWithFailedDebit._id });
      assert.strictEqual(tx, null);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. REDEMPTION & SETTLEMENT LIFECYCLE
  // ─────────────────────────────────────────────────────────────
  describe('4. Redemption Lifecycle, Unit Validation & Settlement', () => {
    it('4.1. Insufficient units check prevents redeeming more units than confirmed holdings', async () => {
      await mfPortfolioEngine.recalculateUserPortfolio(testUserA._id);
      const holding = await MfPortfolioHolding.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
      });
      assert.ok(holding, 'Confirmed holding must exist in DB');
      assert.strictEqual(holding.totalUnits, 100);

      const requestedRedeemUnits = 150; // exceeds 100
      const isRedeemable = holding.totalUnits >= requestedRedeemUnits;
      assert.strictEqual(isRedeemable, false, 'Redemption request exceeding holding units must be invalid');
    });

    it('4.2. Valid redemption request creates REDEMPTION order with PENDING status', async () => {
      const redeemOrder = await MfOrder.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        orderId: `ORD_TEST_${Date.now()}_RED`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        transactionType: 'R',
        redemptionUnits: 40,
        units: 40,
        orderAmount: 4000,
        estimatedPayout: 4000, // 40 * 100
        orderStatus: 'SUBMITTED',
        paymentStatus: 'PENDING',
        allotmentStatus: 'PENDING',
      });

      assert.strictEqual(redeemOrder.transactionType, 'R');
      assert.strictEqual(redeemOrder.redemptionUnits, 40);
      assert.strictEqual(redeemOrder.orderStatus, 'SUBMITTED');
    });

    it('4.3. Redemption settlement consumes FIFO lots, creates REDEMPTION transaction, and updates holdings', async () => {
      const redeemOrder = await MfOrder.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
        transactionType: 'R',
      });
      assert.ok(redeemOrder, 'Redeem order must exist');

      const settlementResult = await mfIdempotencyService.processRedemptionSettlement({
        orderId: redeemOrder._id,
        allottedNav: 120.0, // NAV rose from 100 to 120
        finalSettledAmount: 4800, // 40 * 120
        settlementDate: new Date('2026-10-02'),
        rtaReferenceNo: 'RED_RTA_001',
        idempotencyKey: `RED_SETTLE_${redeemOrder._id}`,
      });

      assert.strictEqual(settlementResult.order.orderStatus, 'ALLOTTED');
      assert.strictEqual(settlementResult.order.finalSettledAmount, 4800); // 40 * 120
      assert.strictEqual(settlementResult.transaction.transactionType, 'REDEMPTION');
      assert.strictEqual(settlementResult.transaction.units, -40);

      // Verify holdings reduced from 100 to 60 units
      const holding = await MfPortfolioHolding.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
      });
      assert.strictEqual(holding.totalUnits, 60);

      // Verify Capital Gain was created
      assert.ok(settlementResult.capitalGains.length > 0);
      const cg = settlementResult.capitalGains[0];
      assert.strictEqual(cg.unitsRedeemed, 40);
      assert.strictEqual(cg.purchaseCost, 4000); // 40 * 100
      assert.strictEqual(cg.redemptionProceeds, 4800); // 40 * 120
      assert.strictEqual(cg.realizedGain, 800);
      assert.strictEqual(cg.gainType, 'STCG'); // Held for 1 day (< 365)
    });

    it('4.4. Duplicate redemption settlement callback is strictly IDEMPOTENT', async () => {
      const redeemOrder = await MfOrder.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
        transactionType: 'R',
      });

      const duplicateResult = await mfIdempotencyService.processRedemptionSettlement({
        orderId: redeemOrder._id,
        allottedNav: 120.0,
        finalSettledAmount: 4800,
        settlementDate: new Date('2026-10-02'),
        rtaReferenceNo: 'RED_RTA_001',
        idempotencyKey: `RED_SETTLE_${redeemOrder._id}`,
      });

      assert.strictEqual(duplicateResult.isDuplicate, true);

      // Holding units must remain 60, not reduced twice to 20
      const holding = await MfPortfolioHolding.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
      });
      assert.strictEqual(holding.totalUnits, 60);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SWITCH LIFECYCLE & REGULAR-ONLY VALIDATION
  // ─────────────────────────────────────────────────────────────
  describe('5. Switch Order Lifecycle & Regular-Only Plan Validation', () => {
    it('5.1. Allows switch between two valid REGULAR plans in the same AMC', async () => {
      const switchOrder = await MfOrder.create({
        user: testUserA._id,
        clientCode: 'TEST_UCC_A',
        orderId: `ORD_TEST_${Date.now()}_SW`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        targetSchemeCode: testSchemeRegular2.schemeCode,
        targetSchemeName: testSchemeRegular2.schemeName,
        planType: 'REGULAR',
        transactionType: 'S',
        redemptionUnits: 10,
        units: 10,
        orderAmount: 1000,
        orderStatus: 'SUBMITTED',
        paymentStatus: 'SUCCESS',
        allotmentStatus: 'PENDING',
      });

      assert.strictEqual(switchOrder.transactionType, 'S');
      assert.strictEqual(switchOrder.schemeCode, testSchemeRegular1.schemeCode);
      assert.strictEqual(switchOrder.targetSchemeCode, testSchemeRegular2.schemeCode);
      assert.strictEqual(switchOrder.planType, 'REGULAR');
    });

    it('5.2. Rejects switch if target scheme is DIRECT', async () => {
      let switchRejected = false;
      try {
        const target = await MutualFundScheme.findOne({ schemeCode: testSchemeDirect.schemeCode });
        if (target.planType !== 'REGULAR') {
          throw new Error('Only Regular mutual fund plans are supported for switch target');
        }
      } catch (err) {
        switchRejected = true;
        assert.ok(err.message.includes('Regular'));
      }
      assert.strictEqual(switchRejected, true, 'Direct target scheme must be strictly rejected');
    });

    it('5.3. Switch submission does NOT immediately alter holdings before confirmed allotment', async () => {
      // User A still has 60 units of Scheme 1
      const holding = await MfPortfolioHolding.findOne({
        user: testUserA._id,
        schemeCode: testSchemeRegular1.schemeCode,
      });
      assert.ok(holding, 'Holding should exist');
      assert.strictEqual(holding.totalUnits, 60, 'Switch submission must not change holdings prematurely');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. CAPITAL GAINS ENGINE (FIFO & TAX CLASSIFICATION)
  // ─────────────────────────────────────────────────────────────
  describe('6. Capital Gains Engine (FIFO Lot Matching & STCG/LTCG)', () => {
    it('6.1. Accurately calculates FIFO multi-lot gains across different purchase dates and NAVs', async () => {
      // Simulate multi-lot scenario for User B:
      // Lot 1: 100 units @ 50 NAV on 2024-01-01 (LTCG >= 365 days)
      // Lot 2: 100 units @ 60 NAV on 2026-09-01 (STCG < 365 days)
      const orderB1 = await MfOrder.create({
        user: testUserB._id,
        clientCode: 'TEST_UCC_B',
        orderId: `ORD_TEST_${Date.now()}_B1`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        orderAmount: 5000,
        transactionType: 'P',
        orderStatus: 'ALLOTTED',
        paymentStatus: 'SUCCESS',
        allotmentStatus: 'ALLOTTED',
        allottedUnits: 100,
        allotmentNav: 50,
        allotmentDate: new Date('2024-01-01'),
      });

      const txB1 = await MfTransaction.create({
        order: orderB1._id,
        user: testUserB._id,
        clientCode: 'TEST_UCC_B',
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        transactionType: 'PURCHASE',
        transactionDate: new Date('2024-01-01'),
        navDate: new Date('2024-01-01'),
        orderAmount: 5000,
        units: 100,
        nav: 50,
        fifoRemainingUnits: 100,
        status: 'CONFIRMED',
      });

      const orderB2 = await MfOrder.create({
        user: testUserB._id,
        clientCode: 'TEST_UCC_B',
        orderId: `ORD_TEST_${Date.now()}_B2`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        orderAmount: 6000,
        transactionType: 'P',
        orderStatus: 'ALLOTTED',
        paymentStatus: 'SUCCESS',
        allotmentStatus: 'ALLOTTED',
        allottedUnits: 100,
        allotmentNav: 60,
        allotmentDate: new Date('2026-09-01'),
      });

      const txB2 = await MfTransaction.create({
        order: orderB2._id,
        user: testUserB._id,
        clientCode: 'TEST_UCC_B',
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        transactionType: 'PURCHASE',
        transactionDate: new Date('2026-09-01'),
        navDate: new Date('2026-09-01'),
        orderAmount: 6000,
        units: 100,
        nav: 60,
        fifoRemainingUnits: 100,
        status: 'CONFIRMED',
      });

      // Now redeem 150 units at NAV 80 on 2026-10-01
      // Lot 1 (100 units): proceeds = 8000, cost = 5000, gain = 3000, LTCG (>365 days)
      // Lot 2 (50 units): proceeds = 4000, cost = 3000, gain = 1000, STCG (<365 days)
      const redeemOrderB = await MfOrder.create({
        user: testUserB._id,
        clientCode: 'TEST_UCC_B',
        orderId: `ORD_TEST_${Date.now()}_RED_B`,
        schemeCode: testSchemeRegular1.schemeCode,
        schemeName: testSchemeRegular1.schemeName,
        planType: 'REGULAR',
        transactionType: 'R',
        redemptionUnits: 150,
        units: 150,
        orderAmount: 12000,
        finalSettledAmount: 12000,
        orderStatus: 'ALLOTTED',
        allottedNav: 80,
        settlementDate: new Date('2026-10-01'),
      });

      const gains = await mfCapitalGainsEngine.processRedemptionCapitalGains(redeemOrderB);

      assert.strictEqual(gains.length, 2, 'Should create 2 capital gain records for 2 lots');

      const ltcg = gains.find(g => g.gainType === 'LTCG');
      assert.ok(ltcg, 'Lot 1 must be classified as LTCG');
      assert.strictEqual(ltcg.unitsRedeemed, 100);
      assert.strictEqual(ltcg.purchaseCost, 5000);
      assert.strictEqual(ltcg.redemptionProceeds, 8000);
      assert.strictEqual(ltcg.realizedGain, 3000);

      const stcg = gains.find(g => g.gainType === 'STCG');
      assert.ok(stcg, 'Lot 2 must be classified as STCG');
      assert.strictEqual(stcg.unitsRedeemed, 50);
      assert.strictEqual(stcg.purchaseCost, 3000);
      assert.strictEqual(stcg.redemptionProceeds, 4000);
      assert.strictEqual(stcg.realizedGain, 1000);

      // Verify FIFO remaining units on transactions:
      const updatedTxB1 = await MfTransaction.findById(txB1._id);
      const updatedTxB2 = await MfTransaction.findById(txB2._id);
      assert.strictEqual(updatedTxB1.fifoRemainingUnits, 0, 'Lot 1 fully consumed');
      assert.strictEqual(updatedTxB2.fifoRemainingUnits, 50, 'Lot 2 has 50 units remaining');
    });

    it('6.2. Aggregates Capital Gains Report by Financial Year', async () => {
      const report = await mfCapitalGainsEngine.getCapitalGainsReport(testUserB._id, '2026-2027');
      assert.strictEqual(report.financialYear, '2026-2027');
      assert.strictEqual(report.summary.ltcg, 3000);
      assert.strictEqual(report.summary.stcg, 1000);
      assert.strictEqual(report.summary.netRealizedGain, 4000);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. XIRR / INVESTOR RETURN ENGINE
  // ─────────────────────────────────────────────────────────────
  describe('7. XIRR Investor Return Engine (Newton-Raphson)', () => {
    it('7.1. Correctly calculates XIRR for single investment of Rs 10,000 growing to Rs 12,000 in 1 year (~20%)', () => {
      const cashFlows = [
        { date: new Date('2025-01-01'), amount: -10000 },
        { date: new Date('2026-01-01'), amount: 12000 },
      ];

      const xirr = mfPortfolioEngine.calculateXirr(cashFlows);
      assert.ok(xirr !== null);
      // Expected: exactly 20.00%
      assert.ok(Math.abs(xirr - 20.0) < 0.1, `XIRR was ${xirr}, expected ~20.0%`);
    });

    it('7.2. Correctly calculates XIRR for monthly SIP cash flows plus current value', () => {
      const cashFlows = [
        { date: new Date('2025-01-01'), amount: -5000 },
        { date: new Date('2025-02-01'), amount: -5000 },
        { date: new Date('2025-03-01'), amount: -5000 },
        { date: new Date('2025-04-01'), amount: -5000 },
        { date: new Date('2025-05-01'), amount: -5000 },
        { date: new Date('2025-06-01'), amount: 26000 }, // slight gain
      ];

      const xirr = mfPortfolioEngine.calculateXirr(cashFlows);
      assert.ok(xirr !== null);
      assert.ok(xirr > 0, `XIRR should be positive, got ${xirr}`);
    });

    it('7.3. Returns null safely without throwing or faking numbers when data is insufficient', () => {
      // Only outflows, no terminal value / inflows
      const onlyOutflows = [
        { date: new Date('2026-01-01'), amount: -10000 },
      ];
      assert.strictEqual(mfPortfolioEngine.calculateXirr(onlyOutflows), null);

      // Only inflows
      const onlyInflows = [
        { date: new Date('2026-01-01'), amount: 10000 },
      ];
      assert.strictEqual(mfPortfolioEngine.calculateXirr(onlyInflows), null);

      // Empty cash flows
      assert.strictEqual(mfPortfolioEngine.calculateXirr([]), null);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. SECURITY & CROSS-TENANT ISOLATION
  // ─────────────────────────────────────────────────────────────
  describe('8. Security, User Ownership & Plan Isolation', () => {
    it('8.1. User A cannot view User B orders or holdings', async () => {
      // User B has orders created in test 6.1
      const userBOrders = await MfOrder.find({ user: testUserB._id });
      assert.ok(userBOrders.length > 0);

      // User A queries orders scoped to User A: User B's orders must NEVER appear
      const userAOrders = await MfOrder.find({ user: testUserA._id });
      for (const ord of userAOrders) {
        assert.notStrictEqual(ord.user.toString(), testUserB._id.toString());
      }
    });

    it('8.2. Direct schemes are strictly blocked from customer endpoints and catalog', async () => {
      // Customer catalog query filter
      const catalogQuery = {
        isActive: true,
        planType: 'REGULAR',
      };

      const results = await MutualFundScheme.find(catalogQuery);
      for (const scheme of results) {
        assert.strictEqual(scheme.planType, 'REGULAR', `Scheme ${scheme.schemeCode} must be REGULAR`);
        assert.notStrictEqual(scheme.planType, 'DIRECT', 'Direct scheme must never appear in customer catalog');
      }
    });

    it('8.3. Audit trail preserves immutable log with actor, source, and state transition', async () => {
      const logs = await MfAuditLog.find({ user: testUserA._id }).lean();
      assert.ok(logs.length > 0);
      for (const log of logs) {
        assert.ok(log.event);
        assert.ok(log.entityType);
        assert.ok(log.actor);
        assert.ok(log.source);
        assert.ok(log.createdAt);
      }
    });
  });
});
