# VikaOne Mutual Fund — Phase 5 Production Operations Runbook

This runbook defines authoritative incident response and operational procedures for the VikaOne Mutual Fund module in production.

All procedures reference actual deployed services, commands, and administrative tools.

---

## 1. Quick Emergency Controls

### 1.1. Emergency Transaction Pause (Circuit Breaker)
Activate when an unexpected exchange anomaly, gateway outage, or severe financial mismatch is detected:
```javascript
const { MfGoLiveService } = require('./services/mfGoLiveService');

await MfGoLiveService.pauseTransactions(
  'Critical exchange latency / reconciliation discrepancy detected',
  'admin_operations_lead'
);
```
**Effect**: Immediately blocks all new purchase, SIP, redemption, and switch orders across all customer stages. Existing data is completely preserved.

### 1.2. Resuming Transactions
Execute only after root cause investigation, data reconciliation, and sign-off:
```javascript
const { MfGoLiveService } = require('./services/mfGoLiveService');

await MfGoLiveService.resumeTransactions(
  'admin_operations_lead',
  'Exchange connectivity and ledger balance verified'
);
```

---

## 2. Standard Operational Procedures

### 2.1. NSE Outage or Network Failure
* **Symptoms**: Requests to `www.nseinvest.com` return `ETIMEDOUT`, `ECONNREFUSED`, or HTTP 502/503/504.
* **Impact**: Orders cannot be dispatched immediately.
* **Automated Behavior**:
  - `nseOrderLifecycleService` marks order as `TIMEOUT` or `SUBMISSION_FAILED`.
  - Payment remains securely recorded as `SUCCESS`.
  - Portfolio units remain strictly `0`.
  - `mfRetryService` backs off with bounded retries up to 3 attempts.
* **Operator Action**:
  1. Run live connectivity diagnostic:
     ```bash
     node -e "require('./services/nse/nseLiveConnectivityService').runConnectivityDiagnostic().then(console.log)"
     ```
  2. If NSE is confirmed down, notify operations and monitor NSE status bulletins.
  3. Do NOT manually mark orders as `ALLOTTED`. Once exchange recovers, execute bulk order reconciliation.

### 2.2. NSE Order Rejection
* **Symptoms**: NSE gateway responds with `status: 'REJECTED'` or error remarks (e.g. invalid client code, cutoff missed, scheme closed).
* **Impact**: Order cannot be processed by the exchange.
* **Automated Behavior**:
  - Order transitions to `REJECTED` in `MfStateMachine`.
  - Allotted units remain strictly `0`.
  - `notifyOrderRejected` dispatches customer alert explaining rejection reason and refund processing.
* **Operator Action**:
  - Verify rejection code in `MfAuditLog`.
  - If rejected due to client KYC or bank details, prompt user to update profile.
  - If payment was deducted, initiate refund via Razorpay dashboard or automated refund handler.

### 2.3. NSE Request Timeout
* **Symptoms**: Order dispatched to NSE, but response times out before acknowledgement.
* **Impact**: Uncertain whether order was accepted by exchange.
* **Automated Behavior**:
  - Order state stays `TIMEOUT`.
  - Does NOT resubmit automatically to prevent duplicate execution on the exchange floor.
* **Operator Action**:
  1. Sync order status directly via NSE report API:
     ```javascript
     const nseOrderLifecycleService = require('./services/nse/nseOrderLifecycleService');
     const status = await nseOrderLifecycleService.syncOrderStatus('ORD_ID_HERE');
     ```
  2. If exchange reports `ACCEPTED`, transition order to `SUBMITTED`.
  3. If exchange reports not found, safely retry submission with original client reference.

### 2.4. Webhook Failure or Tampered Payload
* **Symptoms**: Inbound webhook from Razorpay fails HMAC-SHA256 signature verification or timestamp is expired (> 300s).
* **Automated Behavior**:
  - `MfWebhookSecurity` immediately throws `WebhookSecurityError`.
  - An audit log of type `WEBHOOK_SIGNATURE_REJECTED` is recorded with raw headers.
  - HTTP 400 is returned to the provider.
* **Operator Action**:
  - Verify webhook shared secret configuration in environment (`RAZORPAY_WEBHOOK_SECRET`).
  - Check system clock / NTP synchronization if timestamps are drifting.

### 2.5. Duplicate Webhook or Allotment Callbacks
* **Symptoms**: Same payment event or allotment feed received multiple times.
* **Automated Behavior**:
  - `MfWebhookSecurity.checkIdempotency` detects consumed `idempotencyKey`.
  - `processAllotmentConfirmation` detects existing transaction and returns `isDuplicate: true`.
  - Exactly ONE transaction is recorded, and portfolio units are NOT duplicated.
* **Operator Action**: None required (verified idempotent).

### 2.6. Payment Succeeded but NSE Order Missing (Payment Mismatch)
* **Symptoms**: Multi-point reconciliation flags `MISSING_EXTERNAL` (Payment `SUCCESS` but no corresponding exchange order).
* **Operator Action**:
  1. Inspect the discrepancy report:
     ```javascript
     const mfReconciliationEngine = require('./services/mfReconciliationEngine');
     const status = await mfReconciliationEngine.getLatestStatus();
     ```
  2. If the order was never submitted due to a network glitch, trigger controlled retry via `nseOrderLifecycleService.submitOrderToExchange(orderId)`.
  3. If customer aborted, trigger refund and transition order to `CANCELLED`.

### 2.7. Allotment Mismatch / Missing Transaction
* **Symptoms**: Order marked `ALLOTTED` but `MfTransaction` is missing, or allotted units do not equal transaction units.
* **Operator Action**:
  1. Run reconciliation to detect specific refId:
     ```javascript
     const res = await mfReconciliationEngine.runReconciliation('ADMIN_MANUAL');
     ```
  2. Resolve discrepancy with auditable note:
     ```javascript
     await mfReconciliationEngine.resolveDiscrepancy({
       runId: res.data.runId,
       refId: 'ORD_ID_HERE',
       resolvedBy: 'ops_lead_username',
       reason: 'Verified physical statement from CAMS/KFintech',
       action: 'MANUAL_VERIFIED'
     });
     ```
  3. Trigger `recalculateUserPortfolio(userId)` to synchronize holding units.

### 2.8. SIP Mandate Rejection & Debit Failure
* **Symptoms**: Bank rejects e-Mandate or auto-debit due to insufficient funds / account frozen.
* **Automated Behavior**:
  - Mandate is marked `REJECTED`.
  - SIP transitions to `PAUSED`.
  - Notification sent to customer via `notifyDebitFailed`.
  - Zero units or fake orders generated.
* **Operator Action**:
  - Prompt customer via push notification to authorize new mandate or change bank account.

### 2.9. Redemption Delay or Payout Failure
* **Symptoms**: Redemption units redeemed from holding, but bank payout not credited after T+2/T+3 days.
* **Automated Behavior**:
  - Order remains in `ALLOTTED` with `payoutStatus: 'PENDING_AMC'`.
  - Does NOT falsely claim payout completed.
* **Operator Action**:
  1. Query AMC/RTA settlement file for UTR number.
  2. Once UTR is verified, record payout reference in order remarks:
     ```javascript
     order.remarks += ' | PAYOUT_COMPLETED (UTR: ' + utrNumber + ')';
     order.payoutStatus = 'PROCESSED';
     await order.save();
     await mfNotificationService.notifyPayoutCompleted(order);
     ```

---

## 3. Database Maintenance & Verification

### Daily Health Audit Command
Run the database integrity audit daily at 02:00 IST:
```bash
node scripts/db_audit.js
```
All 16 metrics must report `0`. If any metric > 0, pause transactions immediately and investigate.

### Anti-Mock Verification
Verify zero synthetic data in production services:
```bash
node scripts/anti_mock_audit.js
```
Expected result: `productionRisksCount: 0`.

---

## 4. Rollback & Disaster Recovery Procedure

### 4.1. Pre-deployment Database Snapshot
Before executing any major release or schema migration:
```bash
mongodump --uri="$MONGO_URI" --out="/backup/pre_phase5_$(date +%Y%m%d%H%M)"
```

### 4.2. Safe Code Rollback
If a critical flaw is detected post-deployment:
1. Trigger Emergency Pause:
   ```javascript
   await MfGoLiveService.pauseTransactions('Rollback to previous release', 'admin');
   ```
2. Revert code to the previous verified commit tag (`git checkout <tag>`).
3. Verify test suite passes (`node --test test/phase4_production_readiness.test.js`).
4. Re-run `node scripts/db_audit.js`.
5. Resume transactions via `MfGoLiveService.resumeTransactions(...)`.
