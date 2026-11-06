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
});
