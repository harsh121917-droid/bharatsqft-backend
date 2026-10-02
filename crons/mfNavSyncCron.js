const cron = require('node-cron');
const axios = require('axios');
const MutualFundScheme = require('../models/MutualFundScheme');

/**
 * AMFI & NSE Mutual Funds NAV and Master Sync Cron
 * AMFI updates official NAVs daily between 9:00 PM and 11:00 PM IST.
 * This cron runs daily at 23:30 IST to synchronize all schemes with the latest NAVs.
 */

const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');

async function syncMutualFundNavs() {
  console.log('[MF NAV Sync] Starting daily official Master & NAV synchronization...');
  try {
    const report = await nseMasterReconciliationService.reconcileAllSchemes({ dryRun: false });
    console.log(`✅ [MF NAV Sync] Successfully reconciled ${report.totalDbSchemes} schemes. NAVs Updated: ${report.navDiscrepanciesFlagged}, Matched: ${report.matchedAccurately}.`);
    return {
      success: true,
      updatedCount: report.navDiscrepanciesFlagged,
      matchedCount: report.matchedAccurately,
      totalSchemes: report.totalDbSchemes,
      timestamp: report.lastReconciledAt,
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
