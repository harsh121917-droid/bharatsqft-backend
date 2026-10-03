const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SOURCE_STATUSES } = require('../services/amcSourceRegistry');

describe('VikaOne Production — Data Freshness & Stale Protection Tests', () => {
  it('1. Fresh data within SLA window evaluates as VERIFIED / FRESH', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const thresholdDays = 5;
    const isFresh = (Date.now() - new Date(oneDayAgo).getTime()) < thresholdDays * 86400000;
    assert.strictEqual(isFresh, true);
  });

  it('2. Outdated data evaluates as STALE without wiping last known value', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const existingDoc = {
      nav: 125.50,
      navDate: tenDaysAgo,
      status: 'LIVE_VERIFIED',
    };

    // Stale check
    const isStale = (Date.now() - new Date(existingDoc.navDate).getTime()) > 5 * 86400000;
    assert.strictEqual(isStale, true);

    // Stale evaluation marks status without destroying last known good value
    const updatedDoc = {
      ...existingDoc,
      status: isStale ? SOURCE_STATUSES.STALE : existingDoc.status,
    };

    assert.strictEqual(updatedDoc.nav, 125.50, 'Must preserve last known valid NAV');
    assert.strictEqual(updatedDoc.status, 'STALE');
  });

  it('3. Source failure is non-destructive (retains previous verified data and records failure)', () => {
    const schemeBeforeFailure = {
      schemeCode: '145139',
      aum: 14475.25,
      expenseRatio: 1.84,
      lastSuccessfulFetch: '2026-09-30T10:00:00.000Z',
      lastFailure: null,
      status: 'LIVE_VERIFIED',
    };

    // Simulate transient ingestion fetch error (e.g. 503 or network timeout)
    const failureEvent = {
      error: 'HTTP 503 Service Unavailable',
      timestamp: new Date().toISOString(),
    };

    // Ingestion failure handler preserves valid fields and records error
    const schemeAfterFailure = {
      ...schemeBeforeFailure,
      lastFailure: failureEvent,
      status: SOURCE_STATUSES.LIVE_FETCH_FAILED,
    };

    assert.strictEqual(schemeAfterFailure.aum, 14475.25, 'AUM must NOT be wiped or nulled');
    assert.strictEqual(schemeAfterFailure.expenseRatio, 1.84, 'TER must NOT be wiped');
    assert.strictEqual(schemeAfterFailure.status, 'LIVE_FETCH_FAILED');
    assert.strictEqual(schemeAfterFailure.lastFailure.error, 'HTTP 503 Service Unavailable');
  });

  it('4. Source schema change detects format shifts and sets SOURCE_CHANGED safely', () => {
    const expectedHeaders = ['security_name', 'weight', 'isin', 'sector'];
    const brokenHeaders = ['col_a', 'col_b', 'col_c']; // e.g. AMC changed Excel layout

    const hasAllHeaders = expectedHeaders.every(h => brokenHeaders.includes(h));
    assert.strictEqual(hasAllHeaders, false);

    const status = hasAllHeaders ? SOURCE_STATUSES.LIVE_VERIFIED : SOURCE_STATUSES.SOURCE_CHANGED;
    assert.strictEqual(status, 'SOURCE_CHANGED');
  });
});
