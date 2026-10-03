/**
 * VikaOne Phase 5C — Return Calculation & List/Detail Inconsistency Investigation
 * 
 * Deeply audits the return calculation methodology and pinpoints the exact
 * cause of list API vs detail API divergence and external app variance.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MutualFundScheme = require('../models/MutualFundScheme');
const mfLiveService = require('../services/mfLiveService');
const controller = require('../controllers/mutualFundsController');

const SCHEMES_TO_AUDIT = [
  { code: '130502', name: 'HDFC Small Cap Fund' },
  { code: '145139', name: 'Invesco India Small Cap Fund' },
  { code: '147944', name: 'Bandhan Small Cap Fund' },
  { code: '113177', name: 'Nippon India Small Cap Fund' },
  { code: '122640', name: 'Parag Parikh Flexi Cap Fund' },
];

function createMockRes() {
  let statusCode = 200;
  let responseData = null;
  return {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

async function run() {
  console.log('='.repeat(80));
  console.log('VIKAONE PHASE 5C: RETURN ENGINE & LIST/DETAIL INCONSISTENCY AUDIT');
  console.log('='.repeat(80));

  await mongoose.connect(process.env.MONGO_URI);

  for (const s of SCHEMES_TO_AUDIT) {
    console.log(`\n======================================================`);
    console.log(`AUDITING SCHEME: ${s.code} — ${s.name}`);
    console.log(`======================================================`);

    // 1. Fetch from Database directly
    const dbDoc = await MutualFundScheme.findOne({ schemeCode: s.code, planType: 'REGULAR' }).lean();
    if (!dbDoc) {
      console.warn(`[WARN] Scheme ${s.code} not found in DB!`);
      continue;
    }

    console.log('[DB Document Values]:');
    console.log(`  NAV: ${dbDoc.nav} (${dbDoc.navDate ? new Date(dbDoc.navDate).toISOString().split('T')[0] : 'null'})`);
    console.log(`  1M: ${dbDoc.return1M}%, 3M: ${dbDoc.return3M}%, 6M: ${dbDoc.return6M}%`);
    console.log(`  1Y: ${dbDoc.cagr1Y}%, 3Y: ${dbDoc.cagr3Y}%, 5Y: ${dbDoc.cagr5Y}%`);
    console.log(`  returnsCalculatedAt: ${dbDoc.returnsCalculatedAt}`);
    console.log(`  returnsMethodology: ${dbDoc.returnsMethodology}`);

    // 2. Fetch via List API
    const listRes = createMockRes();
    await controller.getSchemes({ query: { search: s.code, page: 1, limit: 1 } }, listRes);
    const listItem = listRes.getData()?.data?.[0];

    console.log('\n[List API Values]:');
    if (listItem) {
      console.log(`  NAV: ${listItem.nav}`);
      console.log(`  1M: ${listItem.return1M}%, 3M: ${listItem.return3M}%, 6M: ${listItem.return6M}%`);
      console.log(`  1Y: ${listItem.cagr1Y}%, 3Y: ${listItem.cagr3Y}%, 5Y: ${listItem.cagr5Y}%`);
    } else {
      console.log('  Not found in list API!');
    }

    // 3. Fetch via Detail API
    const detailRes = createMockRes();
    await controller.getSchemeDetail({ params: { code: s.code } }, detailRes);
    const detailData = detailRes.getData()?.data;

    console.log('\n[Detail API Values]:');
    if (detailData) {
      console.log(`  NAV: ${detailData.nav} (${detailData.navDate ? new Date(detailData.navDate).toISOString().split('T')[0] : 'null'})`);
      console.log(`  1M: ${detailData.return1M}%, 3M: ${detailData.return3M}%, 6M: ${detailData.return6M}%`);
      console.log(`  1Y: ${detailData.cagr1Y}%, 3Y: ${detailData.cagr3Y}%, 5Y: ${detailData.cagr5Y}%`);
      console.log(`  returns.All: ${detailData.returns?.All}%`);
      console.log(`  chartData available periods: ${Object.keys(detailData.chartData || {})}`);
    }

    // 4. Compare List vs Detail
    console.log('\n[Divergence Analysis (List vs Detail)]:');
    const periods = ['return1M', 'return3M', 'return6M', 'cagr1Y', 'cagr3Y', 'cagr5Y'];
    let hasMismatch = false;
    for (const p of periods) {
      const listVal = listItem ? listItem[p] : null;
      const detailVal = detailData ? detailData[p] : null;
      const match = listVal === detailVal;
      if (!match) hasMismatch = true;
      console.log(`  ${p.padEnd(10)}: List=${String(listVal).padEnd(8)} Detail=${String(detailVal).padEnd(8)} Match=${match ? '✅' : '❌ MISMATCH'}`);
    }

    // 5. Inspect Raw Live Nav Periods & Dates
    const liveNav = await mfLiveService.getLiveHistoricalNav(s.code, dbDoc);
    if (liveNav && liveNav.chartData) {
      console.log('\n[LiveNav Date & Calculation Breakdown]:');
      for (const [tf, item] of Object.entries(liveNav.chartData)) {
        const startNav = item.startNav;
        const endNav = item.endNav;
        const pCount = item.points ? item.points.length : 0;
        const startDate = item.points && item.points.length > 0 ? item.points[0].date : 'N/A';
        const endDate = item.points && item.points.length > 0 ? item.points[item.points.length - 1].date : 'N/A';
        console.log(`  ${tf.padEnd(4)}: ret=${String(item.returnPercent).padEnd(6)}% | startNav=${String(startNav).padEnd(8)} (date: ${startDate}) | endNav=${String(endNav).padEnd(8)} (date: ${endDate}) | points=${pCount}`);
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
