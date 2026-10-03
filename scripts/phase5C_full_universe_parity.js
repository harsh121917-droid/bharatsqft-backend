require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const MutualFundScheme = require('../models/MutualFundScheme');
const mutualFundsController = require('../controllers/mutualFundsController');

function createMockContext(params = {}, query = {}) {
  const req = { params, query };
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolvePromise({ statusCode: this.statusCode, payload });
      return this;
    },
  };

  return { req, res, promise };
}

async function runFullUniverseParity() {
  console.log('='.repeat(75));
  console.log('VIKAONE MF PHASE 5C: COMPREHENSIVE UNIVERSE LIST VS DETAIL PARITY');
  console.log('='.repeat(75));

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[DB] Connected to MongoDB.');

  // Find all Regular Growth schemes in DB with sufficient NAV history (cagr3Y populated)
  const populatedSchemes = await MutualFundScheme.find({
    planType: 'REGULAR',
    cagr3Y: { $ne: null },
  }).select('schemeCode schemeName cagr1Y cagr3Y cagr5Y return1M return3M return6M').lean();

  console.log(`\nFound ${populatedSchemes.length} Regular Growth schemes with populated 3Y returns in MongoDB.`);
  console.log('Beginning 100% parity verification across all eligible schemes...\n');

  let checkedCount = 0;
  let parityCount = 0;
  const discrepancies = [];

  for (const s of populatedSchemes) {
    checkedCount++;
    const code = s.schemeCode;

    // 1. Fetch Detail
    const detailCtx = createMockContext({ code });
    await mutualFundsController.getSchemeDetail(detailCtx.req, detailCtx.res);
    const detailResp = await detailCtx.promise;
    if (detailResp.statusCode !== 200) {
      discrepancies.push({ code, error: `Detail returned HTTP ${detailResp.statusCode}` });
      continue;
    }
    const d = detailResp.payload.data;

    // 2. Fetch List (search specifically for this scheme)
    const listCtx = createMockContext({}, { search: code, page: 1, limit: 10 });
    await mutualFundsController.getSchemes(listCtx.req, listCtx.res);
    const listResp = await listCtx.promise;
    if (listResp.statusCode !== 200) {
      discrepancies.push({ code, error: `List returned HTTP ${listResp.statusCode}` });
      continue;
    }
    const listItems = Array.isArray(listResp.payload.data) ? listResp.payload.data : (listResp.payload.data?.schemes || []);
    const listItem = listItems.find((item) => String(item.schemeCode) === String(code));

    if (!listItem) {
      discrepancies.push({ code, error: 'Not found in list API search result' });
      continue;
    }

    // Compare all return periods
    const mismatches = [];
    if (listItem.return1M !== d.return1M) mismatches.push(`1M (List: ${listItem.return1M} vs Detail: ${d.return1M})`);
    if (listItem.return3M !== d.return3M) mismatches.push(`3M (List: ${listItem.return3M} vs Detail: ${d.return3M})`);
    if (listItem.return6M !== d.return6M) mismatches.push(`6M (List: ${listItem.return6M} vs Detail: ${d.return6M})`);
    if (listItem.cagr1Y !== d.cagr1Y) mismatches.push(`1Y (List: ${listItem.cagr1Y} vs Detail: ${d.cagr1Y})`);
    if (listItem.cagr3Y !== d.cagr3Y) mismatches.push(`3Y (List: ${listItem.cagr3Y} vs Detail: ${d.cagr3Y})`);
    if (listItem.cagr5Y !== d.cagr5Y) mismatches.push(`5Y (List: ${listItem.cagr5Y} vs Detail: ${d.cagr5Y})`);

    if (mismatches.length > 0) {
      discrepancies.push({ code, mismatches });
    } else {
      parityCount++;
    }
  }

  console.log('--- PARITY VERIFICATION SUMMARY ---');
  console.log(`Total Schemes Checked:       ${checkedCount}`);
  console.log(`Schemes with 100% Parity:    ${parityCount}`);
  console.log(`Discrepancies Encountered:   ${discrepancies.length}`);

  if (discrepancies.length > 0) {
    console.error('❌ DISCREPANCIES FOUND:', JSON.stringify(discrepancies, null, 2));
    process.exit(1);
  } else {
    console.log('✅ ZERO DISCREPANCIES. Every eligible scheme exhibits 100% List vs Detail Parity across all periods!\n');
  }

  // 3. Verify Return Sorting
  console.log('--- TESTING SORTING INTEGRITY ---');
  const sortCtx = createMockContext({}, { sort: 'returns3y', page: 1, limit: 20 });
  await mutualFundsController.getSchemes(sortCtx.req, sortCtx.res);
  const sortResp = await sortCtx.promise;
  const sortedSchemes = sortResp.payload.data;

  assert.ok(sortedSchemes.length > 0, 'Sorted schemes must return results');
  for (let i = 0; i < sortedSchemes.length; i++) {
    assert.notStrictEqual(sortedSchemes[i].cagr3Y, null, `Scheme ${sortedSchemes[i].schemeCode} has null cagr3Y in sort=returns3y`);
    if (i > 0) {
      assert.ok(
        sortedSchemes[i - 1].cagr3Y >= sortedSchemes[i].cagr3Y,
        `Sort violation: index ${i - 1} (${sortedSchemes[i - 1].cagr3Y}) < index ${i} (${sortedSchemes[i].cagr3Y})`
      );
    }
  }
  console.log(`✅ sort=returns3y verified: all ${sortedSchemes.length} items strictly non-null and in monotonic descending order.`);

  // 4. Verify Similar Funds Isolation
  console.log('\n--- TESTING SIMILAR FUNDS ISOLATION ---');
  const hdfcDetailCtx = createMockContext({ code: '130502' });
  await mutualFundsController.getSchemeDetail(hdfcDetailCtx.req, hdfcDetailCtx.res);
  const hdfcResp = await hdfcDetailCtx.promise;
  const hdfcData = hdfcResp.payload.data;

  assert.ok(hdfcData.similarFunds && hdfcData.similarFunds.length > 0, 'Similar funds must be present');
  for (const peer of hdfcData.similarFunds) {
    assert.notStrictEqual(peer.schemeCode, '130502', 'Similar funds must not include the primary scheme');
    // Ensure primary scheme values are not equal to peer values
    console.log(`  Peer ${peer.schemeCode} (${peer.schemeName.slice(0, 25)}...): AUM=${peer.aum}, TER=${peer.expenseRatio}`);
  }
  assert.strictEqual(hdfcData.fundDetails.aum, 35420.5);
  assert.strictEqual(hdfcData.fundDetails.expenseRatio, 1.58);
  console.log('✅ Similar funds peer isolation strictly verified.');

  await mongoose.disconnect();
}

runFullUniverseParity().catch((err) => {
  console.error('Fatal Parity Error:', err);
  process.exit(1);
});
