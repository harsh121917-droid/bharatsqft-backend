/**
 * Event Notification Service
 *
 * Implements authoritative event-driven notifications triggered strictly upon
 * verified state transitions:
 * 1. KYC Completed: Dispatched when user's KYC is confirmed/approved.
 * 2. KYC Pending / Failed: Dispatched when KYC documents are pending or need re-submission/failed.
 * 3. Bank Account Verified: Dispatched when a bank account is successfully verified via Penny Drop or authoritative confirmation.
 * 4. First Mutual Fund Purchase: Dispatched when the user's first-ever mutual fund purchase is confirmed or allotted with accurate status.
 *
 * Non-blocking guarantee: All notifications and FCM dispatches run asynchronously with try/catch
 * so failure of external push channels never interrupts core database transactions.
 */

const NotificationLog = require("../models/NotificationLog");
const User = require("../models/User");
const MfOrder = require("../models/MfOrder");
const { sendFcmMessage } = require("../config/firebase");

class EventNotificationService {
  /**
   * Safe, non-blocking notification dispatcher
   * Creates in-app NotificationLog and dispatches push notifications via FCM.
   */
  async sendNotification({
    userId,
    userDoc = null,
    title,
    body,
    deepLink = "home",
    app = "all",
    imageUrl = "",
    sentBy = "EVENT_SYSTEM",
    eventKey = null,
    cooldownMs = 60 * 1000,
  }) {
    try {
      if (!userId && !userDoc) return null;
      const targetUserId = userId || userDoc._id;

      // Idempotency check: prevent duplicate notifications
      if (eventKey) {
        const existing = await NotificationLog.findOne({
          targetUser: targetUserId,
          $or: [
            { eventKey },
            { title, createdAt: { $gte: new Date(Date.now() - cooldownMs) } },
          ],
        });
        if (existing) {
          console.log(`[EventNotification] Suppressed duplicate notification (${eventKey}) for user ${targetUserId}`);
          return existing;
        }
      }

      // Fetch user tokens if not already provided
      let user = userDoc;
      if (!user || (!user.fcmTokens && !user.fcmTokensDrx)) {
        user = await User.findById(targetUserId).select("name phone email fcmTokens fcmTokensDrx");
      }
      if (!user) return null;

      // Determine apps to push to
      const targetApps = app === "all" ? ["vikadrx", "digigold"] : [app];
      let totalSent = 0;
      let totalSuccess = 0;
      let totalFailure = 0;

      for (const targetApp of targetApps) {
        const tokens = targetApp === "vikadrx" ? (user.fcmTokensDrx || []) : (user.fcmTokens || []);
        if (Array.isArray(tokens) && tokens.length > 0) {
          try {
            const fcmRes = await sendFcmMessage({
              app: targetApp,
              tokens,
              title,
              body,
              imageUrl,
              deepLink,
            });
            totalSent += fcmRes?.sentCount || tokens.length;
            totalSuccess += fcmRes?.successCount || 0;
            totalFailure += fcmRes?.failureCount || 0;
          } catch (fcmErr) {
            console.warn(`[EventNotification] FCM push to ${targetApp} warning:`, fcmErr.message);
          }
        }
      }

      // Create authoritative in-app notification entry
      const log = await NotificationLog.create({
        title,
        body,
        imageUrl,
        deepLink,
        app: app || "all",
        targetType: "user",
        targetUser: targetUserId,
        sentBy,
        sentCount: totalSent,
        successCount: totalSuccess,
        failureCount: totalFailure,
        status: "sent",
        eventKey: eventKey || "",
      });

      return log;
    } catch (err) {
      console.warn("[EventNotification] Error sending notification:", err.message);
      return null;
    }
  }

  /**
   * 1. KYC Completed: Notify user once KYC is successfully verified.
   */
  async notifyKycCompleted(userIdOrUser, meta = {}) {
    try {
      const userId = userIdOrUser?._id || userIdOrUser;
      if (!userId) return null;
      const eventKey = `KYC_COMPLETED_${userId}`;

      return await this.sendNotification({
        userId,
        userDoc: userIdOrUser?._id ? userIdOrUser : null,
        title: "KYC Verified Successfully 🎉",
        body: "Congratulations! Your KYC verification is complete. You can now invest in mutual funds and digital bullion without limits.",
        deepLink: "kyc",
        app: "all",
        sentBy: "EVENT_KYC_COMPLETED",
        eventKey,
        cooldownMs: 24 * 60 * 60 * 1000, // At most one completion alert per 24 hours
      });
    } catch (err) {
      console.warn("[EventNotification notifyKycCompleted warning]:", err.message);
      return null;
    }
  }

  /**
   * 2a. KYC Pending: Inform user that documents were received and are under review.
   */
  async notifyKycPending(userIdOrUser, { reason, isInitialSubmission = false } = {}) {
    try {
      const userId = userIdOrUser?._id || userIdOrUser;
      if (!userId) return null;
      const eventKey = isInitialSubmission ? `KYC_SUBMITTED_${userId}` : `KYC_PENDING_${userId}`;
      const title = isInitialSubmission ? "KYC Verification in Progress ⏳" : "KYC Verification Under Review ⏳";
      const body = isInitialSubmission
        ? "Your KYC documents have been submitted and are under review. We'll notify you as soon as verification is complete."
        : (reason ? `Your KYC status is under review: ${reason}` : "Your KYC application is currently being reviewed. We'll update you once completed.");

      return await this.sendNotification({
        userId,
        userDoc: userIdOrUser?._id ? userIdOrUser : null,
        title,
        body,
        deepLink: "kyc",
        app: "all",
        sentBy: "EVENT_KYC_PENDING",
        eventKey,
        cooldownMs: 30 * 60 * 1000,
      });
    } catch (err) {
      console.warn("[EventNotification notifyKycPending warning]:", err.message);
      return null;
    }
  }

  /**
   * 2b. KYC Failed / Rejected: Inform user if further action or re-upload is required.
   */
  async notifyKycFailed(userIdOrUser, { reason, isRevoked = false } = {}) {
    try {
      const userId = userIdOrUser?._id || userIdOrUser;
      if (!userId) return null;
      const eventKey = isRevoked ? `KYC_REVOKED_${userId}` : `KYC_REJECTED_${userId}`;
      const title = isRevoked ? "KYC Verification Revoked ⚠️" : "KYC Verification Action Required ⚠️";
      const cleanReason = (reason && typeof reason === "string" && reason.trim()) ? reason.trim() : "";
      const body = isRevoked
        ? `Your KYC verification was revoked${cleanReason ? `: ${cleanReason}` : ". Please submit updated documents to resume investing."}`
        : `Your KYC verification could not be completed${cleanReason ? `: ${cleanReason}` : ". Please check your details and re-upload valid government ID and PAN documents."}`;

      return await this.sendNotification({
        userId,
        userDoc: userIdOrUser?._id ? userIdOrUser : null,
        title,
        body,
        deepLink: "kyc",
        app: "all",
        sentBy: isRevoked ? "EVENT_KYC_REVOKED" : "EVENT_KYC_FAILED",
        eventKey,
        cooldownMs: 5 * 60 * 1000,
      });
    } catch (err) {
      console.warn("[EventNotification notifyKycFailed warning]:", err.message);
      return null;
    }
  }

  /**
   * 3. Bank Account Verified: Confirm successful bank verification.
   */
  async notifyBankVerified(userIdOrUser, { accountNumber, bankName, accountHolder } = {}) {
    try {
      const userId = userIdOrUser?._id || userIdOrUser;
      if (!userId) return null;
      const accStr = String(accountNumber || "").trim();
      const last4 = accStr.length >= 4 ? accStr.slice(-4) : accStr;
      const bName = (bankName && bankName.trim()) ? bankName.trim() : "";
      const eventKey = `BANK_VERIFIED_${userId}_${last4 || "DEF"}`;

      const title = "Bank Account Verified ✅";
      const body = last4
        ? `Your bank account (${bName ? bName + " " : ""}ending in ${last4}) has been successfully verified and linked to your profile.`
        : `Your bank account (${bName || "Linked Bank"}) has been successfully verified and linked to your profile.`;

      return await this.sendNotification({
        userId,
        userDoc: userIdOrUser?._id ? userIdOrUser : null,
        title,
        body,
        deepLink: "bank",
        app: "all",
        sentBy: "EVENT_BANK_VERIFIED",
        eventKey,
        cooldownMs: 10 * 60 * 1000,
      });
    } catch (err) {
      console.warn("[EventNotification notifyBankVerified warning]:", err.message);
      return null;
    }
  }

  /**
   * 4. First Mutual Fund Purchase: Notify user once their first purchase is successfully processed or confirmed.
   */
  async notifyFirstMfPurchase(userIdOrUser, order) {
    try {
      if (!order) return null;
      const userId = userIdOrUser?._id || userIdOrUser || order.user;
      if (!userId) return null;

      // Verify if this is indeed the user's first successful purchase
      const orderDbId = order._id;
      const priorPurchasesCount = await MfOrder.countDocuments({
        user: userId,
        transactionType: "P",
        paymentStatus: "SUCCESS",
        ...(orderDbId ? { _id: { $ne: orderDbId } } : {}),
        orderId: { $ne: order.orderId },
      });

      if (priorPurchasesCount > 0) {
        // User already has prior completed purchases — not their first purchase
        return null;
      }

      const eventKey = `FIRST_MF_PURCHASE_${order.orderId || orderDbId}`;
      const schemeName = order.schemeName || "Mutual Fund Scheme";
      const amtStr = order.orderAmount ? Number(order.orderAmount).toLocaleString("en-IN") : "";

      let title = "First Mutual Fund Purchase Confirmed! 🚀";
      let body = "";

      if (order.allotmentStatus === "ALLOTTED" || order.orderStatus === "ALLOTTED") {
        title = "Units Allotted for First Purchase! 📈";
        const unitsStr = order.allottedUnits ? `${order.allottedUnits} units of ` : "";
        const navStr = order.allottedNav ? ` at NAV ₹${order.allottedNav}` : "";
        body = `Congratulations on your first mutual fund investment! ${unitsStr}${schemeName} allotted successfully${navStr}. Status: Allotted.`;
      } else {
        const statusLabel = order.orderStatus || (order.paymentStatus === "SUCCESS" ? "Confirmed" : "Processing");
        body = `Congratulations on starting your investment journey! Your first order of ₹${amtStr} in ${schemeName} is confirmed with status: ${statusLabel}. Units will be allotted once processed.`;
      }

      return await this.sendNotification({
        userId,
        title,
        body,
        deepLink: "mutual_funds/portfolio",
        app: "digigold", // Pushed to VikaOne (Gold & MF)
        sentBy: "EVENT_FIRST_MF_PURCHASE",
        eventKey,
        cooldownMs: 24 * 60 * 60 * 1000,
      });
    } catch (err) {
      console.warn("[EventNotification notifyFirstMfPurchase warning]:", err.message);
      return null;
    }
  }
}

module.exports = new EventNotificationService();
