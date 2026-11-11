const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
process.env.NODE_ENV = 'test';
process.env.NSE_MOCK_MODE = 'true';
const nseClient = require('../services/nse/nseClient');

describe('NSE MFSS eKYC Integration Test Suite (Non-Blocking Flow)', () => {
  before(() => {
    nseClient.mockModeOverride = true;
  });

  after(() => {
    nseClient.mockModeOverride = undefined;
  });

  it('1. initiateEkycRegistration should return valid eKYC link from NSE', async () => {
    const res = await nseClient.initiateEkycRegistration({
      amcCode: 'DSP',
      panNo: 'ABCDE1234F',
      mobileNo: '9876543210',
      invEmail: 'test@example.com',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.link, 'Should return eKYC link');
    assert.ok(res.data.link.includes('ekycVerifyByUser'), 'Link must contain ekycVerifyByUser');
    assert.ok(res.data.message.includes('EKYC'), 'Message should confirm EKYC registration');
  });

  it('2. checkClientKycStatus should query CLIENT_KYC_REPORT', async () => {
    const res = await nseClient.checkClientKycStatus('ABCDE1234F');
    assert.strictEqual(res.status, 400, 'Dummy PAN should return 400 in mock mode');
    assert.strictEqual(res.data.kyc_status, 'F');

    const realRes = await nseClient.checkClientKycStatus('BMUPH5075D');
    assert.strictEqual(realRes.success, true);
    assert.strictEqual(realRes.data.response_status, 'S');
    assert.ok(Array.isArray(realRes.data.report_data));
  });

  it('3. Controller initiateEkyc and checkEkycStatus exported successfully', () => {
    const mfController = require('../controllers/mutualFundsController');
    assert.strictEqual(typeof mfController.initiateEkyc, 'function');
    assert.strictEqual(typeof mfController.checkEkycStatus, 'function');
    assert.strictEqual(typeof mfController.verifyPanDetails, 'function');
  });

  it('4. Backward-compatible PAN verification contract includes non-blocking flags', async () => {
    const mfController = require('../controllers/mutualFundsController');
    let jsonResult = null;
    let statusCode = 200;
    const req = {
      body: { pan: 'BMUPH5075D' },
      user: { id: null },
    };
    const res = {
      json: (data) => { jsonResult = data; return res; },
      status: (code) => { statusCode = code; return res; },
    };

    await mfController.verifyPanDetails(req, res);
    assert.ok(jsonResult, 'Must return JSON');
    assert.strictEqual(jsonResult.success, true);
    assert.strictEqual(jsonResult.data.canProceedToUcc, true, 'canProceedToUcc must be true (non-blocking)');
    assert.strictEqual(typeof jsonResult.data.requiresEkyc, 'boolean');
    assert.strictEqual(typeof jsonResult.data.kycCompliant, 'boolean');
  });

  it('5. resolveRtaAmcCode correctly maps broker/friendly AMC codes to official NSE RTA AMC codes', () => {
    assert.strictEqual(nseClient.resolveRtaAmcCode('DSP'), 'G', 'DSP should map to G (DSP Mutual Fund on CAMS)');
    assert.strictEqual(nseClient.resolveRtaAmcCode('HDFC'), 'H', 'HDFC should map to H');
    assert.strictEqual(nseClient.resolveRtaAmcCode('BIRLA'), 'B', 'BIRLA should map to B');
    assert.strictEqual(nseClient.resolveRtaAmcCode('AXIS'), 'AXF', 'AXIS should map to AXF');
    assert.strictEqual(nseClient.resolveRtaAmcCode('KOTAK'), 'K', 'KOTAK should map to K');
    assert.strictEqual(nseClient.resolveRtaAmcCode('CANARA'), 'CR', 'CANARA should map to CR');
    assert.strictEqual(nseClient.resolveRtaAmcCode('HSBC'), 'O', 'HSBC should map to O');
    assert.strictEqual(nseClient.resolveRtaAmcCode('UTI'), 'UK', 'UTI should map to UK');
    assert.strictEqual(nseClient.resolveRtaAmcCode(''), 'H', 'Empty AMC should default to H');
    assert.strictEqual(nseClient.resolveRtaAmcCode(null), 'H', 'Null AMC should default to H');
    assert.strictEqual(nseClient.resolveRtaAmcCode('G'), 'G', 'Direct G code should remain G');
    assert.strictEqual(nseClient.resolveRtaAmcCode('H'), 'H', 'Direct H code should remain H');
  });

  it('6. initiateEkycRegistration fallback logic recovers when an AMC code is rejected as invalid', async () => {
    // Simulate temporary override of post method to verify retry on 'Invalid RTA AMC code'
    const originalPost = nseClient.post.bind(nseClient);
    const attemptedCodes = [];
    try {
      nseClient.mockModeOverride = false;
      nseClient.post = async (endpoint, payload) => {
        if (endpoint.includes('EKYCREG')) {
          attemptedCodes.push(payload.amcCode);
          if (payload.amcCode === 'H') {
            return {
              success: false,
              status: 400,
              message: 'Invalid RTA AMC code. Please Insert appropriate RTA AMC code ',
              error: { success: false, message: 'Invalid RTA AMC code. Please Insert appropriate RTA AMC code ' },
            };
          }
          // Second attempt succeeds
          return {
            success: true,
            status: 200,
            data: {
              link: 'https://nseinvestuat.nseindia.com/nsemfdesk/ekycVerifyByUser/TEST_MOCK_TOKEN',
              message: 'EKYC FRESH REGISTRATION REQUEST RECEVIED',
            },
          };
        }
        return originalPost(endpoint, payload);
      };

      const res = await nseClient.initiateEkycRegistration({
        amcCode: 'H',
        panNo: 'BNWPS7663F',
        mobileNo: '9997143007',
        invEmail: 'test@example.com',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.usedAmcCode, 'G', 'Should have fallen back to next candidate code G');
      assert.deepStrictEqual(attemptedCodes.slice(0, 2), ['H', 'G'], 'Must attempt H then G');
      assert.ok(res.data.link.includes('TEST_MOCK_TOKEN'));
    } finally {
      nseClient.post = originalPost;
      nseClient.mockModeOverride = true;
    }
  });
});
