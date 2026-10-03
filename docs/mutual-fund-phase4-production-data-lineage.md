# VikaOne Mutual Fund — Phase 4 Production Data Lineage

## 1. Principles of Financial Data Lineage

Every financial figure displayed in the customer application or stored in the database has an unbroken, auditable lineage back to an authoritative external event:

```text
AUTHORITATIVE EXTERNAL SOURCE
         ↓
SECURE INGESTION / WEBHOOK GATEWAY
         ↓
IDEMPOTENCY & AUDIT LEDGER
         ↓
DATABASE TRANSACTION RECORD
         ↓
PORTFOLIO VALUATION ENGINE
         ↓
CUSTOMER API & FLUTTER UI
```

---

## 2. Lineage Matrix by Financial Attribute

| Attribute | Database Field | Computing Engine | Source Event | External Authoritative Source |
|---|---|---|---|---|
| **Scheme Identity** | `MutualFundScheme.schemeCode` | `nsePipelineService` | `MASTER_DOWNLOAD` | NSE MFSS SCH Master (43 cols) |
| **Plan Type** | `MutualFundScheme.planType` | `nseParser.parsePlanType` | Regex parsing of Plan | NSE MFSS SCH Column 43 (`REGULAR` only) |
| **Latest NAV** | `MutualFundScheme.nav` | `nsePipelineService` | Daily AMFI Download | AMFI `NAVAll.txt` & NSE NAV Report |
| **NAV Date** | `MutualFundScheme.navDate` | `nsePipelineService` | Feed Date Stamp | AMFI Feed Date Header |
| **Historical NAV** | Cache `navCache` | `mfLiveService` | On-demand REST sync | `api.mfapi.in/mf/{regularCode}` |
| **Order Status** | `MfOrder.orderStatus` | `mfStateMachine` | Payment & Allotment | Razorpay Webhook / NSE Allotment Feed |
| **Allotted Units** | `MfOrder.allottedUnits` | `mfIdempotencyService` | Allotment Feed | RTA Allotment Statement / NSE Allotment |
| **Transaction Record** | `MfTransaction.units` | `mfIdempotencyService` | Allotment Confirmation | Immutable ledger entry |
| **Portfolio Units** | `MfPortfolioHolding.totalUnits`| `mfPortfolioEngine` | Recalculate Portfolio | Sum of confirmed `MfTransaction.units` |
| **Invested Amount** | `MfPortfolioHolding.investedAmount`| `mfPortfolioEngine`| Recalculate Portfolio | FIFO purchase lots cost basis |
| **Current Valuation**| `MfPortfolioHolding.currentValue`| `mfPortfolioEngine`| Confirmed Units × NAV | `totalUnits` × Authoritative AMFI NAV |
| **Unrealized Gain** | `MfPortfolioHolding.unrealizedProfitLoss`| `mfPortfolioEngine` | `currentValue - invested` | Computed mathematically |
| **Realized Gain** | `MfCapitalGain.realizedGain`| `mfCapitalGainsEngine`| Redemption Settlement | FIFO lot match against purchase lots |
| **Investor XIRR** | Computed via Newton-Raphson | `mfPortfolioEngine.calculateXirr` | Dated cash flows | Real dated outflows & inflows |
| **Redemption Payout**| `MfOrder.finalSettledAmount`| `mfIdempotencyService` | Bank Credit Advice | AMC direct credit / RTA settlement |

---

## 3. Strict Rules of Non-Fabrication

1. **Zero Synthetic Units**: If an order is in `SUBMITTED` or `PROCESSING` status, `allottedUnits` is strictly `0`. No holding document is materialized.
2. **Zero Default Returns**: If historical NAV points are missing or insufficient to calculate 1Y, 3Y, or 5Y returns, the API returns `null` and `insufficientData: true`.
3. **Zero Direct Plan Fallback**: Direct plan schemes and historical NAV data are never used as a proxy or fallback for Regular plans.
4. **Authoritative Lineage Only**: If an external source is not integrated or unavailable, the status is marked explicitly as `PENDING`, `UNKNOWN`, or `FAILED`.
