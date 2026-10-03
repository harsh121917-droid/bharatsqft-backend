# VikaOne Mutual Fund — Phase 5 Live Production Data Lineage

This document establishes the authoritative, end-to-end data lineage across the entire VikaOne Mutual Fund financial architecture for Phase 5 (Production Activation, Live NSE Verification & Controlled Go-Live).

Every financial attribute is strictly mapped across:
```text
External Source → External Event → Integration Service → Database Model → Business Engine → API → Flutter UI
```

---

## 1. Core Architectural Invariants

1. **Regular Plans Only**: Only REGULAR mutual fund schemes (`planType === 'REGULAR'`) are supported. Direct plans are permanently filtered and rejected across all endpoints.
2. **Zero-Fabrication Principle**: All NAVs, units, and values are derived solely from verified external authoritative feeds (AMFI, NSE MFSS, RTA). No synthetic financial values, mock data, or random generation are permitted.
3. **Payment Success ≠ Allotment**: Successful payment gateway authorization leaves `allottedUnits = 0` and portfolio holdings at 0. Units materialize only upon receipt of verified RTA/NSE allotment statements.
4. **Authoritative Valuation Formula**:
   $$\text{Current Value} = \sum (\text{Confirmed Allotted Units} \times \text{Authoritative NAV})$$

---

## 2. End-to-End Lineage Specifications

### 2.1. Payment Lifecycle
* **External Source**: Razorpay Payment Gateway (Live Production)
* **External Event**: `payment.captured` Webhook (with HMAC-SHA256 signature and timestamp drift protection)
* **Integration Service**: [`services/mfWebhookSecurity.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfWebhookSecurity.js)
* **Database Model**: [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (`paymentStatus: 'SUCCESS'`, `orderStatus: 'PAYMENT_SUCCESS'`), [`models/MfAuditLog.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfAuditLog.js)
* **Business Engine**: [`services/mfStateMachine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfStateMachine.js)
* **API**: `POST /api/mutual-funds/orders/verify-payment`
* **Flutter UI**: Shows order status as `"Payment received. Your mutual fund order is being processed."` (allottedUnits remains 0; no portfolio creation).

### 2.2. Exchange Order Submission
* **External Source**: VikaOne Order Engine dispatched to NSE MFSS (NNF Protocol)
* **External Event**: Secure HTTP POST via TLS v1.3 (`AES_256_GCM_SHA384`) with PBKDF2/AES encrypted payload
* **Integration Service**: [`services/nse/nseOrderLifecycleService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/nse/nseOrderLifecycleService.js) & [`services/nse/nseClient.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/nse/nseClient.js)
* **Database Model**: [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (`orderStatus: 'SUBMITTED'`, `nseTrxnOrderId: string`)
* **Business Engine**: [`services/mfStateMachine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfStateMachine.js)
* **API**: `GET /api/mutual-funds/orders/:orderId`
* **Flutter UI**: Displays order state as `"Submitted to Exchange - Awaiting Allotment"`.

### 2.3. Exchange Status
* **External Source**: NSE MFSS Daily Order Status Report / Real-time API
* **External Event**: Synchronous order status polling or batch callback feed
* **Integration Service**: [`services/nse/nseOrderLifecycleService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/nse/nseOrderLifecycleService.js) (`syncOrderStatus`)
* **Database Model**: [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (`nseStatus: 'ACCEPTED' | 'REJECTED' | 'PROCESSING'`)
* **Business Engine**: [`services/mfStateMachine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfStateMachine.js)
* **API**: `GET /api/mutual-funds/orders/:orderId`
* **Flutter UI**: Order details card showing authoritative NSE status and remarks.

### 2.4. Allotment
* **External Source**: Registrar and Transfer Agents (CAMS / KFintech / NSE MFSS Allotment Feed)
* **External Event**: Authoritative Allotment Statement Feed (`allottedUnits`, `allottedNav`, `allotmentDate`, `rtaReferenceNo`)
* **Integration Service**: [`services/mfIdempotencyService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfIdempotencyService.js) (`processAllotmentConfirmation`)
* **Database Model**:
  - [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (`orderStatus: 'ALLOTTED'`, `allottedUnits`, `allottedNav`, `allotmentDate`)
  - [`models/MfTransaction.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfTransaction.js) (`transactionType: 'PURCHASE'`, `units: +allottedUnits`, `nav: allottedNav`)
  - [`models/MfPortfolioHolding.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfPortfolioHolding.js) (`units += allottedUnits`, `investedAmount += orderAmount`)
* **Business Engine**: [`services/mfPortfolioEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfPortfolioEngine.js) (`recalculateUserPortfolio`)
* **API**: `GET /api/mutual-funds/portfolio`
* **Flutter UI**: Portfolio materialized with confirmed units; displays `"Your mutual fund units have been allotted."`

### 2.5. Net Asset Value (NAV)
* **External Source**: AMFI Official Daily NAV Portal & AMC Feeds
* **External Event**: Daily EOD NAV Synchronization (11:00 PM IST)
* **Integration Service**: [`services/amfiService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/amfiService.js) & [`services/amfiDailyNavCron.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/amfiDailyNavCron.js)
* **Database Model**: [`models/MutualFundScheme.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MutualFundScheme.js) (`nav`, `navDate`)
* **Business Engine**: [`services/mfPortfolioEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfPortfolioEngine.js)
* **API**: `GET /api/mutual-funds/schemes/:schemeCode`
* **Flutter UI**: Live NAV badge with official date disclosure tag.

### 2.6. Units & Portfolio Valuation
* **External Source**: Verified ledger of confirmed allotments and redemptions
* **External Event**: Materialization via atomic recalculation
* **Integration Service**: [`services/mfPortfolioEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfPortfolioEngine.js)
* **Database Model**: [`models/MfPortfolioHolding.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfPortfolioHolding.js) (`units`, `investedAmount`, `currentValue`, `unrealizedGain`, `returnsPercentage`)
* **Business Engine**: Double-entry ledger reconciliation against [`models/MfTransaction.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfTransaction.js)
* **API**: `GET /api/mutual-funds/portfolio`
* **Flutter UI**: [`lib/modules/mutual_funds/views/mf_portfolio_view.dart`](file:///C:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_portfolio_view.dart) (scheme breakdown, overall invested, current valuation, unrealized gain/loss).

### 2.7. Redemption Settlement & Bank Payout
* **External Source**: NSE MFSS / AMC / RTA Redemption Settlement Statement
* **External Event**: Redemption Settlement confirmation with UTR reference
* **Integration Service**: [`services/mfIdempotencyService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfIdempotencyService.js) (`processRedemptionSettlement`)
* **Database Model**:
  - [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (`transactionType: 'R'`, `orderStatus: 'ALLOTTED'`, `payoutStatus: 'PROCESSED'`)
  - [`models/MfTransaction.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfTransaction.js) (`transactionType: 'REDEMPTION'`, `units: -redeemedUnits`)
  - [`models/MfPortfolioHolding.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfPortfolioHolding.js) (`units -= redeemedUnits`)
  - [`models/MfCapitalGain.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfCapitalGain.js) (FIFO consumption of lots)
* **Business Engine**: [`services/mfCapitalGainsEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfCapitalGainsEngine.js)
* **API**: `GET /api/mutual-funds/orders/:orderId`
* **Flutter UI**: Displays `"Your redemption payout has been completed."` with credited bank details.

### 2.8. SIP Mandate & Auto-Debit Lifecycle
* **External Source**: NPCI / Razorpay Mandate / Bank eNACH
* **External Event**: Mandate authorization, UMRN assignment, and scheduled debit notifications
* **Integration Service**: [`services/mfWebhookSecurity.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfWebhookSecurity.js) & [`services/mfIdempotencyService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfIdempotencyService.js)
* **Database Model**:
  - [`models/MfMandate.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfMandate.js) (`status: 'PENDING' | 'ACTIVE' | 'REJECTED'`, `umrn`)
  - [`models/MfSip.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfSip.js) (`status: 'PENDING_PAYMENT' | 'ACTIVE' | 'PAUSED'`, `installmentsPaid`)
  - [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) (created per debit event)
* **Business Engine**: [`services/mfStateMachine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfStateMachine.js)
* **API**: `GET /api/mutual-funds/sip`
* **Flutter UI**: SIP dashboard showing active mandates, next due date, and payment history.

### 2.9. Regular-to-Regular Switching
* **External Source**: Client-initiated switch order across regular schemes
* **External Event**: Switch-Out submitted to source scheme -> Settled -> Switch-In created for destination regular scheme
* **Integration Service**: [`services/nse/nseOrderLifecycleService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/nse/nseOrderLifecycleService.js)
* **Database Model**: Two linked [`models/MfOrder.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfOrder.js) records linked via lineage remarks
* **Business Engine**: Prohibits Direct plan switches; enforces source lot verification before switch-in creation
* **API**: `POST /api/mutual-funds/switch`
* **Flutter UI**: Switch tracking screen showing linked source/destination transactions.

### 2.10. Capital Gains & Tax Engine
* **External Source**: FIFO transaction history matched against authoritative NAV
* **External Event**: Redemption settlement event
* **Integration Service**: [`services/mfCapitalGainsEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfCapitalGainsEngine.js)
* **Database Model**: [`models/MfCapitalGain.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/models/MfCapitalGain.js) (`holdingDays`, `purchaseNav`, `redemptionNav`, `realizedGain`, `isLTCG`, `taxRatePercent`)
* **Business Engine**: Automatic equity (>=65%) vs debt specified tax categorization with mandatory legal review disclaimer
* **API**: `GET /api/mutual-funds/tax/capital-gains`
* **Flutter UI**: Tax summary breakdown stamped with legal status `"TAX_CALCULATION_DATA_ONLY_NOT_TAX_ADVICE"`.
