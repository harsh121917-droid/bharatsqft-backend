require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const mutualFundsController = require('../controllers/mutualFundsController');

// Mock req / res for Express controller
function createMockReqRes(params = {}, query = {}) {
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

async function testListDetailParity() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for parity test.');

  const testCodes = ['130502', '145139', '147944', '113177', '122640'];

  for (const code of testCodes) {
    console.log(`\nTesting parity for Scheme ${code}...`);

    // 1. Call getSchemeDetail
    const detailContext = createMockReqRes({ code });
    await mutualFundsController.getSchemeDetail(detailContext.req, detailContext.res);
    const detailResp = await detailContext.promise;
    assert.equal(detailResp.statusCode, 200, `getSchemeDetail failed for ${code}`);
    const detailData = detailResp.payload.data;

    // 2. Call getSchemes (search for this code)
    const listContext = createMockReqRes({}, { search: code, page: 1, limit: 10 });
    await mutualFundsController.getSchemes(listContext.req, listContext.res);
    const listResp = await listContext.promise;
    assert.equal(listResp.statusCode, 200, `getSchemes failed for ${code}`);
    const listItems = Array.isArray(listResp.payload.data) ? listResp.payload.data : (listResp.payload.data?.schemes || []);
    const listItem = listItems.find((s) => String(s.schemeCode) === String(code) || String(s.amfiCode) === String(code));
    assert.ok(listItem, `Scheme ${code} not found in getSchemes list`);

    console.log(`List:   1M=${listItem.return1M}, 3M=${listItem.return3M}, 6M=${listItem.return6M}, 1Y=${listItem.cagr1Y}, 3Y=${listItem.cagr3Y}, 5Y=${listItem.cagr5Y}`);
    console.log(`Detail: 1M=${detailData.return1M}, 3M=${detailData.return3M}, 6M=${detailData.return6M}, 1Y=${detailData.cagr1Y}, 3Y=${detailData.cagr3Y}, 5Y=${detailData.cagr5Y}`);

    // Assert absolute equality between List and Detail
    assert.equal(listItem.return1M, detailData.return1M, `1M mismatch for ${code}: list=${listItem.return1M} detail=${detailData.return1M}`);
    assert.equal(listItem.return3M, detailData.return3M, `3M mismatch for ${code}: list=${listItem.return3M} detail=${detailData.return3M}`);
    assert.equal(listItem.return6M, detailData.return6M, `6M mismatch for ${code}: list=${listItem.return6M} detail=${detailData.return6M}`);
    assert.equal(listItem.cagr1Y, detailData.cagr1Y, `1Y mismatch for ${code}: list=${listItem.cagr1Y} detail=${detailData.cagr1Y}`);
    assert.equal(listItem.cagr3Y, detailData.cagr3Y, `3Y mismatch for ${code}: list=${listItem.cagr3Y} detail=${detailData.cagr3Y}`);
    assert.equal(listItem.cagr5Y, detailData.cagr5Y, `5Y mismatch for ${code}: list=${listItem.cagr5Y} detail=${detailData.cagr5Y}`);

    console.log(`✅ Scheme ${code}: 100% PARITY between List and Detail!`);
  }

  await mongoose.disconnect();
}

testListDetailParity().catch((err) => {
  console.error('Parity test error:', err);
  process.exit(1);
});
