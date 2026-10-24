const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MfWatchlist = require('../models/MfWatchlist');
const MutualFundScheme = require('../models/MutualFundScheme');
const { getWatchlist, toggleWatchlist, addToWatchlist, removeFromWatchlist } = require('../controllers/mutualFundsController');

describe('Mutual Fund Watchlist / Wishlist API Tests', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const scheme1 = '122640';
  const scheme2 = '100377';

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    }
    await MfWatchlist.deleteMany({ user: mockUserId });
    // Ensure mock schemes exist
    await MutualFundScheme.updateOne(
      { schemeCode: scheme1 },
      { $setOnInsert: { schemeCode: scheme1, schemeName: 'Parag Parikh Flexi Cap Fund', category: 'Flexi Cap' } },
      { upsert: true }
    );
    await MutualFundScheme.updateOne(
      { schemeCode: scheme2 },
      { $setOnInsert: { schemeCode: scheme2, schemeName: 'Nippon India Growth Mid Cap Fund', category: 'Mid Cap' } },
      { upsert: true }
    );
  });

  after(async () => {
    await MfWatchlist.deleteMany({ user: mockUserId });
    await mongoose.disconnect();
  });

  test('1. Empty Watchlist returns count: 0 and empty data array', async () => {
    let result = null;
    const req = { user: { _id: mockUserId } };
    const res = { json: (data) => { result = data; return res; } };

    await getWatchlist(req, res);
    assert.equal(result.success, true);
    assert.equal(result.count, 0);
    assert.deepEqual(result.schemeCodes, []);
  });

  test('2. Add Scheme 1: Saves to watchlist and returns Scheme 1', async () => {
    let result = null;
    const req = { user: { _id: mockUserId }, body: { schemeCode: scheme1 } };
    const res = { json: (data) => { result = data; return res; } };

    await toggleWatchlist(req, res);
    assert.equal(result.success, true);
    assert.equal(result.saved, true);
    assert.equal(result.count, 1);
    assert.ok(result.schemeCodes.includes(scheme1));
  });

  test('3. Add Scheme 2: BOTH Scheme 1 and Scheme 2 are preserved (NO OVERRIDE)', async () => {
    let result = null;
    const req = { user: { _id: mockUserId }, body: { schemeCode: scheme2 } };
    const res = { json: (data) => { result = data; return res; } };

    await toggleWatchlist(req, res);
    assert.equal(result.success, true);
    assert.equal(result.saved, true);
    assert.equal(result.count, 2, 'Watchlist count must be 2, not overriding the first one!');
    assert.ok(result.schemeCodes.includes(scheme1), 'Scheme 1 must still be in watchlist');
    assert.ok(result.schemeCodes.includes(scheme2), 'Scheme 2 must also be in watchlist');
  });

  test('4. Toggle Scheme 1 again: Removes Scheme 1, keeps Scheme 2', async () => {
    let result = null;
    const req = { user: { _id: mockUserId }, body: { schemeCode: scheme1 } };
    const res = { json: (data) => { result = data; return res; } };

    await toggleWatchlist(req, res);
    assert.equal(result.success, true);
    assert.equal(result.saved, false);
    assert.equal(result.count, 1);
    assert.ok(!result.schemeCodes.includes(scheme1), 'Scheme 1 removed');
    assert.ok(result.schemeCodes.includes(scheme2), 'Scheme 2 retained');
  });

  test('5. Remove Scheme 2 via removeFromWatchlist: Empty watchlist', async () => {
    let result = null;
    const req = { user: { _id: mockUserId }, params: { schemeCode: scheme2 } };
    const res = { json: (data) => { result = data; return res; } };

    await removeFromWatchlist(req, res);
    assert.equal(result.success, true);
    assert.equal(result.count, 0);
    assert.deepEqual(result.schemeCodes, []);
  });
});
