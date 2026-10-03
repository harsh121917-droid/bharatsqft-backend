require('dotenv').config();
const mongoose = require('mongoose');
const { getSchemeDetail } = require('../controllers/mutualFundsController');

async function testApi() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const testCodes = ['130502', '145139', '147944', '108466', '100822', '129006', '100119', '135759', '999999'];

  for (const code of testCodes) {
    const req = { params: { code } };
    let responseData = null;
    let statusCode = 200;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseData = data; return res; }
    };

    await getSchemeDetail(req, res);

    if (code === '999999') {
      console.log(`\nScheme ${code}: HTTP ${statusCode} (Expected 404 for nonexistent)`);
      continue;
    }

    if (!responseData || !responseData.success) {
      console.log(`\nScheme ${code}: FAILED - ${responseData?.message}`);
      continue;
    }

    const d = responseData.data;
    const p = d.portfolio;
    console.log(`\n=== Scheme ${code}: ${d.schemeName} ===`);
    console.log(`Fund Type: ${d.fundType} | Plan: ${d.plan} | Option: ${d.option} | PlanType: ${d.planType}`);
    console.log(`Holdings Available: ${p.holdingsAvailable} | Total Holdings Count: ${p.totalHoldingsCount} | Holdings Length: ${p.holdings?.length} | isPartial: ${p.isPartial}`);
    console.log(`Portfolio Status: ${p.portfolioStatus} | As Of Date: ${p.asOfDate} | Source: ${p.source}`);
    console.log(`Source Document: ${p.sourceDocument}`);
    if (p.holdings && p.holdings.length > 0) {
      const top10 = p.holdings.slice(0, 10);
      const top10Sum = top10.reduce((acc, h) => acc + (h.weightPercent || 0), 0);
      console.log(`First 3 Holdings:`);
      top10.slice(0, 3).forEach((h, idx) => {
        console.log(`  ${idx + 1}. ${h.securityName} (${h.isin || 'N/A'}): ${h.weightPercent}% [Source: ${h.weightSource}]`);
      });
      console.log(`Top 10 Weight Sum: ${top10Sum.toFixed(2)}% (NOT normalized to 100%)`);
      const totalWeightSum = p.holdings.reduce((acc, h) => acc + (h.weightPercent || 0), 0);
      console.log(`Total Portfolio Weight Sum: ${totalWeightSum.toFixed(2)}%`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

testApi().catch(console.error);
