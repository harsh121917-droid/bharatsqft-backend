const mongoose = require('mongoose');
const mutualFundsController = require('../controllers/mutualFundsController');

require('dotenv').config();

function createMockContext(params = {}, query = {}) {
  let statusCode = 200;
  let responseData = null;
  const req = { params, query };
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      resolvePromise({ statusCode, data });
      return this;
    },
  };
  return { req, res, promise };
}

async function inspectSamples() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const sampleCodes = [
    { name: 'HDFC Small Cap', code: '130502', type: 'Small Cap' },
    { name: 'Invesco India Small Cap', code: '145139', type: 'Small Cap' },
    { name: 'Bandhan Small Cap', code: '147944', type: 'Small Cap' },
    { name: 'ICICI Prudential Bluechip', code: '108466', type: 'Large Cap' },
    { name: 'Franklin India Banking & PSU Debt', code: '129006', type: 'Debt' },
    { name: 'UTI Nifty 50 Index', code: '100822', type: 'Index' },
  ];

  console.log('\n======================================================');
  console.log('       PHASE 5E REPRESENTATIVE API SAMPLES AUDIT      ');
  console.log('======================================================\n');

  for (const sample of sampleCodes) {
    const ctx = createMockContext({ code: sample.code });
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const { statusCode, data } = await ctx.promise;

    if (!data.success) {
      console.error(`FAILED for ${sample.name} (${sample.code}):`, data.message);
      continue;
    }

    const d = data.data;
    console.log(`Scheme: ${sample.name} [${sample.code}] (${sample.type})`);
    console.log(`  - Fund Type: "${d.fundType}" (API option: "${d.option}")`);
    console.log(`  - Plan:      "${d.plan}" (API planType: "${d.planType}")`);
    console.log(`  - Rating:    ${d.rating} (status: "${d.ratingStatus}")`);
    console.log(`  - Portfolio:`);
    console.log(`      * holdingsAvailable:  ${d.portfolio?.holdingsAvailable}`);
    console.log(`      * isPartial:          ${d.portfolio?.isPartial}`);
    console.log(`      * totalHoldingsCount: ${d.portfolio?.totalHoldingsCount}`);
    console.log(`      * displayedCount:     ${d.portfolio?.displayedCount}`);
    console.log(`      * asOfDate:           ${d.portfolio?.asOfDate}`);
    console.log(`      * source:             ${d.portfolio?.source}`);
    console.log(`      * holdings count:     ${d.portfolio?.holdings?.length}`);
    if (d.portfolio?.holdings && d.portfolio.holdings.length > 0) {
      console.log(`      * Top 3 holdings:`);
      d.portfolio.holdings.slice(0, 3).forEach((h, i) => {
        console.log(`          ${i + 1}. ${h.securityName || h.name} [ISIN: ${h.isin || 'N/A'}] | Sector: ${h.sector} | Weight: ${h.weightPercent}% (${h.weightSource})`);
      });
      const sumWeight = d.portfolio.holdings.reduce((sum, h) => sum + (h.weightPercent || 0), 0);
      console.log(`      * Total disclosed holdings weight sum: ${sumWeight.toFixed(2)}%`);
    }
    console.log('------------------------------------------------------');
  }

  // Also test an unverified scheme (coverage of sourceUnavailable)
  const unverifiedCtx = createMockContext({ code: '135759' }); // Axis Children's Fund - Regular Plan - Growth Option
  await mutualFundsController.getSchemeDetail(unverifiedCtx.req, unverifiedCtx.res);
  const unverifiedRes = await unverifiedCtx.promise;
  const ud = unverifiedRes.data?.data;
  console.log(`Scheme: Unverified Scheme [135759] (Testing SOURCE_UNAVAILABLE Contract)`);
  console.log(`  - Fund Type: "${ud?.fundType}" | Plan: "${ud?.plan}"`);
  console.log(`  - Portfolio:`);
  console.log(`      * holdingsAvailable:  ${ud?.portfolio?.holdingsAvailable}`);
  console.log(`      * isPartial:          ${ud?.portfolio?.isPartial}`);
  console.log(`      * totalHoldingsCount: ${ud?.portfolio?.totalHoldingsCount}`);
  console.log(`      * holdings:           ${ud?.portfolio?.holdings}`);
  console.log(`      * portfolioStatus:    "${ud?.portfolio?.portfolioStatus}"`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

inspectSamples().catch(console.error);
