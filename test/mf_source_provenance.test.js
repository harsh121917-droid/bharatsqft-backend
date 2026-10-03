const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateFundReturns } = require('../services/mfReturnEngine');
const { getAmcSources, calculateChecksum, isSourceAuthorized } = require('../services/amcSourceRegistry');
const { getSchemeIntelligence } = require('../services/mfIntelligenceService');

describe('VikaOne Production — Source Provenance & Lineage Tests', () => {
  it('1. Statutory facts include complete field-level provenance metadata', () => {
    const invesco = getSchemeIntelligence('145139');
    assert.ok(invesco, 'Invesco statutory facts must exist');
    assert.strictEqual(invesco.schemeCode, '145139');
    assert.strictEqual(invesco.planType, 'REGULAR');
    assert.strictEqual(invesco.option, 'GROWTH');

    const prov = invesco.dataProvenance;
    assert.ok(prov, 'dataProvenance must be defined');
    assert.strictEqual(prov.source, 'AMC_OFFICIAL_FACTSHEET');
    assert.ok(prov.sourceDoc.includes('Invesco'));
    assert.ok(prov.asOfDate);
    assert.ok(prov.verifiedAt);
    assert.strictEqual(prov.status, 'VERIFIED');
  });

  it('2. Returns engine exposes complete Section 5 audit provenance for each period', () => {
    const mockSeries = [
      { date: '2023-09-29', nav: 100.0 },
      { date: '2026-10-01', nav: 150.0 },
    ];
    const res = calculateFundReturns(mockSeries, { schemeCode: '145139' });
    const p3Y = res.provenance['3Y'];

    assert.ok(p3Y, '3Y provenance must exist');
    assert.strictEqual(p3Y.targetDate, '2023-10-01');
    assert.strictEqual(p3Y.selectedNavDate, '2023-09-29');
    assert.strictEqual(p3Y.startNAV, 100.0);
    assert.strictEqual(p3Y.endNAV, 150.0);
    assert.strictEqual(p3Y.elapsedYears, 3);
    assert.strictEqual(p3Y.formula, '((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100');
    assert.strictEqual(p3Y.methodology, 'CAGR');
    assert.strictEqual(p3Y.source, 'AMFI_DAILY_NAV_TIMESERIES');
  });

  it('3. Holdings items include security name, weight, asOfDate, and official source', () => {
    const hdfc = getSchemeIntelligence('130502');
    assert.ok(hdfc.holdings && hdfc.holdings.length > 0);

    for (const h of hdfc.holdings) {
      assert.ok(h.name, 'Security name required');
      assert.ok(typeof h.weight === 'number' && h.weight > 0, 'Positive weight required');
      assert.ok(h.asOfDate, 'asOfDate required');
      assert.ok(h.source, 'source disclosure required');
    }
  });

  it('4. AMC Source Registry tracks parser versions, cadences, and cryptographic checksums', () => {
    const amc = getAmcSources('HDFC_MF');
    assert.ok(amc, 'HDFC_MF must exist');
    assert.strictEqual(amc.cadence, 'MONTHLY');
    assert.strictEqual(amc.parserVersion, 'hdfc_v1');
    assert.strictEqual(amc.status, 'LIVE_VERIFIED');
    assert.strictEqual(typeof amc.checksum, 'string');
    assert.strictEqual(amc.checksum.length, 64, 'Checksum must be SHA-256 (64 hex chars)');
  });

  it('5. Rating source is strictly marked SOURCE_NOT_AUTHORIZED without contract', () => {
    const check = isSourceAuthorized('RATING');
    assert.strictEqual(check.authorized, false);
    assert.strictEqual(check.status, 'SOURCE_NOT_AUTHORIZED');
    assert.ok(check.reason.includes('CRISIL / Morningstar / Value Research'));
  });
});
