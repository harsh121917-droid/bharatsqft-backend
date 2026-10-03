require('dotenv').config();
const mongoose = require('mongoose');
const mutualFundsController = require('../controllers/mutualFundsController');

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

async function checkHdfcDetail() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const ctx = createMockReqRes({ code: '130502' });
  await mutualFundsController.getSchemeDetail(ctx.req, ctx.res);
  const resp = await ctx.promise;

  const data = resp.payload.data;
  console.log('HDFC Small Cap Detail Result:');
  console.log('  Scheme Name:', data.schemeName);
  console.log('  fundDetails:', data.fundDetails);
  console.log('  investmentRules:', data.investmentRules);
  console.log('  fundHouse:', data.fundHouse);
  console.log('  fundManagement:', data.fundManagement);
  console.log('  holdings count:', data.portfolio?.holdings?.length);
  console.log('  returns:', data.returns);

  await mongoose.disconnect();
}

checkHdfcDetail().catch(console.error);
