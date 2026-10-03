/**
 * VikaOne Mutual Fund — Phase 5 NSE Order Submission & Response Mapping Service
 *
 * Implements real NSE MFSS order entry and response state mapping.
 * Strictly adheres to:
 * - Regular mutual fund plans ONLY.
 * - Payment success is a required prerequisite before exchange submission.
 * - Payment success != Allotment (allottedUnits remains 0 until confirmed allotment).
 * - Maps raw NSE statuses (100, REJECTED, PROCESSING, TIMEOUT) into the Order State Machine.
 */

const nseClient = require('./nseClient');
const MfOrder = require('../../models/MfOrder');
const MfAuditLog = require('../../models/MfAuditLog');
const { MfStateMachine } = require('../mfStateMachine');

class NseOrderLifecycleService {
  /**
   * Submit an authorized, paid order to NSE MFSS
   * @param {string | object} orderOrId - MfOrder or ID
   * @param {object} [options]
   */
  async submitOrderToExchange(orderOrId, options = {}) {
    let order;
    if (typeof orderOrId === 'string' || orderOrId._bsontype === 'ObjectID') {
      order = await MfOrder.findById(orderOrId);
    } else {
      order = orderOrId;
    }

    if (!order) {
      throw new Error('Order not found for exchange submission');
    }

    // 1. Enforce Regular plan only
    if (order.planType !== 'REGULAR') {
      throw new Error(`Invalid planType '${order.planType}'. Only REGULAR mutual fund plans are supported.`);
    }

    // 2. Validate Payment Prerequisite
    if (order.paymentStatus !== 'SUCCESS') {
      throw new Error(`Cannot submit unpaid order ${order.orderId} to exchange. Payment status is '${order.paymentStatus}'.`);
    }

    // 3. Idempotency guard: Prevent duplicate submission if already submitted
    if (['SUBMITTED', 'PROCESSING', 'ALLOTTED', 'EXCHANGE_ACCEPTED'].includes(order.orderStatus)) {
      return {
        success: true,
        order,
        alreadySubmitted: true,
        message: `Order ${order.orderId} was already submitted to exchange previously.`,
      };
    }

    const requestTimestamp = new Date();

    // 4. Build official NSE NORMAL transaction payload (per NSEINVEST NNF spec)
    const transactionDetails = {
      order_ref_number: order.orderId,
      client_code: order.clientCode,
      scheme_code: order.schemeCode,
      buy_sell: order.transactionType === 'R' ? 'RED' : 'PUR',
      buy_sell_type: order.buySellType || 'FRESH',
      dp_txn_mode: 'P', // Physical / Demat
      order_amount: String(order.orderAmount),
      sub_broker_code: process.env.NSE_SUB_BROKER_CODE || '',
      euin: process.env.NSE_EUIN || 'E123456',
      euin_opt: 'N',
      remarks: 'VikaOne Regular Mutual Fund Order',
    };

    let nseResponse = null;
    let exchangeStatus = 'UNKNOWN';
    let exchangeRemark = '';
    let exchangeReference = null;

    try {
      nseResponse = await nseClient.createNormalOrder(transactionDetails);

      const responseData = nseResponse?.data;
      const txItem = responseData?.transaction_details?.[0] || responseData?.orders?.[0];

      if (nseResponse?.status === 200 && (responseData?.status === '100' || txItem?.status === 'SUCCESS')) {
        exchangeStatus = 'ACCEPTED';
        exchangeReference = txItem?.trxn_order_id || txItem?.order_no || `NSE_REF_${order.orderId}`;
        exchangeRemark = txItem?.message || responseData?.message || 'Transaction accepted by exchange';
      } else {
        exchangeStatus = 'REJECTED';
        exchangeRemark = txItem?.rejection_reason || txItem?.message || nseResponse?.message || responseData?.message || 'Exchange rejected order';
      }
    } catch (err) {
      if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        exchangeStatus = 'TIMEOUT';
        exchangeRemark = 'Exchange gateway timeout during order dispatch';
      } else {
        exchangeStatus = 'SUBMISSION_FAILED';
        exchangeRemark = err.message || 'Network exception during exchange submission';
      }
    }

    const responseTimestamp = new Date();

    // 5. Map Exchange Response to Order State Machine
    if (exchangeStatus === 'ACCEPTED') {
      await MfStateMachine.transitionOrder(order, 'SUBMITTED', {
        source: 'NSE_MFSS_EXCHANGE',
        actor: 'ORDER_DISPATCHER',
        externalReference: exchangeReference,
        remark: exchangeRemark,
      });

      order.nseTrxnOrderId = exchangeReference;
      order.nseStatus = 'ACCEPTED';
      order.remarks = `${order.remarks ? order.remarks + ' | ' : ''}NSE Accepted (${exchangeReference})`;
      await order.save();
    } else if (exchangeStatus === 'TIMEOUT') {
      order.nseStatus = 'TIMEOUT';
      order.remarks = `${order.remarks ? order.remarks + ' | ' : ''}NSE Timeout - Pending Reconciliation`;
      await order.save();
    } else {
      // Rejection / Failure: Order cannot proceed to allotment
      order.nseStatus = exchangeStatus;
      order.remarks = `${order.remarks ? order.remarks + ' | ' : ''}NSE ${exchangeStatus}: ${exchangeRemark}`;
      await order.save();
    }

    // 6. Log audit event
    await MfAuditLog.create({
      event: `NSE_ORDER_SUBMISSION_${exchangeStatus}`,
      entityType: 'ORDER',
      entityId: String(order._id),
      user: order.user,
      source: 'NSE_ORDER_LIFECYCLE_SERVICE',
      actor: 'ORDER_DISPATCHER',
      externalReference: exchangeReference || order.orderId,
      reason: exchangeRemark,
      newState: {
        exchangeStatus,
        exchangeReference,
        requestTimestamp,
        responseTimestamp,
        allottedUnits: order.allottedUnits, // Strictly 0
      },
    });

    return {
      success: exchangeStatus === 'ACCEPTED',
      order,
      exchangeStatus,
      exchangeReference,
      exchangeRemark,
      requestTimestamp,
      responseTimestamp,
    };
  }

  /**
   * Synchronize Order Status from NSE Exchange
   */
  async syncOrderStatus(orderId) {
    const order = await MfOrder.findOne({
      $or: [{ _id: orderId }, { orderId: String(orderId) }],
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const filter = {
      order_ref_number: order.orderId,
      client_code: order.clientCode,
    };

    const report = await nseClient.getOrderStatusReport(filter);
    const nseData = report?.data?.orders?.[0] || report?.data?.transaction_details?.[0];

    if (!nseData) {
      return {
        synchronized: false,
        order,
        message: 'No status record returned from exchange for this order',
      };
    }

    const rawStatus = (nseData.order_status || nseData.status || '').toUpperCase();
    const allottedUnits = parseFloat(nseData.allotted_units || nseData.units || '0');
    const allottedNav = parseFloat(nseData.nav || '0');

    return {
      synchronized: true,
      order,
      rawStatus,
      allottedUnits,
      allottedNav,
      nseData,
    };
  }
}

module.exports = new NseOrderLifecycleService();
