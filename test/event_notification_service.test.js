const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../models/User');
const NotificationLog = require('../models/NotificationLog');
const MfOrder = require('../models/MfOrder');
const BankAccount = require('../models/BankAccount');
const Kyc = require('../models/Kyc');
const eventNotificationService = require('../services/eventNotificationService');

describe('Event-Driven Automatic Notification Service Tests', () => {
  let testUser;
  let testUserId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    testUser = await User.create({
      name: 'Event Notification Test Investor',
      email: `test_event_notify_${Date.now()}@test.com`,
      phone: `99${Date.now().toString().slice(-8)}`,
      password: 'Password123!',
      kycStatus: 'pending',
    });
    testUserId = testUser._id;
  });

  after(async () => {
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
      await NotificationLog.deleteMany({ targetUser: testUserId });
      await MfOrder.deleteMany({ user: testUserId });
      await BankAccount.deleteMany({ user: testUserId });
      await Kyc.deleteMany({ user: testUserId });
    }
    await mongoose.disconnect();
  });

  it('1. KYC Completed: Dispatches verified alert with correct deepLink and title', async () => {
    const log = await eventNotificationService.notifyKycCompleted(testUserId);
    assert.ok(log, 'Notification log should be returned');
    assert.strictEqual(log.title, 'KYC Verified Successfully 🎉');
    assert.strictEqual(log.deepLink, 'kyc');
    assert.strictEqual(String(log.targetUser), String(testUserId));
    assert.strictEqual(log.status, 'sent');
    assert.strictEqual(log.sentBy, 'EVENT_KYC_COMPLETED');

    // Verify it is queryable in NotificationLog for in-app inbox
    const stored = await NotificationLog.findById(log._id);
    assert.ok(stored, 'Log should be stored in database');
    assert.match(stored.body, /verification is complete/i);
  });

  it('2. KYC Completed: Idempotency suppresses duplicate notification within cooldown', async () => {
    const secondCall = await eventNotificationService.notifyKycCompleted(testUserId);
    assert.ok(secondCall, 'Should return existing log on deduplication');
    const count = await NotificationLog.countDocuments({
      targetUser: testUserId,
      eventKey: `KYC_COMPLETED_${testUserId}`,
    });
    assert.strictEqual(count, 1, 'Should only create exactly one NotificationLog');
  });

  it('3. KYC Pending: Dispatches pending/submission alert with deepLink kyc', async () => {
    const log = await eventNotificationService.notifyKycPending(testUserId, { isInitialSubmission: true });
    assert.ok(log);
    assert.strictEqual(log.title, 'KYC Verification in Progress ⏳');
    assert.strictEqual(log.deepLink, 'kyc');
    assert.match(log.body, /submitted and are under review/i);
  });

  it('4. KYC Failed: Dispatches failed alert with action required and rejection reason', async () => {
    const reason = 'Document was blurry. Please upload clear color copy of PAN card.';
    const log = await eventNotificationService.notifyKycFailed(testUserId, { reason });
    assert.ok(log);
    assert.strictEqual(log.title, 'KYC Verification Action Required ⚠️');
    assert.strictEqual(log.deepLink, 'kyc');
    assert.ok(log.body.includes(reason), 'Rejection reason should be present in notification body');
  });

  it('5. Bank Account Verified: Dispatches verified alert with masked account number and bank name', async () => {
    const bankDetails = {
      accountNumber: '123456789012',
      bankName: 'HDFC Bank',
      accountHolder: 'Test Investor',
    };

    const log = await eventNotificationService.notifyBankVerified(testUserId, bankDetails);
    assert.ok(log);
    assert.strictEqual(log.title, 'Bank Account Verified ✅');
    assert.strictEqual(log.deepLink, 'bank');
    assert.match(log.body, /HDFC Bank/i);
    assert.match(log.body, /9012/); // Last 4 digits

    // Test idempotency for same bank account
    const secondBankCall = await eventNotificationService.notifyBankVerified(testUserId, bankDetails);
    assert.ok(secondBankCall);
    const bankLogCount = await NotificationLog.countDocuments({
      targetUser: testUserId,
      eventKey: `BANK_VERIFIED_${testUserId}_9012`,
    });
    assert.strictEqual(bankLogCount, 1, 'Should not create duplicate notification for same bank');
  });

  it('6. First Mutual Fund Purchase: Dispatches first purchase alert when user has 0 prior purchases', async () => {
    const firstOrder = await MfOrder.create({
      user: testUserId,
      clientCode: 'VK999999',
      orderId: `ORD_FIRST_${Date.now()}`,
      schemeCode: '119551',
      schemeName: 'HDFC Flexi Cap Fund - Growth',
      transactionType: 'P',
      orderAmount: 5000,
      paymentStatus: 'SUCCESS',
      orderStatus: 'PROCESSING',
      paymentMode: 'UPI',
    });

    const log = await eventNotificationService.notifyFirstMfPurchase(testUserId, firstOrder);
    assert.ok(log, 'First purchase notification should be dispatched');
    assert.strictEqual(log.title, 'First Mutual Fund Purchase Confirmed! 🚀');
    assert.strictEqual(log.deepLink, 'mutual_funds/portfolio');
    assert.match(log.body, /5,000/);
    assert.match(log.body, /HDFC Flexi Cap Fund/i);
    assert.match(log.body, /PROCESSING/i);
  });

  it('7. First Mutual Fund Purchase: Does NOT dispatch when user already has prior completed purchases', async () => {
    const secondOrder = await MfOrder.create({
      user: testUserId,
      clientCode: 'VK999999',
      orderId: `ORD_SECOND_${Date.now()}`,
      schemeCode: '100033',
      schemeName: 'SBI Bluechip Fund - Growth',
      transactionType: 'P',
      orderAmount: 2000,
      paymentStatus: 'SUCCESS',
      orderStatus: 'PROCESSING',
      paymentMode: 'UPI',
    });

    const secondPurchaseNotification = await eventNotificationService.notifyFirstMfPurchase(testUserId, secondOrder);
    assert.strictEqual(secondPurchaseNotification, null, 'Second purchase must NOT receive first purchase notification');
  });

  it('8. First Mutual Fund Purchase: Allotted state includes allotted units and NAV', async () => {
    // New test user with 0 prior purchases
    const newUser = await User.create({
      name: 'Allotment Investor',
      email: `allot_test_${Date.now()}@test.com`,
      phone: `98${Date.now().toString().slice(-8)}`,
      password: 'Password123!',
    });

    const allottedOrder = await MfOrder.create({
      user: newUser._id,
      clientCode: 'VK888888',
      orderId: `ORD_ALLOT_${Date.now()}`,
      schemeCode: '119551',
      schemeName: 'HDFC Flexi Cap Fund',
      transactionType: 'P',
      orderAmount: 1000,
      paymentStatus: 'SUCCESS',
      orderStatus: 'ALLOTTED',
      allotmentStatus: 'ALLOTTED',
      allottedUnits: 0.51,
      allottedNav: 1960.78,
    });

    const log = await eventNotificationService.notifyFirstMfPurchase(newUser._id, allottedOrder);
    assert.ok(log);
    assert.strictEqual(log.title, 'Units Allotted for First Purchase! 📈');
    assert.strictEqual(log.deepLink, 'mutual_funds/portfolio');
    assert.match(log.body, /0.51 units/i);
    assert.match(log.body, /1960.78/);

    // Clean up
    await User.findByIdAndDelete(newUser._id);
    await NotificationLog.deleteMany({ targetUser: newUser._id });
    await MfOrder.deleteMany({ user: newUser._id });
  });
});
