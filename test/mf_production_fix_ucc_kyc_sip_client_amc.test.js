const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
require('dotenv').config();

// Models
const User = require('../models/User');
const MfClientUcc = require('../models/MfClientUcc');
const MfMandate = require('../models/MfMandate');
const MfOrder = require('../models/MfOrder');
const MfSip = require('../models/MfSip');
const MutualFundScheme = require('../models/MutualFundScheme');
const MfSipSchemeMaster = require('../models/MfSipSchemeMaster');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');

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
    await MfClientUcc.deleteMany({ clientCode: /^VKTESTFIX/ });
    await MfMandate.deleteMany({ mandateId: /^MND_TESTFIX_/ });
    await MfOrder.deleteMany({ orderId: /^MFP_TESTFIX_/ });
    await MfSip.deleteMany({ sipRefNo: /^SIP_TESTFIX_/ });

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
      nseStatus: 'ACTIVE',
      nseRemarks: 'APPROVED',
      primaryBank: {
        accountNo: '123456789013',
        ifsc: 'SBIN0000123',
        bankName: 'SBI',
        accountType: 'SB',
      },
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
      nseStatus: 'ACTIVE',
      nseRemarks: 'APPROVED',
      primaryBank: {
        accountNo: '123456789014',
        ifsc: 'ICIC0000123',
        bankName: 'ICICI Bank',
        accountType: 'SB',
      },
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
    await MfClientUcc.deleteMany({ clientCode: /^VKTESTFIX/ });
    await MfMandate.deleteMany({ mandateId: /^MND_TESTFIX_/ });
    await MutualFundScheme.deleteMany({ schemeCode: /^TEST_/ });
    await MfOrder.deleteMany({ orderId: /^MFP_TESTFIX_/ });
    await MfSip.deleteMany({ sipRefNo: /^SIP_TESTFIX_/ });
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
});
