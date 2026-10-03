require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const MutualFundScheme = require('../models/MutualFundScheme');
const { calculateReturns } = require('../services/mfLiveService');

/**
 * Fetch JSON with timeout and retry
 */
function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return resolve(null);
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (_) {
            resolve(null);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => resolve(null));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBackfill() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || (!args.includes('--apply') && !args.includes('--force'));
  const force = args.includes('--force');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

  console.log('====================================================');
  console.log('🚀 PHASE 5A: REAL HISTORICAL NAV & RETURNS BACKFILL');
  console.log(`   Dry Run: ${dryRun}`);
  console.log(`   Force (overwrite existing returns): ${force}`);
  console.log(`   Limit: ${limit}`);
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  // Pre-audit counts
  const totalSchemes = await MutualFundScheme.countDocuments({ planType: 'REGULAR' });
  const beforeReturns = await MutualFundScheme.countDocuments({
    planType: 'REGULAR',
    cagr3Y: { $ne: null },
  });
  console.log(`Pre-Backfill Status: Total Regular = ${totalSchemes}, With Returns = ${beforeReturns}\n`);

  // Build query: If not force, only fetch schemes missing cagr3Y
  const query = {
    planType: 'REGULAR',
    isActive: true,
  };
  if (!force) {
    query.cagr3Y = null;
  }

  // Prioritize schemes by AMC or category
  const schemes = await MutualFundScheme.find(query)
    .sort({ isPopular: -1, isFeatured: -1, _id: 1 })
    .limit(limit)
    .lean();

  console.log(`📋 Found ${schemes.length} schemes to process in this run.\n`);

  let processed = 0;
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const scheme of schemes) {
    processed++;
    const code = scheme.amfiCode || scheme.schemeCode;
    process.stdout.write(`[${processed}/${schemes.length}] Scheme ${code} (${scheme.schemeName.slice(0, 40)}...): `);

    try {
      const url = `https://api.mfapi.in/mf/${code}`;
      const response = await fetchJson(url);

      if (!response || !Array.isArray(response.data) || response.data.length === 0) {
        console.log('⚠️  No historical NAV series returned from AMFI.');
        skippedCount++;
        await sleep(100);
        continue;
      }

      // Verify Scheme Identity: Never use Direct plan data
      const metaName = (response.meta?.scheme_name || '').toLowerCase();
      if (metaName.includes('direct')) {
        console.log('🛑 REJECTED: Feed returned a DIRECT plan series. Skipping to preserve Regular integrity.');
        skippedCount++;
        await sleep(100);
        continue;
      }

      // Convert raw data to chronological series (oldest first, latest last)
      const rawList = response.data;
      const chronological = [];
      for (let i = rawList.length - 1; i >= 0; i--) {
        const item = rawList[i];
        const navVal = parseFloat(item.nav);
        if (!isNaN(navVal) && navVal > 0) {
          const parts = item.date.split('-');
          const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : item.date;
          chronological.push({
            date: isoDate,
            nav: navVal,
          });
        }
      }

      if (chronological.length < 2) {
        console.log('⚠️  Insufficient chronological points (< 2).');
        skippedCount++;
        await sleep(100);
        continue;
      }

      // Calculate SEBI / AMFI returns
      const returns = calculateReturns(chronological);
      const latestPoint = chronological[chronological.length - 1];

      console.log(
        `✅ 1M: ${returns.return1M !== null ? returns.return1M + '%' : '—'}, 1Y: ${returns.return1Y !== null ? returns.return1Y + '%' : '—'}, 3Y: ${returns.return3Y !== null ? returns.return3Y + '%' : '—'}`
      );

      if (!dryRun) {
        const updateDoc = {
          return1M: returns.return1M,
          return3M: returns.return3M,
          return6M: returns.return6M,
          cagr1Y: returns.return1Y,
          cagr3Y: returns.return3Y,
          cagr5Y: returns.return5Y,
          returnsCalculatedAt: new Date(),
          returnsMethodology: returns.methodology,
          returnsSource: returns.source,
          navSource: 'AMFI_DAILY_NAV_TIMESERIES',
        };

        // If latest NAV in timeseries is valid, update NAV date and value
        if (latestPoint && latestPoint.nav > 0) {
          updateDoc.nav = latestPoint.nav;
          updateDoc.navDate = new Date(latestPoint.date);
          updateDoc.navUpdatedAt = new Date();
        }

        await MutualFundScheme.updateOne({ _id: scheme._id }, { $set: updateDoc });
      }

      successCount++;
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      errorCount++;
    }

    // Rate-limit safety: 120ms between requests
    await sleep(120);
  }

  const afterReturns = await MutualFundScheme.countDocuments({
    planType: 'REGULAR',
    cagr3Y: { $ne: null },
  });

  console.log('\n====================================================');
  console.log('🏁 BACKFILL RUN SUMMARY:');
  console.log(`   Processed:    ${processed}`);
  console.log(`   Successful:   ${successCount}`);
  console.log(`   Skipped:      ${skippedCount}`);
  console.log(`   Errors:       ${errorCount}`);
  console.log(`   DB Schemes with 3Y Returns Before: ${beforeReturns}`);
  console.log(`   DB Schemes with 3Y Returns After:  ${afterReturns}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
}

runBackfill().catch((err) => {
  console.error('Fatal Backfill Error:', err);
  process.exit(1);
});
