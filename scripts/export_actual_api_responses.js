require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const mutualFundsController = require('../controllers/mutualFundsController');

function createMockContext(code) {
  const req = { params: { code }, query: {} };
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

async function exportResponses() {
  await mongoose.connect(process.env.MONGO_URI);

  const codes = ['130502', '147944', '145139'];
  const exported = {};

  for (const code of codes) {
    const ctx = createMockContext(code);
    await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
    const resp = await ctx.promise;
    const d = resp.payload.data;

    exported[code] = {
      schemeCode: d.schemeCode,
      schemeName: d.schemeName,
      isin: d.isin,
      planType: d.planType,
      option: d.option,
      nav: d.nav,
      navDate: d.navDate,
      returns: {
        '1M': d.return1M,
        '3M': d.return3M,
        '6M': d.return6M,
        '1Y': d.cagr1Y,
        '3Y': d.cagr3Y,
        '5Y': d.cagr5Y,
        All: d.returns?.All,
        allReturnMethodology: d.returns?.allReturnMethodology,
        allStartDate: d.returns?.allStartDate,
        allStartNav: d.returns?.allStartNav,
        allEndDate: d.returns?.allEndDate,
        allEndNav: d.returns?.allEndNav,
        allSource: d.returns?.allSource,
      },
      fundDetails: d.fundDetails,
      investmentRules: d.investmentRules,
      fundHouse: d.fundHouse,
      fundManagement: d.fundManagement,
      portfolio: {
        holdingsCount: d.portfolio?.holdings?.length || 0,
        holdings: d.portfolio?.holdings,
        holdingsAsOf: d.portfolio?.holdingsAsOf,
        holdingsSource: d.portfolio?.holdingsSource,
      },
      dataQuality: d.dataQuality,
      dataProvenance: d.dataProvenance,
    };
  }

  const outPath = path.join(__dirname, '..', 'docs', 'phase5C_canary_actual_responses.json');
  fs.writeFileSync(outPath, JSON.stringify(exported, null, 2));
  console.log('Saved actual responses to:', outPath);
  console.log(JSON.stringify(exported, null, 2));

  await mongoose.disconnect();
}

exportResponses().catch(console.error);
