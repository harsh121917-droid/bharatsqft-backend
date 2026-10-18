/**
 * crons/mfAumSyncCron.js
 * 
 * Monthly Statutory Mutual Fund AUM, Holdings & Facts Sync Cron
 * SEBI mandates AMCs to disclose scheme-level AUM and full portfolios by the 10th of every month.
 * This cron runs on the 11th of every month at 02:00 AM IST to refresh all schemes dynamically.
 */

const cron = require('node-cron');
const mfMarketSyncService = require('../services/mfMarketSyncService');
const mfPortfolioIngestionService = require('../services/mfPortfolioIngestionService');

async function runMonthlyAumAndPortfolioSync() {
  console.log('[Monthly MF Sync] ⏰ Starting automated monthly AUM & factsheet sync...');
  try {
    // 1. Sync verified statutory scheme facts (AUM, fund managers, expense ratio)
    const schemeReport = await mfMarketSyncService.syncAllVerifiedSchemeFacts();
    console.log(`[Monthly MF Sync] ✅ Scheme facts sync complete: ${schemeReport.modified} updated.`);

    // 2. Ingest all statutory disclosure portfolios
    const portfolioReport = await mfPortfolioIngestionService.ingestAllDisclosures();
    console.log(`[Monthly MF Sync] ✅ Portfolio disclosures ingested: ${portfolioReport.results?.length || 0} files.`);

    return {
      success: true,
      schemeReport,
      portfolioReport,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Monthly MF Sync Error] ❌ Monthly sync failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Scheduled: 11th of every month at 02:00 AM IST (20:30 UTC on 10th)
cron.schedule('0 2 11 * *', async () => {
  console.log('⏰ [CRON] Triggering scheduled Monthly Mutual Fund AUM & Portfolio Sync...');
  await runMonthlyAumAndPortfolioSync();
});

module.exports = {
  runMonthlyAumAndPortfolioSync,
};
