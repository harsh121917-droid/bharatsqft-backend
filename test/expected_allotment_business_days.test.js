const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeExpectedAllotmentDate } = require('../services/mfPortfolioEngine');

describe('Expected Allotment Date - Business Day Calculation', () => {
  test('Debt fund placed on Friday before cut-off (11:00 AM IST) lands on Monday (T+1)', () => {
    // 2026-11-06 05:30 UTC = 11:00 AM IST (Friday)
    const dateStr = '2026-11-06T05:30:00.000Z';
    const result = computeExpectedAllotmentDate(dateStr, 'ICICI Prudential Corporate Bond Fund', 'Debt');
    assert.match(result, /Mon,\s*9\s*Nov/);
  });

  test('Debt fund placed on Friday after cut-off (20:00 PM IST) lands on Tuesday (T+1 from Monday)', () => {
    // 2026-11-06 14:30 UTC = 20:00 PM IST (Friday)
    const dateStr = '2026-11-06T14:30:00.000Z';
    const result = computeExpectedAllotmentDate(dateStr, 'ICICI Prudential Corporate Bond Fund', 'Debt');
    assert.match(result, /Tue,\s*10\s*Nov/);
  });

  test('Equity fund placed on Friday before cut-off (11:00 AM IST) lands on Tuesday (T+2)', () => {
    const dateStr = '2026-11-06T05:30:00.000Z';
    const result = computeExpectedAllotmentDate(dateStr, 'HDFC Flexi Cap Fund', 'Equity');
    assert.match(result, /Tue,\s*10\s*Nov/);
  });

  test('Equity fund placed on Friday after cut-off (20:00 PM IST) lands on Wednesday (T+2 from Monday)', () => {
    const dateStr = '2026-11-06T14:30:00.000Z';
    const result = computeExpectedAllotmentDate(dateStr, 'HDFC Flexi Cap Fund', 'Equity');
    assert.match(result, /Wed,\s*11\s*Nov/);
  });

  test('Order placed on Saturday never lands on Saturday or Sunday', () => {
    const dateStr = '2026-11-07T08:00:00.000Z'; // Saturday
    const result = computeExpectedAllotmentDate(dateStr, 'DSP Large Cap Fund', 'Equity');
    assert.doesNotMatch(result, /Sat|Sun/);
    assert.match(result, /Wed,\s*11\s*Nov/);
  });

  test('Order placed on Sunday never lands on Saturday or Sunday', () => {
    const dateStr = '2026-11-08T08:00:00.000Z'; // Sunday
    const result = computeExpectedAllotmentDate(dateStr, 'ICICI Prudential Liquid Fund', 'Liquid');
    assert.doesNotMatch(result, /Sat|Sun/);
    assert.match(result, /Tue,\s*10\s*Nov/);
  });
});
