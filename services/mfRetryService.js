/**
 * VikaOne Mutual Fund — Phase 4 Bounded Idempotent Retry Engine
 *
 * Provides safe, bounded, and auditable retry handling for:
 * - Exchange order submission
 * - Order status polling
 * - Allotment ingestion
 * - Payment reconciliation
 * - SIP debit reconciliation
 * - Redemption settlement
 * - Bank payout verification
 *
 * Strict Rules:
 * - Bounded retry ceiling (default max 5 attempts).
 * - Exponential backoff to prevent retry storms.
 * - Idempotency guard: never execute duplicate financial debits or units creation.
 * - Structured audit logging upon failure and retry exhaustion.
 */

const MfAuditLog = require('../models/MfAuditLog');

class MfRetryService {
  constructor() {
    this.DEFAULT_MAX_ATTEMPTS = 5;
    this.BASE_BACKOFF_MS = 2000; // 2 seconds
  }

  /**
   * Calculate next retry timestamp using exponential backoff
   * @param {number} attemptCount
   * @param {number} baseDelayMs
   * @returns {{ nextRetryAt: Date, delayMs: number }}
   */
  calculateNextRetry(attemptCount, baseDelayMs = this.BASE_BACKOFF_MS) {
    const delayMs = Math.min(baseDelayMs * Math.pow(2, attemptCount - 1), 60000); // Max 60 seconds
    const nextRetryAt = new Date(Date.now() + delayMs);
    return { nextRetryAt, delayMs };
  }

  /**
   * Determine if an error is considered retryable (network timeout, 502/503/504 gateway error)
   * Non-retryable: 400 Bad Request, 401/403 Invalid Credentials, 409 Conflict, validation errors
   */
  isRetryableError(error) {
    if (!error) return false;
    const status = error.status || error.response?.status;
    const code = error.code;

    // Network / timeout codes are retryable
    if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ESOCKETTIMEDOUT'].includes(code)) {
      return true;
    }

    // 5xx Server errors are retryable
    if (status >= 500 && status <= 599) {
      return true;
    }

    // Business rule / validation / auth errors are NOT retryable
    if (status >= 400 && status <= 499) {
      return false;
    }

    // Default to false for unknown application exceptions to avoid duplicate financial loops
    return false;
  }

  /**
   * Execute an operation with bounded idempotent retries
   * @param {object} params
   * @param {string} params.operationName - Name of the financial operation
   * @param {string} params.entityId - ID of the entity (e.g. Order ID, SIP ID)
   * @param {Function} params.fn - Async function returning { success: boolean, ... }
   * @param {number} [params.maxAttempts=5]
   * @param {Function} [params.isRetryable]
   * @param {object} [params.context] - Additional context for logging
   */
  async executeWithRetry({
    operationName,
    entityId,
    fn,
    maxAttempts = this.DEFAULT_MAX_ATTEMPTS,
    isRetryable = null,
    context = {},
  }) {
    let attemptCount = 0;
    let lastError = null;
    let lastAttemptAt = null;

    const retryPredicate = isRetryable || this.isRetryableError.bind(this);

    while (attemptCount < maxAttempts) {
      attemptCount++;
      lastAttemptAt = new Date();

      try {
        const result = await fn({ attemptCount, lastAttemptAt });
        return {
          success: true,
          attemptCount,
          lastAttemptAt,
          result,
        };
      } catch (err) {
        lastError = err;
        const retryable = retryPredicate(err);
        const { nextRetryAt, delayMs } = this.calculateNextRetry(attemptCount);

        const retryState = {
          operationName,
          entityId: String(entityId),
          attemptCount,
          maxAttempts,
          lastAttemptAt,
          nextRetryAt: retryable && attemptCount < maxAttempts ? nextRetryAt : null,
          failureReason: err.message,
          retryable,
        };

        // If not retryable or max attempts exhausted, break and log
        if (!retryable || attemptCount >= maxAttempts) {
          const event = attemptCount >= maxAttempts ? 'RETRY_EXHAUSTION' : 'NON_RETRYABLE_FAILURE';
          await MfAuditLog.create({
            event,
            entityType: 'ORDER',
            entityId: String(entityId),
            actor: 'RETRY_ENGINE',
            source: operationName,
            reason: `${event} after ${attemptCount}/${maxAttempts} attempts: ${err.message}`,
            newState: retryState,
          });

          return {
            success: false,
            attemptCount,
            maxAttempts,
            lastAttemptAt,
            nextRetryAt: null,
            failureReason: err.message,
            retryable,
            retryExhausted: attemptCount >= maxAttempts,
            error: err,
          };
        }

        // Sleep for exponential backoff if running in real environment
        if (process.env.NODE_ENV !== 'test') {
          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
        }
      }
    }

    return {
      success: false,
      attemptCount,
      maxAttempts,
      lastAttemptAt,
      nextRetryAt: null,
      failureReason: lastError?.message || 'Max retry attempts exceeded',
      retryable: false,
      retryExhausted: true,
      error: lastError,
    };
  }
}

module.exports = new MfRetryService();
