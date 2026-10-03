const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateSchemeIdentity } = require('../services/mfIntelligenceService');

describe('VikaOne Production — Exact Scheme Identity Tests', () => {
  const verifiedTarget = {
    schemeCode: '145139',
    amfiCode: '145139',
    isin: 'INF205K011T7',
    amcCode: 'INVESCO_MF',
    planType: 'REGULAR',
    option: 'GROWTH',
  };

  it('1. Verifies exact unambiguous Regular Growth scheme identity', () => {
    const validScheme = {
      schemeCode: '145139',
      schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth',
      planType: 'REGULAR',
      option: 'GROWTH',
      amcCode: 'INVESCO_MF',
      isin: 'INF205K011T7',
    };

    const res = validateSchemeIdentity(validScheme, verifiedTarget);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.code, 'LIVE_VERIFIED');
  });

  it('2. Strictly rejects Direct Plan from Regular ingestion', () => {
    const directScheme = {
      schemeCode: '145140',
      schemeName: 'Invesco India Small Cap Fund - Direct Plan - Growth',
      planType: 'DIRECT',
      option: 'GROWTH',
      amcCode: 'INVESCO_MF',
    };

    const res = validateSchemeIdentity(directScheme, verifiedTarget);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'IDENTITY_AMBIGUOUS');
    assert.strictEqual(res.reason, 'DIRECT_PLAN_FORBIDDEN');
  });

  it('3. Rejects scheme with ambiguous "Direct" in name even if labeled Regular', () => {
    const sneakyScheme = {
      schemeCode: '145139',
      schemeName: 'Invesco India Small Cap Direct Growth',
      planType: 'REGULAR',
      option: 'GROWTH',
    };

    const res = validateSchemeIdentity(sneakyScheme, verifiedTarget);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'IDENTITY_AMBIGUOUS');
    assert.strictEqual(res.reason, 'DIRECT_PLAN_FORBIDDEN');
  });

  it('4. Rejects Option mismatch (IDCW vs Growth)', () => {
    const idcwScheme = {
      schemeCode: '145139',
      schemeName: 'Invesco India Small Cap Fund - Regular Plan - IDCW',
      planType: 'REGULAR',
      option: 'IDCW',
      amcCode: 'INVESCO_MF',
      isin: 'INF205K011T7',
    };

    const res = validateSchemeIdentity(idcwScheme, verifiedTarget);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'IDENTITY_AMBIGUOUS');
    assert.ok(res.reason.includes('OPTION_MISMATCH'));
  });

  it('5. Rejects ISIN mismatch across cross-catalog records', () => {
    const isinConflict = {
      schemeCode: '145139',
      schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth',
      planType: 'REGULAR',
      option: 'GROWTH',
      amcCode: 'INVESCO_MF',
      isin: 'INF999K01999', // Mismatched ISIN
    };

    const res = validateSchemeIdentity(isinConflict, verifiedTarget);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'IDENTITY_AMBIGUOUS');
    assert.ok(res.reason.includes('ISIN_MISMATCH'));
  });

  it('6. Rejects AMC mismatch across schemes', () => {
    const amcConflict = {
      schemeCode: '145139',
      schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth',
      planType: 'REGULAR',
      option: 'GROWTH',
      amcCode: 'HDFC_MF', // Mismatched AMC
      isin: 'INF205K011T7',
    };

    const res = validateSchemeIdentity(amcConflict, verifiedTarget);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'IDENTITY_AMBIGUOUS');
    assert.ok(res.reason.includes('AMC_MISMATCH'));
  });
});
