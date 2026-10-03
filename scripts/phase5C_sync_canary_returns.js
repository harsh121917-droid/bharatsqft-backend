require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const MutualFundScheme = require('../models/MutualFundScheme');
const { calculateFundReturns } = require('../services/mfReturnEngine');

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return resolve(null);
        }
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (_) {
            resolve(null);
          }
        });
      }
    ).on('error', () => resolve(null));
  });
}

const CANARY_CODES = ['130502', '145139', '147944', '113177', '122640'];

async function syncCanaries() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  for (const code of CANARY_CODES) {
    const scheme = await MutualFundScheme.findOne({
      $or: [{ schemeCode: code }, { amfiCode: code }],
      planType: 'REGULAR',
    });

    if (!scheme) {
      console.log(`Scheme ${code} not found in DB!`);
      continue;
    }

    console.log(`\nFetching AMFI timeseries for ${code} (${scheme.schemeName})...`);
    const resp = await fetchJson(`https://api.mfapi.in/mf/${code}`);
    if (!resp || !Array.isArray(resp.data) || resp.data.length < 2) {
      console.log(`Failed to fetch timeseries for ${code}`);
      continue;
    }

    const rawList = resp.data;
    const chronological = [];
    for (let i = rawList.length - 1; i >= 0; i--) {
      const item = rawList[i];
      const navVal = parseFloat(item.nav);
      if (!isNaN(navVal) && navVal > 0) {
        const parts = item.date.split('-');
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : item.date;
        chronological.push({ date: isoDate, nav: navVal });
      }
    }

    const fundReturns = calculateFundReturns(chronological, {
      schemeCode: code,
      planType: 'REGULAR',
      option: scheme.option || 'GROWTH',
    });

    console.log(`Results for ${code}:`, {
      '1M': fundReturns.returns['1M'],
      '3M': fundReturns.returns['3M'],
      '6M': fundReturns.returns['6M'],
      '1Y': fundReturns.returns['1Y'],
      '3Y': fundReturns.returns['3Y'],
      '5Y': fundReturns.returns['5Y'],
      'All': fundReturns.returns['All'],
    });

    const latestPoint = chronological[chronological.length - 1];
    const updateDoc = {
      return1M: fundReturns.returns['1M'],
      return3M: fundReturns.returns['3M'],
      return6M: fundReturns.returns['6M'],
      cagr1Y: fundReturns.returns['1Y'],
      cagr3Y: fundReturns.returns['3Y'],
      cagr5Y: fundReturns.returns['5Y'],
      returnsCalculatedAt: new Date(),
      returnsMethodology: fundReturns.returnsMethodology,
      returnsSource: fundReturns.returnsSource,
    };

    if (latestPoint && latestPoint.nav > 0) {
      updateDoc.nav = latestPoint.nav;
      updateDoc.navDate = new Date(latestPoint.date);
      updateDoc.navUpdatedAt = new Date();
    }

    await MutualFundScheme.updateOne({ _id: scheme._id }, { $set: updateDoc });
    console.log(`✅ Scheme ${code} DB updated with unified returns.`);
  }

  await mongoose.disconnect();
}

syncCanaries().catch((err) => {
  console.error(err);
  process.exit(1);
});
