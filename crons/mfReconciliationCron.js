const cron = require('node-cron');
const mfReconciliationEngine = require('../services/mfReconciliationEngine');

/**
 * Daily Automated Mutual Fund Order & SIP Reconciliation Cron
 * Runs every night at 01:00 AM IST to compare Vikaone DB orders against exchange settlement.
 */

const MfMandate = require('../models/MfMandate');
const MfClientUcc = require('../models/MfClientUcc');
const nseClient = require('../services/nse/nseClient');

/**
 * Syncs pending mandates with NSE MFSS MANDATE_STATUS report
 */
async function syncPendingMandates() {
  try {
    const pendingMandates = await MfMandate.find({
      status: { $in: ['PENDING', 'SUBMITTED', 'PENDING_APPROVAL', 'INITIATED'] },
      mandateId: { $nin: ['', null, ' '] },
    }).limit(20);

    for (const m of pendingMandates) {
      try {
        const ucc = await MfClientUcc.findOne({ user: m.user });
        const res = await nseClient.getMandateStatus({
          mandateId: m.mandateId,
          client_code: ucc?.clientCode,
        });
        const repItem = res?.data?.mandates?.[0] || res?.data?.report_data?.[0];
        if (repItem) {
          const rawSt = (repItem.status || repItem.mandate_status || '').toUpperCase();
          const rawUmrn = repItem.umrn || repItem.umrnNo || repItem.umrn_no || '';
          if (['APPROVED', 'AUTHORIZED', 'ACTIVE', 'ACCEPTED_BY_BANK'].includes(rawSt) || rawUmrn) {
            m.status = 'APPROVED';
            if (rawUmrn) m.umrn = String(rawUmrn).trim();
            await m.save();
            console.log(`[Mandate Cron] ✅ Mandate ${m.mandateId} auto-synced to APPROVED (UMRN: ${m.umrn})`);
          } else if (['REJECTED', 'FAILED'].includes(rawSt)) {
            m.status = 'REJECTED';
            m.rejectionReason = repItem.rejection_reason || repItem.remarks || 'Rejected by bank/exchange';
            await m.save();
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[Mandate Cron] Error during sync:', err.message);
  }
}

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

  // Run every 15 minutes during market hours to auto-sync bank mandates from NSE
  cron.schedule('*/15 * * * *', async () => {
    await syncPendingMandates();
  });

  console.log('[Cron] Mutual Fund Daily Automated Reconciliation & Mandate Poller scheduled.');
}

module.exports = {
  startReconciliationCron,
  syncPendingMandates,
  runReconciliationNow: () => mfReconciliationEngine.runReconciliation('ADMIN_MANUAL'),
};
