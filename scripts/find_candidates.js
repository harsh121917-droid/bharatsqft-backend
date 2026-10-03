const mongoose = require('mongoose');
require('dotenv').config();
const MutualFundScheme = require('../models/MutualFundScheme');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const searches = [
    { label: 'Mid Cap', query: { planType: 'REGULAR', schemeName: { $regex: /mid\s*cap/i, $not: /direct/i } } },
    { label: 'Hybrid / Balanced', query: { planType: 'REGULAR', schemeName: { $regex: /hybrid|balanced/i, $not: /direct/i } } },
    { label: 'Arbitrage', query: { planType: 'REGULAR', schemeName: { $regex: /arbitrage/i, $not: /direct/i } } },
    { label: 'Kotak', query: { planType: 'REGULAR', amcCode: /KOTAK/i, schemeName: { $not: /direct/i } } },
    { label: 'SBI', query: { planType: 'REGULAR', amcCode: /SBI/i, schemeName: { $not: /direct/i } } },
    { label: 'ICICI', query: { planType: 'REGULAR', amcCode: /ICICI/i, schemeName: { $not: /direct/i } } },
    { label: 'Axis', query: { planType: 'REGULAR', amcCode: /AXIS/i, schemeName: { $not: /direct/i } } },
  ];
  for (const s of searches) {
    const list = await MutualFundScheme.find(s.query)
      .select('schemeCode amfiCode isin schemeName amcName amcCode subCategory category aum')
      .limit(4);
    console.log(`=== ${s.label} ===`);
    list.forEach(item => console.log(' ', item.schemeCode, '|', item.isin, '|', item.schemeName, '|', item.subCategory, '|', item.amcCode));
  }
  await mongoose.disconnect();
}
main().catch(console.error);
