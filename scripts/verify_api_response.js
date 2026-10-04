require('dotenv').config();
const mongoose = require('mongoose');
const controller = require('../controllers/mutualFundsController');

async function testApi() {
  await mongoose.connect(process.env.MONGO_URI);

  const testCodes = ['145139', '147944', '130502', '122640'];

  for (const code of testCodes) {
    let capturedData = null;
    const req = { params: { code } };
    const res = {
      json: (payload) => {
        capturedData = payload;
        return payload;
      },
      status: (code) => ({
        json: (payload) => {
          capturedData = { statusCode: code, ...payload };
          return payload;
        },
      }),
    };

    await controller.getSchemeDetail(req, res);

    if (!capturedData || !capturedData.success) {
      console.error(`Failed to get scheme ${code}:`, capturedData);
      continue;
    }

    const d = capturedData.data;
    console.log(`\n=== API Contract Check for ${code} (${d.schemeName}) ===`);
    console.log(`Top-level aum:            ${d.aum}`);
    console.log(`Top-level aumAsOf:        ${d.aumAsOf}`);
    console.log(`Top-level aumSource:      ${d.aumSource}`);
    console.log(`Top-level aumStatus:      ${d.aumStatus}`);
    console.log(`fundDetails.aum:          ${d.fundDetails.aum}`);
    console.log(`fundDetails.aumAsOf:      ${d.fundDetails.aumAsOf}`);
    console.log(`fundDetails.aumSource:    ${d.fundDetails.aumSource}`);
    console.log(`fundDetails.aumStatus:    ${d.fundDetails.aumStatus}`);
    console.log(`fundHouse.totalAum:       ${d.fundHouse.totalAum}`);
    console.log(`fundHouse.totalAumAsOf:   ${d.fundHouse.totalAumAsOf}`);
    console.log(`fundHouse.totalAumSource: ${d.fundHouse.totalAumSource}`);
    console.log(`fundHouse.totalAumStatus: ${d.fundHouse.totalAumStatus}`);
    console.log(`NAV:                      ${d.nav} (${d.navDate})`);
  }

  // Also test an uncatalogued scheme
  const uncatReq = { params: { code: '100027' } }; // An unverified scheme
  let uncatData = null;
  const uncatRes = {
    json: (payload) => {
      uncatData = payload;
      return payload;
    },
    status: (code) => ({
      json: (payload) => {
        uncatData = { statusCode: code, ...payload };
        return payload;
      },
    }),
  };
  await controller.getSchemeDetail(uncatReq, uncatRes);
  if (uncatData && uncatData.success) {
    const d = uncatData.data;
    console.log(`\n=== API Contract Check for Uncatalogued Scheme 100027 ===`);
    console.log(`fundDetails.aum:          ${d.fundDetails.aum} (expected null)`);
    console.log(`fundDetails.aumStatus:    ${d.fundDetails.aumStatus} (expected SOURCE_UNAVAILABLE)`);
    console.log(`fundHouse.totalAum:       ${d.fundHouse.totalAum} (expected registered AMC AUM)`);
    console.log(`fundHouse.totalAumStatus: ${d.fundHouse.totalAumStatus} (expected VERIFIED)`);
  }

  await mongoose.disconnect();
}

testApi().catch(console.error);
