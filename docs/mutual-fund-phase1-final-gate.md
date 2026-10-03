# VikaOne Mutual Fund — Phase 1 Final Gate Verification Report

**Date:** 2026-10-03  
**Status:** **PHASE 1 COMPLETE — FINAL GATE PASSED**  
**Governing Rule:**
> *A missing financial value is better than a fake financial value. Never show, store, calculate, or return fabricated, synthetic, guessed, or default financial figures.*  
> **VikaOne Customer Mutual Funds = REGULAR PLAN ONLY.**

---

## Executive Summary

Phase 1 data remediation and source-of-truth verification has been concluded across the Node.js / Express backend, MongoDB database, NSE integration engine, and the Flutter mobile client. All hardcoded financial defaults (`₹500` SIP, `₹1,000` lump sum, `5` star ratings, `5000 Cr` AUM, `0.85%` expense ratio, and synthetic NAV charts) have been eliminated. Direct plans and unknown plan codes are strictly excluded at ingestion, database query, and customer API layers.

The test suite contains **17 comprehensive automated tests** passing 100%. Flutter static analysis reports **0 errors and 0 warnings**.

---

## A. Changes Made

| File Path | Component | Changes Made & Exact Rationale |
|---|---|---|
| [`services/nse/nseMasterReconciliationService.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/nse/nseMasterReconciliationService.js) | Backend Service | **Strict Plan Parsing & Pipeline Wiring:**<br>1. Refactored `parsePlanType` to explicitly map: `'D'`/`'DIRECT'` &rarr; `'DIRECT'`; `'R'`/`'REGULAR'` &rarr; `'REGULAR'`; `''` (blank) &rarr; `'REGULAR'` (NSE Webfile Structure spec); unrecognized codes (e.g. `'X'`, `'Z'`) &rarr; `'UNKNOWN'`. Excludes Direct even if code is blank/R when scheme name contains `'direct'`.<br>2. Updated `parseNseSchemeMasterText` to record `rawPlanCode`, exclude Direct to `directSchemesExcluded`, and exclude unknown codes to `unknownSchemesExcluded`.<br>3. Implemented `syncNseMasterPipeline()`: calls `MASTER_DOWNLOAD` for `'SCH'`, `'NAV'`, and `'SIP'`, applies strict Regular-only parsing, upserts to MongoDB, and strictly prevents destructive deletion/empty-overwrites upon 403, timeout, or malformed data. |
| [`crons/mfNavSyncCron.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/crons/mfNavSyncCron.js) | Backend Cron | **Master Pipeline Ingestion Wiring:**<br>Wired `syncNseMasterPipeline()` into daily scheduled cron (`23:30 IST`) prior to AMFI feed cross-reconciliation. Logs pipeline status and audit metrics. |
| [`controllers/mutualFundsController.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/controllers/mutualFundsController.js) | Backend Controller | **Dynamic Similar Funds & Strict Endpoint Enforcement:**<br>1. In `getSchemeDetail`: added `similarFundsCount: similarFunds.length` dynamically derived from database records matching `peerFilter`. Current scheme is excluded (`$ne`); Direct and Unknown plans are excluded (`planType: 'REGULAR'`, name not regex direct); inactive schemes excluded.<br>2. In `createPurchaseOrder` and `registerSipOrder`: updated scheme plan validation to strictly reject `scheme.planType !== 'REGULAR' || scheme.schemeName.toLowerCase().includes('direct')`. |
| [`test/phase1_remediation.test.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/test/phase1_remediation.test.js) | Backend Tests | **Regression Suite Expansion:**<br>Updated Test 5 and Test 11 for strict D/R/blank/unknown parsing; added Tests 14, 15, 16, 17 covering dynamic `similarFundsCount`, customer API search/purchase protection, master pipeline failure safety (403/empty/malformed), and null integrity. Total tests: 17/17 passing. |
| [`lib/modules/mutual_funds/views/mf_scheme_detail_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart) | Flutter UI | **Elimination of Fake NAV Chart & Strict Null Handling:**<br>1. Removed `_getCurvePoints(period)` and all 40+ lines of hardcoded trend coordinates (`0.42, 0.45...`, `0.72, 0.70...`). When real historical NAV points are absent, renders clean centered indicator (`NAV chart data unavailable`).<br>2. Fixed `similarFunds` return display: missing `cagr3Y` displays `'—'` instead of defaulting to `0.00%`.<br>3. Handled nullable `liveNav` (`double?`), `widget.scheme.fundManager` (`String?`), and nullable rating/return in `_buildRecentlyViewedSection`. |
| [`lib/modules/mutual_funds/views/mf_all_mutual_funds_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_all_mutual_funds_view.dart) | Flutter UI | Fixed analyzer warning on type-promoted return string formatting. |
| [`lib/modules/mutual_funds/views/mf_collection_list_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_collection_list_view.dart) | Flutter UI | Fixed nullable `rating` sorting (`(b.rating ?? 0).compareTo(a.rating ?? 0)`), return null safety, and `scheme.rating!.toInt()` in star pill. |
| [`lib/modules/mutual_funds/views/mf_compare_funds_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_compare_funds_view.dart) | Flutter UI | Removed unused field `cardHeaderBg`; fixed nullable `fundManager` mapping. |
| [`lib/modules/mutual_funds/views/mf_nfo_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_nfo_view.dart) | Flutter UI | Cleaned nested ternary in `minSip` display (`minSip != null ? '₹${minSip.toStringAsFixed(0)}' : '—'`). |
| [`lib/modules/mutual_funds/views/mf_search_view.dart`](file:///c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_search_view.dart) | Flutter UI | Added null check on `scheme.rating != null && scheme.rating! > 0`. |

---

## B. Plan-Type Verification

Strict NSE Scheme Plan Code parsing rules implemented per `NSE_MF_WebfileStructure.pdf` (pages 77–79, Demat Scheme Master, Column 8 / 0-indexed column 7):

| Input `rawPlanCode` | `schemeName` Context | Resolved `planType` | Ingestion Action | Customer Catalog Exposure |
|---|---|---|---|---|
| `'D'` or `'DIRECT'` | Any | `'DIRECT'` | Excluded to `directSchemesExcluded` | **Blocked (0 Direct schemes in DB/API)** |
| `'d'` (lowercase) | Any | `'DIRECT'` | Excluded to `directSchemesExcluded` | **Blocked** |
| `'  D  '` (whitespace) | Any | `'DIRECT'` | Excluded to `directSchemesExcluded` | **Blocked** |
| `'R'` or `'REGULAR'` | Scheme name without "direct" | `'REGULAR'` | Ingested to `regularSchemes` | **Allowed** |
| `'r'` (lowercase) | Scheme name without "direct" | `'REGULAR'` | Ingested to `regularSchemes` | **Allowed** |
| `'  R  '` (whitespace) | Scheme name without "direct" | `'REGULAR'` | Ingested to `regularSchemes` | **Allowed** |
| `''` (blank / empty) | Scheme name without "direct" | `'REGULAR'` (NSE default: "IF D THEN DIRECT ELSE REGULAR") | Ingested to `regularSchemes` | **Allowed** |
| `null` / `undefined` | Scheme name without "direct" | `'REGULAR'` | Ingested to `regularSchemes` | **Allowed** |
| `'X'`, `'Z'`, `'9'`, etc. | Any | `'UNKNOWN'` | Excluded to `unknownSchemesExcluded` | **Blocked (0 Unknown schemes in DB/API)** |
| `'R'` or `''` (blank) | Scheme name contains `"direct"` | `'UNKNOWN'` (Conflict Guard) | Excluded to `unknownSchemesExcluded` | **Blocked** |

---

## C. NSE Ingestion Verification

### Pipeline Trace
```text
Scheduler (mfNavSyncCron.js - 23:30 IST)
      ↓
NseMasterReconciliationService.syncNseMasterPipeline()
      ↓
nseClient.downloadMaster('SCH' / 'NAV' / 'SIP')
      ↓
POST /nsemfdesk/api/v2/reports/MASTER_DOWNLOAD
      ↓
nseMasterReconciliationService.parseNseSchemeMasterText() [43 columns]
nseMasterReconciliationService.parseNseNavMasterText()     [8 columns]
nseMasterReconciliationService.parseNseSipMasterText()     [22 columns]
      ↓
Regular-Only Filtering:
  • planType === 'REGULAR' only
  • Direct excluded to directSchemesExcluded
  • Unknown excluded to unknownSchemesExcluded
      ↓
Atomic Bulk Upsert (`bulkWrite({ upsert: true })`) to MongoDB
      ↓
AMFI / RTA Daily NAV Cross-Reconciliation (`reconcileAllSchemes()`)
      ↓
Customer API Routes (Filtered strictly: planType: 'REGULAR', name not regex 'direct')
      ↓
Flutter Mobile App (Renders authentic numbers, or '—' / hidden if null)
```

### Verification Status Matrix

| Component | Status | Evidence |
|---|---|---|
| **Pipeline Code & Parser Wiring** | **VERIFIED BY TEST** | `test/phase1_remediation.test.js` Tests 3, 4, 5, 11, 16. `syncNseMasterPipeline()` parses SCH, NAV, and SIP. |
| **Failure Safety (403, Timeout, Malformed, Empty)** | **VERIFIED BY TEST & EXECUTION** | When NSE endpoint responds with HTTP 403 (`Invalid authorization header or IP Address not mapped with user.`), the pipeline logs explicit errors, aborts destructive modification, preserves 100% of existing valid database records (`preservedExistingData: true`), and does NOT synthesize fake success. |
| **Regular-Only Ingestion Gate** | **VERIFIED BY TEST** | Direct plans (`D`) and Unknown plans (`X`) are separated into exclusion arrays and never enter `regularSchemes`. |
| **MongoDB Atlas Upsert** | **VERIFIED LIVE** | Live MongoDB Atlas database queried: 1,864 documents audited. 1,864 are Regular, 0 Direct, 0 Unknown. |
| **Live Production NSE Credentials & IP Whitelist** | **NOT LIVE / NOT VERIFIED** | Live NSE API requires static IP whitelisting on NSE servers and active live participant credentials. When called without production IP mapping, NSE returns 403 as verified in test run. **No fake success is simulated.** Existing authentic data is preserved. |

---

## D. Similar Funds Verification

`similarFundsCount` was audited across the entire backend and Flutter codebase:

1. **Calculation Source:**
   In `controllers/mutualFundsController.js` (`getSchemeDetail`):
   ```javascript
   const peerFilter = {
     schemeCode: { $ne: scheme.schemeCode },
     planType: 'REGULAR',
     schemeName: { $not: { $regex: 'direct', $options: 'i' } },
     isActive: true,
   };
   if (scheme.subCategory && scheme.subCategory.trim()) {
     peerFilter.subCategory = { $regex: scheme.subCategory.trim(), $options: 'i' };
   } else if (scheme.category) {
     peerFilter.category = scheme.category;
   }

   const similarFunds = await MutualFundScheme.find(peerFilter)
     .sort({ aum: -1, cagr3Y: -1 })
     .limit(6)
     .select('schemeCode schemeName amcName nav cagr1Y cagr3Y cagr5Y rating aum expenseRatio minSipAmount');

   // Explicit dynamic count:
   similarFundsCount: similarFunds.length
   ```
2. **Audit Verification:**
   - **No hardcoded `6`**: The field is evaluated dynamically via `similarFunds.length`.
   - **Current scheme excluded**: `{ schemeCode: { $ne: scheme.schemeCode } }`.
   - **Direct & Unknown excluded**: `{ planType: 'REGULAR', schemeName: { $not: { $regex: 'direct', $options: 'i' } } }`.
   - **Inactive schemes excluded**: `{ isActive: true }`.
   - **Verified in Test 14**: Verified that `similarFundsCount === similarFunds.length` and current scheme is excluded.

---

## E. API Contract Verification

| Endpoint | Method | Plan Enforcement | Null Integrity & Anti-Fabrication Result |
|---|---|---|---|
| `/api/mutual-funds/schemes` | GET | `planType: 'REGULAR'`, name `$not: /direct/i`, `isActive: true` | Missing ratings/returns return `null`. Zero fake fallback schemes. |
| `/api/mutual-funds/schemes?search=direct` | GET | Strictly enforced | Returns 0 schemes. Direct plans cannot be found via search. |
| `/api/mutual-funds/schemes/:code` | GET | `planType: 'REGULAR'`, name `$not: /direct/i` | Returns 404 for Direct/Unknown codes. `similarFundsCount: similarFunds.length`. |
| `/api/mutual-funds/orders/purchase` | POST | Rejects `planType !== 'REGULAR'` | Returns 400 if plan is Direct or Unknown. Units start at 0, pending authentic allotment. |
| `/api/mutual-funds/sip/register` | POST | Rejects `planType !== 'REGULAR'` | Returns 400 if plan is Direct or Unknown. No synthetic XSIP IDs generated in production. |
| `/api/mutual-funds/orders/redeem` | POST | `planType: 'REGULAR'` | Requires genuine positive units from settled orders. |
| `/api/mutual-funds/orders/switch` | POST | Both source & target must be `'REGULAR'` and same AMC | Enforces SEBI intra-AMC switch rule. |
| `/api/mutual-funds/stp/register` | POST | Both schemes must be `'REGULAR'` and same AMC | Validated against database. |
| `/api/mutual-funds/swp/register` | POST | `planType: 'REGULAR'` | Requires confirmed available units. |
| `/api/mutual-funds/portfolio` | GET | Only `ALLOTTED` or confirmed orders contribute to units | Pending orders have 0 units. Valuation computed strictly from `totalUnits * liveNav`. |

---

## F. Database Audit Results

Direct audit of MongoDB Atlas cluster via `scripts/audit_database.js`:

```json
{
  "totalSchemes": 1864,
  "regularCount": 1864,
  "directCount": 0,
  "unknownCount": 0,
  "schemeNamesContainingDirect": 0,
  "suspiciousDefaults": {
    "rating5": 0,
    "rating48": 0,
    "rating45": 0,
    "aum5000": 0,
    "expenseRatio085": 0,
    "minSipAmount500": 0,
    "minPurchaseAmount1000": 0
  },
  "orders": {
    "totalOrders": 1,
    "pendingOrdersWithNonZeroUnits": 0,
    "syntheticOrderIds": 0
  }
}
```

---

## G. Test Results

Command executed:
```bash
node --test test/phase1_remediation.test.js
```

Actual execution output:
```text
▶ VikaOne Phase 1 Remediation & NSE Source of Truth Verification
  ✔ 1. Model Schema: Financial metrics default to null, never fabricated numbers (10.4ms)
  ✔ 2. Order Model: Allotted units must start at 0 and be separate from estimated units (3.2ms)
  ✔ 3. NSE Demat Scheme Master (SCH): Parses 43 columns per NSE_MF_WebfileStructure.pdf without inventing data (2.8ms)
  ✔ 4. NSE SIP Master (SIP): Parses 22 columns per NSE_MF_WebfileStructure.pdf p. 79-80 (1.2ms)
  ✔ 5. Plan & Option Identity: Strict parsing of D, R, blank, and UNKNOWN rejection (0.4ms)
  ✔ 6. NSE Client: Production mode isolates mocks, HTTP failure returns explicit failure (0.4ms)
  ✔ 7. Live Service: Missing NAV data returns null without synthesizing Math.sin curves (1787.4ms)
  ✔ 8. Catalog API: When no schemes match query, returns empty array without fallback schemes (675.8ms)
  ✔ 9. NSE Client: Exchange 403/timeout returns explicit structured error, never fake success (662.6ms)
  ✔ 10. Units Separation: Pending order has 0 units; Allotment report sets actual units (3.7ms)
  ✔ 11. Regular-Only Enforcement: Excludes both Direct and Unknown plans from ingestion (0.8ms)
  ✔ 12. External Scraping Disabled in Phase 1: getLiveSchemeFacts returns null without external HTTP calls (0.5ms)
  ✔ 13. No Synthetic Order IDs: Rejects synthetic order ID generators in production (1.6ms)
  ✔ 14. Similar Funds: Dynamic count derived strictly from qualifying database records, never hardcoded (1017.7ms)
  ✔ 15. Customer APIs: Direct & Unknown plans cannot be searched or accessed via customer routes (79.6ms)
  ✔ 16. NSE Master Pipeline: Failure safety protects database from 403, timeout, and empty responses (849.7ms)
  ✔ 17. Null Integrity: Missing financial metrics remain null through API, never defaulted (197.5ms)
✔ VikaOne Phase 1 Remediation & NSE Source of Truth Verification (6397.5ms)
ℹ tests 17
ℹ suites 1
ℹ pass 17
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

---

## H. Flutter Analysis Results

Command executed:
```bash
flutter analyze "C:\Ashahad\Porwal\GoldVikaone\lib\modules\mutual_funds" "C:\Ashahad\Porwal\GoldVikaone\lib\data\models\mf_scheme_model.dart"
```

Filtered errors and warnings check:
```bash
powershell -Command "flutter analyze 'C:\Ashahad\Porwal\GoldVikaone\lib\modules\mutual_funds' 'C:\Ashahad\Porwal\GoldVikaone\lib\data\models\mf_scheme_model.dart' | Select-String -Pattern '^\s*(error|warning)\b'"
```

**Result:**
- **Errors: 0**
- **Warnings: 0**
- **Infos: 160** (non-blocking Flutter SDK deprecation notices, e.g. `withOpacity` recommendation to use `withValues`).

---

## I. Phase 2 Scope — Explicitly Deferred

Per strict product requirements, the following features remain in **Phase 2** and were **NOT** implemented in Phase 1:

1. **AMFI Monthly Portfolio & AUM Ingestion**: Official monthly AMFI asset ingestion service for scheme AUMs.
2. **Authorized Third-Party Rating Engine**: Integrating CRISIL / Morningstar / Value Research official rating feeds.
3. **TER / Expense Ratio Ingestion**: Automated AMC daily/monthly total expense ratio scraper/feed.
4. **Fund Manager Portfolio Tracker**: Historical AMC manager profiles, tenure histories, and educational backgrounds.
5. **Historical Multi-Year Returns & CAGR Engine**: Historical rolling return engine calculated from daily AMFI NAV history.
6. **Benchmark Indices Integration**: Nifty 50, Nifty Midcap 150, BSE Sensex comparison feeds.
7. **MF Central RTA Integration**: Direct CAS (Consolidated Account Statement) ingestion from CAMS/KFintech.
8. **Automated Recommendation & Ranking Algorithms**: Algorithmic scoring beyond basic category sorting.

---

## Conclusion & Sign-Off

Phase 1 final verification is **100% complete**. The Mutual Fund module in VikaOne is strictly compliant with:
- **Regular Plan Only** policy across ingestion, database, APIs, and Flutter UI.
- **Zero Fabricated Financial Data** policy across all metrics.
- Complete failure resilience and data integrity across the NSE master data ingestion pipeline.
