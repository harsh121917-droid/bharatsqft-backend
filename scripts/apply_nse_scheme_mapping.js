require('dotenv').config();
const mongoose = require('mongoose');

async function applyNseSchemeMapping() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);

  const MFScheme = mongoose.models.MutualFundScheme || mongoose.model('MutualFundScheme', new mongoose.Schema({}, { strict: false }));
  const SipMaster = mongoose.models.MfSipSchemeMaster || mongoose.model('MfSipSchemeMaster', new mongoose.Schema({}, { strict: false }));

  console.log('Fetching all schemes and SIP master records...');
  const schemes = await MFScheme.find({ isin: { $exists: true, $ne: '' } }).lean();
  const sipDocs = await SipMaster.find({}).lean();

  const sipByIsin = new Map();
  for (const s of sipDocs) {
    if (!s.isin) continue;
    if (!sipByIsin.has(s.isin)) {
      sipByIsin.set(s.isin, []);
    }
    sipByIsin.get(s.isin).push(s);
  }

  const bulkOps = [];
  let mapped = 0;
  let unmapped = 0;

  for (const scheme of schemes) {
    const sips = sipByIsin.get(scheme.isin) || [];
    // Strict Regular + Growth filter
    const regularGrowthSips = sips.filter(s => {
      const name = (s.schemeName || '').toUpperCase();
      const code = (s.schemeCode || '').toUpperCase();
      if (name.includes('DIRECT')) return false;
      return code.endsWith('-GR') || code.endsWith('GR') || name.includes('GROWTH');
    });

    let bestMatch = null;
    if (regularGrowthSips.length > 0) {
      // Prefer base tier (not -L1, -L0, -L2)
      bestMatch = regularGrowthSips.find(s => !s.schemeCode.includes('-L1') && !s.schemeCode.includes('-L0') && !s.schemeCode.includes('-L2')) || regularGrowthSips[0];
    } else if (sips.length > 0) {
      bestMatch = sips.find(s => !s.schemeCode.includes('-L1') && !s.schemeCode.includes('-L0')) || sips[0];
    }

    if (bestMatch) {
      mapped++;
      bulkOps.push({
        updateOne: {
          filter: { _id: scheme._id },
          update: {
            $set: {
              nseSchemeCode: bestMatch.schemeCode,
              amfiCode: scheme.schemeCode, // Preserve original AMFI code
              nseSchemeMappingSource: 'NSE_MFSS_MASTER',
              nseSchemeMappedAt: new Date(),
            },
          },
        },
      });
    } else {
      unmapped++;
    }
  }

  console.log(`Writing ${bulkOps.length} mappings to database...`);
  if (bulkOps.length > 0) {
    const res = await MFScheme.bulkWrite(bulkOps, { ordered: false });
    console.log(`Bulk write complete: Modified = ${res.modifiedCount}, Matched = ${res.matchedCount}`);
  }

  // Validate Bandhan Small Cap 147944
  const bandhan = await MFScheme.findOne({ schemeCode: '147944' }).lean();
  console.log('\n--- VERIFICATION OF SCHEME 147944 ---');
  console.log('ID:             ', bandhan._id);
  console.log('AMFI Code:      ', bandhan.schemeCode);
  console.log('NSE Scheme Code:', bandhan.nseSchemeCode);
  console.log('ISIN:           ', bandhan.isin);
  console.log('AMC:            ', bandhan.amcName, `(${bandhan.amcCode})`);
  console.log('Scheme Name:    ', bandhan.schemeName);
  console.log('Plan Type:      ', bandhan.planType);
  console.log('Option:         ', bandhan.option);
  console.log('Is Active:      ', bandhan.isActive);
  console.log('Purchase Allowed:', bandhan.purchaseAllowed);
  console.log('Mapping Source: ', bandhan.nseSchemeMappingSource);
  console.log('Mapped At:      ', bandhan.nseSchemeMappedAt);

  await mongoose.disconnect();
}

applyNseSchemeMapping().catch(console.error);
