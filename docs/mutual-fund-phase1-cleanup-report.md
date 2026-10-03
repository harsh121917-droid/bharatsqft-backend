# VikaOne Mutual Fund — Phase 1 Remediation & Cleanup Report

**Project:** VikaOne Mutual Fund Module (Backend + MongoDB + Flutter)  
**Execution Phase:** Phase 1 Only (Data Foundation & NSE Source-of-Truth Remediation)  
**Date:** October 2026  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Phase 1 remediation has successfully audited and cleansed the Mutual Fund data architecture across:
- **Node.js REST Backend** (`bharatsqft-backend`)
- **MongoDB Schema Models and Ingestion Seeders**
- **NSE Integration Services & Clients** (`services/nse`)
- **Flutter Mobile Application** (`GoldVikaone/lib`)

The governing objective has been strictly satisfied:
> **Never show, store, or return fabricated, synthetic, guessed, default, or misleading financial data.**

All dummy catalogs (`DEFAULT_SCHEMES`), synthetic performance curves (`Math.sin`), hardcoded metrics (e.g. `rating: 5`, `aum: 5000`, `expenseRatio: 0.85`, `minSipAmount: 500`), manufactured order IDs (`NSE_${Date.now()}`), and unverified fallback paths have been completely eradicated or isolated strictly to automated test environments (`NODE_ENV === 'test'`).

---

## 2. Removed Items

### Backend Files & Modules

| File | Function / Section | Old Dummy / Misleading Behavior | Reason for Removal |
|---|---|---|---|
| `controllers/mutualFundsController.js` | `DEFAULT_SCHEMES` array & `seedDefaultSchemesIfEmpty()` | Served 8 hardcoded schemes (e.g. Parag Parikh Flexi Cap, HDFC Top 100) whenever database was empty. | Violated strict source-of-truth. Fabricated schemes must never appear when database or backend is unavailable. |
| `controllers/mutualFundsController.js` | `getSchemeDetail` | Used hardcoded defaults: `|| 500`, `|| 1000`, `|| 4`, generated flat-line chart points, and scraped external data into live database. | Corrupted source data with fallbacks. Financial values must remain `null` if unverified. |
| `controllers/mutualFundsController.js` | `createPurchaseOrder` | Generated synthetic `NSE_${Date.now()}` order IDs and fake success upon NSE exchange failure; created Razorpay orders. | Circular SEBI violation (pool account ban) and masking exchange failures with fake success. |
| `controllers/mutualFundsController.js` | `registerSipOrder` | Generated synthetic `XSIP_${Date.now()}` registration IDs when NSE returned failure; created Razorpay orders. | SIP mandates must follow exchange authorization. Fake registration IDs deceive users. |
| `controllers/mutualFundsController.js` | `createRedemptionOrder`, `createSwitchOrder`, `setupUserMandate` | Generated synthetic `NSE_RED_${Date.now()}`, `NSE_SW_${Date.now()}`, and `MND_${Date.now()}` IDs. | Masks actual exchange rejection with fabricated transaction success. |
| `controllers/mutualFundsController.js` | `getUserSchemeHoldings`, `getPortfolio` | Counted pending orders as live holdings; calculated units as `orderAmount / nav`. Subtracted redemption amounts improperly. | Estimated units at order creation are not allotted units. Allotment must come from NSE Allotment Statement report. |
| `services/mfLiveService.js` | `generateFallbackNavData()` | Manufactured sinusoidal NAV chart points using `Math.sin(i / 10) * 15 + ...` | Complete fabrication of financial market history. |
| `services/mfLiveService.js` | `getLiveHistoricalNav()` & `extractPeriodSeries()` | Synthesized fake 1Y, 3Y, 5Y return percentages when historical dates were missing. | Invented financial return metrics without actual price history. |
| `services/mfLiveService.js` | `scrapeGrowwFundDetails()` | Scraped uncontracted web endpoints and assigned Direct Plan returns to Regular schemes. | Mixing Direct and Regular fund performance violates regulatory investor disclosure. |
| `seeders/ingest_regular_schemes.js` | Scheme generation loop | Generated synthetic AUM (`nav * 140`), synthetic ratings (`isPopular ? 5`), synthetic CAGR (`base1Y + delta`), and dummy managers (`STAR_MANAGERS`). | Polluted database with thousands of manufactured financial figures. |
| `seeders/ingest_amfi_master.js` | AMFI ingestion | Computed fake AUM (`codeNum % 60`), dummy CAGR (`cagr5Y * 1.35`), and fake ratings. | Ingested unverified and manufactured fields into the master catalog. |
| `services/nse/nseEncryption.js` | `generateAuthHeaders()` | Used hardcoded member code `'1031616'` as fallback in production. | Insecure credential fallback; risked routing production requests with stale credentials. |
| `models/NseConfig.js` | Schema definitions | Used `'1031616'` and `'ADMIN'` as hardcoded schema defaults. | Production settings must be explicitly configured from secure environment variables. |
| `verify_production_nse.js` | CLI credentials helper | Had hardcoded `'1031616'` member code. | Replaced with strict requirement for environment variables. |

### Flutter Files & Components

| File | Widget / Class | Old Dummy / Misleading Behavior | Reason for Removal |
|---|---|---|---|
| `data/models/mf_scheme_model.dart` | `MutualFundScheme` | Non-nullable fields with hardcoded defaults: `rating: json['rating'] ?? 5`, `expenseRatio: json['expenseRatio'] ?? 0.85`, `minSipAmount: json['minSipAmount'] ?? 500`. | Deserialization turned missing financial data into fake financial data. |
| `modules/mutual_funds/controllers/mutual_funds_controller.dart` | `_getDefaultSchemes()` | Maintained 8 hardcoded fund models in Dart code for offline/fallback catalog display. | Prevented user from seeing real offline/error states; showed fake fund list. |
| `modules/mutual_funds/views/mf_scheme_detail_view.dart` | Return pills & similar funds | Hardcoded `-0.98%` (1M), `14.50%` (6M), and `cagr5Y * 1.35` (All); synthesized category comparisons (`* 1.08`, `* 0.88`, `* 0.85`). Hardcoded "#4 in India" and mock similar schemes. | Completely fabricated fund comparison and historical performance metrics. |
| `modules/mutual_funds/views/mf_popular_funds_view.dart` | Fund card badges | Hardcoded `5.0 ★` rating badge for all funds. | Deceptive ratings display. |
| `modules/mutual_funds/views/mf_search_view.dart` | Search results | Hardcoded `4.8 ★` and `AUM ₹12,450 Cr` fallbacks for all search hits. | Misleading search results. |
| `modules/mutual_funds/views/widgets/mf_groww_widgets.dart` | Cards & Quick Access | Hardcoded `4.5 ★` and `5.0 ★` badges on fund cards. | Fabricated star rating cards. |
| `modules/mutual_funds/views/mf_sip_investment_view.dart` | Min SIP input fallback | Hardcoded `500` fallback when scheme had no verified minimum SIP. | Must respect actual NSE SIP Scheme Master minimums. |
| `modules/mutual_funds/views/mf_investment_checkout_sheet.dart` | Min Lumpsum input fallback | Hardcoded `1000` fallback when scheme had no verified minimum purchase. | Must respect actual NSE Demat Scheme Master minimums. |

---

## 3. Disabled & Isolated Items

| Component | Previous Fallback Behavior | Remediated Behavior | Isolation Mechanism |
|---|---|---|---|
| **NSE Client Mock Mode** (`services/nse/nseClient.js`) | Automatically activated whenever network timed out or HTTP 403 Forbidden was encountered in production. | Mock responses are strictly unreachable in production (`NODE_ENV === 'production'`). NSE 403 or network failure returns structured explicit HTTP failure. | `isMockMode() { return process.env.NODE_ENV === 'test' && !isConfigured; }` |
| **Direct Plan Scraper Enrichment** (`services/mfLiveService.js`) | Scraped Direct plan data from third-party sites and overwrote Regular plan fields in MongoDB. | Disabled database overwrite during scheme detail calls; return stats set to `null` if not verified. | Scraper marked as unverified external enrichment for Phase 2 review. |
| **Razorpay Direct Payment Integration** (`mutualFundsController.js`) | Created Razorpay orders for MF transactions. | Disabled. NSE MF transactions must follow NSE payment gateway link (`GET_LINK` API / UPI Short URL) or authorized mandate debit per SEBI circular on pool accounts. | Replaced with NSE payment URL generation (`GET_LINK`). |

---

## 4. Preserved Verified Logic

1. **Strict TLS 1.3 Architecture** (`services/nse/nseEncryption.js`):
   - Enforces TLS 1.3 (`minVersion: 'TLSv1.3'`) with documented OpenSSL cipher suite:
     - `TLS_AES_256_GCM_SHA384`
     - `TLS_CHACHA20_POLY1305_SHA256`
     - `TLS_AES_128_GCM_SHA256`
   - Preserves required Akamai bypass headers (`User-Agent: PostmanRuntime/7.36.0`, `Accept: */*`, `Connection: keep-alive`).
   - Verified against `Connection level pre-requisite for API connection of NSEINVEST 1_Draft1.pdf`.

2. **Demat Scheme Master (`SCH`) Ingestion** (`services/nse/nseMasterReconciliationService.js`):
   - Full 43-column parser verified against `NSE_MF_WebfileStructure.pdf` (pages 77–79).
   - Preserves exact source scheme names, codes, ISINs, purchase cutoffs, and redemption rules.

3. **NSE SIP Scheme Master (`SIP`) Ingestion** (`services/nse/nseMasterReconciliationService.js` & `models/MfSipSchemeMaster.js`):
   - Full 22-column parser verified against `NSE_MF_WebfileStructure.pdf` (pages 79–80).
   - Maps exact `sipDates`, `sipFrequency`, `minInstallmentAmount`, `maxInstallmentAmount`, and `multiplierAmount`.

4. **Fund Identity Partitioning**:
   - Explicit mapping: Regular plans are strictly separated from Direct plans (`Col 8: SCHEME PLAN`).
   - Growth options are strictly separated from IDCW Payout and IDCW Reinvestment (`Col 28 / NAV Col 5`).
   - Scheme names are preserved faithfully without arbitrary text replacing.

---

## 5. Still Pending (Phase 2 Roadmap)

The following items are recognized as data gaps requiring Phase 2 integrations, not Phase 1 fabrication:

1. **AUM (Fund Size)**:
   - Not provided in NSE Master files (`SCH`, `NAV`, `SIP`).
   - Currently preserved as `null` in DB and `—` in Flutter.
   - *Phase 2 Recommendation:* Ingest authoritative monthly AMFI AUM disclosures or integrate contracted Morningstar/ValueResearch feeds.

2. **Expense Ratio, Fund Managers, Portfolio Holdings**:
   - Not provided in NSE transaction APIs.
   - Currently preserved as `null`.
   - *Phase 2 Recommendation:* Ingest monthly AMC SID/portfolio disclosure reports or contracted data provider API.

3. **Historical Performance & CAGR Returns**:
   - NSE supplies daily NAV snapshots, not historical returns.
   - Currently preserved as `null` (no sinusoidal curves or fake percentages).
   - *Phase 2 Recommendation:* Build a verified return engine calculating CAGR (1Y, 3Y, 5Y) and absolute returns (1M, 3M, 6M) based strictly on stored daily historical NAV points.

4. **MF Central Consolidated Portfolio Integration**:
   - External CAS and consolidated portfolio holdings split between NSE MF and MF Central as per `vikaone-mf-development-map.pdf`.
   - Scheduled for Phase 2 implementation.
