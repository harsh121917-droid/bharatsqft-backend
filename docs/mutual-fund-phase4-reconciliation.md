# VikaOne Mutual Fund — Phase 4 Reconciliation Specification

## 1. Multi-Point Reconciliation Architecture

Phase 4 establishes an automated multi-point reconciliation engine (`services/mfReconciliationEngine.js`) executing across 6 financial touchpoints:

```text
[1. Payment Gateway]  <-- (Amount, Status) -->  [2. VikaOne Local Orders]
                                                        ↕
                                                [3. NSE MFSS Exchange]
                                                        ↕
[4. Materialized Holdings] <-- (Units, Cost) --> [5. RTA Allotment & Ledger]
                                                        ↕
                                                [6. Bank Settlement & Payout]
```

---

## 2. Discrepancy Detection & Classification

The engine audits all 6 dimensions and classifies discrepancies into standard statuses:

| Dimension | Checked Condition | Status Assigned | Action Required |
|---|---|---|---|
| **Payment ↔ Order** | Gateway payment confirmed but Order status is `PENDING` | `MISMATCH` | Queue order for exchange dispatch |
| **Order ↔ Payment** | Order marked `PAYMENT_SUCCESS` but Gateway reports failed | `MISMATCH` | Freeze order, investigate chargeback |
| **Order ↔ Exchange** | Order marked `SUBMITTED` locally but exchange reports `REJECTED` | `MISMATCH` | Initiate customer refund |
| **Exchange ↔ Order** | Exchange confirms `ALLOTTED` but local order is not allotted | `PENDING_REVIEW` | Trigger authoritative allotment ingestion |
| **Order ↔ Transaction** | Order marked `ALLOTTED` but `MfTransaction` is missing | `MISSING_LOCAL` | Re-materialize ledger entry |
| **Transaction ↔ Holding**| Net ledger units differ from `MfPortfolioHolding.totalUnits` | `MISMATCH` | Atomically recalculate user portfolio |
| **Redemption ↔ Bank** | Redemption marked `ALLOTTED` but payout amount is missing | `MISMATCH` | Query RTA settlement feed |

---

## 3. Discrepancy Resolution Protocol

### Non-Negotiable Rule:
> **No silent repairs of financial data.**
> Every discrepancy resolution requires an authenticated administrative actor, a documented business reason, and creates an immutable audit trail in `MfAuditLog`.

### Resolution API Workflow:
```javascript
await mfReconciliationEngine.resolveDiscrepancy({
  runId: 'REC_1791021227500',
  refId: 'ORD_P4_ORPHAN_REC',
  resolvedBy: 'CHIEF_COMPLIANCE_OFFICER',
  reason: 'Manually verified against RTA physical statement',
  action: 'MANUAL_VERIFIED',
});
```

Resulting Audit Entry:
- `event`: `RECONCILIATION_DISCREPANCY_RESOLVED`
- `entityType`: `RECONCILIATION`
- `entityId`: `ORD_P4_ORPHAN_REC`
- `actor`: `CHIEF_COMPLIANCE_OFFICER`
- `previousState`: `{ resolved: false, discrepancyStatus: 'MISMATCH' }`
- `newState`: `{ resolved: true, discrepancyStatus: 'RESOLVED', action: 'MANUAL_VERIFIED' }`
