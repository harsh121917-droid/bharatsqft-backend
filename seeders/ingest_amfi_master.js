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

async function ingestAmfiMaster() {
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

    // Process schemes faithfully
    if (line.includes(';') && line.toLowerCase().includes('growth')) {
      const parts = line.split(';');
      if (parts.length >= 5) {
        const schemeCode = parts[0]?.trim();
        const isinGrowth = parts[1]?.trim();
        const isinDiv = parts[2]?.trim();
        const isin = (isinGrowth && isinGrowth !== '-') ? isinGrowth : ((isinDiv && isinDiv !== '-') ? isinDiv : '');
        let rawSchemeName = parts[3]?.trim() || '';
        const navStr = parts[parts.length - 2]?.trim();
        const dateStr = parts[parts.length - 1]?.trim();

        const nav = parseFloat(navStr);
        if (!schemeCode || !isin || isNaN(nav) || nav <= 0) continue;

        const isDirect = rawSchemeName.toLowerCase().includes('direct');
        const planType = isDirect ? 'DIRECT' : 'REGULAR';

        const catMeta = mapCategory(currentCategory);
        const amcCode = deriveAmcCode(currentAmc);

        bulkOps.push({
          updateOne: {
            filter: { schemeCode },
            update: {
              $set: {
                schemeCode,
                schemeName: rawSchemeName,
                planType,
                option: 'GROWTH',
                amcCode,
                amcName: currentAmc,
                isin,
                category: catMeta.category,
                subCategory: catMeta.subCategory,
                nav,
                navDate: dateStr ? new Date(dateStr) : new Date(),
                riskLevel: catMeta.riskLevel,
                cagr1Y: null,
                cagr3Y: null,
                cagr5Y: null,
                minPurchaseAmount: null,
                minSipAmount: null,
                sipAllowed: true,
                purchaseAllowed: true,
                redemptionAllowed: true,
                rating: null,
                fundManager: null,
                aum: null,
                expenseRatio: null,
                isPopular: false,
                isFeatured: false,
                isActive: true,
              },
            },
            upsert: true,
          },
        });
      }
    }
  }
                

  console.log(`📦 Updating ${bulkOps.length} schemes with refined metrics in MongoDB...`);
  const BATCH_SIZE = 500;
  for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
    const batch = bulkOps.slice(i, i + BATCH_SIZE);
    await MutualFundScheme.bulkWrite(batch);
  }

  const totalInDb = await MutualFundScheme.countDocuments();
  console.log(`\n🎉 Ingestion Complete! Total Real Mutual Funds in Database: ${totalInDb}`);
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected.');
    await ingestAmfiMaster();
  } catch (err) {
    console.error('Ingestion Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected.');
  }
}

run();
