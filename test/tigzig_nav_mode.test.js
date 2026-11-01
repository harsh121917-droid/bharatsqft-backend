const mongoose = require('mongoose');
require('dotenv').config();
const mfLiveService = require('../services/mfLiveService');
const NseConfig = require('../models/NseConfig');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vikas-app');
  
  console.log('--- Testing TIGZIG DataSource mode ---');
  await NseConfig.updateOne({}, { $set: { mfDataSource: 'TIGZIG' } }, { upsert: true });
  NseConfig.invalidateCache();
  mfLiveService.clearNavCache();

  const resTz = await mfLiveService.getLiveHistoricalNav('101762');
  console.log('TIGZIG Result:', {
    source: resTz?.source,
    dataSource: resTz?.dataSource,
    latestNav: resTz?.latestNav,
    latestDate: resTz?.latestDate,
    chartPointsCount1Y: resTz?.chartData?.['1Y']?.points?.length,
    return1Y: resTz?.periodReturns?.['1Y']
  });

  console.log('--- Testing LEGACY DataSource mode ---');
  await NseConfig.updateOne({}, { $set: { mfDataSource: 'LEGACY' } });
  NseConfig.invalidateCache();
  mfLiveService.clearNavCache();

  const resLegacy = await mfLiveService.getLiveHistoricalNav('101762');
  console.log('LEGACY Result:', {
    source: resLegacy?.source,
    dataSource: resLegacy?.dataSource,
    latestNav: resLegacy?.latestNav,
    latestDate: resLegacy?.latestDate,
    chartPointsCount1Y: resLegacy?.chartData?.['1Y']?.points?.length,
    return1Y: resLegacy?.periodReturns?.['1Y']
  });

  // Restore TIGZIG as selected
  await NseConfig.updateOne({}, { $set: { mfDataSource: 'TIGZIG' } });
  NseConfig.invalidateCache();
  mfLiveService.clearNavCache();

  console.log('--- Testing mutualFundsController.getSchemeDetail with TIGZIG ---');
  const mfController = require('../controllers/mutualFundsController');
  let detailResponse = null;
  const mockReq = { params: { code: '101762' } };
  const mockRes = {
    status: (code) => ({
      json: (data) => { detailResponse = { code, ...data }; }
    }),
    json: (data) => { detailResponse = { code: 200, ...data }; }
  };
  await mfController.getSchemeDetail(mockReq, mockRes);
  console.log('Scheme Details Output:', {
    nav: detailResponse?.data?.nav,
    navDate: detailResponse?.data?.navDate,
    navSource: detailResponse?.data?.navSource,
    returnsSource: detailResponse?.data?.returns?.source,
    chartDataPeriods: Object.keys(detailResponse?.data?.chartData || {})
  });

  if (detailResponse?.data?.navSource !== 'TigZig AMFI Historical NAV Feed') {
    throw new Error('Expected navSource to be TigZig AMFI Historical NAV Feed');
  }

  await mongoose.disconnect();
  console.log('✅ TigZig & Legacy NAV mode test passed!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
