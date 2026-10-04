require('dotenv').config();
const mongoose = require('mongoose');
const Scheme = require('../models/MutualFundScheme');
const amcSourceRegistry = require('../services/amcSourceRegistry');
const mfIntelligenceService = require('../services/mfIntelligenceService');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const filter = {
    planType: 'REGULAR',
    schemeName: { $not: /direct/i },
    option: { $not: /idcw|dividend/i },
  };

  const total = await Scheme.countDocuments(filter);
  const withDbAum = await Scheme.countDocuments({ ...filter, aum: { $ne: null } });

  console.log(`Total Regular Growth Schemes: ${total}`);
  console.log(`Schemes with aum != null in DB: ${withDbAum}`);

  // Canary schemes
  const canaries = ['145139', '147944', '130502', '122640'];
  for (const c of canaries) {
    const s = await Scheme.findOne({ schemeCode: c }).lean();
    const intel = mfIntelligenceService.getSchemeIntelligence(c);
    const amc = amcSourceRegistry.getAmcSources(s ? s.amcCode : null);

    console.log(`\nCanary Scheme ${c}: ${s ? s.schemeName : 'NOT FOUND'}`);
    console.log(`  AMC Code:         ${s ? s.amcCode : 'N/A'}`);
    console.log(`  DB AUM:           ${s ? s.aum : 'N/A'}`);
    console.log(`  DB AUM AsOf:      ${s ? s.aumAsOfDate : 'N/A'}`);
    console.log(`  DB AUM Source:    ${s ? s.aumSource : 'N/A'}`);
    console.log(`  Intel AUM:        ${intel ? intel.aum : 'N/A'}`);
    console.log(`  Intel AUM AsOf:   ${intel ? intel.aumAsOfDate : 'N/A'}`);
    console.log(`  Intel AUM Source: ${intel ? intel.aumSource : 'N/A'}`);
    console.log(`  AMC Total AUM:    ${amc ? amc.totalAum : 'N/A'}`);
    console.log(`  AMC Total AUM AsOf:${amc ? amc.totalAumAsOfDate : 'N/A'}`);
    console.log(`  AMC Total AUM Src:${amc ? amc.totalAumSource : 'N/A'}`);
    console.log(`  DB NAV:           ${s ? s.nav : 'N/A'}`);
    console.log(`  DB NAV Date:      ${s ? s.navDate : 'N/A'}`);
  }

  // Check how many have Intel AUM
  const allSchemes = await Scheme.find(filter).lean();
  let intelCount = 0;
  let amcCount = 0;
  for (const s of allSchemes) {
    if (mfIntelligenceService.hasSchemeIntelligence(s.schemeCode)) intelCount++;
    const amc = amcSourceRegistry.getAmcSources(s.amcCode);
    if (amc && amc.totalAum != null) amcCount++;
  }

  console.log(`\nSchemes with verified Intelligence AUM: ${intelCount}`);
  console.log(`Schemes with registered AMC Total AUM:   ${amcCount}`);

  await mongoose.disconnect();
}

inspect().catch(console.error);
