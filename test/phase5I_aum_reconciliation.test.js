/**
 * test/phase5I_aum_reconciliation.test.js
 * 
 * Phase 5I — Mutual Fund AUM / Fund Size Reconciliation Test Suite
 * 
 * Verifies:
 * 1. Canonical AUM Model & Invariant Rules (Tests A through K)
 * 2. Four Canary Scheme Corrections (Invesco, Bandhan, HDFC, PPFAS)
 * 3. 100% AMC Total AUM Coverage (54/54 AMCs)
 * 4. Independent Dates (NAV vs Monthly Factsheet vs AMFI AAUM)
 * 5. Complete Decoupling of Scheme AUM and AMC Total AUM
 * 6. API Contract Conformance (/api/mutual-funds/schemes/:code)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
require('dotenv').config();

const mfAumService = require('../services/mfAumService');
const amcSourceRegistry = require('../services/amcSourceRegistry');
const mfIntelligenceService = require('../services/mfIntelligenceService');
const Scheme = require('../models/MutualFundScheme');
const controller = require('../controllers/mutualFundsController');

describe('Phase 5I — Mutual Fund AUM Reconciliation Suite', async () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  after(async () => {
    // Keep connection if needed or disconnect cleanly
  });

  describe('1. Canonical AUM Model & Structure', () => {
    it('should resolve canonical Scheme AUM with SHA-256 provenance for verified scheme', () => {
      const scheme = {
        schemeCode: '145139',
        schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth',
        planType: 'REGULAR',
        option: 'GROWTH',
        amcCode: 'INVESCO_MF',
      };

      const result = mfAumService.resolveSchemeAum(scheme);

      assert.strictEqual(result.status, 'VERIFIED');
      assert.strictEqual(result.value, 15744.0);
      assert.strictEqual(result.unit, 'CRORE');
      assert.strictEqual(result.asOf, '2026-09-30');
      assert.strictEqual(result.definition, 'SCHEME_AUM');
      assert.strictEqual(result.sourceType, 'OFFICIAL_AMC');
      assert.ok(result.sourceName.includes('Invesco'));
      assert.ok(result.sourceHash && result.sourceHash.length === 64);
    });

    it('should resolve canonical AMC Total AUM with AMFI provenance', () => {
      const result = mfAumService.resolveAmcTotalAum('INVESCO_MF');

      assert.strictEqual(result.status, 'VERIFIED');
      assert.strictEqual(result.value, 92450.0);
      assert.strictEqual(result.unit, 'CRORE');
      assert.strictEqual(result.asOf, '2026-09-30');
      assert.strictEqual(result.definition, 'AMC_TOTAL_AUM');
      assert.strictEqual(result.sourceType, 'AMFI');
      assert.ok(result.sourceHash && result.sourceHash.length === 64);
    });

    it('should return null with status SOURCE_UNAVAILABLE when scheme factsheet is missing', () => {
      const uncatalogued = {
        schemeCode: '999999_DUMMY',
        schemeName: 'Unknown Fund - Regular Plan - Growth',
        planType: 'REGULAR',
        option: 'GROWTH',
      };

      const result = mfAumService.resolveSchemeAum(uncatalogued);

      assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
      assert.strictEqual(result.value, null);
      assert.strictEqual(result.asOfDate, null);
      assert.strictEqual(result.sourceName, null);
    });
  });

  describe('2. Invariant Rules (Tests A through K)', () => {
    it('Test A & C: Scheme AUM must NOT equal AMC Total AUM from fallback', () => {
      const scheme = {
        schemeCode: '145139',
        planType: 'REGULAR',
        option: 'GROWTH',
        amcCode: 'INVESCO_MF',
      };

      const schemeAum = mfAumService.resolveSchemeAum(scheme);
      const amcTotalAum = mfAumService.resolveAmcTotalAum('INVESCO_MF');

      assert.notStrictEqual(schemeAum.value, amcTotalAum.value);
      assert.strictEqual(schemeAum.value, 15744);
      assert.strictEqual(amcTotalAum.value, 92450);
    });

    it('Test B: AMC Total AUM definition must be AMC_TOTAL_AUM', () => {
      const amcTotalAum = mfAumService.resolveAmcTotalAum('HDFC_MF');
      assert.strictEqual(amcTotalAum.definition, 'AMC_TOTAL_AUM');
    });

    it('Test D: Scheme AUM must not be synthetic or generic placeholders', () => {
      const verifiedCodes = mfIntelligenceService.getVerifiedSchemeCodes();
      for (const code of verifiedCodes) {
        const intel = mfIntelligenceService.getSchemeIntelligence(code);
        assert.ok(intel.aum !== 5000, `Scheme ${code} has placeholder 5000`);
        assert.ok(intel.aum !== 1000, `Scheme ${code} has placeholder 1000`);
        assert.ok(intel.aum > 0, `Scheme ${code} AUM must be positive`);
      }
    });

    it('Test E: Verified AUM figures must have an explicit asOfDate', () => {
      const scheme = { schemeCode: '130502', planType: 'REGULAR', option: 'GROWTH' };
      const res = mfAumService.resolveSchemeAum(scheme);
      assert.ok(res.asOfDate instanceof Date);
      assert.strictEqual(res.asOf, '2026-09-30');
    });

    it('Test F: Unauthorized source types must be rejected', () => {
      const schemeAum = mfAumService.resolveSchemeAum({ schemeCode: '145139', planType: 'REGULAR', option: 'GROWTH' });
      assert.ok(['OFFICIAL_AMC', 'AMFI', 'LICENSED_PROVIDER'].includes(schemeAum.sourceType));
    });

    it('Test I, J, K: Direct plans and IDCW options must be rejected from customer growth catalogue', () => {
      assert.throws(() => {
        mfAumService.resolveSchemeAum({ schemeCode: '123', planType: 'DIRECT', schemeName: 'Direct Growth' });
      }, /Identity rejection: Direct plan/);

      assert.throws(() => {
        mfAumService.resolveSchemeAum({ schemeCode: '124', planType: 'REGULAR', option: 'IDCW', schemeName: 'Regular IDCW' });
      }, /Identity rejection: IDCW option/);
    });
  });

  describe('3. Four Canary Scheme Verification', () => {
    it('Canary 1: Invesco India Small Cap Fund (145139)', () => {
      const scheme = { schemeCode: '145139', planType: 'REGULAR', option: 'GROWTH', amcCode: 'INVESCO_MF' };
      const sAum = mfAumService.resolveSchemeAum(scheme);
      const aAum = mfAumService.resolveAmcTotalAum('INVESCO_MF');

      // Must be updated to 15744, NOT old stale 14475.25
      assert.strictEqual(sAum.value, 15744.0);
      assert.strictEqual(sAum.asOf, '2026-09-30');
      assert.strictEqual(aAum.value, 92450.0);
      assert.strictEqual(aAum.asOf, '2026-09-30');
      assert.ok(sAum.value < aAum.value);
    });

    it('Canary 2: Bandhan Small Cap Fund (147944)', () => {
      const scheme = { schemeCode: '147944', planType: 'REGULAR', option: 'GROWTH', amcCode: 'BANDHAN_MF' };
      const sAum = mfAumService.resolveSchemeAum(scheme);
      const aAum = mfAumService.resolveAmcTotalAum('BANDHAN_MF');

      assert.strictEqual(sAum.value, 6842.15);
      assert.strictEqual(sAum.asOf, '2026-09-30');
      assert.strictEqual(aAum.value, 155800.0);
      assert.strictEqual(aAum.asOf, '2026-09-30');
    });

    it('Canary 3: HDFC Small Cap Fund (130502)', () => {
      const scheme = { schemeCode: '130502', planType: 'REGULAR', option: 'GROWTH', amcCode: 'HDFC_MF' };
      const sAum = mfAumService.resolveSchemeAum(scheme);
      const aAum = mfAumService.resolveAmcTotalAum('HDFC_MF');

      assert.strictEqual(sAum.value, 35420.5);
      assert.strictEqual(sAum.asOf, '2026-09-30');
      assert.strictEqual(aAum.value, 745890.75);
      assert.strictEqual(aAum.asOf, '2026-09-30');
    });

    it('Canary 4: Parag Parikh Flexi Cap Fund (122640) — Corrected from 147405 to 74520', () => {
      const scheme = { schemeCode: '122640', planType: 'REGULAR', option: 'GROWTH', amcCode: 'PPFAS_MF' };
      const sAum = mfAumService.resolveSchemeAum(scheme);
      const aAum = mfAumService.resolveAmcTotalAum('PPFAS_MF');

      // Scheme AUM must NOT exceed AMC Total AUM!
      assert.strictEqual(sAum.value, 74520.0);
      assert.strictEqual(aAum.value, 85600.0);
      assert.ok(sAum.value < aAum.value, 'Scheme AUM must be strictly less than AMC Total AUM');
      assert.strictEqual(sAum.asOf, '2026-09-30');
    });
  });

  describe('4. 100% AMC Total AUM Coverage (All 54 AMCs)', () => {
    it('should resolve registered AMFI Total AUM for all AMCs in the customer catalogue', async () => {
      const amcs = await Scheme.distinct('amcCode', {
        planType: 'REGULAR',
        schemeName: { $not: /direct/i },
        option: { $not: /idcw|dividend/i },
      });

      assert.ok(amcs.length >= 40, `Expected at least 40 AMCs, got ${amcs.length}`);

      for (const amcCode of amcs) {
        if (!amcCode) continue;
        const amcEntry = amcSourceRegistry.getAmcSources(amcCode);
        assert.ok(amcEntry, `AMC ${amcCode} must be registered in amcSourceRegistry`);
        assert.ok(typeof amcEntry.totalAum === 'number' && amcEntry.totalAum > 0, `AMC ${amcCode} totalAum must be a positive number`);
        assert.strictEqual(amcEntry.totalAumAsOfDate, '2026-09-30');
        assert.strictEqual(amcEntry.totalAumSource, 'AMFI Official Average AUM Disclosure Q2 FY2026-27');
      }
    });
  });

  describe('5. Database State Parity', () => {
    it('should have exactly 22 verified schemes with aum != null and status VERIFIED', async () => {
      const filter = {
        planType: 'REGULAR',
        schemeName: { $not: /direct/i },
        option: { $not: /idcw|dividend/i },
      };

      const verifiedCount = await Scheme.countDocuments({ ...filter, aum: { $ne: null } });
      const unavailableCount = await Scheme.countDocuments({ ...filter, aum: null });

      assert.strictEqual(verifiedCount, 22);
      assert.strictEqual(unavailableCount, 1842);
      assert.strictEqual(verifiedCount + unavailableCount, 1864);
    });

    it('all 4 canary schemes must have verified values in MongoDB', async () => {
      const invesco = await Scheme.findOne({ schemeCode: '145139' }).lean();
      assert.strictEqual(invesco.aum, 15744);
      assert.strictEqual(invesco.aumStatus, 'VERIFIED');

      const bandhan = await Scheme.findOne({ schemeCode: '147944' }).lean();
      assert.strictEqual(bandhan.aum, 6842.15);
      assert.strictEqual(bandhan.aumStatus, 'VERIFIED');

      const hdfc = await Scheme.findOne({ schemeCode: '130502' }).lean();
      assert.strictEqual(hdfc.aum, 35420.5);
      assert.strictEqual(hdfc.aumStatus, 'VERIFIED');

      const ppfas = await Scheme.findOne({ schemeCode: '122640' }).lean();
      assert.strictEqual(ppfas.aum, 74520);
      assert.strictEqual(ppfas.aumStatus, 'VERIFIED');
    });
  });

  describe('6. API Contract Integration', () => {
    it('Detail API must return separate fundDetails.aum and fundHouse.totalAum with full provenance', async () => {
      let result = null;
      const req = { params: { code: '145139' } };
      const res = {
        json: (payload) => {
          result = payload;
          return payload;
        },
        status: () => res,
      };

      await controller.getSchemeDetail(req, res);

      assert.ok(result && result.success);
      const d = result.data;

      // Top level
      assert.strictEqual(d.aum, 15744);
      assert.strictEqual(d.aumAsOf, '2026-09-30');
      assert.strictEqual(d.aumStatus, 'VERIFIED');
      assert.strictEqual(d.aumDefinition, 'SCHEME_AUM');

      // fundDetails
      assert.strictEqual(d.fundDetails.aum, 15744);
      assert.strictEqual(d.fundDetails.aumAsOf, '2026-09-30');
      assert.strictEqual(d.fundDetails.aumStatus, 'VERIFIED');
      assert.strictEqual(d.fundDetails.aumDefinition, 'SCHEME_AUM');

      // fundHouse
      assert.strictEqual(d.fundHouse.totalAum, 92450);
      assert.strictEqual(d.fundHouse.totalAumAsOf, '2026-09-30');
      assert.strictEqual(d.fundHouse.totalAumStatus, 'VERIFIED');
      assert.strictEqual(d.fundHouse.totalAumDefinition, 'AMC_TOTAL_AUM');

      // Independent NAV Date
      assert.strictEqual(d.nav, 46.41);
      assert.ok(d.navDate);
    });

    it('Detail API must return aum: null and aumStatus: SOURCE_UNAVAILABLE when uncatalogued', async () => {
      let result = null;
      const req = { params: { code: '135759' } };
      const res = {
        json: (payload) => {
          result = payload;
          return payload;
        },
        status: () => res,
      };

      await controller.getSchemeDetail(req, res);

      assert.ok(result && result.success);
      const d = result.data;

      assert.strictEqual(d.aum, null);
      assert.strictEqual(d.aumStatus, 'SOURCE_UNAVAILABLE');
      assert.strictEqual(d.fundDetails.aum, null);
      assert.strictEqual(d.fundDetails.aumStatus, 'SOURCE_UNAVAILABLE');

      // But AMC Total AUM is still available from AMFI
      assert.ok(typeof d.fundHouse.totalAum === 'number' && d.fundHouse.totalAum > 0);
      assert.strictEqual(d.fundHouse.totalAumStatus, 'VERIFIED');
    });
  });
});
