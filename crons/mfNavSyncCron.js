const cron = require('node-cron');
const axios = require('axios');
const MutualFundScheme = require('../models/MutualFundScheme');

/**
 * AMFI & NSE Mutual Funds NAV and Master Sync Cron
 * AMFI updates official NAVs daily between 9:00 PM and 11:00 PM IST.
 * This cron runs daily at 23:30 IST to synchronize all schemes with the latest NAVs.
 */

async function syncMutualFundNavs() {
  console.log('[MF NAV Sync] Starting daily AMFI NAV synchronization...');
  try {
    const response = await axios.get('https://portal.amfiindia.com/spages/NAVAll.txt', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    const lines = response.data.split('\n');
    let updatedCount = 0;

    // Create an in-memory map of ISIN -> { nav, navDate, schemeName }
    const isinNavMap = new Map();
    const codeNavMap = new Map();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || !line.includes(';')) continue;

      const parts = line.split(';');
      if (parts.length >= 5) {
        const amfiCode = parts[0]?.trim();
        const isinGrowth = parts[1]?.trim();
        const isinDiv = parts[2]?.trim();
        const schemeName = parts[3]?.trim();
        const navStr = parts[parts.length - 2]?.trim();
        const dateStr = parts[parts.length - 1]?.trim();

        const nav = parseFloat(navStr);
        if (!isNaN(nav) && nav > 0) {
          const navData = { nav, dateStr, schemeName };
          if (isinGrowth && isinGrowth !== '-' && isinGrowth.length > 5) isinNavMap.set(isinGrowth, navData);
          if (isinDiv && isinDiv !== '-' && isinDiv.length > 5) isinNavMap.set(isinDiv, navData);
          if (amfiCode) codeNavMap.set(amfiCode, navData);
        }
      }

    }

    console.log(`[MF NAV Sync] Parsed ${isinNavMap.size} ISIN records from AMFI feed.`);

    // Fetch all active schemes in our database
    const dbSchemes = await MutualFundScheme.find({ isActive: true });
    for (const scheme of dbSchemes) {
      let navInfo = null;

      if (scheme.isin && isinNavMap.has(scheme.isin)) {
        navInfo = isinNavMap.get(scheme.isin);
      } else if (scheme.schemeCode && codeNavMap.has(scheme.schemeCode)) {
        navInfo = codeNavMap.get(scheme.schemeCode);
      }

      if (navInfo && navInfo.nav > 0) {
        scheme.nav = navInfo.nav;
        scheme.navDate = new Date();
        await scheme.save();
        updatedCount++;
      }
    }

    console.log(`✅ [MF NAV Sync] Successfully updated ${updatedCount}/${dbSchemes.length} schemes with live AMFI NAVs.`);
    return {
      success: true,
      updatedCount,
      totalSchemes: dbSchemes.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ [MF NAV Sync Error]:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Schedule: Daily at 23:30 IST (18:00 UTC)
cron.schedule('30 23 * * *', async () => {
  console.log('⏰ [CRON] Triggering scheduled Mutual Funds Daily NAV Sync...');
  await syncMutualFundNavs();
});

module.exports = {
  syncMutualFundNavs,
};
