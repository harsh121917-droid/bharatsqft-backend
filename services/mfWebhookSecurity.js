/**
 * VikaOne Mutual Fund — Phase 4 Webhook Security Service
 *
 * Implements:
 * 1. Cryptographic HMAC-SHA256 signature verification.
 * 2. Replay protection with timestamp drift checks (max 300 seconds / 5 mins).
 * 3. Idempotency verification preventing duplicate external event processing.
 * 4. Structured audit logging for both successful and rejected webhooks.
 */

const crypto = require('crypto');
const MfAuditLog = require('../models/MfAuditLog');

const MAX_TIMESTAMP_DRIFT_SECONDS = 300; // 5 minutes

class WebhookSecurityError extends Error {
  constructor(message, code = 'WEBHOOK_UNAUTHORIZED') {
    super(message);
    this.name = 'WebhookSecurityError';
    this.code = code;
  }
}

class MfWebhookSecurity {
  /**
   * Verify HMAC-SHA256 signature against raw payload
   */
  verifyHmacSignature(rawBody, signature, secret) {
    if (!rawBody || !signature || !secret) {
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
      hmac.update(bodyString);
      const expectedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Validate webhook timestamp to prevent replay attacks
   */
  validateTimestamp(timestamp) {
    if (!timestamp) return true; // Optional if provider doesn't send timestamp

    const eventTimeMs = typeof timestamp === 'number'
      ? (timestamp > 1e11 ? timestamp : timestamp * 1000)
      : new Date(timestamp).getTime();

    if (isNaN(eventTimeMs)) {
      throw new WebhookSecurityError('Invalid webhook timestamp format', 'INVALID_TIMESTAMP');
    }

    const now = Date.now();
    const driftSeconds = Math.abs(now - eventTimeMs) / 1000;

    if (driftSeconds > MAX_TIMESTAMP_DRIFT_SECONDS) {
      throw new WebhookSecurityError(
        `Webhook timestamp expired or drifted by ${Math.round(driftSeconds)}s (max allowed: ${MAX_TIMESTAMP_DRIFT_SECONDS}s)`,
        'TIMESTAMP_EXPIRED'
      );
    }

    return true;
  }

  /**
   * Check for replay attack / duplicate webhook using idempotency key
   */
  async checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) return { isDuplicate: false };

    const existingLog = await MfAuditLog.findOne({ idempotencyKey });
    if (existingLog) {
      return {
        isDuplicate: true,
        firstReceivedAt: existingLog.createdAt,
        existingAuditId: existingLog._id,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Full comprehensive webhook verification pipeline
   * @param {object} params
   * @param {string} params.source - 'RAZORPAY_WEBHOOK' | 'NSE_MFSS_WEBHOOK' | 'RTA_FEED' | 'NPCI_MANDATE'
   * @param {string | object} params.rawBody - Raw payload or string
   * @param {string} params.signature - Provided signature header
   * @param {string} params.secret - Shared webhook secret
   * @param {number | string} [params.timestamp] - Webhook timestamp header
   * @param {string} [params.idempotencyKey] - Unique event ID from provider
   */
  async verifyAndAuthenticateWebhook({
    source,
    rawBody,
    signature,
    secret,
    timestamp = null,
    idempotencyKey = null,
  }) {
    // 1. Signature Verification
    const isValidSignature = this.verifyHmacSignature(rawBody, signature, secret);

    if (!isValidSignature) {
      // Record security audit for rejected signature
      await MfAuditLog.create({
        event: 'WEBHOOK_SIGNATURE_REJECTED',
        entityType: 'ORDER',
        entityId: idempotencyKey || 'UNKNOWN',
        source,
        actor: 'WEBHOOK_SECURITY_GUARD',
        reason: 'HMAC signature verification failed. Possible spoofing or invalid secret.',
      });

      throw new WebhookSecurityError(
        `Webhook signature verification failed for source: ${source}`,
        'INVALID_SIGNATURE'
      );
    }

    // 2. Replay Protection: Timestamp Drift
    if (timestamp) {
      this.validateTimestamp(timestamp);
    }

    // 3. Idempotency Check
    if (idempotencyKey) {
      const { isDuplicate, firstReceivedAt } = await this.checkIdempotency(idempotencyKey);
      if (isDuplicate) {
        return {
          verified: true,
          isDuplicate: true,
          message: `Webhook event ${idempotencyKey} was already processed at ${firstReceivedAt}`,
        };
      }
    }

    // 4. Log verified webhook receipt
    await MfAuditLog.create({
      event: 'WEBHOOK_AUTHENTICATED',
      entityType: 'ORDER',
      entityId: idempotencyKey || 'GENERIC',
      source,
      actor: 'WEBHOOK_RECEIVER',
      idempotencyKey: idempotencyKey || null,
      reason: `Webhook verified successfully from ${source}`,
    });

    return {
      verified: true,
      isDuplicate: false,
      message: 'Webhook authenticated successfully',
    };
  }
}

module.exports = {
  MfWebhookSecurity: new MfWebhookSecurity(),
  WebhookSecurityError,
};
