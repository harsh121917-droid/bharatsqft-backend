const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'test';
require('dotenv').config();

const User = require('../models/User');
const { GoldBalance, GoldTransaction, GoldRate } = require('../models/Gold');
const PaymentGateway = require('../models/PaymentGateway');
const goldController = require('../controllers/goldController');
const paymentController = require('../controllers/paymentController');
const paymentGatewayService = require('../services/paymentGatewayService');

describe('VikaOne Gold Direct UPI Purchase Automatic Verification & Auto-Reconciliation Suite', () => {
    let testUser;
    let mockOrders = {};

    // Mock checkRazorpayOrderStatus to test all gateway states deterministically
    const originalCheckStatus = paymentGatewayService.checkRazorpayOrderStatus;

    before(async () => {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (uri && mongoose.connection.readyState === 0) {
            await mongoose.connect(uri);
        }

        // Clean up previous test runs
        await User.deleteMany({ email: 'gold_upi_tester@vikaone.test' });
        await GoldTransaction.deleteMany({ note: /UPI_TEST/ });

        testUser = await User.create({
            name: 'Gold UPI Investor',
            email: 'gold_upi_tester@vikaone.test',
            phone: '9876543210',
            password: 'Password123!',
            kycStatus: 'approved',
            isActive: true,
        });

        // Intercept checkRazorpayOrderStatus for mock orders
        paymentGatewayService.checkRazorpayOrderStatus = async (orderId) => {
            if (mockOrders[orderId]) {
                return mockOrders[orderId];
            }
            return originalCheckStatus(orderId);
        };
    });

    after(async () => {
        paymentGatewayService.checkRazorpayOrderStatus = originalCheckStatus;
        if (testUser) {
            await User.deleteOne({ _id: testUser._id });
            await GoldBalance.deleteOne({ user: testUser._id });
            await GoldTransaction.deleteMany({ user: testUser._id });
        }
    });

    it('1. verifyBuy with UPI flow (missing signature, but gateway confirms order is paid) should automatically verify and credit gold', async () => {
        const orderId = 'order_upi_paid_123';
        const paymentId = 'pay_upi_captured_123';
        mockOrders[orderId] = {
            isPaid: true,
            orderStatus: 'paid',
            paymentId: paymentId,
            paymentStatus: 'captured',
            amount: 515,
        };

        const txn = await GoldTransaction.create({
            user: testUser._id,
            type: 'buy',
            grams: 0.065432,
            ratePerGram: 7500,
            goldValue: 500,
            gstAmt: 15,
            totalAmt: 515,
            status: 'pending',
            razorpayOrderId: orderId,
            note: 'UPI_TEST_1',
        });

        const req = {
            user: testUser,
            body: {
                transactionId: txn._id.toString(),
                razorpayOrderId: orderId,
                razorpayPaymentId: '', // UPI flow on mobile often has no initial paymentId
                razorpaySignature: '', // No signature provided
            },
        };

        let responseData = null;
        let responseCode = 200;
        const res = {
            status: (code) => {
                responseCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            },
            json: (data) => { responseData = data; }
        };

        await goldController.verifyBuy(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.success, true);
        assert.match(responseData.message, /gold credited/i);

        // Verify database state
        const updatedTxn = await GoldTransaction.findById(txn._id);
        assert.equal(updatedTxn.status, 'success');
        assert.equal(updatedTxn.razorpayPaymentId, paymentId);
        assert.match(updatedTxn.note, /Verified via Gateway/i);

        const bal = await GoldBalance.findOne({ user: testUser._id });
        assert.equal(bal.totalGrams, 0.065432);
        assert.equal(bal.investedAmt, 515);
    });

    it('2. verifyBuy must be idempotent: repeated calls should safely return without double-crediting gold', async () => {
        const txn = await GoldTransaction.findOne({ user: testUser._id, razorpayOrderId: 'order_upi_paid_123' });

        const req = {
            user: testUser,
            body: {
                transactionId: txn._id.toString(),
                razorpayOrderId: 'order_upi_paid_123',
                razorpayPaymentId: 'pay_upi_captured_123',
                razorpaySignature: '',
            },
        };

        let responseData = null;
        const res = {
            json: (data) => { responseData = data; }
        };

        await goldController.verifyBuy(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.success, true);

        // Verify balance was NOT double credited
        const bal = await GoldBalance.findOne({ user: testUser._id });
        assert.equal(bal.totalGrams, 0.065432);
        assert.equal(bal.investedAmt, 515);
    });

    it('3. verifyBuy when UPI payment is still processing at bank should remain pending and NOT fail prematurely', async () => {
        const orderId = 'order_upi_pending_456';
        mockOrders[orderId] = {
            isPaid: false,
            orderStatus: 'attempted',
            paymentId: null,
            amount: 1030,
        };

        const txn = await GoldTransaction.create({
            user: testUser._id,
            type: 'buy',
            grams: 0.130864,
            ratePerGram: 7500,
            goldValue: 1000,
            gstAmt: 30,
            totalAmt: 1030,
            status: 'pending',
            razorpayOrderId: orderId,
            note: 'UPI_TEST_PENDING',
        });

        const req = {
            user: testUser,
            body: {
                transactionId: txn._id.toString(),
                razorpayOrderId: orderId,
                razorpayPaymentId: '',
                razorpaySignature: '',
            },
        };

        let responseData = null;
        const res = {
            status: (code) => ({
                json: (data) => { responseData = data; }
            }),
            json: (data) => { responseData = data; }
        };

        await goldController.verifyBuy(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.success, false);
        assert.equal(responseData.status, 'pending');
        assert.equal(responseData.isPending, true);

        // Database status must still be pending
        const checkTxn = await GoldTransaction.findById(txn._id);
        assert.equal(checkTxn.status, 'pending');

        // Gold should NOT be credited yet
        const bal = await GoldBalance.findOne({ user: testUser._id });
        assert.equal(bal.totalGrams, 0.065432);
    });

    it('4. getBalance must automatically reconcile pending transactions and credit gold instantly', async () => {
        // Customer completed the payment on UPI in the background, transitioning status on Razorpay
        mockOrders['order_upi_pending_456'] = {
            isPaid: true,
            orderStatus: 'paid',
            paymentId: 'pay_upi_now_captured_456',
            paymentStatus: 'captured',
            amount: 1030,
        };

        const req = { user: testUser };
        let responseData = null;
        const res = {
            json: (data) => { responseData = data; }
        };

        await goldController.getBalance(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.success, true);
        // Total grams should now be 0.065432 + 0.130864 = 0.196296g
        assert.equal(responseData.data.totalGrams, 0.196296);

        // Transaction in DB should be marked success
        const txn = await GoldTransaction.findOne({ razorpayOrderId: 'order_upi_pending_456' });
        assert.equal(txn.status, 'success');
        assert.equal(txn.razorpayPaymentId, 'pay_upi_now_captured_456');
        assert.match(txn.note, /Auto-verified via UPI Sync/i);
    });

    it('5. Webhook handleRazorpayWebhook (order.paid / payment.captured) must automatically credit gold without admin manual action', async () => {
        const orderId = 'order_webhook_789';
        const paymentId = 'pay_webhook_789';

        const txn = await GoldTransaction.create({
            user: testUser._id,
            type: 'buy',
            grams: 0.05,
            ratePerGram: 7500,
            goldValue: 375,
            gstAmt: 11.25,
            totalAmt: 386.25,
            status: 'pending',
            razorpayOrderId: orderId,
            note: 'UPI_TEST_WEBHOOK',
        });

        const req = {
            body: {
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: paymentId,
                            order_id: orderId,
                            amount: 38625,
                            status: 'captured',
                            method: 'upi',
                        }
                    }
                }
            }
        };

        let responseData = null;
        const res = {
            status: (code) => ({
                json: (data) => { responseData = data; }
            }),
            json: (data) => { responseData = data; }
        };

        await paymentController.handleRazorpayWebhook(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.status, 'ok');

        const updatedTxn = await GoldTransaction.findById(txn._id);
        assert.equal(updatedTxn.status, 'success');
        assert.equal(updatedTxn.razorpayPaymentId, paymentId);
        assert.match(updatedTxn.note, /Auto-credited via Razorpay Webhook/i);

        const bal = await GoldBalance.findOne({ user: testUser._id });
        // Total grams should now be 0.196296 + 0.05 = 0.246296g
        assert.equal(bal.totalGrams, 0.246296);
    });

    it('6. syncPendingGold endpoint must proactively resolve any pending transactions', async () => {
        const orderId = 'order_sync_proactive_999';
        const paymentId = 'pay_sync_proactive_999';
        mockOrders[orderId] = {
            isPaid: true,
            orderStatus: 'paid',
            paymentId: paymentId,
            amount: 500,
        };

        await GoldTransaction.create({
            user: testUser._id,
            type: 'buy',
            grams: 0.01,
            ratePerGram: 7500,
            goldValue: 75,
            gstAmt: 2.25,
            totalAmt: 77.25,
            status: 'pending',
            razorpayOrderId: orderId,
            note: 'UPI_TEST_PROACTIVE',
        });

        const req = { user: testUser };
        let responseData = null;
        const res = {
            json: (data) => { responseData = data; }
        };

        await goldController.syncPendingGold(req, res, (err) => { if (err) throw err; });

        assert.equal(responseData.success, true);
        assert.equal(responseData.data.totalGrams, 0.256296);

        const checkTxn = await GoldTransaction.findOne({ razorpayOrderId: orderId });
        assert.equal(checkTxn.status, 'success');
        assert.equal(checkTxn.razorpayPaymentId, paymentId);
    });
});
