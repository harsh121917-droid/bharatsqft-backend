const nseClient = require('./nse/nseClient');
const MfOrder = require('../models/MfOrder');
const MfSip = require('../models/MfSip');
const MfReconciliation = require('../models/MfReconciliation');
const MutualFundScheme = require('../models/MutualFundScheme');

class MfReconciliationEngine {
  /**
   * Run automated or manual reconciliation
   * @param {'CRON_NIGHTLY' | 'ADMIN_MANUAL'} executedBy
   */
  async runReconciliation(executedBy = 'CRON_NIGHTLY') {
    const startTime = Date.now();
    const runId = `REC_${Date.now()}`;
    console.log(`[Reconciliation Engine] Starting reconciliation run ${runId} (${executedBy})...`);

    const discrepancies = [];
    let totalOrdersChecked = 0;
    let totalSipsChecked = 0;

    try {
      // 1. Fetch Orders from last 30 days or pending
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const orders = await MfOrder.find({
        $or: [
          { createdAt: { $gte: sinceDate } },
          { paymentStatus: 'PENDING' },
          { nseStatus: { $in: ['PENDING', 'ORDER SUBMITTED', 'PROCESSING'] } },
        ],
      }).populate('user', 'name email phone');

      totalOrdersChecked = orders.length;

      // Check each order
      for (const order of orders) {
        try {
          const nseFilter = {
            order_ref_number: order.orderId,
            client_code: order.clientCode,
          };
          const report = await nseClient.getOrderStatusReport(nseFilter);
          const nseData = report?.data?.orders?.[0];

          if (nseData) {
            const nseOrderStatus = (nseData.order_status || nseData.status || '').toUpperCase();
            const nseAllottedUnits = parseFloat(nseData.allotted_units || nseData.units || '0');
            const nseNav = parseFloat(nseData.nav || '0');

            // Scenario A: Mismatched Status (e.g. Vikaone SUCCESS, NSE REJECTED)
            if (
              order.paymentStatus === 'SUCCESS' &&
              ['REJECTED', 'FAILED', 'CANCELLED'].includes(nseOrderStatus)
            ) {
              discrepancies.push({
                refId: order.orderId,
                type: 'ORDER',
                user: order.user?._id || order.user,
                userName: order.user?.name || 'Investor',
                schemeCode: order.schemeCode,
                schemeName: order.schemeName,
                amount: order.orderAmount,
                units: order.units,
                vikaoneStatus: order.paymentStatus,
                nseStatus: nseOrderStatus,
                description: `Payment marked SUCCESS in Vikaone, but exchange returned ${nseOrderStatus}. Reason: ${nseData.rejection_reason || 'RTA Rejection'}`,
                resolved: false,
              });
            }

            // Scenario B: Order was PENDING in Vikaone, but exchange ALLOTTED -> Auto-resolve!
            else if (
              order.paymentStatus === 'PENDING' &&
              ['ALLOTTED', 'SETTLED', 'SUCCESS'].includes(nseOrderStatus)
            ) {
              order.paymentStatus = 'SUCCESS';
              order.nseStatus = nseOrderStatus;
              if (nseAllottedUnits > 0) order.units = nseAllottedUnits;
              if (nseNav > 0) order.navAtOrder = nseNav;
              await order.save();

              discrepancies.push({
                refId: order.orderId,
                type: 'ORDER',
                user: order.user?._id || order.user,
                userName: order.user?.name || 'Investor',
                schemeCode: order.schemeCode,
                schemeName: order.schemeName,
                amount: order.orderAmount,
                units: order.units,
                vikaoneStatus: 'PENDING (Auto-Healed)',
                nseStatus: nseOrderStatus,
                description: `Pending order synchronized and confirmed from exchange settlement (Units: ${order.units}).`,
                resolved: true,
                resolvedAt: new Date(),
                autoResolved: true,
              });
            }
          }
        } catch (err) {
          console.warn(`[Reconciliation Engine] Error checking order ${order.orderId}:`, err.message);
        }
      }

      // 2. Fetch Active / Pending SIPs
      const sips = await MfSip.find({
        status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] },
      }).populate('user', 'name email phone');

      totalSipsChecked = sips.length;

      for (const sip of sips) {
        try {
          const sipReport = await nseClient.getOrderStatusReport({
            reg_id: sip.sipRegNo,
            client_code: sip.clientCode,
          });
          const nseSipData = sipReport?.data?.orders?.[0];

          if (nseSipData) {
            const nseSipStatus = (nseSipData.status || nseSipData.order_status || '').toUpperCase();
            if (sip.status === 'ACTIVE' && ['CANCELLED', 'REJECTED', 'FAILED'].includes(nseSipStatus)) {
              discrepancies.push({
                refId: sip.sipRegNo,
                type: 'SIP',
                user: sip.user?._id || sip.user,
                userName: sip.user?.name || 'Investor',
                schemeCode: sip.schemeCode,
                schemeName: sip.schemeName,
                amount: sip.installmentAmount,
                units: 0,
                vikaoneStatus: sip.status,
                nseStatus: nseSipStatus,
                description: `SIP ${sip.sipRegNo} active in app, but marked ${nseSipStatus} on exchange.`,
                resolved: false,
              });
            }
          }
        } catch (sipErr) {
          console.warn(`[Reconciliation Engine] Error checking SIP ${sip.sipRegNo}:`, sipErr.message);
        }
      }

      const unresolvedCount = discrepancies.filter((d) => !d.resolved).length;
      const status = unresolvedCount > 0 ? 'DISCREPANCIES_FOUND' : 'CLEAN';
      const durationMs = Date.now() - startTime;
      const summary = `Reconciled ${totalOrdersChecked} orders and ${totalSipsChecked} SIPs in ${durationMs}ms. Found ${unresolvedCount} unresolved discrepancies (${discrepancies.filter((d) => d.autoResolved).length} auto-healed).`;

      const record = await MfReconciliation.create({
        runId,
        executedBy,
        totalOrdersChecked,
        totalSipsChecked,
        mismatchesCount: unresolvedCount,
        discrepancies,
        status,
        durationMs,
        summary,
      });

      console.log(`✅ [Reconciliation Engine] ${summary}`);
      return {
        success: true,
        data: record,
      };
    } catch (engineError) {
      console.error('[Reconciliation Engine Critical Error]:', engineError);
      const record = await MfReconciliation.create({
        runId,
        executedBy,
        totalOrdersChecked,
        totalSipsChecked,
        mismatchesCount: 0,
        discrepancies: [],
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        summary: `Reconciliation failed: ${engineError.message}`,
      });
      return {
        success: false,
        message: engineError.message,
        data: record,
      };
    }
  }

  /**
   * Get latest reconciliation status and alerts
   */
  async getLatestStatus() {
    const latest = await MfReconciliation.findOne().sort({ executedAt: -1 }).lean();
    const unresolvedAlertsCount = await MfReconciliation.aggregate([
      { $unwind: '$discrepancies' },
      { $match: { 'discrepancies.resolved': false } },
      { $count: 'unresolved' },
    ]);

    return {
      lastRun: latest || null,
      unresolvedCount: unresolvedAlertsCount[0]?.unresolved || 0,
    };
  }
}

module.exports = new MfReconciliationEngine();
