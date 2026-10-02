require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const MutualFundScheme = require('../models/MutualFundScheme');


function mapCategory(header) {
  const h = header.toLowerCase();
  if (h.includes('elss') || h.includes('tax')) {
    return { category: 'Tax Saver (ELSS)', subCategory: 'ELSS Tax Saver (Sec 80C)', riskLevel: 'Very High' };
  }
  if (h.includes('gold') || h.includes('silver') || h.includes('commodity')) {
    return { category: 'Gold & Commodity', subCategory: 'Gold ETF FoF', riskLevel: 'Moderately High' };
  }
  if (h.includes('liquid') || h.includes('overnight') || h.includes('money market')) {
    return { category: 'Liquid & Overnight', subCategory: 'Liquid Fund', riskLevel: 'Low' };
  }
  if (h.includes('hybrid') || h.includes('balanced') || h.includes('dynamic asset') || h.includes('arbitrage')) {
    return { category: 'Hybrid', subCategory: 'Dynamic Asset Allocation', riskLevel: 'High' };
  }
  if (h.includes('index') || h.includes('etf')) {
    return { category: 'Index', subCategory: 'Index / Passive ETF', riskLevel: 'Very High' };
  }
  if (h.includes('debt') || h.includes('gilt') || h.includes('bond') || h.includes('banking and psu')) {
    return { category: 'Debt', subCategory: 'Debt / Fixed Income', riskLevel: 'Moderate' };
  }
  if (h.includes('small cap')) {
    return { category: 'Equity', subCategory: 'Small Cap', riskLevel: 'Very High' };
  }
  if (h.includes('mid cap')) {
    return { category: 'Equity', subCategory: 'Mid Cap', riskLevel: 'Very High' };
  }
  if (h.includes('large cap') || h.includes('large & mid')) {
    return { category: 'Equity', subCategory: 'Large Cap', riskLevel: 'High' };
  }
  if (h.includes('flexi cap') || h.includes('multi cap')) {
    return { category: 'Equity', subCategory: 'Flexi Cap', riskLevel: 'Very High' };
  }
  return { category: 'Equity', subCategory: 'Equity Fund', riskLevel: 'Very High' };
}

function deriveAmcCode(amcName) {
  if (!amcName) return 'MF';
  return amcName
    .toUpperCase()
    .replace(/MUTUAL FUND|ASSET MANAGEMENT|COMPANY|LIMITED|LTD|\./g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 15) + '_MF';
}

async function ingestRegularSchemes() {
  console.log('🔗 Connecting to database...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  console.log('📡 Fetching official AMFI live mutual fund master feed...');
  const res = await axios.get('https://portal.amfiindia.com/spages/NAVAll.txt', {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });

  const lines = res.data.split('\n');
  console.log(`✅ AMFI Feed downloaded. Total lines: ${lines.length}`);

  let currentCategory = 'Open Ended Schemes(Equity Scheme - Large Cap Fund)';
  let currentAmc = 'HDFC Mutual Fund';
  const bulkOps = [];
  const processedCodes = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('Open Ended Schemes') || line.startsWith('Close Ended Schemes')) {
      currentCategory = line;
      continue;
    }
    if (!line.includes(';') && (line.includes('Mutual Fund') || line.includes('Asset Management'))) {
      currentAmc = line.replace(/Mutual Fund.*/i, 'Mutual Fund').trim();
      continue;
    }

    if (!line.includes(';')) continue;

    const lower = line.toLowerCase();

    // ── STRICT REGULAR PLAN FILTERING ──
    // 1. Must be Growth option
    if (!lower.includes('growth')) continue;

    // 2. Must NOT be Direct plan
    if (lower.includes('direct')) continue;

    // 3. Must NOT be dividend / IDCW / bonus / institutional
    if (
      lower.includes('idcw') ||
      lower.includes('dividend') ||
      lower.includes('bonus') ||
      lower.includes('institutional')
    ) {
      continue;
    }

    const parts = line.split(';');
    if (parts.length < 5) continue;

    const schemeCode = parts[0]?.trim();
    if (!schemeCode || processedCodes.has(schemeCode)) continue;

    const isinGrowth = parts[1]?.trim();
    const isinDiv = parts[2]?.trim();
    const isin = (isinGrowth && isinGrowth !== '-') ? isinGrowth : ((isinDiv && isinDiv !== '-') ? isinDiv : '');
    const navStr = parts[parts.length - 2]?.trim();
    const nav = parseFloat(navStr);

    if (!isin || isNaN(nav) || nav <= 0) continue;

    // Construct raw scheme name faithfully from feed without altering source identity
    let nameParts = [];
    for (let i = 3; i < parts.length - 2; i++) {
      const p = parts[i]?.trim();
      if (p && !nameParts.includes(p)) {
        nameParts.push(p);
      }
    }
    const sourceSchemeName = nameParts.join(' - ').trim();

    const catMeta = mapCategory(currentCategory);
    const amcCode = deriveAmcCode(currentAmc);

    processedCodes.add(schemeCode);

    bulkOps.push({
      updateOne: {
        filter: { schemeCode },
        update: {
          $set: {
            schemeCode,
            schemeName: sourceSchemeName, // Faithful source scheme name
            planType: 'REGULAR',
            option: 'GROWTH',
            amcCode,
            amcName: currentAmc,
            isin,
            category: catMeta.category,
            subCategory: catMeta.subCategory,
            nav,
            navDate: new Date(),
            riskLevel: catMeta.riskLevel,
            // Financial fields default to null if not authoritatively available
            cagr1Y: null,
            cagr3Y: null,
            cagr5Y: null,
            minPurchaseAmount: null,
            minSipAmount: null,
            rating: null,
            fundManager: null,
            aum: null,
            expenseRatio: null,
            isPopular: false,
            isFeatured: false,
            isRecommended: false,
            isActive: true,
          },
        },
        upsert: true,
      },
    });
  }

  console.log(`📦 Prepared ${bulkOps.length} Regular Plan schemes for database insertion.`);

  // 1. Delete all existing Direct schemes so no Direct scheme ever remains in DB
  console.log('🗑️  Removing all Direct schemes from database...');
  const delResult = await MutualFundScheme.deleteMany({
    $or: [
      { schemeName: { $regex: 'direct', $options: 'i' } },
      { planType: 'DIRECT' },
    ],
  });
  console.log(`✅ Removed ${delResult.deletedCount} Direct schemes.`);

  // 2. Bulk upsert all Regular schemes
  console.log('🚀 Ingesting official Regular Plan schemes...');
  const batchSize = 300;
  for (let i = 0; i < bulkOps.length; i += batchSize) {
    const batch = bulkOps.slice(i, i + batchSize);
    await MutualFundScheme.bulkWrite(batch);
    console.log(`   Saved ${Math.min(i + batchSize, bulkOps.length)} / ${bulkOps.length} Regular schemes`);
  }

  const finalRegularCount = await MutualFundScheme.countDocuments({ planType: 'REGULAR' });
  const remainingDirectCount = await MutualFundScheme.countDocuments({
    $or: [
      { schemeName: { $regex: 'direct', $options: 'i' } },
      { planType: 'DIRECT' },
    ],
  });
  const totalInDb = await MutualFundScheme.countDocuments();

  console.log('\n==========================================');
  console.log('🎉 REGULAR PLAN INGESTION COMPLETE:');
  console.log(`   Total Schemes in DB: ${totalInDb}`);
  console.log(`   Regular Schemes:     ${finalRegularCount}`);
  console.log(`   Direct Schemes:      ${remainingDirectCount}`);
  console.log('==========================================\n');

  await mongoose.disconnect();
}

ingestRegularSchemes().catch((err) => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});
