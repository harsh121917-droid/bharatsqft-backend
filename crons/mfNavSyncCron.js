const cron = require('node-cron');
const axios = require('axios');
const MutualFundScheme = require('../models/MutualFundScheme');

/**
 * AMFI & NSE Mutual Funds NAV and Master Sync Cron
 * AMFI updates official NAVs daily between 9:00 PM and 11:00 PM IST.
 * This cron runs daily at 23:30 IST to synchronize all schemes with the latest NAVs.
 */

const nseMasterReconciliationService = require('../services/nse/nseMasterReconciliationService');
const mfMarketSyncService = require('../services/mfMarketSyncService');
const mfNfoService = require('../services/mfNfoService');
const NseConfig = require('../models/NseConfig');

async function syncMutualFundNavs() {
  console.log('[MF NAV Sync] Starting daily official Master & NAV synchronization...');
  try {
    // Step 0: Sync official AMFI Daily NAVs
    try {
      await mfMarketSyncService.syncAmfiDailyNavs();
    } catch (e) {
      console.warn('[MF NAV Sync] AMFI direct feed note:', e.message);
    }

    // Step 0.5: Sync Live NFO Master & Recalculate Countdowns
    try {
      await mfNfoService.syncLiveNfoMaster();
    } catch (e) {
      console.warn('[MF NAV Sync] NFO Sync note:', e.message);
    }

    // Step 1: Execute NSE Master Ingestion Pipeline (SCH, NAV, SIP)
    const pipelineReport = await nseMasterReconciliationService.syncNseMasterPipeline({ dryRun: false });
    console.log(`[MF NAV Sync] NSE Master Pipeline completed. SCH=${pipelineReport.sch.status}, NAV=${pipelineReport.nav.status}, SIP=${pipelineReport.sip.status}`);

    // Step 2: Cross-reconcile against official AMFI/RTA feed
    const report = await nseMasterReconciliationService.reconcileAllSchemes({ dryRun: false });
    console.log(`✅ [MF NAV Sync] Successfully reconciled ${report.totalDbSchemes} schemes. NAVs Updated: ${report.navDiscrepanciesFlagged}, Matched: ${report.matchedAccurately}.`);

    // Step 3: Synchronize statutory scheme facts with TigZig AMFI connector (if enabled in Admin)
    try {
      const mfDataSource = await NseConfig.getMfDataSource();
      if (mfDataSource === 'LEGACY') {
        console.log('[MF NAV Sync] TigZig sync skipped (Data Source set to LEGACY in Admin NSE Credentials).');
      } else {
        console.log('[MF NAV Sync] Starting TigZig statutory facts sync (AUM, TER, Fund Managers, Min Investment)...');
        await mfMarketSyncService.syncSchemesWithTigzig({ batchSize: 50 });
      }
    } catch (e) {
      console.warn('[MF NAV Sync] TigZig sync note:', e.message);
    }

    return {
      success: true,
      pipelineReport,
      reconciliationReport: report,
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
