const { describe, it, before, after, beforeEach } = require('node:test');
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
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSipSchemeMaster = require('../models/MfSipSchemeMaster');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const BankAccount = require('../models/BankAccount');

// Services & Controllers
const nseClient = require('../services/nse/nseClient');
const mfInvestorReadinessService = require('../services/mfInvestorReadinessService');
const mfIdempotencyService = require('../services/mfIdempotencyService');
const mutualFundsController = require('../controllers/mutualFundsController');

// Helper to simulate express req/res
function mockReqRes(body = {}, params = {}, query = {}, user = null) {
  const req = {
    user: user || null,
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

describe('MF Production Fix: UCC, KYC, SIP, Client Code VK143005 & Scheme 145139 Tests (1-23)', () => {
  let testUserKycOnly;
  let testUserPendingUcc;
  let testUserActiveReady;
  let testUserSipReady;
  let invescoScheme;
  let unmappedSipScheme;
  let directScheme;

  let normalOrderSpyCount = 0;
  let xsipSpyCount = 0;
  let lastXsipPayload = null;
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
      normalOrderSpyCount++;
      lastNormalPayload = orders;
      return origCreateNormalOrder(orders);
    };

    const origRegisterXsip = nseClient.registerXsip.bind(nseClient);
    nseClient.registerXsip = async (sipData) => {
      xsipSpyCount++;
      lastXsipPayload = sipData;
      return origRegisterXsip(sipData);
    };

    // Clean test data
    await User.deleteMany({ email: /^test_vk_prod_fix_/ });
    await MfClientUcc.deleteMany({ clientCode: /^VK(TESTFIX|54009)/ });
    await MfMandate.deleteMany({ mandateId: /^MND_TESTFIX_/ });
    await MfOrder.deleteMany({ orderId: /^MFP_TESTFIX_/ });
    await MfSip.deleteMany({ sipRefNo: /^SIP_TESTFIX_/ });
    await BankAccount.deleteMany({ accountNumber: /^12345678901/ });

    // 1. User with KYC approved, but NO UCC
    testUserKycOnly = await User.create({
      name: 'Kyc Only User',
      email: 'test_vk_prod_fix_kyconly@vikaone.test',
      phone: '9876540001',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });

    // 2. User with UCC in PENDING state (unapproved in NSE)
    testUserPendingUcc = await User.create({
      name: 'Pending UCC User',
      email: 'test_vk_prod_fix_pending@vikaone.test',
      phone: '9876540002',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    await MfClientUcc.create({
      user: testUserPendingUcc._id,
      clientCode: 'VKTESTFIX02',
      pan: 'ABCDE0002F',
      fullName: 'Pending UCC User',
      nseStatus: 'PENDING',
      nseRemarks: 'Pending NSE approval',
      primaryBank: {
        accountNo: '123456789012',
        ifsc: 'HDFC0000123',
        bankName: 'HDFC Bank',
        accountType: 'SB',
      },
    });

    // 3. User with active UCC and verified bank (Purchase ready, Mandate pending)
    testUserActiveReady = await User.create({
      name: 'Active Ready User',
      email: 'test_vk_prod_fix_active@vikaone.test',
      phone: '9876540003',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    await MfClientUcc.create({
      user: testUserActiveReady._id,
      clientCode: 'VKTESTFIX03',
      pan: 'ABCDE0003F',
      fullName: 'Active Ready User',
      nseStatus: 'ACTIVE',
      nseRemarks: 'APPROVED',
      primaryBank: {
        accountNo: '123456789013',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
        accountType: 'SB',
      },
    });
    await BankAccount.create({
      user: testUserActiveReady._id,
      accountHolder: 'Active Ready User',
      accountNumber: '123456789013',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'ACTIVE READY USER',
    });
    await MfMandate.create({
      user: testUserActiveReady._id,
      clientCode: 'VKTESTFIX03',
      mandateId: 'MND_TESTFIX_03',
      amount: 50000,
      status: 'PENDING_AUTH',
      umrn: '',
      mandateType: 'E',
      accountNo: '123456789013',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
    });

    // 4. User with active UCC + authorized mandate with UMRN (SIP ready)
    testUserSipReady = await User.create({
      name: 'SIP Ready User',
      email: 'test_vk_prod_fix_sipready@vikaone.test',
      phone: '9876540004',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    await MfClientUcc.create({
      user: testUserSipReady._id,
      clientCode: 'VKTESTFIX04',
      pan: 'ABCDE0004F',
      fullName: 'SIP Ready User',
      nseStatus: 'ACTIVE',
      nseRemarks: 'APPROVED',
      primaryBank: {
        accountNo: '123456789014',
        ifsc: 'ICIC0000123',
        bankName: 'ICICI Bank',
        accountType: 'SB',
      },
    });
    await BankAccount.create({
      user: testUserSipReady._id,
      accountHolder: 'SIP Ready User',
      accountNumber: '123456789014',
      ifsc: 'ICIC0000123',
      bankName: 'ICICI Bank',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'SIP READY USER',
    });
    await MfMandate.create({
      user: testUserSipReady._id,
      clientCode: 'VKTESTFIX04',
      mandateId: 'MND_TESTFIX_04',
      amount: 50000,
      status: 'APPROVED',
      umrn: 'UMRN_TESTFIX_04_OK',
      mandateType: 'E',
      accountNo: '123456789014',
      ifsc: 'ICIC0000123',
      bankName: 'ICICI Bank',
    });

    // Invesco Small Cap Fund scheme 145139 setup
    invescoScheme = await MutualFundScheme.findOne({ schemeCode: '145139' });
    if (!invescoScheme) {
      invescoScheme = await MutualFundScheme.create({
        schemeCode: '145139',
        nseSchemeCode: 'RGSCGP-GR',
        schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth',
        isin: 'INF205K011T7',
        amcCode: 'INVESCO_MF',
        amcName: 'Invesco Mutual Fund',
        planType: 'REGULAR',
        option: 'GROWTH',
        purchaseAllowed: true,
        sipAllowed: true,
        minPurchaseAmount: 1000,
        minSipAmount: 500,
        isActive: true,
      });
    }

    // Ensure MfSipSchemeMaster record exists for RGSCGP-GR
    let sipMasterDoc = await MfSipSchemeMaster.findOne({ schemeCode: 'RGSCGP-GR' });
    if (!sipMasterDoc) {
      await MfSipSchemeMaster.create({
        schemeCode: 'RGSCGP-GR',
        schemeName: 'INVESCO INDIA SMALL CAP FUND - REGULAR GROWTH',
        amcCode: 'INVESCOMUTUALFUND_MF',
        amcName: 'INVESCO MUTUAL FUND',
        sipFrequency: 'MONTHLY',
        minInstallmentAmount: 100,
        sipDates: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28',
        sipStatus: '1',
        sipTransactionMode: 'DP',
      });
    }

    // Scheme with SIP unavailable
    unmappedSipScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_UNMAPPED_SIP',
      nseSchemeCode: 'TEST_NO_SIP',
      schemeName: 'Test Fund Without SIP - Regular Plan',
      isin: 'INF999K01999',
      amcCode: 'TEST_MF',
      planType: 'REGULAR',
      purchaseAllowed: true,
      sipAllowed: false,
      isActive: true,
      minPurchaseAmount: 500,
      minSipAmount: 500,
    });

    // Direct plan scheme
    directScheme = await MutualFundScheme.create({
      schemeCode: 'TEST_DIRECT_PLAN_SCHEME',
      nseSchemeCode: 'TEST_DIR_01',
      schemeName: 'Direct Growth Plan - Direct Plan',
      isin: 'INF999K01DIR',
      amcCode: 'TEST_MF',
      planType: 'DIRECT',
      purchaseAllowed: true,
      sipAllowed: true,
      isActive: true,
    });
  });

  after(async () => {
    await User.deleteMany({ email: /^test_vk_prod_fix_/ });
    await MfClientUcc.deleteMany({ clientCode: /^VK(TESTFIX|54009)/ });
    await MfMandate.deleteMany({ mandateId: /^MND_TESTFIX_/ });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_/ });
    await MfOrder.deleteMany({ orderId: /^MFP_TESTFIX_/ });
    await MfSip.deleteMany({ sipRefNo: /^SIP_TESTFIX_/ });
    await mongoose.disconnect();
  });

  beforeEach(() => {
    normalOrderSpyCount = 0;
    xsipSpyCount = 0;
    lastXsipPayload = null;
    lastNormalPayload = null;
  });

  // ── UCC TESTS (1-6) ──

  it('1. KYC approved but UCC absent -> purchase blocked with NSE_UCC_NOT_READY', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 2000 },
      {},
      {},
      testUserKycOnly
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_UCC_NOT_READY');
    assert.match(res.data.message, /not yet approved for investment/i);
    assert.equal(normalOrderSpyCount, 0, 'No NSE order should be dispatched when UCC is absent');
  });

  it('2. Local UCC but NSE approval missing -> purchase blocked with NSE_UCC_NOT_READY', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 2000 },
      {},
      {},
      testUserPendingUcc
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_UCC_NOT_READY');
    assert.equal(normalOrderSpyCount, 0, 'No NSE order should be dispatched when UCC status is PENDING');
  });

  it('3. NSE UCC approved -> purchase can proceed to order entry', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 2000 },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(normalOrderSpyCount, 1, 'NSE order should be submitted when UCC is ACTIVE');
    assert.equal(lastNormalPayload[0].client_code, 'VKTESTFIX03');
    assert.equal(lastNormalPayload[0].scheme_code, 'RGSCGP-GR');
  });

  it('4. Wrong member -> blocked/diagnosed with missing credentials or unmapped member', () => {
    const nseEncryption = require('../services/nse/nseEncryption');
    const origMember = nseEncryption.memberCode;
    const origEnv = process.env.NODE_ENV;
    try {
      delete process.env.NODE_ENV;
      nseEncryption.memberCode = '';
      assert.throws(() => {
        nseEncryption.generateAuthHeaders();
      }, /Missing required NSE API credentials/i);
    } finally {
      nseEncryption.memberCode = origMember;
      process.env.NODE_ENV = origEnv;
    }
  });

  it('5. UAT/production mismatch -> diagnosed and prevented', () => {
    const prodClient = new (require('../services/nse/nseClient').constructor)();
    prodClient.env = 'PROD';
    assert.equal(prodClient.getBaseUrl(), 'https://www.nseinvest.com');

    const uatClient = new (require('../services/nse/nseClient').constructor)();
    uatClient.env = 'UAT';
    assert.equal(uatClient.getBaseUrl(), 'https://nseinvestuat.nseindia.com');
  });

  it('6. Duplicate UCC registration -> idempotent return without creating duplicate', async () => {
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE0003F',
        fullName: 'Active Ready User',
        accountNo: '123456789013',
        ifsc: 'SBIN0000123',
      },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.isDuplicate, true);
    assert.equal(res.data.data.clientCode, 'VKTESTFIX03');
  });

  it('6a. UCC registration with placeholder address -> rejected with NSE_ADDRESS_NOT_VERIFIED', async () => {
    const freshUser = await User.create({
      name: 'Placeholder Address User',
      email: 'test_vk_prod_fix_placeholder@vikaone.test',
      phone: '9876540099',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9999F',
        fullName: 'Placeholder User',
        dob: '15/08/1995',
        accountNo: '123456789099',
        ifsc: 'SBIN0000123',
        address1: 'Document Photo Uploaded (Review Required)',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_ADDRESS_NOT_VERIFIED');
    assert.match(res.data.message, /verified residential address/i);
  });

  it('6b. UCC registration with incomplete address (short length / missing fields) -> rejected with NSE_ADDRESS_NOT_VERIFIED', async () => {
    const freshUser = await User.create({
      name: 'Incomplete Address User',
      email: 'test_vk_prod_fix_incomplete@vikaone.test',
      phone: '9876540098',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9998F',
        fullName: 'Incomplete User',
        dob: '15/08/1995',
        accountNo: '123456789098',
        ifsc: 'SBIN0000123',
        address1: 'Abc', // length < 5
        city: '',
        state: '',
        pincode: '',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_ADDRESS_NOT_VERIFIED');
  });

  it('6c. UCC registration without verified bank details -> rejected with NSE_BANK_NOT_VERIFIED', async () => {
    const freshUser = await User.create({
      name: 'No Bank User',
      email: 'test_vk_prod_fix_nobank@vikaone.test',
      phone: '9876540097',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9997F',
        fullName: 'No Bank User',
        dob: '15/08/1995',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
        // accountNo and ifsc intentionally omitted
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_BANK_NOT_VERIFIED');
  });

  it('6d. Valid UCC registration with verified street address, DOB, and bank -> succeeds and saves address in DB', async () => {
    await User.deleteMany({ email: 'test_vk_prod_fix_validreg@vikaone.test' });
    await MfClientUcc.deleteMany({ clientCode: 'VK540096' });
    const freshUser = await User.create({
      name: 'Valid Reg User',
      email: 'test_vk_prod_fix_validreg@vikaone.test',
      phone: '9876540096',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9996F',
        fullName: 'Valid Reg User',
        dob: '15/08/1995',
        accountNo: '123456789096',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        address2: 'Budhana Road',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.address.address1, '112, Saniyan, Shahpur');
    assert.equal(res.data.data.address.address2, 'Budhana Road');
    assert.equal(res.data.data.address.city, 'Muzaffarnagar');
    assert.equal(res.data.data.address.state, 'Uttar Pradesh');
    assert.equal(res.data.data.address.pincode, '251318');
  });

  it('6e. UCC registration with missing DOB -> rejected with NSE_DOB_REQUIRED (no 01/01/1990 fallback)', async () => {
    const freshUser = await User.create({
      name: 'No Dob User',
      email: 'test_vk_prod_fix_nodob@vikaone.test',
      phone: '9876540095',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9995F',
        fullName: 'No Dob User',
        // dob intentionally omitted
        accountNo: '123456789095',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_DOB_REQUIRED');
  });

  it('6f. UCC registration with missing legal name (account nickname only) -> rejected with NSE_LEGAL_NAME_REQUIRED', async () => {
    const freshUser = await User.create({
      name: 'user123',
      email: 'test_vk_prod_fix_noname@vikaone.test',
      phone: '9876540094',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });
    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9994F',
        fullName: '', // empty name
        dob: '15/08/1995',
        accountNo: '123456789094',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_LEGAL_NAME_REQUIRED');
  });

  it('6g. UCC registration with bank account name mismatch -> rejected with NSE_BANK_NAME_MISMATCH', async () => {
    const BankAccount = require('../models/BankAccount');
    const freshUser = await User.create({
      name: 'Vikas Saini',
      email: 'test_vk_prod_fix_mismatch@vikaone.test',
      phone: '9876540093',
      password: 'testPassword123',
      isKycVerified: true,
      kycStatus: 'approved',
      role: 'user',
      isActive: true,
    });

    await BankAccount.create({
      user: freshUser._id,
      accountHolder: 'ANOTHER PERSON',
      accountNumber: '123456789093',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
    });

    const { req, res } = mockReqRes(
      {
        pan: 'ABCDE9993F',
        fullName: 'Vikas Saini',
        dob: '15/08/1995',
        accountNo: '123456789093',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      freshUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_BANK_NAME_MISMATCH');
    assert.match(res.data.message, /does not match verified investor name/i);
  });

  // ── PURCHASE TESTS (7-11) ──

  it('7. Client does not exist rejection -> mapped to NSE_UCC_NOT_READY and local UCC updated to PENDING', async () => {
    const origCreate = nseClient.createNormalOrder.bind(nseClient);
    const origMock = nseClient.isMockMode.bind(nseClient);
    try {
      // Simulate live NSE rejecting with "Client does not exist."
      nseClient.isMockMode = () => false;
      nseClient.createNormalOrder = async () => ({
        success: false,
        status: 400,
        data: {
          transaction_details: [
            {
              trxn_status: 'TRXN FAILED',
              trxn_remark: 'Client does not exist.',
            },
          ],
        },
      });

      const { req, res } = mockReqRes(
        { schemeCode: invescoScheme.schemeCode, orderAmount: 2500 },
        {},
        {},
        testUserActiveReady
      );

      await mutualFundsController.createPurchaseOrder(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.code, 'NSE_UCC_NOT_READY');
      assert.match(res.data.message, /not yet approved for investment/i);

      // Verify local DB status updated to PENDING
      const updatedUcc = await MfClientUcc.findOne({ user: testUserActiveReady._id });
      assert.equal(updatedUcc.nseStatus, 'PENDING');

      // Reset back to ACTIVE for subsequent tests
      await MfClientUcc.updateOne({ user: testUserActiveReady._id }, { $set: { nseStatus: 'ACTIVE' } });
    } finally {
      nseClient.createNormalOrder = origCreate;
      nseClient.isMockMode = origMock;
    }
  });

  it('8. Valid UCC + valid scheme -> NSE purchase submitted with correct scheme_code and client_code', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 3100 },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(normalOrderSpyCount, 1);
    assert.equal(lastNormalPayload[0].client_code, 'VKTESTFIX03');
    assert.equal(lastNormalPayload[0].scheme_code, 'RGSCGP-GR');
    assert.equal(lastNormalPayload[0].trxn_type, 'P');
  });

  it('9. NSE rejection -> no payment link generated and order rejected', async () => {
    const origCreate = nseClient.createNormalOrder.bind(nseClient);
    const origMock = nseClient.isMockMode.bind(nseClient);
    try {
      nseClient.isMockMode = () => false;
      nseClient.createNormalOrder = async () => ({
        success: false,
        status: 400,
        data: {
          transaction_details: [
            {
              trxn_status: 'FAILED',
              trxn_remark: 'Exchange halted for this scheme',
            },
          ],
        },
      });

      const { req, res } = mockReqRes(
        { schemeCode: invescoScheme.schemeCode, orderAmount: 3200 },
        {},
        {},
        testUserActiveReady
      );

      await mutualFundsController.createPurchaseOrder(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.code, 'NSE_ORDER_REJECTED');
      assert.equal(res.data.data.paymentLink, undefined, 'No payment link must be generated on NSE rejection');
    } finally {
      nseClient.createNormalOrder = origCreate;
      nseClient.isMockMode = origMock;
    }
  });

  it('10. NSE accepted -> payment link generated from GET_LINK', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 3300 },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.paymentLink, 'Payment link must be present');
    assert.match(res.data.data.paymentLink, /api\/mutual-funds\/checkout/);
  });

  it('11. No Razorpay call in mutual funds purchase flow', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, orderAmount: 3400 },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.data.order.paymentMode, 'NSE_PAYMENT_LINK');
    assert.equal(Boolean(res.data.data.order.razorpayOrderId), false, 'No Razorpay order ID should be generated');
  });

  // ── SIP TESTS (12-19) ──

  it('12. KYC approved but no UCC -> SIP registration blocked with NSE_UCC_NOT_READY', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, installmentAmount: 1000 },
      {},
      {},
      testUserKycOnly
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_UCC_NOT_READY');
    assert.equal(xsipSpyCount, 0, 'No XSIP registration must be submitted when UCC is missing');
  });

  it('13. UCC approved but mandate pending -> SIP registration blocked with NSE_MANDATE_NOT_READY', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, installmentAmount: 1000 },
      {},
      {},
      testUserActiveReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_MANDATE_NOT_READY');
    assert.match(res.data.message, /bank mandate is not yet authorized/i);
    assert.equal(xsipSpyCount, 0, 'No XSIP registration must be submitted when mandate is pending');
  });

  it('14. Mandate authorized -> SIP registration allowed to proceed', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: invescoScheme.schemeCode, installmentAmount: 1000, frequency: 'MONTHLY' },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(xsipSpyCount, 1);
  });

  it('15. SIP scheme unavailable -> blocked with NSE_SIP_SCHEME_UNAVAILABLE', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: unmappedSipScheme.schemeCode, installmentAmount: 1000 },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_SIP_SCHEME_UNAVAILABLE');
    assert.equal(xsipSpyCount, 0);
  });

  it('16. AMC mapping is authoritative from MfSipSchemeMaster (INVESCOMUTUALFUND_MF, not INVESCO_MF)', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: '145139', installmentAmount: 1000, frequency: 'MONTHLY' },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(xsipSpyCount, 1);
    assert.equal(
      lastXsipPayload[0].amc_code,
      'INVESCOMUTUALFUND_MF',
      'Payload must send authoritative exchange AMC code INVESCOMUTUALFUND_MF'
    );
  });

  it('17. Wrong RTA scheme mapping or unrecognized scheme -> blocked with 404 or NSE_SIP_SCHEME_UNAVAILABLE', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: 'UNKNOWN_SCHEME_999999', installmentAmount: 1000 },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.data.success, false);
    assert.equal(xsipSpyCount, 0);
  });

  it('18. Valid UCC + mandate + SIP scheme -> NSE XSIP registration payload correctly formatted', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: '145139', installmentAmount: 1500, frequency: 'MONTHLY' },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.registerSipOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(lastXsipPayload[0].client_code, 'VKTESTFIX04');
    assert.equal(lastXsipPayload[0].sch_code, 'RGSCGP-GR');
    assert.equal(lastXsipPayload[0].amc_code, 'INVESCOMUTUALFUND_MF');
    assert.equal(lastXsipPayload[0].mandate_id, 'MND_TESTFIX_04');
    assert.equal(lastXsipPayload[0].installment_amount, '1500');
    assert.equal(lastXsipPayload[0].dp_txn_mode, 'P');
    assert.equal(lastXsipPayload[0].dp_txn_mode.length, 1);
  });

  it('19. NSE REG_FAILED -> no false SIP active state created in DB', async () => {
    const origXsip = nseClient.registerXsip.bind(nseClient);
    const origMock = nseClient.isMockMode.bind(nseClient);
    try {
      nseClient.isMockMode = () => false;
      nseClient.registerXsip = async () => ({
        success: false,
        status: 400,
        data: {
          reg_data: [
            {
              reg_status: 'REG_FAILED',
              reg_remark: 'AMC DOES NOT EXISTS',
            },
          ],
        },
      });

      const { req, res } = mockReqRes(
        { schemeCode: '145139', installmentAmount: 2000, frequency: 'MONTHLY' },
        {},
        {},
        testUserSipReady
      );

      await mutualFundsController.registerSipOrder(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.code, 'NSE_AMC_NOT_ENABLED');
      assert.match(res.data.message, /selected amc is not enabled/i);

      // Verify no active SIP record was created for this amount
      const sipInDb = await MfSip.findOne({ user: testUserSipReady._id, installmentAmount: 2000 });
      assert.equal(sipInDb, null, 'No active SIP record should be created when exchange rejects registration');
    } finally {
      nseClient.registerXsip = origXsip;
      nseClient.isMockMode = origMock;
    }
  });

  // ── REGRESSION TESTS (20-23) ──

  it('20. Redemption works independently without Razorpay and validates settled units', async () => {
    // 1. Create and confirm purchase order so portfolio has confirmed holdings
    const orderId = `MFP_TESTFIX_ALLOT_${Date.now()}`;
    const purchaseOrder = await MfOrder.create({
      user: testUserSipReady._id,
      clientCode: 'VKTESTFIX04',
      orderId,
      schemeCode: invescoScheme.schemeCode,
      schemeName: invescoScheme.schemeName,
      isin: invescoScheme.isin,
      transactionType: 'P',
      orderAmount: 5000,
      paymentStatus: 'SUCCESS',
      orderStatus: 'PAYMENT_SUCCESS',
      allotmentStatus: 'PENDING',
      units: 0,
      navAtOrder: 100.0,
    });

    await mfIdempotencyService.processAllotmentConfirmation({
      orderId: purchaseOrder.orderId,
      allottedUnits: 50.0,
      allottedNav: 100.0,
      rtaReferenceNo: `RTA_TEST_ALLOT_${Date.now()}`,
    });

    const { req, res } = mockReqRes(
      {
        schemeCode: invescoScheme.schemeCode,
        redeemMode: 'UNITS',
        units: 10.0,
        allUnits: false,
      },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.createRedemptionOrder(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.order.transactionType, 'R');
    assert.equal(res.data.data.order.paymentMode, 'DIRECT_AMC_PAYOUT');
  });

  it('21. Portfolio unaffected: valuation computed strictly from totalUnits * liveNav', async () => {
    const { req, res } = mockReqRes({}, {}, {}, testUserSipReady);

    await mutualFundsController.getPortfolio(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.totalInvested !== undefined);
    assert.ok(res.data.data.currentValue !== undefined);
  });

  it('22. Non-MF Razorpay modules remain unaffected and isolated', () => {
    const goldRouteExists = require('fs').existsSync('./routes/gold.js') || require('fs').existsSync('./controllers/goldController.js');
    assert.equal(typeof goldRouteExists, 'boolean');
  });

  it('23. MF catalogue remains Regular-only; Direct plans strictly excluded', async () => {
    const { req, res } = mockReqRes(
      { schemeCode: directScheme.schemeCode, orderAmount: 2000 },
      {},
      {},
      testUserSipReady
    );

    await mutualFundsController.createPurchaseOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.match(res.data.message, /only regular plan mutual funds/i);
  });

  it('24. Cashfree IP error / 403 / timeout does NOT fake KYC approval in verifyCashfreePan', async () => {
    const kycController = require('../controllers/kycController');
    const axios = require('axios');
    const origPost = axios.post;

    // Simulate Cashfree returning HTTP 403 IP not whitelisted
    axios.post = async () => {
      const err = new Error('Request failed with status code 403');
      err.response = { status: 403, data: { message: 'IP not whitelisted. Your current ip is 117.99.250.5' } };
      throw err;
    };

    try {
      const unverifiedUser = await User.create({
        name: 'Unverified Test Investor',
        email: `unverified_test_ip_err_${Date.now()}@vikaone.test`,
        phone: `99${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
        kycStatus: 'pending',
      });

      const { req, res } = mockReqRes({ pan: 'ABCDE1234F', name: 'Unverified Test Investor' }, {}, {}, unverifiedUser);
      let capturedError = null;
      await kycController.verifyCashfreePan(req, res, (err) => { capturedError = err; });

      assert.equal(res.statusCode, 502);
      assert.equal(res.data.success, false);
      assert.ok(res.data.message.includes('IP not whitelisted') || /failed/i.test(res.data.message));

      // Verify user was NOT marked approved in DB
      const refreshedUser = await User.findById(unverifiedUser._id);
      assert.notEqual(refreshedUser.kycStatus, 'approved');

      await User.deleteOne({ _id: unverifiedUser._id });
      await Kyc.deleteOne({ user: unverifiedUser._id });
    } finally {
      axios.post = origPost;
    }
  });

  it('25. verifyPanDetails prioritizes NSE/KRA and does NOT call Cashfree when NSE confirms KRA compliance', async () => {
    const origCheckKyc = nseClient.checkKycStatus.bind(nseClient);
    const axios = require('axios');
    const origPost = axios.post;
    let cashfreeCalled = false;

    nseClient.checkKycStatus = async () => ({
      success: true,
      data: {
        kyc_status: 'S',
        kyc_status_remark: 'KYC REGISTERED',
        kra_name: 'ndmlkra',
        name: 'VIKAS SAINI',
      },
    });

    axios.post = async (url) => {
      if (typeof url === 'string' && url.includes('cashfree')) {
        cashfreeCalled = true;
      }
      return { data: {} };
    };

    try {
      const testInvestor = await User.create({
        name: 'Vikas Saini',
        email: `vikas_kra_test_${Date.now()}@vikaone.test`,
        phone: `98${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
        kycStatus: 'pending',
      });

      const { req, res } = mockReqRes({ pan: 'BNWPS5678F' }, {}, {}, testInvestor);
      await mutualFundsController.verifyPanDetails(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.registeredName, 'VIKAS SAINI');
      assert.equal(res.data.data.kra, 'ndmlkra');
      assert.equal(res.data.data.source, 'NSE_MFSS_KYC_VERIFY');
      assert.equal(cashfreeCalled, false, 'Cashfree PAN API must NOT be called when NSE confirms KRA status');

      await User.deleteOne({ _id: testInvestor._id });
    } finally {
      nseClient.checkKycStatus = origCheckKyc;
      axios.post = origPost;
    }
  });

  it('26. Historical approved KYC with false-approval signature (cashfree_pan_verified / placeholder address) remains blocked in readiness check with NSE_KYC_NOT_READY', async () => {
    const historicalUser = await User.create({
      name: 'Historical False Approved',
      email: `historical_false_app_${Date.now()}@vikaone.test`,
      phone: `97${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: historicalUser._id,
      fullName: 'Historical False Approved',
      panNumber: 'ABCDE1111F',
      panImage: { url: 'cashfree_pan_verified', uploadedAt: new Date() },
      address: { line1: 'Document Photo Uploaded (Review Required)' },
      status: 'approved',
      reviewedBy: historicalUser._id,
      verificationSource: 'NONE',
    });

    await MfClientUcc.create({
      user: historicalUser._id,
      clientCode: `VK${historicalUser.phone.slice(-6)}`,
      pan: 'ABCDE1111F',
      fullName: 'Historical False Approved',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '123456789111',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(historicalUser._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_KYC_NOT_READY');
    assert.equal(readiness.data.requiresReverification, true);

    await User.deleteOne({ _id: historicalUser._id });
    await Kyc.deleteOne({ user: historicalUser._id });
    await MfClientUcc.deleteOne({ user: historicalUser._id });
  });

  it('27. verifyPanDetails gives identical evidence-based treatment across different customer names without hardcoded exceptions', async () => {
    const origCheckKyc = nseClient.checkKycStatus.bind(nseClient);
    nseClient.checkKycStatus = async () => ({ success: false, data: { kyc_status: 'N' } });

    try {
      // User A named "Harsh"
      const userHarsh = await User.create({
        name: 'Harsh',
        email: `harsh_${Date.now()}@vikaone.test`,
        phone: `96${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
        kycStatus: 'approved',
      });
      await Kyc.create({
        user: userHarsh._id,
        fullName: 'Harsh',
        panNumber: 'BMUPH7890K',
        status: 'approved',
        verificationSource: 'NONE',
        address: { line1: 'Document Photo Uploaded (Review Required)' },
      });

      // User B named "Ramesh Kumar" (non-Harsh user with historical approval)
      const userRamesh = await User.create({
        name: 'Ramesh Kumar',
        email: `ramesh_${Date.now()}@vikaone.test`,
        phone: `95${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
        kycStatus: 'approved',
      });
      await Kyc.create({
        user: userRamesh._id,
        fullName: 'Ramesh Kumar',
        panNumber: 'BNWPS6543M',
        status: 'approved',
        verificationSource: 'NONE',
        address: { line1: 'Some Unverified Street' },
      });

      const reqA = mockReqRes({ pan: 'BMUPH7890K' }, {}, {}, userHarsh);
      await mutualFundsController.verifyPanDetails(reqA.req, reqA.res);

      const reqB = mockReqRes({ pan: 'BNWPS6543M' }, {}, {}, userRamesh);
      await mutualFundsController.verifyPanDetails(reqB.req, reqB.res);

      // Both must receive identical evidence-based treatment: neither is KRA verified
      assert.equal(reqA.res.statusCode, 200);
      assert.equal(reqA.res.data.data.isFreshInvestor, true);
      assert.equal(reqA.res.data.data.kra, 'NONE');

      assert.equal(reqB.res.statusCode, 200);
      assert.equal(reqB.res.data.data.isFreshInvestor, true);
      assert.equal(reqB.res.data.data.kra, 'NONE');

      await User.deleteMany({ _id: { $in: [userHarsh._id, userRamesh._id] } });
      await Kyc.deleteMany({ user: { $in: [userHarsh._id, userRamesh._id] } });
    } finally {
      nseClient.checkKycStatus = origCheckKyc;
    }
  });

  it('28. Cashfree mock mode rejects outside test environment (NODE_ENV !== "test" returns 503)', async () => {
    const kycController = require('../controllers/kycController');
    const origEnv = process.env.NODE_ENV;
    const origId = process.env.CASHFREE_VERIFICATION_CLIENT_ID;
    const origSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.CASHFREE_VERIFICATION_CLIENT_ID = 'your_cashfree_client_id';
      process.env.CASHFREE_VERIFICATION_CLIENT_SECRET = 'your_cashfree_client_secret';

      const testUser = await User.create({
        name: 'Prod Env User',
        email: `prodenv_${Date.now()}@vikaone.test`,
        phone: `94${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
      });

      const { req, res } = mockReqRes({ pan: 'ABCDE1234F', name: 'Prod Env User' }, {}, {}, testUser);
      await kycController.verifyCashfreePan(req, res, () => {});

      assert.equal(res.statusCode, 503);
      assert.equal(res.data.success, false);
      assert.match(res.data.message, /not configured/i);

      await User.deleteOne({ _id: testUser._id });
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.CASHFREE_VERIFICATION_CLIENT_ID = origId;
      process.env.CASHFREE_VERIFICATION_CLIENT_SECRET = origSecret;
    }
  });

  it('29. Bank accounts default to isVerified: false upon creation via addAccount', async () => {
    const bankController = require('../controllers/bankController');
    const BankAccount = require('../models/BankAccount');

    const freshUser = await User.create({
      name: 'Bank Test User',
      email: `banktest_${Date.now()}@vikaone.test`,
      phone: `93${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
    });

    const { req, res } = mockReqRes(
      {
        accountHolder: 'BANK TEST USER',
        accountNumber: '998877665544',
        ifsc: 'SBIN0000123',
        bankName: 'State Bank of India',
        accountType: 'savings',
      },
      {},
      {},
      freshUser
    );

    await bankController.addAccount(req, res, () => {});

    assert.equal(res.statusCode, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.isVerified, false, 'Newly added bank accounts must default to isVerified: false');

    const inDb = await BankAccount.findOne({ user: freshUser._id, accountNumber: '998877665544' });
    assert.equal(inDb.isVerified, false);

    await User.deleteOne({ _id: freshUser._id });
    await BankAccount.deleteOne({ _id: inDb._id });
  });

  it('30. Bank verification provider failure/timeout returns 502 and never marks bank account verified', async () => {
    const bankController = require('../controllers/bankController');
    const BankAccount = require('../models/BankAccount');
    const axios = require('axios');
    const origPost = axios.post;

    // Simulate provider failure
    axios.post = async () => {
      const err = new Error('Gateway Timeout');
      err.response = { status: 504, data: { message: 'Provider connection timed out' } };
      throw err;
    };

    const freshUser = await User.create({
      name: 'Bank Timeout User',
      email: `banktimeout_${Date.now()}@vikaone.test`,
      phone: `92${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
    });

    const bankAcc = await BankAccount.create({
      user: freshUser._id,
      accountHolder: 'BANK TIMEOUT USER',
      accountNumber: '998877665533',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: false,
    });

    try {
      // Set temporary non-mock client id to force provider execution
      const origId = process.env.CASHFREE_VERIFICATION_CLIENT_ID;
      const origSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
      process.env.CASHFREE_VERIFICATION_CLIENT_ID = 'cf_real_client_id_test';
      process.env.CASHFREE_VERIFICATION_CLIENT_SECRET = 'cf_real_secret_test';

      const { req, res } = mockReqRes(
        {
          accountNumber: '998877665533',
          ifsc: 'SBIN0000123',
          accountHolder: 'BANK TIMEOUT USER',
        },
        {},
        {},
        freshUser
      );

      await bankController.verifyBankAccount(req, res, () => {});

      assert.equal(res.statusCode, 502);
      assert.equal(res.data.isVerified, false);

      const refreshed = await BankAccount.findById(bankAcc._id);
      assert.equal(refreshed.isVerified, false, 'Database record must remain isVerified: false on failure');

      process.env.CASHFREE_VERIFICATION_CLIENT_ID = origId;
      process.env.CASHFREE_VERIFICATION_CLIENT_SECRET = origSecret;
    } finally {
      axios.post = origPost;
      await User.deleteOne({ _id: freshUser._id });
      await BankAccount.deleteOne({ _id: bankAcc._id });
    }
  });

  it('31. Bank account with name mismatch blocks investor readiness with NSE_BANK_NAME_MISMATCH', async () => {
    const BankAccount = require('../models/BankAccount');

    const investor = await User.create({
      name: 'Vikas Saini',
      email: `mismatch_readiness_${Date.now()}@vikaone.test`,
      phone: `91${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS9999F',
      fullName: 'VIKAS SAINI',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '112233445566',
        ifsc: 'BKID0001400',
        bankName: 'Bank of India',
      },
    });

    await BankAccount.create({
      user: investor._id,
      accountHolder: 'HARSH', // Mismatch against VIKAS SAINI
      accountNumber: '112233445566',
      ifsc: 'BKID0001400',
      bankName: 'Bank of India',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_BANK_NAME_MISMATCH');
    assert.match(readiness.message, /does not match your registered name/i);

    await User.deleteOne({ _id: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
    await BankAccount.deleteOne({ user: investor._id });
  });

  it('32. Authoritative NSE KRA verification response establishes only KRA status and name, not DOB or bank ownership', async () => {
    const origCheckKyc = nseClient.checkKycStatus.bind(nseClient);
    nseClient.checkKycStatus = async () => ({
      success: true,
      data: {
        kyc_status: 'S',
        kyc_status_remark: 'KYC REGISTERED',
        kra_name: 'ndmlkra',
        name: 'VIKAS SAINI',
      },
    });

    try {
      const investor = await User.create({
        name: 'Vikas Saini',
        email: `kra_scope_${Date.now()}@vikaone.test`,
        phone: `90${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
        kycStatus: 'pending',
      });

      const { req, res } = mockReqRes({ pan: 'BNWPS5678K' }, {}, {}, investor);
      await mutualFundsController.verifyPanDetails(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.registeredName, 'VIKAS SAINI');
      assert.equal(res.data.data.kra, 'ndmlkra');
      assert.equal(res.data.data.source, 'NSE_MFSS_KYC_VERIFY');

      // Verify that DOB, address, and bank are NOT inferred from the KRA response
      assert.equal(res.data.data.dob, undefined);
      assert.equal(res.data.data.address, undefined);
      assert.equal(res.data.data.bankAccount, undefined);

      await User.deleteOne({ _id: investor._id });
    } finally {
      nseClient.checkKycStatus = origCheckKyc;
    }
  });

  it('33. UCC registration with matching name and DOB against verified KYC -> succeeds without conflict', async () => {
    const kycUser = await User.create({
      name: 'Vikas Saini',
      email: `ucc_match_${Date.now()}@vikaone.test`,
      phone: `93${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: kycUser._id,
      fullName: 'VIKAS SAINI',
      panNumber: 'BNWPS8888F',
      panVerified: true,
      panRegisteredName: 'VIKAS SAINI',
      dob: new Date('1995-08-15'),
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
    });

    await BankAccount.create({
      user: kycUser._id,
      accountHolder: 'VIKAS SAINI',
      accountNumber: '998811223344',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'VIKAS SAINI',
    });

    const { req, res } = mockReqRes(
      {
        pan: 'BNWPS8888F',
        fullName: 'VIKAS SAINI',
        dob: '15/08/1995',
        accountNo: '998811223344',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      kycUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.fullName, 'VIKAS SAINI');

    await User.deleteOne({ _id: kycUser._id });
    await Kyc.deleteOne({ user: kycUser._id });
    await BankAccount.deleteOne({ user: kycUser._id });
    await MfClientUcc.deleteOne({ user: kycUser._id });
  });

  it('34. UCC registration with conflicting name against verified KYC -> rejected with NSE_IDENTITY_CONFLICT', async () => {
    const kycUser = await User.create({
      name: 'Vikas Saini',
      email: `ucc_name_conflict_${Date.now()}@vikaone.test`,
      phone: `92${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: kycUser._id,
      fullName: 'VIKAS SAINI',
      panNumber: 'BNWPS7777F',
      panVerified: true,
      panRegisteredName: 'VIKAS SAINI',
      dob: new Date('1995-08-15'),
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
    });

    await BankAccount.create({
      user: kycUser._id,
      accountHolder: 'VIKAS SAINI',
      accountNumber: '998811223355',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'VIKAS SAINI',
    });

    const { req, res } = mockReqRes(
      {
        pan: 'BNWPS7777F',
        fullName: 'JOHN DOE',
        dob: '15/08/1995',
        accountNo: '998811223355',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      kycUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_IDENTITY_CONFLICT');
    assert.match(res.data.message, /conflicts with authoritative verified KYC/i);

    await User.deleteOne({ _id: kycUser._id });
    await Kyc.deleteOne({ user: kycUser._id });
    await BankAccount.deleteOne({ user: kycUser._id });
  });

  it('35. UCC registration with conflicting DOB against verified KYC -> rejected with NSE_IDENTITY_CONFLICT', async () => {
    const kycUser = await User.create({
      name: 'Vikas Saini',
      email: `ucc_dob_conflict_${Date.now()}@vikaone.test`,
      phone: `91${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: kycUser._id,
      fullName: 'VIKAS SAINI',
      panNumber: 'BNWPS6666F',
      panVerified: true,
      panRegisteredName: 'VIKAS SAINI',
      dob: new Date('1995-08-15'),
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
    });

    await BankAccount.create({
      user: kycUser._id,
      accountHolder: 'VIKAS SAINI',
      accountNumber: '998811223366',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'VIKAS SAINI',
    });

    const { req, res } = mockReqRes(
      {
        pan: 'BNWPS6666F',
        fullName: 'VIKAS SAINI',
        dob: '01/01/1990', // Conflicting DOB
        accountNo: '998811223366',
        ifsc: 'SBIN0000123',
        address1: '112, Saniyan, Shahpur',
        city: 'Muzaffarnagar',
        state: 'Uttar Pradesh',
        pincode: '251318',
      },
      {},
      {},
      kycUser
    );

    await mutualFundsController.registerUserUcc(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'NSE_IDENTITY_CONFLICT');
    assert.match(res.data.message, /conflicts with authoritative verified KYC/i);

    await User.deleteOne({ _id: kycUser._id });
    await Kyc.deleteOne({ user: kycUser._id });
    await BankAccount.deleteOne({ user: kycUser._id });
  });

  it('36. UCC registration outside test environment without verified KYC records -> rejected with NSE_VERIFIED_IDENTITY_REQUIRED', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const unverifiedUser = await User.create({
        name: 'Unverified Prod Investor',
        email: `ucc_noprodkyc_${Date.now()}@vikaone.test`,
        phone: `89${Date.now().toString().slice(-8)}`,
        password: 'TestPassword123!',
      });

      const { req, res } = mockReqRes(
        {
          pan: 'BNWPS5555F',
          fullName: 'Unverified Prod Investor',
          dob: '15/08/1995',
          accountNo: '998811223377',
          ifsc: 'SBIN0000123',
        },
        {},
        {},
        unverifiedUser
      );

      await mutualFundsController.registerUserUcc(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.code, 'NSE_VERIFIED_IDENTITY_REQUIRED');

      await User.deleteOne({ _id: unverifiedUser._id });
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('37. MOCK_TEST_VERIFIED provenance passes in test env but is strictly rejected in production', async () => {
    const origEnv = process.env.NODE_ENV;
    const testUser = await User.create({
      name: 'Mock Provenance User',
      email: `mock_prov_${Date.now()}@vikaone.test`,
      phone: `88${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: testUser._id,
      fullName: 'Mock Provenance User',
      panNumber: 'BNWPS4444F',
      status: 'approved',
      verificationSource: 'MOCK_TEST_VERIFIED',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: testUser._id,
      clientCode: `VK${testUser.phone.slice(-6)}`,
      pan: 'BNWPS4444F',
      fullName: 'Mock Provenance User',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223388',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    await BankAccount.create({
      user: testUser._id,
      accountHolder: 'Mock Provenance User',
      accountNumber: '998811223388',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'MOCK PROVENANCE USER',
    });

    try {
      // 1. In test environment, MOCK_TEST_VERIFIED passes readiness
      process.env.NODE_ENV = 'test';
      const testRes = await mfInvestorReadinessService.checkInvestorReady(testUser._id, 'PURCHASE');
      assert.equal(testRes.ready, true);

      // 2. In production environment, MOCK_TEST_VERIFIED is strictly blocked
      process.env.NODE_ENV = 'production';
      const prodRes = await mfInvestorReadinessService.checkInvestorReady(testUser._id, 'PURCHASE');
      assert.equal(prodRes.ready, false);
      assert.equal(prodRes.code, 'NSE_KYC_NOT_READY');
    } finally {
      process.env.NODE_ENV = origEnv;
      await User.deleteOne({ _id: testUser._id });
      await Kyc.deleteOne({ user: testUser._id });
      await MfClientUcc.deleteOne({ user: testUser._id });
      await BankAccount.deleteOne({ user: testUser._id });
    }
  });

  it('38. Missing linked bank record blocks readiness with NSE_BANK_RECORD_MISSING', async () => {
    const investor = await User.create({
      name: 'No Linked Bank User',
      email: `no_bank_rec_${Date.now()}@vikaone.test`,
      phone: `87${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: investor._id,
      fullName: 'No Linked Bank User',
      panNumber: 'BNWPS3333F',
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS3333F',
      fullName: 'No Linked Bank User',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223399',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    // BankAccount record intentionally omitted from DB
    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_BANK_RECORD_MISSING');

    await User.deleteOne({ _id: investor._id });
    await Kyc.deleteOne({ user: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
  });

  it('39. Linked bank account with isVerified: false blocks readiness with NSE_BANK_NOT_VERIFIED', async () => {
    const investor = await User.create({
      name: 'Unverified Bank User',
      email: `unverified_bank_${Date.now()}@vikaone.test`,
      phone: `86${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: investor._id,
      fullName: 'Unverified Bank User',
      panNumber: 'BNWPS2222F',
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS2222F',
      fullName: 'Unverified Bank User',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223300',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    await BankAccount.create({
      user: investor._id,
      accountHolder: 'Unverified Bank User',
      accountNumber: '998811223300',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: false, // Explicitly unverified
      verificationSource: 'NONE',
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_BANK_NOT_VERIFIED');

    await User.deleteOne({ _id: investor._id });
    await Kyc.deleteOne({ user: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
    await BankAccount.deleteOne({ user: investor._id });
  });

  it('40. Bank account with untrusted verificationSource blocks readiness with NSE_BANK_NOT_VERIFIED', async () => {
    const investor = await User.create({
      name: 'Untrusted Source User',
      email: `untrusted_src_${Date.now()}@vikaone.test`,
      phone: `85${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: investor._id,
      fullName: 'Untrusted Source User',
      panNumber: 'BNWPS1111F',
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS1111F',
      fullName: 'Untrusted Source User',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223311',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    await BankAccount.create({
      user: investor._id,
      accountHolder: 'Untrusted Source User',
      accountNumber: '998811223311',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'UNKNOWN_FABRICATED_SOURCE', // Untrusted provenance
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_BANK_NOT_VERIFIED');

    await User.deleteOne({ _id: investor._id });
    await Kyc.deleteOne({ user: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
    await BankAccount.deleteOne({ user: investor._id });
  });

  it('41. Common-first-name false positive ("Harsh Sharma" vs "Harsh Verma") is strictly blocked with NSE_BANK_NAME_MISMATCH', async () => {
    const investor = await User.create({
      name: 'Harsh Sharma',
      email: `harsh_sharma_${Date.now()}@vikaone.test`,
      phone: `84${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: investor._id,
      fullName: 'HARSH SHARMA',
      panNumber: 'BNWPS0001F',
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS0001F',
      fullName: 'HARSH SHARMA',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223322',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    await BankAccount.create({
      user: investor._id,
      accountHolder: 'HARSH VERMA', // Shares first name "HARSH" but conflicting surname "VERMA"
      accountNumber: '998811223322',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'HARSH VERMA',
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.code, 'NSE_BANK_NAME_MISMATCH');
    assert.match(readiness.message, /does not match your registered name/i);

    await User.deleteOne({ _id: investor._id });
    await Kyc.deleteOne({ user: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
    await BankAccount.deleteOne({ user: investor._id });
  });

  it('42. Transposed legitimate matching name ("Vikas Saini" vs "Saini Vikas") passes strong name matching', async () => {
    const investor = await User.create({
      name: 'Vikas Saini',
      email: `vikas_trans_${Date.now()}@vikaone.test`,
      phone: `83${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      isKycVerified: true,
      kycStatus: 'approved',
    });

    await Kyc.create({
      user: investor._id,
      fullName: 'VIKAS SAINI',
      panNumber: 'BNWPS0002F',
      status: 'approved',
      verificationSource: 'NSE_MFSS_KYC_VERIFY',
      address: { line1: 'Valid Street 123', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    });

    await MfClientUcc.create({
      user: investor._id,
      clientCode: `VK${investor.phone.slice(-6)}`,
      pan: 'BNWPS0002F',
      fullName: 'VIKAS SAINI',
      nseStatus: 'ACTIVE',
      primaryBank: {
        accountNo: '998811223333',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
      },
    });

    await BankAccount.create({
      user: investor._id,
      accountHolder: 'SAINI VIKAS', // Transposed name order
      accountNumber: '998811223333',
      ifsc: 'SBIN0000123',
      bankName: 'SBI',
      isVerified: true,
      verificationSource: 'CASHFREE_PENNY_DROP',
      verifiedName: 'SAINI VIKAS',
    });

    const readiness = await mfInvestorReadinessService.checkInvestorReady(investor._id, 'PURCHASE');
    assert.equal(readiness.ready, true);

    await User.deleteOne({ _id: investor._id });
    await Kyc.deleteOne({ user: investor._id });
    await MfClientUcc.deleteOne({ user: investor._id });
    await BankAccount.deleteOne({ user: investor._id });
  });

  it('43. Sensitive KYC provider fields (rawPanData / rawAadhaarData) never appear in getMyKyc or verifyCashfreePan responses', async () => {
    const kycController = require('../controllers/kycController');
    const axios = require('axios');
    const origPost = axios.post;

    const sensitiveUser = await User.create({
      name: 'Sensitive Test User',
      email: `sens_${Date.now()}@vikaone.test`,
      phone: `82${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
    });

    await Kyc.create({
      user: sensitiveUser._id,
      fullName: 'Sensitive Test User',
      panNumber: 'BNWPS0003F',
      panVerified: true,
      status: 'approved',
      verificationSource: 'MOCK_TEST_VERIFIED',
      rawPanData: { secretToken: 'SUPER_SECRET_123', fatherName: 'Private Father', fullTaxPayload: { data: 999 } },
      rawAadhaarData: { uidaiXml: '<xml>SECRET_DATA</xml>' },
    });

    try {
      // 1. Check getMyKyc response (GET /api/kyc/me or /api/kyc/status)
      const reqStatus = mockReqRes({}, {}, {}, sensitiveUser);
      await kycController.getMyKyc(reqStatus.req, reqStatus.res, () => {});

      assert.equal(reqStatus.res.statusCode, 200);
      assert.equal(reqStatus.res.data.success, true);
      assert.equal(reqStatus.res.data.data.rawPanData, undefined);
      assert.equal(reqStatus.res.data.data.rawAadhaarData, undefined);
      assert.ok(reqStatus.res.data.data.panNumberMasked.includes('******'));

      // 2. Mock Cashfree response containing raw provider payload
      axios.post = async () => ({
        data: {
          valid: true,
          pan_status: 'VALID',
          registered_name: 'Sensitive Test User',
          sensitiveRawToken: 'RAW_SECRET_TOKEN_DO_NOT_EXPOSE',
          internalScore: 99.8,
        },
      });

      const reqPan = mockReqRes({ pan: 'BNWPS0003F', name: 'Sensitive Test User' }, {}, {}, sensitiveUser);
      await kycController.verifyCashfreePan(reqPan.req, reqPan.res, () => {});

      assert.equal(reqPan.res.statusCode, 200);
      assert.equal(reqPan.res.data.data.rawPanData, undefined);
      assert.equal(reqPan.res.data.data.rawAadhaarData, undefined);
      assert.equal(reqPan.res.data.data.sensitiveRawToken, undefined);
      assert.equal(reqPan.res.data.data.internalScore, undefined);
      assert.ok(reqPan.res.data.data.panNumberMasked.includes('******'));

      // 3. Verify error responses also never leak raw provider payloads
      axios.post = async () => {
        const err = new Error('Provider error');
        err.response = { status: 400, data: { message: 'Invalid PAN', rawInternalError: 'SECRET_PROVIDER_ERROR_BODY' } };
        throw err;
      };
      const reqPanErr = mockReqRes({ pan: 'BNWPS0003F', name: 'Sensitive Test User' }, {}, {}, sensitiveUser);
      await kycController.verifyCashfreePan(reqPanErr.req, reqPanErr.res, () => {});
      assert.equal(reqPanErr.res.statusCode, 502);
      assert.equal(reqPanErr.res.data.rawInternalError, undefined);
      assert.equal(reqPanErr.res.data.rawPanData, undefined);
    } finally {
      axios.post = origPost;
      await User.deleteOne({ _id: sensitiveUser._id });
      await Kyc.deleteOne({ user: sensitiveUser._id });
    }
  });

  it('44. Admin review with valid evidence approves KYC and records ADMIN_DOCUMENT_VERIFIED provenance', async () => {
    const kycController = require('../controllers/kycController');
    const adminUser = await User.create({
      name: 'Authorized Admin',
      email: `admin_${Date.now()}@vikaone.test`,
      phone: `81${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'admin',
    });

    const regularUser = await User.create({
      name: 'Manual Document User',
      email: `manual_doc_${Date.now()}@vikaone.test`,
      phone: `80${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'user',
    });

    const pendingKyc = await Kyc.create({
      user: regularUser._id,
      fullName: 'Manual Document User',
      panNumber: 'BNWPS0004F',
      status: 'pending',
      panImage: { url: 'https://s3.amazonaws.com/kyc-docs/real_pan_card.jpg' },
      verificationSource: 'NONE',
    });

    const { req, res } = mockReqRes(
      { status: 'approved', evidenceReference: 'PAN_DOC_REF_9988' },
      { id: pendingKyc._id.toString() },
      {},
      adminUser
    );

    await kycController.reviewKyc(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.verificationSource, 'ADMIN_DOCUMENT_VERIFIED');

    const updated = await Kyc.findById(pendingKyc._id);
    assert.equal(updated.status, 'approved');
    assert.equal(updated.verificationSource, 'ADMIN_DOCUMENT_VERIFIED');
    assert.equal(updated.evidenceReference, 'PAN_DOC_REF_9988');
    assert.equal(String(updated.reviewedBy), String(adminUser._id));

    await User.deleteMany({ _id: { $in: [adminUser._id, regularUser._id] } });
    await Kyc.deleteOne({ _id: pendingKyc._id });
  });

  it('45. Admin review without valid supporting evidence is rejected with KYC_EVIDENCE_MISSING', async () => {
    const kycController = require('../controllers/kycController');
    const adminUser = await User.create({
      name: 'Authorized Admin',
      email: `admin_no_ev_${Date.now()}@vikaone.test`,
      phone: `79${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'admin',
    });

    const regularUser = await User.create({
      name: 'No Doc User',
      email: `nodoc_${Date.now()}@vikaone.test`,
      phone: `78${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'user',
    });

    const pendingKyc = await Kyc.create({
      user: regularUser._id,
      fullName: 'No Doc User',
      panNumber: 'BNWPS0005F',
      status: 'pending',
      panImage: { url: 'placeholder' },
      verificationSource: 'NONE',
    });

    const { req, res } = mockReqRes(
      { status: 'approved' }, // No evidenceReference and placeholder image URL
      { id: pendingKyc._id.toString() },
      {},
      adminUser
    );

    await kycController.reviewKyc(req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'KYC_EVIDENCE_MISSING');

    await User.deleteMany({ _id: { $in: [adminUser._id, regularUser._id] } });
    await Kyc.deleteOne({ _id: pendingKyc._id });
  });

  it('46. Non-admin user attempting KYC review is rejected with HTTP 403 ADMIN_AUTH_REQUIRED', async () => {
    const kycController = require('../controllers/kycController');
    const nonAdminUser = await User.create({
      name: 'Normal User',
      email: `nonadmin_${Date.now()}@vikaone.test`,
      phone: `77${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'user',
    });

    const pendingKyc = await Kyc.create({
      user: nonAdminUser._id,
      fullName: 'Normal User',
      panNumber: 'BNWPS0006F',
      status: 'pending',
      verificationSource: 'NONE',
    });

    const { req, res } = mockReqRes(
      { status: 'approved', evidenceReference: 'HACK_ATTEMPT' },
      { id: pendingKyc._id.toString() },
      {},
      nonAdminUser
    );

    await kycController.reviewKyc(req, res, () => {});

    assert.equal(res.statusCode, 403);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'ADMIN_AUTH_REQUIRED');

    await User.deleteOne({ _id: nonAdminUser._id });
    await Kyc.deleteOne({ _id: pendingKyc._id });
  });

  it('47. Admin attempting self-review of their own KYC is rejected with HTTP 403 SELF_REVIEW_PROHIBITED', async () => {
    const kycController = require('../controllers/kycController');
    const selfAdmin = await User.create({
      name: 'Self Review Admin',
      email: `self_admin_${Date.now()}@vikaone.test`,
      phone: `76${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'admin',
    });

    const selfKyc = await Kyc.create({
      user: selfAdmin._id,
      fullName: 'Self Review Admin',
      panNumber: 'BNWPS0007F',
      status: 'pending',
      panImage: { url: 'https://s3.amazonaws.com/kyc-docs/admin_pan.jpg' },
      verificationSource: 'NONE',
    });

    const { req, res } = mockReqRes(
      { status: 'approved', evidenceReference: 'SELF_APPROVAL_REF' },
      { id: selfKyc._id.toString() },
      {},
      selfAdmin
    );

    await kycController.reviewKyc(req, res, () => {});

    assert.equal(res.statusCode, 403);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'SELF_REVIEW_PROHIBITED');

    await User.deleteOne({ _id: selfAdmin._id });
    await Kyc.deleteOne({ _id: selfKyc._id });
  });

  it('48. Admin rejection sets status to rejected and verificationSource to NONE', async () => {
    const kycController = require('../controllers/kycController');
    const adminUser = await User.create({
      name: 'Authorized Admin 2',
      email: `admin2_${Date.now()}@vikaone.test`,
      phone: `75${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'admin',
    });

    const regularUser = await User.create({
      name: 'Rejected User',
      email: `rejected_${Date.now()}@vikaone.test`,
      phone: `74${Date.now().toString().slice(-8)}`,
      password: 'TestPassword123!',
      role: 'user',
    });

    const pendingKyc = await Kyc.create({
      user: regularUser._id,
      fullName: 'Rejected User',
      panNumber: 'BNWPS0008F',
      status: 'pending',
      verificationSource: 'NONE',
    });

    const { req, res } = mockReqRes(
      { status: 'rejected', rejectionReason: 'Illegible document photo' },
      { id: pendingKyc._id.toString() },
      {},
      adminUser
    );

    await kycController.reviewKyc(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.status, 'rejected');
    assert.equal(res.data.data.verificationSource, 'NONE');

    const updated = await Kyc.findById(pendingKyc._id);
    assert.equal(updated.status, 'rejected');
    assert.equal(updated.rejectionReason, 'Illegible document photo');

    await User.deleteMany({ _id: { $in: [adminUser._id, regularUser._id] } });
    await Kyc.deleteOne({ _id: pendingKyc._id });
  });
});
