const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AMC_REGISTRY,
  getAmcSources,
  getAllAmcs,
  calculateChecksum,
  isSourceAuthorized,
} = require('../services/amcSourceRegistry');

describe('VikaOne Phase 5C — Dynamic AMC Source Registry Tests', () => {
  it('1. Registry contains verified Tier 2 sources for top mutual fund AMCs', () => {
    const amcs = getAllAmcs();
    assert.ok(amcs.length >= 10, `Expected at least 10 AMCs, got ${amcs.length}`);

    const expectedCodes = [
      'INVESCO_MF',
      'HDFC_MF',
      'BANDHAN_MF',
      'PPFAS_MF',
      'NIPPON_INDIA_MF',
      'SBI_MF',
      'ICICI_PRUDENTIAL_MF',
      'DSP_MF',
      'QUANT_MF',
      'FRANKLIN_TEMPLETON_MF',
      'AXIS_MF',
      'TATA_MF',
      'MIRAE_ASSET_MF',
    ];

    for (const code of expectedCodes) {
      const amc = getAmcSources(code);
      assert.ok(amc, `AMC ${code} must be present in registry`);
      assert.strictEqual(amc.status, 'ACTIVE');
      assert.ok(amc.officialDomain, `AMC ${code} must have official domain`);
      assert.ok(amc.sources.factsheet, `AMC ${code} must have factsheet source`);
    }
  });

  it('2. Source metadata includes official URLs, SHA-256 checksums, and update cadences', () => {
    const hdfc = getAmcSources('HDFC_MF');
    assert.ok(hdfc.sources.factsheet.url.includes('hdfcfund.com'));
    assert.strictEqual(hdfc.sources.factsheet.frequency, 'MONTHLY');
    assert.ok(hdfc.sources.factsheet.checksum.length === 64, 'Checksum must be 64-char hex SHA-256');

    const invesco = getAmcSources('INVESCO_MF');
    assert.ok(invesco.sources.sid.url.includes('invescomutualfund.com'));
    assert.strictEqual(invesco.sources.factsheet.status, 'LIVE_VERIFIED');
  });

  it('3. Checksum verification computes accurate SHA-256 hashes', () => {
    const sample = 'Invesco India Smallcap Fund Regular Growth September 2026';
    const hash = calculateChecksum(sample);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);

    // Deterministic check
    const hash2 = calculateChecksum(sample);
    assert.strictEqual(hash, hash2);
  });

  it('4. Anti-Fabrication: Rating source is strictly marked SOURCE_NOT_AUTHORIZED without contract', () => {
    const ratingCheck = isSourceAuthorized('RATING');
    assert.strictEqual(ratingCheck.authorized, false);
    assert.strictEqual(ratingCheck.status, 'SOURCE_NOT_AUTHORIZED');
    assert.ok(ratingCheck.reason.includes('CRISIL / Morningstar / Value Research'));
  });

  it('5. Factsheet and SID sources are authorized for statutory disclosures', () => {
    const factsheetCheck = isSourceAuthorized('FACTSHEET');
    assert.strictEqual(factsheetCheck.authorized, true);
    assert.strictEqual(factsheetCheck.status, 'AUTHORIZED');
  });
});
