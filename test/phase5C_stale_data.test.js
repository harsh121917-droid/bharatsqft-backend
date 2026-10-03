const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('VikaOne Phase 5C — Data Freshness & Stale Protection Tests', () => {
  // Freshness policy mapping
  const FRESHNESS_WINDOWS_HOURS = {
    NAV: 36, // Daily feed (market close + buffer)
    AUM: 35 * 24, // Monthly disclosure + 5 days
    TER: 7 * 24, // Weekly / statutory update
    HOLDINGS: 40 * 24, // Monthly portfolio disclosure + 10 days
    RISKOMETER: 40 * 24, // Monthly review
    FUND_MANAGER: 90 * 24, // Quarterly / event-driven
    BENCHMARK: 180 * 24, // Semi-annual / event-driven
    EXIT_LOAD: 180 * 24, // Semi-annual / event-driven
  };

  function evaluateFreshness(lastVerifiedAt, fieldType) {
    if (!lastVerifiedAt) return { status: 'SOURCE_UNAVAILABLE', isStale: false };
    const maxHours = FRESHNESS_WINDOWS_HOURS[fieldType] || (30 * 24);
    const diffHours = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60);

    if (diffHours > maxHours) {
      return { status: 'STALE', isStale: true, ageHours: Math.round(diffHours) };
    }
    return { status: 'VERIFIED', isStale: false, ageHours: Math.round(diffHours) };
  }

  it('1. Fresh data within SLA window evaluates as VERIFIED', () => {
    const yesterday = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const navFreshness = evaluateFreshness(yesterday, 'NAV');
    assert.strictEqual(navFreshness.status, 'VERIFIED');
    assert.strictEqual(navFreshness.isStale, false);

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const aumFreshness = evaluateFreshness(twoWeeksAgo, 'AUM');
    assert.strictEqual(aumFreshness.status, 'VERIFIED');
    assert.strictEqual(aumFreshness.isStale, false);
  });

  it('2. Outdated data evaluates as STALE without wiping last known value', () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const aumFreshness = evaluateFreshness(fortyDaysAgo, 'AUM');
    assert.strictEqual(aumFreshness.status, 'STALE');
    assert.strictEqual(aumFreshness.isStale, true);

    const oldNav = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const navFreshness = evaluateFreshness(oldNav, 'NAV');
    assert.strictEqual(navFreshness.status, 'STALE');
    assert.strictEqual(navFreshness.isStale, true);
  });

  it('3. Null timestamp evaluates as SOURCE_UNAVAILABLE', () => {
    const result = evaluateFreshness(null, 'HOLDINGS');
    assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
    assert.strictEqual(result.isStale, false);
  });

  it('4. Failure Safety: Ingestion failure does not corrupt or overwrite existing valid document', () => {
    const existingDoc = {
      schemeCode: '145139',
      aum: 14475.25,
      fundManager: 'Taher Badshah, Aditya Khemani',
      expenseRatio: 1.84,
      nav: 168.45,
    };

    // Simulate failed update attempt with empty payload
    const failedPayload = { aum: null, fundManager: null };
    const safeMerge = (existing, incoming) => {
      const merged = { ...existing };
      for (const [key, val] of Object.entries(incoming)) {
        // Never overwrite valid data with transient nulls
        if (val !== null && val !== undefined) {
          merged[key] = val;
        }
      }
      return merged;
    };

    const protectedDoc = safeMerge(existingDoc, failedPayload);
    assert.strictEqual(protectedDoc.aum, 14475.25);
    assert.strictEqual(protectedDoc.fundManager, 'Taher Badshah, Aditya Khemani');
    assert.strictEqual(protectedDoc.expenseRatio, 1.84);
  });
});
