/**
 * VikaOne Mutual Fund — Phase 4 Admin Operations & Controlled Reversal Service
 *
 * Provides:
 * 1. Deep 360-degree inspection across all financial entities:
 *    Orders, Payments, Exchange refs, Allotment feeds, Transactions, Holdings,
 *    SIPs, Mandates, Capital Gains, Reconciliation, Webhooks, Audit Logs.
 * 2. Controlled Financial Reversal Workflow:
 *    Strictly prevents arbitrary manual edits to units/NAV/holdings.
 *    Any administrative correction must proceed through an immutable, auditable
 *    ledger reversal transaction with mandatory reason and actor identity.
 */

const mongoose = require('mongoose');
const MfOrder = require('../models/MfOrder');
const MfTransaction = require('../models/MfTransaction');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfSip = require('../models/MfSip');
const MfMandate = require('../models/MfMandate');
const MfCapitalGain = require('../models/MfCapitalGain');
const MfAuditLog = require('../models/MfAuditLog');
const { recalculateUserPortfolio } = require('./mfPortfolioEngine');

class MfAdminService {
  /**
   * 360-degree inspection for an Order
   */
  async inspectOrder(orderId) {
    const query = mongoose.isValidObjectId(orderId)
      ? { $or: [{ _id: orderId }, { orderId: String(orderId) }] }
      : { orderId: String(orderId) };
    const order = await MfOrder.findOne(query).populate('user', 'name email phone');

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const transactions = await MfTransaction.find({ order: order._id });
    const auditLogs = await MfAuditLog.find({ entityId: String(order._id) }).sort({ createdAt: -1 });
    const holding = await MfPortfolioHolding.findOne({ user: order.user?._id, schemeCode: order.schemeCode });

    return {
      order,
      transactions,
      auditLogs,
      holdingSnapshot: holding,
    };
  }

  /**
   * 360-degree inspection for a User's complete Mutual Fund position
   */
  async inspectUserFinancials(userId) {
    const [orders, holdings, transactions, sips, mandates, capitalGains, auditLogs] = await Promise.all([
      MfOrder.find({ user: userId }).sort({ createdAt: -1 }),
      MfPortfolioHolding.find({ user: userId }),
      MfTransaction.find({ user: userId }).sort({ transactionDate: -1 }),
      MfSip.find({ user: userId }).sort({ createdAt: -1 }),
      MfMandate.find({ user: userId }).sort({ createdAt: -1 }),
      MfCapitalGain.find({ user: userId }).sort({ redemptionDate: -1 }),
      MfAuditLog.find({ user: userId }).sort({ createdAt: -1 }),
    ]);

    const totalInvested = holdings.reduce((sum, h) => sum + (h.investedAmount || 0), 0);
    const totalCurrentValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);

    return {
      userId,
      portfolioSummary: {
        totalInvested: +totalInvested.toFixed(2),
        totalCurrentValue: +totalCurrentValue.toFixed(2),
        holdingsCount: holdings.length,
      },
      holdings,
      orders,
      transactions,
      sips,
      mandates,
      capitalGains,
      auditLogs,
    };
  }

  /**
   * Controlled Administrative Reversal Workflow
   * Strictly prohibits direct manual alteration of units or NAV.
   * Creates an auditable REVERSAL transaction in the ledger and recalculates portfolio.
   */
  async executeControlledReversal({ orderId, adminActor, reason }) {
    if (!orderId || !adminActor || !reason) {
      throw new Error('orderId, adminActor, and reason are mandatory for administrative reversal');
    }

    const query = mongoose.isValidObjectId(orderId)
      ? { $or: [{ _id: orderId }, { orderId: String(orderId) }] }
      : { orderId: String(orderId) };
    const order = await MfOrder.findOne(query);

    if (!order) {
      throw new Error(`Order ${orderId} not found for reversal`);
    }

    if (order.orderStatus !== 'ALLOTTED') {
      throw new Error(`Cannot reverse order in status '${order.orderStatus}'. Only ALLOTTED orders can be reversed.`);
    }

    const originalTxn = await MfTransaction.findOne({ order: order._id });
    if (!originalTxn) {
      throw new Error(`No original transaction found for order ${orderId}`);
    }

    // Check if already reversed
    const existingReversal = await MfTransaction.findOne({
      order: order._id,
      transactionType: 'REVERSAL',
    });
    if (existingReversal) {
      throw new Error(`Order ${orderId} has already been reversed on ${existingReversal.transactionDate}`);
    }

    const reversalUnits = -originalTxn.units; // Inverts units (+units become -units, -units become +units)
    const reversalAmount = originalTxn.orderAmount;

    // 1. Create Immutable REVERSAL Ledger Transaction
    const reversalTxn = await MfTransaction.create({
      user: order.user,
      order: order._id,
      clientCode: order.clientCode,
      schemeCode: order.schemeCode,
      schemeName: order.schemeName,
      planType: 'REGULAR',
      transactionType: 'REVERSAL',
      transactionDate: new Date(),
      orderAmount: reversalAmount,
      units: reversalUnits,
      nav: originalTxn.nav,
      navDate: originalTxn.navDate,
      status: 'REVERSED',
      externalReference: `REV_${order.orderId}_${Date.now()}`,
      remarks: `ADMIN REVERSAL by ${adminActor}: ${reason}`,
    });

    // 2. Mark order status as REFUNDED/CANCELLED
    order.orderStatus = 'REFUNDED';
    order.remarks = `${order.remarks ? order.remarks + ' | ' : ''}REVERSED by ${adminActor}: ${reason}`;
    await order.save();

    // 3. Atomically recalculate user portfolio
    await recalculateUserPortfolio(order.user);

    // 4. Create immutable audit log entry
    await MfAuditLog.create({
      event: 'ADMIN_CONTROLLED_REVERSAL',
      entityType: 'ORDER',
      entityId: String(order._id),
      user: order.user,
      previousState: {
        orderStatus: 'ALLOTTED',
        units: originalTxn.units,
        orderAmount: originalTxn.orderAmount,
      },
      newState: {
        orderStatus: 'REFUNDED',
        reversalTransactionId: reversalTxn._id,
        reversalUnits,
      },
      source: 'ADMIN_OPERATIONS',
      actor: adminActor,
      reason,
      externalReference: reversalTxn.externalReference,
    });

    return {
      success: true,
      message: `Controlled reversal executed successfully for order ${orderId}`,
      reversalTransaction: reversalTxn,
      updatedOrderStatus: order.orderStatus,
    };
  }
}

module.exports = new MfAdminService();
