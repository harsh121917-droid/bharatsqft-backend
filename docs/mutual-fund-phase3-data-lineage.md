# VikaOne Mutual Fund — Phase 3 Data Lineage Specification

## Purpose & Scope
This document specifies the authoritative, verified data lineage for all Phase 3 investment-management and transaction-lifecycle components in VikaOne. Every financial state, unit quantity, ledger entry, and tax/performance calculation is traced directly to its authentic origin.

**Guiding Rule:** *No financial value is ever fabricated, assumed, or defaulted. If data is unavailable from the authentic source, the system stores and returns `null`, empty, or an explicit pending state.*

---

## 1. Verified Data Lineage Table

| Financial Attribute | Authoritative Source Entity | Ingestion / Derivation Mechanism | Null / Missing Data State | Prohibited Synthetic Fallbacks |
| :--- | :--- | :--- | :--- | :--- |
| **Order Status** | NSE MFSS Exchange API (`trxn_status`, `trxn_remark`) / Gateway Callback | Webhook & Inbound Reconciliation Feed (`services/mfIdempotencyService.js`) | `PENDING` / `SUBMITTED` | Never map unknown external statuses silently to `SUCCESS`. |
| **Allotment Status** | RTA Allotment Feed / NSE Daily Allotment Statement Report | Idempotent Allotment Processor (`processAllotmentConfirmation`) | `PENDING` | `PAYMENT_SUCCESS` must never be equated with allotment. |
| **Allotted Units** | Authoritative RTA Confirmation / Allotment Statement Feed | Confirmed record update in `MfOrder.allottedUnits` & `MfTransaction.units` | `0` (Strictly 0 until allotted) | No client-supplied units or synthetic estimates in holdings. |
| **Transaction NAV** | Verified NAV as of Allotment Date (`allottedNav`) from RTA Feed | Recorded into `MfTransaction.nav` and `MfOrder.allottedNav` | `null` | No hardcoded NAV or synthetic average estimates. |
| **Redemption Settlement** | AMC / Bank Payout Confirmation via Exchange Settlement Feed | Idempotent Settlement Processor (`processRedemptionSettlement`) | `PENDING_AMC` / `SUBMITTED` | Redemption requested must never be treated as settled. |
| **SIP Status** | Exchange SIP Confirmation (`sipRegNo`) + Mandate Registration | Recorded in `MfSip.status` (`ACTIVE`, `PAUSED`, `CANCELLED`) | `PENDING_PAYMENT` | Local record creation must never be treated as active SIP. |
| **Mandate Status** | NPCI / Bank eNACH Authorization Webhook (`status`, `umrn`) | Inbound Mandate Webhook mapped to `MfMandate.status` | `PENDING_AUTH` | Mandate created must never be displayed as active. |
| **Portfolio NAV** | Daily Ingested AMFI / NSE Regular Scheme Master (`nav`, `navDate`) | Real-time scheme lookup (`MutualFundScheme.nav`) | `null` / `—` | Never copy Direct plan NAV or generate sinusoidal curves. |
| **Portfolio Holdings** | Materialized strictly from `MfOrder` with `allotmentStatus: 'ALLOTTED'` & `allottedUnits > 0` | Computed dynamically via `services/mfPortfolioEngine.js` | Empty list `[]` | Pending orders (`allottedUnits === 0`) never enter holdings. |
| **Benchmark History** | Authoritative AMFI / Index provider history (where available) | Dedicated index ingestion service | `null` ("Not enough benchmark data") | Never substitute unrelated indices or generate fake curves. |
| **Capital Gains Inputs** | FIFO lot matching against confirmed `MfTransaction` purchase ledger | Computed server-side by `services/mfCapitalGainsEngine.js` | `0.00` | Never calculate realized gains from current portfolio value. |
| **Tax Classification** | Indian Income Tax Act rules (Holding period: Equity `<365d` = STCG, `>=365d` = LTCG) | Computed automatically based on exact holding period in days | Under review / Raw dates exposed | Analytics clearly distinguished from formal tax advice. |
| **Investor XIRR** | Exact historical cash flow dates & amounts (`PURCHASE`, `REDEMPTION`, current valuation) | Pure Newton-Raphson annualized return engine with convergence guards | `null` ("Not enough portfolio history yet") | Fund CAGR is never substituted for investor XIRR. |

---

## 2. Core Lifecycle State Transitions

### 2.1. Investment Order Lifecycle
```text
Customer Purchase Intent (REGULAR scheme only)
    ↓
MfOrder Created (`orderStatus: 'CREATED'`, `paymentStatus: 'PENDING'`, `allottedUnits: 0`)
    ↓
Payment Gateway Success (`paymentStatus: 'SUCCESS'`, `orderStatus: 'PAYMENT_SUCCESS'`)
    [NOTE: Holdings remain 0; Total Invested remains 0]
    ↓
NSE MFSS Exchange Submission (`orderStatus: 'SUBMITTED'`)
    ↓
Exchange / RTA Allotment Processing (`orderStatus: 'PROCESSING'`)
    ↓
Authentic Allotment Confirmation (`orderStatus: 'ALLOTTED'`, `allottedUnits > 0`, `allottedNav > 0`)
    ↓
Ledger Entry (`MfTransaction: 'PURCHASE'`, `fifoRemainingUnits = allottedUnits`)
    ↓
Portfolio Materialization (`MfPortfolioHolding.totalUnits += allottedUnits`)
```

### 2.2. SIP Lifecycle
```text
SIP Registration Request (REGULAR scheme only)
    ↓
MfMandate Setup (`status: 'PENDING_AUTH'`)
    ↓
NPCI / Bank Authorization (`status: 'ACTIVE'`, `umrn` recorded)
    ↓
MfSip Activation (`status: 'ACTIVE'`, `mandateRef` linked)
    ↓
Scheduled Installment Due (`paymentStatus: 'PAYMENT_PENDING'`)
    ↓
Auto-Debit / eNACH Execution (`paymentStatus: 'PAID'`)
    ↓
Order Entry at Exchange (`MfOrder: transactionType: 'P'`, `allottedUnits: 0`)
    ↓
Authentic Allotment (`allotmentStatus: 'ALLOTTED'`, `allottedUnits > 0`)
    ↓
Ledger Transaction (`MfTransaction: 'SIP_INSTALLMENT'`)
    ↓
Portfolio Holdings Updated
```

### 2.3. Redemption Lifecycle
```text
Redemption Request (Validated: `redeemUnits <= confirmedAllottedUnits`)
    ↓
MfOrder Created (`transactionType: 'R'`, `orderStatus: 'SUBMITTED'`, `payoutStatus: 'PENDING_AMC'`)
    [NOTE: Confirmed holding units do NOT reduce yet; estimated payout != settled payout]
    ↓
NSE MFSS Exchange Processing
    ↓
AMC Settlement & Bank Payout (`orderStatus: 'ALLOTTED'`, `payoutStatus: 'PROCESSED'`, `finalSettledAmount` recorded)
    ↓
Ledger Transaction (`MfTransaction: 'REDEMPTION'`, negative units)
    ↓
FIFO Capital Gains Processing (`MfCapitalGain` created for each consumed purchase lot)
    ↓
Portfolio Materialization (`MfPortfolioHolding.totalUnits -= redeemedUnits`)
```

### 2.4. Switch Lifecycle
```text
Switch Request (Source Scheme: REGULAR; Target Scheme: REGULAR; Same AMC)
    ↓
Validation (Both schemes active, non-locked, REGULAR plan; Direct & Unknown strictly rejected)
    ↓
MfOrder Created (`transactionType: 'S'`, `orderStatus: 'SUBMITTED'`)
    ↓
Exchange Switch Submission
    ↓
Source Scheme Redemption Settled
    ↓
Target Scheme Units Allotted Authentically
    ↓
Ledger Transactions (`SWITCH_OUT` on source, `SWITCH_IN` on target)
    ↓
Portfolio Updated
```

---

## 3. Idempotency & Duplicate Protection Architecture

All external callbacks and reconciliation jobs are protected against duplicate processing by:
1. **Database Index Constraints**:
   - `MfTransaction`: Unique compound index on `{ order: 1, transactionType: 1 }`.
   - `MfPortfolioHolding`: Unique compound index on `{ user: 1, schemeCode: 1 }`.
   - `MfAuditLog`: Sparse index on `idempotencyKey`.
2. **Pre-Execution Guards in Services**:
   - `processAllotmentConfirmation`: Checks if order is already `ALLOTTED` or if `idempotencyKey` exists in `MfAuditLog`. If so, skips execution and returns `isDuplicate: true`.
   - `processRedemptionSettlement`: Checks if `payoutStatus === 'PROCESSED'` or `orderStatus === 'ALLOTTED'`. If so, returns `isDuplicate: true` and skips lot consumption.
3. **Audit Trail Logging**:
   - All state transitions record `event`, `entityType`, `entityId`, `user`, `previousState`, `newState`, `source`, `actor`, and `idempotencyKey`.

---

## 4. Regular-Plan Enforcement & Data Segregation

1. **Catalog & Search Level**: Query filter `{ planType: 'REGULAR', isActive: true }` strictly isolates Regular plans. Direct plans (`planType: 'DIRECT'`) and Unknown plans are excluded at database level.
2. **Order & SIP Creation Level**: Controller explicitly checks `scheme.planType === 'REGULAR'`. Any non-Regular scheme request returns HTTP 404 / 400.
3. **Switch Level**: Both source and target schemes are independently validated as `planType === 'REGULAR'`. Direct source or target schemes are unconditionally rejected.
4. **Data Mixing Prohibition**: NAV, returns, CAGR, AUM, or expense ratios from Direct plans are never used to fill or fallback into Regular scheme records.
