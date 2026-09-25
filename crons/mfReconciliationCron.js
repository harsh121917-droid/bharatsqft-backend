const cron = require('node-cron');
const mfReconciliationEngine = require('../services/mfReconciliationEngine');

/**
 * Daily Automated Mutual Fund Order & SIP Reconciliation Cron
 * Runs every night at 01:00 AM IST to compare Vikaone DB orders against exchange settlement.
 */

async function startReconciliationCron() {
  // Run daily at 01:00 AM IST (19:30 UTC)
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] ⏰ Triggering Daily Automated Mutual Fund Reconciliation...');
    try {
      await mfReconciliationEngine.runReconciliation('CRON_NIGHTLY');
    } catch (err) {
      console.error('[Cron] ❌ Daily Reconciliation failed:', err.message);
    }
  });

  console.log('[Cron] Mutual Fund Daily Automated Reconciliation Cron scheduled for 01:00 AM daily.');
}

module.exports = {
  startReconciliationCron,
  runReconciliationNow: () => mfReconciliationEngine.runReconciliation('ADMIN_MANUAL'),
};
