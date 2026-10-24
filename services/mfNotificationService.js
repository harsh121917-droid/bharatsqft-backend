/**
 * VikaOne Mutual Fund — Phase 4 Authoritative Notification Service
 *
 * Implements customer notifications strictly tied to authoritative state transitions:
 * - Purchase: Payment received, Order submitted, Accepted, Rejected, Allotted, Failed.
 * - SIP: Created, Mandate pending, Mandate active, Debit success, Debit failed, Allotted, Paused, Cancelled.
 * - Redemption: Requested, Accepted, Settled, Payout completed, Failed.
 *
 * Strict Rule: No notification may ever claim units or investment success before
 * authoritative allotment occurs.
 */

const NotificationLog = require('../models/NotificationLog');
const eventNotificationService = require('./eventNotificationService');

class MfNotificationService {
  /**
   * Helper to persist notification log and dispatch
   */
  async sendCustomerNotification({ userId, title, body, deepLink = 'mutual_funds' }) {
    if (!userId) return null;

    try {
      return await eventNotificationService.sendNotification({
        userId,
        title,
        body,
        deepLink,
        app: 'digigold', // VikaOne (Gold & MF)
        sentBy: 'MF_LIFECYCLE_SYSTEM',
      });
    } catch (err) {
      console.warn('[MfNotificationService] Failed to record notification:', err.message);
      return null;
    }
  }

  // ── Purchase Lifecycle Notifications ──
  async notifyPaymentReceived(order) {
    try {
      await eventNotificationService.notifyOrderLifecycle(order.user, order);
    } catch (_) {}
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Payment Received',
      body: `Payment of ₹${order.orderAmount} received for ${order.schemeName}. Your mutual fund order is being queued for exchange submission.`,
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  async notifyOrderSubmitted(order) {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Order Submitted to Exchange',
      body: `Order ${order.orderId} for ${order.schemeName} submitted to NSE MFSS. Awaiting exchange processing.`,
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  async notifyOrderAccepted(order) {
    try {
      await eventNotificationService.notifyOrderLifecycle(order.user, order);
    } catch (_) {}
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Order Accepted by Exchange',
      body: `Your mutual fund order for ${order.schemeName} (₹${order.orderAmount}) has been accepted and is awaiting allotment.`,
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  async notifyOrderRejected(order, reason = 'Exchange rejection') {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Order Rejected',
      body: `Order ${order.orderId} for ${order.schemeName} was not accepted by exchange: ${reason}. Refund will be initiated if deducted.`,
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  async notifyAllotmentConfirmed(order) {
    try {
      await eventNotificationService.notifyOrderLifecycle(order.user, order);
    } catch (_) {}
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Units Allotted Successfully',
      body: `Your mutual fund units have been allotted. (${order.allottedUnits || ''} units of ${order.schemeName || ''} at NAV ₹${order.allottedNav || ''})`.trim(),
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  async notifyOrderFailed(order, reason = 'Processing failure') {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Order Processing Failed',
      body: `Order ${order.orderId} for ${order.schemeName} failed: ${reason}.`,
      deepLink: 'mutual_funds/portfolio?tab=orders',
    });
  }

  // ── SIP Lifecycle Notifications ──
  async notifySipCreated(sip) {
    try {
      return await eventNotificationService.notifySipRegistration(sip.user, sip);
    } catch (_) {
      return this.sendCustomerNotification({
        userId: sip.user,
        title: 'SIP Registration Confirmed 🎉',
        body: `Your monthly SIP of ₹${sip.installmentAmount} for ${sip.schemeName} has been created. Mandate authorization required.`,
        deepLink: 'mutual_funds/portfolio?tab=sips',
      });
    }
  }

  async notifyMandateActive(sip) {
    return this.sendCustomerNotification({
      userId: sip.user,
      title: 'Mandate Activated',
      body: `Bank auto-debit mandate is now active for your SIP in ${sip.schemeName}. Installments will auto-debit on the scheduled date.`,
      deepLink: 'mutual_funds/portfolio?tab=sips',
    });
  }

  async notifyMandateRejected(sip, reason = 'Bank rejection') {
    return this.sendCustomerNotification({
      userId: sip.user,
      title: 'Mandate Registration Rejected',
      body: `Bank mandate registration failed for ${sip.schemeName}: ${reason}. Please register a valid bank account.`,
      deepLink: 'mutual_funds/portfolio?tab=sips',
    });
  }

  async notifyDebitSuccess(sip, amount) {
    try {
      return await eventNotificationService.notifyFirstSipPayment(sip.user, {
        schemeName: sip.schemeName,
        orderAmount: amount,
        orderStatus: 'PAYMENT_SUCCESS',
        paymentStatus: 'SUCCESS',
        orderId: `SIP_DEBIT_${sip.sipRegNo || sip._id}_${Date.now()}`,
      }, sip);
    } catch (_) {
      return this.sendCustomerNotification({
        userId: sip.user,
        title: 'SIP Installment Debited',
        body: `Installment of ₹${amount} debited successfully for ${sip.schemeName}. Order submitted for allotment.`,
        deepLink: 'mutual_funds/portfolio?tab=orders',
      });
    }
  }

  async notifyDebitFailed(sip, amount, reason = 'Insufficient funds') {
    try {
      return await eventNotificationService.notifySipPaymentFailed(sip.user, { sip, amount, reason });
    } catch (_) {
      return this.sendCustomerNotification({
        userId: sip.user,
        title: 'SIP Debit Failed',
        body: `SIP installment of ₹${amount} for ${sip.schemeName} could not be debited: ${reason}.`,
        deepLink: 'mutual_funds/portfolio?tab=sips',
      });
    }
  }

  async notifySipPaused(sip) {
    return this.sendCustomerNotification({
      userId: sip.user,
      title: 'SIP Paused',
      body: `Your SIP for ${sip.schemeName} has been paused. No upcoming installments will be debited until resumed.`,
      deepLink: `mutual_funds/sip/${sip._id}`,
    });
  }

  async notifySipCancelled(sip) {
    return this.sendCustomerNotification({
      userId: sip.user,
      title: 'SIP Cancelled',
      body: `Your SIP for ${sip.schemeName} has been cancelled. Existing portfolio units remain untouched.`,
      deepLink: `mutual_funds/sip/${sip._id}`,
    });
  }

  // ── Redemption Lifecycle Notifications ──
  async notifyRedemptionRequested(order) {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Redemption Request Received',
      body: `Your redemption request is being processed. Redemption for ${order.redemptionUnits || order.requestedUnits || ''} units of ${order.schemeName} received and validated.`,
      deepLink: `mutual_funds/order/${order.orderId}`,
    });
  }

  async notifyRedemptionSettled(order) {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Redemption Settled',
      body: `Redemption of ${order.redemptionUnits} units of ${order.schemeName} settled for ₹${order.finalSettledAmount}. Payout initiated.`,
      deepLink: `mutual_funds/order/${order.orderId}`,
    });
  }

  async notifyPayoutCompleted(order) {
    return this.sendCustomerNotification({
      userId: order.user,
      title: 'Bank Payout Credited',
      body: `Your redemption payout has been completed. Payout of ₹${order.finalSettledAmount || ''} for ${order.schemeName || ''} credited to your registered bank account.`.trim(),
      deepLink: `mutual_funds/order/${order.orderId}`,
    });
  }
}

module.exports = new MfNotificationService();
