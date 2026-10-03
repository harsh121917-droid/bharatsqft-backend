# VikaOne Mutual Fund — Phase 4 Production Runbook

## 1. Operating Windows & Cutoff Times

| Category | Cutoff Time (IST) | Applicable Business Days | Same-Day NAV Rule |
|---|---|---|---|
| **Liquid & Overnight Funds** | 13:30:00 (1:30 PM) | Monday to Friday (excl. holidays) | Previous Day / Day-before NAV |
| **Equity, Hybrid, & Debt Funds**| 15:00:00 (3:00 PM) | Monday to Friday (excl. holidays) | Same Day NAV (subject to funds realization) |
| **Orders Received Post-Cutoff**| After 15:00:00 | Queued for next business day | Next Business Day NAV |

---

## 2. Standard Operating Procedures (SOPs)

### SOP-01: Exchange API Downtime or Network Outage
1. **Symptoms**: Multiple orders remain in `PAYMENT_SUCCESS` without progressing to `SUBMITTED`. Log indicates `ETIMEDOUT` or `503 Service Unavailable` from NSE.
2. **Action**:
   - `mfRetryService` automatically attempts bounded exponential retries up to 5 times.
   - If retry ceiling is reached, order is flagged with `RETRY_EXHAUSTION` in `MfAuditLog`.
   - **Do NOT re-submit duplicate payment requests.**
   - Run manual status synchronization via Admin Portal once NSE connectivity is restored:
     ```bash
     node -e "require('./services/mfReconciliationEngine').runReconciliation('ADMIN_MANUAL')"
     ```

### SOP-02: Stale NAV Feed Detected
1. **Symptoms**: `MutualFundScheme.navDate` is older than 2 business days.
2. **Action**:
   - Verify AMFI source feed accessibility: `https://www.amfiindia.com/spages/NAVAll.txt`.
   - Run manual master NAV ingestion pipeline:
     ```bash
     node -e "require('./services/nse/nsePipelineService').runPipeline({ forceNavOnly: true })"
     ```
   - Check error logs in `NotificationLog` or terminal output.

### SOP-03: Webhook Signature Verification Failures Spike
1. **Symptoms**: Multiple `WEBHOOK_SIGNATURE_REJECTED` logs in `MfAuditLog`.
2. **Action**:
   - Verify if Razorpay / Gateway webhook secret was rotated in Admin → Payment Gateways.
   - Check timestamp drift: ensure system NTP daemon is synchronized (clock drift must be < 300 seconds).
   - If legitimate rotation occurred, update `RAZORPAY_MF_WEBHOOK_SECRET` in environment.

### SOP-04: Bank Mandate Rejection
1. **Symptoms**: `MfMandate.status` set to `REJECTED` or debit callback returns failure.
2. **Action**:
   - Verify rejection reason provided by bank (e.g. `ACCOUNT_CLOSED`, `SIGNATURE_MISMATCH`).
   - Customer notification is automatically dispatched via `mfNotificationService.notifyMandateRejected`.
   - Investor must register an alternate verified bank account before next installment date.

### SOP-05: Controlled Financial Reversal Procedure
1. **Prerequisite**: Formal compliance / finance authorization required.
2. **Execution**:
   ```javascript
   const mfAdminService = require('./services/mfAdminService');
   await mfAdminService.executeControlledReversal({
     orderId: 'ORD_ID_HERE',
     adminActor: 'ADMIN_EMAIL_OR_ID',
     reason: 'Detailed justification for reversal',
   });
   ```
3. **Verification**:
   - Confirm `REVERSAL` transaction exists in `MfTransaction`.
   - Confirm portfolio units and invested amount updated atomically.
   - Confirm `ADMIN_CONTROLLED_REVERSAL` audit log created.

---

## 3. Rollback & Migration Safety Plan

- **Database Backup**: Take full mongodump before applying any production deployment:
  ```bash
  mongodump --uri="$MONGO_URI" --out="/backup/pre_phase4_$(date +%Y%m%d%H%M)"
  ```
- **Append-Only Financial Integrity**: Financial transactions and audit logs are append-only. Never run `dropDatabase()` or `deleteMany({})` on live transaction collections.
- **Rollback Decision Matrix**: If an unexpected regression occurs in API routing, revert application code to Phase 3 baseline while preserving existing confirmed `MfOrder` and `MfTransaction` documents.
