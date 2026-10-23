const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
require('dotenv').config();

const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const MfClientUcc = require('../models/MfClientUcc');
const MfOrder = require('../models/MfOrder');
const MfRecentlyViewed = require('../models/MfRecentlyViewed');
const MfCart = require('../models/MfCart');
const MutualFundScheme = require('../models/MutualFundScheme');

const mfController = require('../controllers/mutualFundsController');

function mockReqRes(body = {}, params = {}, query = {}, user = null) {
  const req = {
    user: user || { _id: new mongoose.Types.ObjectId(), name: 'Test Investor', email: 'test@vikaone.com' },
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

describe('Mutual Funds Recently Viewed, Cart & Profile Endpoints', () => {
  let testUser;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    testUser = await User.create({
      name: 'Ashahad Shaikh',
      email: `test_profile_${Date.now()}@test.com`,
      phone: `9898${Math.floor(100000 + Math.random() * 900000)}`,
      password: 'password123',
      role: 'user',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    // Seed dummy scheme
    await MutualFundScheme.updateOne(
      { schemeCode: '120503' },
      {
        $set: {
          schemeCode: '120503',
          schemeName: 'Axis Bluechip Fund - Regular Growth',
          fundHouse: 'Axis Mutual Fund',
          category: 'Equity',
          planType: 'REGULAR',
          purchaseAllowed: true,
          isActive: true,
          isin: 'INF846K01164',
          minPurchaseAmount: 500,
        },
      },
      { upsert: true }
    );

    await MutualFundScheme.updateOne(
      { schemeCode: '120504' },
      {
        $set: {
          schemeCode: '120504',
          schemeName: 'HDFC Top 100 Fund - Regular Growth',
          fundHouse: 'HDFC Mutual Fund',
          category: 'Equity',
          planType: 'REGULAR',
          purchaseAllowed: true,
          isActive: true,
          isin: 'INF179K01123',
          minPurchaseAmount: 500,
        },
      },
      { upsert: true }
    );

    await MfClientUcc.updateOne(
      { user: testUser._id },
      {
        $set: {
          clientCode: `TST${Date.now().toString().slice(-6)}`,
          fullName: 'Ashahad Shaikh',
          pan: 'ABCDE0001F',
          nseStatus: 'ACTIVE',
          nseRemarks: 'APPROVED',
          primaryBank: {
            accountNo: '1300182100001716',
            ifsc: 'BKID0001300',
            bankName: 'Bank of India',
          },
        },
      },
      { upsert: true }
    );

    await BankAccount.updateOne(
      { user: testUser._id },
      {
        $set: {
          accountHolder: 'Ashahad Shaikh',
          accountNumber: '1300182100001716',
          ifsc: 'BKID0001300',
          bankName: 'Bank of India',
          isVerified: true,
          verificationSource: 'CASHFREE_PENNY_DROP',
          verifiedName: 'ASHAHAD SHAIKH',
        },
      },
      { upsert: true }
    );
  });

  after(async () => {
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await MfRecentlyViewed.deleteMany({ user: testUser._id });
      await MfCart.deleteMany({ user: testUser._id });
      await BankAccount.deleteMany({ user: testUser._id });
      await MfClientUcc.deleteMany({ user: testUser._id });
      await MfOrder.deleteMany({ user: testUser._id });
    }
  });

  it('1. Records and fetches recently viewed schemes in chronological order', async () => {
    const { req: req1, res: res1 } = mockReqRes({ schemeCode: '120503' }, {}, {}, testUser);
    await mfController.recordRecentlyViewed(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.success, true);

    const { req: req2, res: res2 } = mockReqRes({}, {}, {}, testUser);
    await mfController.getRecentlyViewed(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.success, true);
    assert.ok(Array.isArray(res2.data.data));
    assert.ok(res2.data.data.some((s) => s.schemeCode === '120503'));
  });

  it('2. Adds items to cart, updates amount, and calculates total amount', async () => {
    // Add to cart
    const { req: addReq, res: addRes } = mockReqRes(
      {
        schemeCode: '120503',
        schemeName: 'Axis Bluechip Fund - Regular Growth',
        amount: 2500,
        investmentType: 'SIP',
        frequency: 'MONTHLY',
        sipDay: 10,
      },
      {},
      {},
      testUser
    );
    await mfController.addToCart(addReq, addRes);
    assert.equal(addRes.statusCode, 200);
    assert.equal(addRes.data.success, true);
    assert.equal(addRes.data.data.items.length, 1);
    assert.equal(addRes.data.data.totalAmount, 2500);

    const itemId = addRes.data.data.items[0]._id.toString();

    // Update cart item
    const { req: updateReq, res: updateRes } = mockReqRes(
      { amount: 5000, sipDay: 15 },
      { itemId },
      {},
      testUser
    );
    await mfController.updateCartItem(updateReq, updateRes);
    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.data.data.totalAmount, 5000);

    // Get cart
    const { req: getReq, res: getRes } = mockReqRes({}, {}, {}, testUser);
    await mfController.getCart(getReq, getRes);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.data.data.items.length, 1);
    assert.equal(getRes.data.data.totalAmount, 5000);

    // Remove item
    const { req: delReq, res: delRes } = mockReqRes({}, { itemId }, {}, testUser);
    await mfController.removeFromCart(delReq, delRes);
    assert.equal(delRes.statusCode, 200);
    assert.equal(delRes.data.data.items.length, 0);
    assert.equal(delRes.data.data.totalAmount, 0);
  });

  it('2b. Multi-fund cart checkout processes all selected funds and clears them from cart', async () => {
    // Add 2 funds to cart
    const { req: a1, res: r1 } = mockReqRes(
      { schemeCode: '120503', schemeName: 'Axis Bluechip', amount: 1000, investmentType: 'LUMPSUM' },
      {}, {}, testUser
    );
    await mfController.addToCart(a1, r1);
    assert.equal(r1.statusCode, 200);

    const { req: a2, res: r2 } = mockReqRes(
      { schemeCode: '120504', schemeName: 'HDFC Top 100', amount: 2000, investmentType: 'LUMPSUM' },
      {}, {}, testUser
    );
    await mfController.addToCart(a2, r2);
    assert.equal(r2.statusCode, 200);
    assert.equal(r2.data.data.items.length, 2);

    const item1Id = r2.data.data.items[0]._id.toString();
    const item2Id = r2.data.data.items[1]._id.toString();

    // Checkout both selected items
    const { req: coReq, res: coRes } = mockReqRes(
      {
        selectedItemIds: [item1Id, item2Id],
        paymentMode: 'NSE_PAYMENT_LINK',
      },
      {}, {}, testUser
    );
    await mfController.checkoutCart(coReq, coRes);
    assert.equal(coRes.statusCode, 200);
    assert.equal(coRes.data.success, true);
    assert.equal(coRes.data.data.totalAmount, 3000);
    assert.equal(coRes.data.data.totalFunds, 2);
    assert.equal(coRes.data.data.orders.length, 2);
    assert.ok(coRes.data.data.primaryPaymentLink);

    // Verify both items were cleared from the cart
    const { req: getReq, res: getRes } = mockReqRes({}, {}, {}, testUser);
    await mfController.getCart(getReq, getRes);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.data.data.items.length, 0);
  });

  it('3. Adds bank account and retrieves MF Profile with account details, bank and orders', async () => {
    // Add bank
    const { req: bankReq, res: bankRes } = mockReqRes(
      {
        accountNumber: '1300182100001716',
        ifsc: 'BKID0001300',
        bankName: 'Bank of India',
        accountType: 'savings',
      },
      {},
      {},
      testUser
    );
    await mfController.addMfBank(bankReq, bankRes);
    assert.equal(bankRes.statusCode, 200);
    assert.equal(bankRes.data.success, true);
    assert.equal(bankRes.data.data.accountNumber, '1300182100001716');

    // Create UCC record
    await MfClientUcc.create({
      user: testUser._id,
      clientCode: 'VK088819',
      nseStatus: 'ACTIVE',
      pan: 'TYJPS0683E',
      fullName: 'Ashahad Shaikh',
      email: 'ashahad@test.com',
      mobileNo: '8855088817',
      gender: 'M',
      dob: '10/11/2004',
      occupationCode: '01',
      taxStatus: '01',
      primaryBank: {
        accountNo: '1300182100001716',
        ifsc: 'BKID0001300',
        bankName: 'Bank of India',
        accountType: 'SB',
      },
      address: {
        address1: 'Flat 101, Main Road',
        city: 'Mumbai',
        state: 'MA',
        pincode: '400001',
      },
    });

    // Create a passed and failed order
    await MfOrder.create([
      {
        user: testUser._id,
        clientCode: 'VK088819',
        orderId: 'ORD_PASS_01',
        schemeCode: '120503',
        schemeName: 'Axis Bluechip Fund - Regular Growth',
        orderAmount: 5000,
        orderStatus: 'ALLOTTED',
      },
      {
        user: testUser._id,
        clientCode: 'VK088819',
        orderId: 'ORD_FAIL_02',
        schemeCode: '120503',
        schemeName: 'Axis Bluechip Fund - Regular Growth',
        orderAmount: 2000,
        orderStatus: 'FAILED',
        rejectionReason: 'Payment cancelled by user',
      },
    ]);

    // Get profile
    const { req: profReq, res: profRes } = mockReqRes({}, {}, {}, testUser);
    await mfController.getMfProfile(profReq, profRes);
    assert.equal(profRes.statusCode, 200);
    assert.equal(profRes.data.success, true);

    const profile = profRes.data.data;
    assert.equal(profile.investorName, 'Ashahad Shaikh');
    assert.equal(profile.accountDetails.clientCode, 'VK088819');
    assert.equal(profile.accountDetails.status, 'ACTIVE');
    assert.equal(profile.personalDetails.pan, 'TYJPS0683E');
    assert.ok(profile.bankAccounts.length >= 1);
    assert.equal(profile.bankAccounts[0].accountNumber, '1300182100001716');

    assert.equal(profile.orders.length, 2);
    const passOrder = profile.orders.find((o) => o.orderId === 'ORD_PASS_01');
    const failOrder = profile.orders.find((o) => o.orderId === 'ORD_FAIL_02');
    assert.equal(passOrder.passFailStatus, 'PASSED');
    assert.equal(failOrder.passFailStatus, 'FAILED');
  });
});
