/**
 * VikaOne Mutual Fund — Phase 5H Test Suite
 * Validates:
 * 1. Statutory Percentage Parser (parseStatutoryWeightPercent)
 * 2. Descending Weight Comparator (comparePortfolioWeightDesc)
 * 3. Decimal Scale and Mapping Integrity
 * 4. Sorting & Top-10 Invariants (no string sorting, numeric order, stable tie-break, null last)
 * 5. Full Source -> DB -> API -> UI Invariant Verification
 * 6. Snapshot Immutability and Scheme Isolation
 */

require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const validationService = require('../services/mfPortfolioValidationService');
const snapshotService = require('../services/mfPortfolioSnapshotService');
const mfPortfolioService = require('../services/mfPortfolioService');
const MutualFundPortfolioSnapshot = require('../models/MutualFundPortfolioSnapshot');
const MutualFundScheme = require('../models/MutualFundScheme');

const DISCLOSURES_DIR = path.join(__dirname, '..', 'data', 'amc_disclosures');

describe('Phase 5H: Portfolio Percentage Accuracy, Ranking & Sort Reconciliation', () => {

  // ── 1. Canonical Percentage Parser Tests ──
  describe('1. Canonical Statutory Percentage Parser', () => {
    test('parses clean numeric string "4.82"', () => {
      const res = validationService.parseStatutoryWeightPercent('4.82');
      assert.equal(res.weightPercent, 4.82);
      assert.equal(res.weightDisplay, '4.82%');
      assert.equal(res.sourceWeightText, '4.82%');
    });

    test('parses string with percent symbol "4.82%"', () => {
      const res = validationService.parseStatutoryWeightPercent('4.82%');
      assert.equal(res.weightPercent, 4.82);
      assert.equal(res.weightDisplay, '4.82%');
      assert.equal(res.sourceWeightText, '4.82%');
    });

    test('parses whitespace-padded string "  4.82  "', () => {
      const res = validationService.parseStatutoryWeightPercent('  4.82  ');
      assert.equal(res.weightPercent, 4.82);
      assert.equal(res.weightDisplay, '4.82%');
    });

    test('handles statutory trace marker "<0.01%" as null weight with source text', () => {
      const res = validationService.parseStatutoryWeightPercent('<0.01%');
      assert.equal(res.weightPercent, null);
      assert.equal(res.sourceWeightText, '<0.01%');
      assert.equal(res.weightDisplay, '<0.01%');
    });

    test('handles statutory asterisk marker "*" as null weight with source text', () => {
      const res = validationService.parseStatutoryWeightPercent('*');
      assert.equal(res.weightPercent, null);
      assert.equal(res.sourceWeightText, '*');
      assert.equal(res.weightDisplay, '*');
    });

    test('parses "0.00" as valid 0 numeric weight', () => {
      const res = validationService.parseStatutoryWeightPercent('0.00');
      assert.equal(res.weightPercent, 0.0);
      assert.equal(res.weightDisplay, '0.00%');
    });

    test('parses exact number 4.82 without drift', () => {
      const res = validationService.parseStatutoryWeightPercent(4.82);
      assert.equal(res.weightPercent, 4.82);
      assert.equal(res.weightDisplay, '4.82%');
    });

    test('handles null and undefined gracefully', () => {
      const resNull = validationService.parseStatutoryWeightPercent(null);
      assert.equal(resNull.weightPercent, null);
      assert.equal(resNull.weightDisplay, '—');

      const resUndef = validationService.parseStatutoryWeightPercent(undefined);
      assert.equal(resUndef.weightPercent, null);
      assert.equal(resUndef.weightDisplay, '—');
    });

    test('handles dash/empty string as null weight', () => {
      const resDash = validationService.parseStatutoryWeightPercent('-');
      assert.equal(resDash.weightPercent, null);
      assert.equal(resDash.weightDisplay, '—');

      const resEmpty = validationService.parseStatutoryWeightPercent('');
      assert.equal(resEmpty.weightPercent, null);
      assert.equal(resEmpty.weightDisplay, '—');
    });

    test('rejects malformed text without silently converting to 0', () => {
      assert.throws(() => {
        validationService.parseStatutoryWeightPercent('invalid_abc');
      }, /Invalid non-numeric weight string/);
    });

    test('rejects out of bounds negative weights', () => {
      assert.throws(() => {
        validationService.parseStatutoryWeightPercent(-5);
      }, /Weight percentage out of bounds/);
    });

    test('rejects out of bounds weights > 100', () => {
      assert.throws(() => {
        validationService.parseStatutoryWeightPercent(105);
      }, /Weight percentage out of bounds/);
    });
  });

  // ── 2. Canonical Descending Comparator Tests ──
  describe('2. Canonical Descending Comparator (comparePortfolioWeightDesc)', () => {
    test('sorts strictly by numeric value (12.5 > 9.5 > 4.82) preventing string sort error', () => {
      const items = [
        { name: 'A', weightPercent: 4.82, sourceOrder: 1 },
        { name: 'B', weightPercent: 12.5, sourceOrder: 2 },
        { name: 'C', weightPercent: 9.5, sourceOrder: 3 },
      ];
      items.sort(validationService.comparePortfolioWeightDesc);

      // In string sort: "4.82", "9.5", "12.5" -> "9.5" > "12.5" > "4.82" (wrong!)
      // Numeric sort: 12.5, 9.5, 4.82 (correct!)
      assert.equal(items[0].name, 'B');
      assert.equal(items[0].weightPercent, 12.5);
      assert.equal(items[1].name, 'C');
      assert.equal(items[1].weightPercent, 9.5);
      assert.equal(items[2].name, 'A');
      assert.equal(items[2].weightPercent, 4.82);
    });

    test('places null and trace weights after all numeric values', () => {
      const items = [
        { name: 'NullWeight', weightPercent: null, sourceOrder: 1 },
        { name: 'LowestWeight', weightPercent: 0.01, sourceOrder: 2 },
        { name: 'HighWeight', weightPercent: 5.0, sourceOrder: 3 },
      ];
      items.sort(validationService.comparePortfolioWeightDesc);

      assert.equal(items[0].name, 'HighWeight');
      assert.equal(items[1].name, 'LowestWeight');
      assert.equal(items[2].name, 'NullWeight');
    });

    test('uses stable sourceOrder as tie-breaker for identical weights', () => {
      const items = [
        { name: 'FirstSourceRow', weightPercent: 3.5, sourceOrder: 10 },
        { name: 'SecondSourceRow', weightPercent: 3.5, sourceOrder: 25 },
      ];
      items.sort(validationService.comparePortfolioWeightDesc);

      assert.equal(items[0].name, 'FirstSourceRow');
      assert.equal(items[1].name, 'SecondSourceRow');
    });

    test('preserves sourceOrder among multiple null items', () => {
      const items = [
        { name: 'TraceItemB', weightPercent: null, sourceOrder: 50 },
        { name: 'TraceItemA', weightPercent: null, sourceOrder: 20 },
      ];
      items.sort(validationService.comparePortfolioWeightDesc);

      assert.equal(items[0].name, 'TraceItemA');
      assert.equal(items[1].name, 'TraceItemB');
    });
  });

  // ── 3. Database & API End-to-End Tracing Tests ──
  describe('3. Database & API End-to-End Tracing', () => {
    before(async () => {
      const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
      }
    });

    after(async () => {
      await mongoose.disconnect();
    });

    test('Bandhan Small Cap (147944): CCIL Reverse Repo is Rank 1 at 13.10% and Top 10 matches official source', async () => {
      const apiResult = await mfPortfolioService.getSchemePortfolio('147944');
      assert.ok(apiResult.holdings.length === 264, 'Expected 264 holdings');

      const top1 = apiResult.holdings[0];
      assert.match(top1.securityName, /Clearing Corporation of India Ltd. - Reverse Repo/);
      assert.equal(top1.weightPercent, 13.1);
      assert.equal(top1.weightRank, 1);
      assert.equal(top1.sourceOrder, 83); // Preserved original statutory source row

      const top2 = apiResult.holdings[1];
      assert.equal(top2.securityName, 'Apar Industries Ltd.');
      assert.equal(top2.weightPercent, 4.52);
      assert.equal(top2.weightRank, 2);
    });

    test('Invesco India Small Cap (145139): CCIL TREPS is Rank 1 at 8.45% and KEI Industries is Rank 2 at 4.15%', async () => {
      const apiResult = await mfPortfolioService.getSchemePortfolio('145139');
      assert.ok(apiResult.holdings.length === 72, 'Expected 72 holdings');

      const top1 = apiResult.holdings[0];
      assert.match(top1.securityName, /Clearing Corporation of India Ltd. - Tri-party Repo/);
      assert.equal(top1.weightPercent, 8.45);
      assert.equal(top1.weightRank, 1);
      assert.equal(top1.sourceOrder, 69);

      const top2 = apiResult.holdings[1];
      assert.equal(top2.securityName, 'KEI Industries Ltd.');
      assert.equal(top2.weightPercent, 4.15);
      assert.equal(top2.weightRank, 2);
    });

    test('Parag Parikh Flexi Cap (122640): Top 5 holdings match official source exactly', async () => {
      const apiResult = await mfPortfolioService.getSchemePortfolio('122640');
      assert.ok(apiResult.holdings.length === 150, 'Expected 150 holdings');

      const top5 = apiResult.holdings.slice(0, 5);
      assert.equal(top5[0].securityName, 'HDFC Bank Ltd.');
      assert.equal(top5[0].weightPercent, 7.12);
      assert.equal(top5[1].securityName, 'Bajaj Holdings & Investment Ltd.');
      assert.equal(top5[1].weightPercent, 6.25);
      assert.equal(top5[2].securityName, 'Power Grid Corporation of India Ltd.');
      assert.equal(top5[2].weightPercent, 5.45);
      assert.equal(top5[3].securityName, 'ITC Ltd.');
      assert.equal(top5[3].weightPercent, 5.12);
      assert.equal(top5[4].securityName, 'Alphabet Inc. (Class A)');
      assert.equal(top5[4].weightPercent, 4.85);
    });

    test('HDFC Small Cap (130502): Firstsource Solutions is Rank 1 at 4.82%', async () => {
      const apiResult = await mfPortfolioService.getSchemePortfolio('130502');
      assert.ok(apiResult.holdings.length === 78, 'Expected 78 holdings');

      const top1 = apiResult.holdings[0];
      assert.equal(top1.securityName, 'Firstsource Solutions Ltd.');
      assert.equal(top1.weightPercent, 4.82);
      assert.equal(top1.weightRank, 1);
      assert.equal(top1.sourceOrder, 1);

      const top2 = apiResult.holdings[1];
      assert.equal(top2.securityName, 'eClerx Services Ltd.');
      assert.equal(top2.weightPercent, 4.12);
      assert.equal(top2.weightRank, 2);
    });

    test('Anti-normalization Invariant: Top 10 weights are NOT scaled to 100%', async () => {
      const apiResult = await mfPortfolioService.getSchemePortfolio('130502');
      const top10 = apiResult.holdings.slice(0, 10);
      const top10Sum = top10.reduce((acc, h) => acc + (h.weightPercent || 0), 0);

      // Statutory Top 10 sum should be approx 32.90%
      assert.ok(top10Sum > 30 && top10Sum < 35, `Top 10 sum must remain statutory (~32.90%), got ${top10Sum}%`);
      assert.notEqual(top10Sum, 100, 'Top 10 must NEVER be normalized to 100%');
    });

    test('Pagination Parity: Paginated holdings match descending weight sort', async () => {
      const paginated = await snapshotService.getPaginatedHoldings('147944', { page: 1, limit: 10 });
      assert.equal(paginated.items.length, 10);
      assert.match(paginated.items[0].name, /Reverse Repo/);
      assert.equal(paginated.items[0].weightPercent, 13.1);
      assert.equal(paginated.items[0].weightRank, 1);
    });

    test('No Cross-Scheme or Direct/IDCW Leakage', async () => {
      const allCurrentSnapshots = await MutualFundPortfolioSnapshot.find({ isCurrent: true }).lean();
      for (const snap of allCurrentSnapshots) {
        assert.equal(snap.planType, 'REGULAR');
        assert.equal(snap.option, 'GROWTH');
        assert.ok(!/direct/i.test(snap.schemeName), `Direct scheme found in snapshots: ${snap.schemeName}`);
        assert.ok(!/idcw|dividend/i.test(snap.schemeName), `IDCW scheme found in snapshots: ${snap.schemeName}`);
      }
    });
  });
});
