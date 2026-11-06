/**
 * Test Suite: NSE MFSS Direct Transaction Sync, Strict Reconciliation & Portfolio Integrity
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const MfOrder = require('../models/MfOrder');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfClientUcc = require('../models/MfClientUcc');
const MutualFundScheme = require('../models/MutualFundScheme');
const mfReconciliationEngine = require('../services/mfReconciliationEngine');
const { recalculateUserPortfolio } = require('../services/mfPortfolioEngine');
const nseClient = require('../services/nse/nseClient');

describe('NSE MFSS Direct Transaction Sync & Reconciliation Integrity', () => {
  let testUser;
  let testScheme;
  const testClientCode = 'VK_TEST_RECON_01';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    }

    testUser = await User.create({
      name: 'Test Recon User',
      email: `test_recon_${Date.now()}@vikaone.com`,
      phone: `99${Date.now().toString().slice(-8)}`,
      password: 'Password123!',
      role: 'user',
    });

    await MfClientUcc.create({
      user: testUser._id,
      clientCode: testClientCode,
      status: 'ACTIVE',
      pan: 'ABCDE1234F',
      primaryBank: {
        accountNo: '1234567890',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
    });

    testScheme = await MutualFundScheme.findOneAndUpdate(
      { schemeCode: 'TEST_RECON_SCHEME' },
      {
        schemeCode: 'TEST_RECON_SCHEME',
        schemeName: 'Test Integrity Fund - Regular Growth',
        amcCode: 'TEST_AMC',
        amcName: 'Test AMC Fund',
        nav: 100.0,
        planType: 'REGULAR',
      },
      { upsert: true, new: true }
    );
  });

  after(async () => {
    if (testUser?._id) {
      await MfOrder.deleteMany({ user: testUser._id });
      await MfPortfolioHolding.deleteMany({ user: testUser._id });
      await MfClientUcc.deleteMany({ user: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    await MutualFundScheme.deleteOne({ schemeCode: 'TEST_RECON_SCHEME' });
    await mongoose.disconnect();
  });

  test('1. Exact Match Only: Missing order in report is NOT matched with report[0]', async () => {
    // Create an order that does not exist in exchange report
    const order = await MfOrder.create({
      orderId: `ORD_UNMATCHED_${Date.now()}`,
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      orderAmount: 500,
      estimatedUnits: 5.0,
      orderStatus: 'SUBMITTED',
      paymentStatus: 'PENDING',
      allotmentStatus: 'PENDING',
      nseTrxnOrderId: '999999999999',
    });

    // Mock getTransactionDetailReport returning someone else's order as item[0]
    const origGetTx = nseClient.getTransactionDetailReport;
    nseClient.getTransactionDetailReport = async () => ({
      success: true,
      data: {
        report_data: [
          {
            product_id: '111111111111', // Different order!
            order_status: 'VALID',
            order_remark: 'ALLOTMENT DONE',
            allotted_units: '50.000',
            payment_status: 'APPROVED',
            folio_no: 'FOLIO_SOMEONE_ELSE',
          },
        ],
      },
    });

    try {
      await mfReconciliationEngine.syncMissingFolios(testUser._id);
      const refreshed = await MfOrder.findById(order._id);
      // Must NOT adopt the someone-else order data!
      assert.notEqual(refreshed.allotmentStatus, 'ALLOTTED');
      assert.notEqual(refreshed.folioNo, 'FOLIO_SOMEONE_ELSE');
    } finally {
      nseClient.getTransactionDetailReport = origGetTx;
      await MfOrder.deleteOne({ _id: order._id });
    }
  });

  test('2. Order with INVALID / ORDER EXPIRED is marked CANCELLED with 0 allotted units', async () => {
    const expiredOrderId = `ORD_EXP_${Date.now()}`;
    const nseId = `4630_${Date.now().toString().slice(-6)}`;

    const order = await MfOrder.create({
      orderId: expiredOrderId,
      nseTrxnOrderId: nseId,
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      orderAmount: 100,
      estimatedUnits: 1.0,
      orderStatus: 'SUBMITTED',
      paymentStatus: 'PENDING',
      allotmentStatus: 'PENDING',
    });

    const origGetTx = nseClient.getTransactionDetailReport;
    nseClient.getTransactionDetailReport = async () => ({
      success: true,
      data: {
        report_data: [
          {
            product_id: nseId,
            order_id: nseId,
            order_status: 'INVALID',
            order_remark: 'ORDER EXPIRED',
            payment_status: '',
            allotted_units: '0.000',
          },
        ],
      },
    });

    try {
      await mfReconciliationEngine.syncUserTransactionsFromNse({
        userId: testUser._id,
        clientCode: testClientCode,
      });

      const refreshed = await MfOrder.findById(order._id);
      assert.equal(refreshed.orderStatus, 'CANCELLED');
      assert.equal(refreshed.allotmentStatus, 'REJECTED');
      assert.equal(refreshed.allottedUnits, 0);
      assert.equal(refreshed.paymentStatus, 'FAILED');

      // Holdings must be 0
      const portfolio = await recalculateUserPortfolio(testUser._id);
      const holding = portfolio?.holdings?.find((h) => h.schemeCode === testScheme.schemeCode);
      assert.equal(holding || null, null);
    } finally {
      nseClient.getTransactionDetailReport = origGetTx;
      await MfOrder.deleteOne({ _id: order._id });
    }
  });

  test('3. Order with APPROVED payment but KYC NOT VERIFIED is marked REJECTED / REFUNDED with AMC UTR', async () => {
    const kycRejectOrderId = `ORD_KYC_${Date.now()}`;
    const nseId = `4631_${Date.now().toString().slice(-6)}`;

    const order = await MfOrder.create({
      orderId: kycRejectOrderId,
      nseTrxnOrderId: nseId,
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      orderAmount: 100,
      estimatedUnits: 1.0,
      orderStatus: 'SUBMITTED',
      paymentStatus: 'PENDING',
      allotmentStatus: 'PENDING',
    });

    const origGetTx = nseClient.getTransactionDetailReport;
    nseClient.getTransactionDetailReport = async () => ({
      success: true,
      data: {
        report_data: [
          {
            product_id: nseId,
            order_id: nseId,
            order_status: 'INVALID',
            order_remark: 'FIRST HOLDER KYC STATUS IS NOT VERIFIED.',
            payment_status: 'APPROVED',
            reconciliation_status: 'SUCCESS',
            amc_payout_utr_no: '2068845149',
            allotted_units: '0.000',
          },
        ],
      },
    });

    try {
      await mfReconciliationEngine.syncUserTransactionsFromNse({
        userId: testUser._id,
        clientCode: testClientCode,
      });

      const refreshed = await MfOrder.findById(order._id);
      assert.equal(refreshed.orderStatus, 'REFUNDED');
      assert.equal(refreshed.paymentStatus, 'SUCCESS');
      assert.equal(refreshed.allotmentStatus, 'REJECTED');
      assert.equal(refreshed.allottedUnits, 0);
      assert.ok(refreshed.remarks.includes('2068845149'));
      assert.ok(refreshed.remarks.includes('KYC STATUS IS NOT VERIFIED'));
    } finally {
      nseClient.getTransactionDetailReport = origGetTx;
      await MfOrder.deleteOne({ _id: order._id });
    }
  });

  test('4. Genuine Order with VALID and ALLOTMENT DONE is correctly marked ALLOTTED with real units', async () => {
    const validOrderId = `ORD_VALID_${Date.now()}`;
    const nseId = `4632_${Date.now().toString().slice(-6)}`;

    const order = await MfOrder.create({
      orderId: validOrderId,
      nseTrxnOrderId: nseId,
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      orderAmount: 100,
      estimatedUnits: 1.0,
      orderStatus: 'SUBMITTED',
      paymentStatus: 'SUCCESS',
      allotmentStatus: 'PENDING',
    });

    const origGetTx = nseClient.getTransactionDetailReport;
    nseClient.getTransactionDetailReport = async () => ({
      success: true,
      data: {
        report_data: [
          {
            product_id: nseId,
            order_id: nseId,
            order_status: 'VALID',
            order_remark: 'ALLOTMENT DONE',
            payment_status: 'APPROVED',
            reconciliation_status: 'SUCCESS',
            allotted_units: '0.220',
            allotted_nav: '454.8590',
            folio_no: '11591465/08',
          },
        ],
      },
    });

    try {
      await mfReconciliationEngine.syncUserTransactionsFromNse({
        userId: testUser._id,
        clientCode: testClientCode,
      });

      const refreshed = await MfOrder.findById(order._id);
      assert.equal(refreshed.orderStatus, 'ALLOTTED');
      assert.equal(refreshed.allotmentStatus, 'ALLOTTED');
      assert.equal(refreshed.allottedUnits, 0.220);
      assert.equal(refreshed.folioNo, '11591465/08');

      // Holdings must reflect exactly 0.220 units
      const portfolio = await recalculateUserPortfolio(testUser._id);
      const holding = portfolio?.holdings?.find((h) => h.schemeCode === testScheme.schemeCode);
      assert.ok(holding);
      assert.equal(holding.totalUnits, 0.220);
      assert.equal(holding.folioNo, '11591465/08');
    } finally {
      nseClient.getTransactionDetailReport = origGetTx;
      await MfOrder.deleteOne({ _id: order._id });
      await MfPortfolioHolding.deleteMany({ user: testUser._id });
    }
  });

  test('5. Internal Integrity Healing: Previously erroneously ALLOTTED expired order is reversed', async () => {
    // Simulating an order that had previously been wrongly marked ALLOTTED
    const errOrderId = `ORD_ERR_${Date.now()}`;
    const order = await MfOrder.create({
      orderId: errOrderId,
      nseTrxnOrderId: `4633_${Date.now().toString().slice(-6)}`,
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      orderAmount: 100,
      orderStatus: 'ALLOTTED',
      paymentStatus: 'SUCCESS',
      allotmentStatus: 'ALLOTTED',
      allottedUnits: 0.17, // fake units!
      folioNo: '',
      remarks: 'Payment session expired by exchange (unpaid past validity window)',
    });

    // Materialize holding with fake units
    await MfPortfolioHolding.create({
      user: testUser._id,
      clientCode: testClientCode,
      schemeCode: testScheme.schemeCode,
      schemeName: testScheme.schemeName,
      totalUnits: 0.17,
      units: 0.17,
      investedAmount: 100,
      currentValue: 100,
      holdingStatus: 'ACTIVE',
    });

    // Mock getOrderStatusReport returning empty so fallback to internal check happens
    const origGetReport = nseClient.getOrderStatusReport;
    const origGetTx = nseClient.getTransactionDetailReport;
    const origGetAllot = nseClient.getAllotmentStatement;

    nseClient.getOrderStatusReport = async () => ({ success: true, data: { report_data: [] } });
    nseClient.getTransactionDetailReport = async () => ({ success: true, data: { report_data: [] } });
    nseClient.getAllotmentStatement = async () => ({ success: true, data: { allotment_list: [] } });

    try {
      await mfReconciliationEngine.syncMissingFolios(testUser._id);

      const refreshed = await MfOrder.findById(order._id);
      assert.equal(refreshed.allotmentStatus, 'REJECTED');
      assert.equal(refreshed.allottedUnits, 0);
      assert.equal(refreshed.orderStatus, 'CANCELLED');

      // Portfolio recalculated - holding must be closed / 0
      const holding = await MfPortfolioHolding.findOne({ user: testUser._id, schemeCode: testScheme.schemeCode });
      assert.ok(holding.totalUnits === 0 || holding.holdingStatus === 'CLOSED');
    } finally {
      nseClient.getOrderStatusReport = origGetReport;
      nseClient.getTransactionDetailReport = origGetTx;
      nseClient.getAllotmentStatement = origGetAllot;
      await MfOrder.deleteOne({ _id: order._id });
      await MfPortfolioHolding.deleteMany({ user: testUser._id });
    }
  });
});
