# VikaOne Mutual Fund — Master Data Source of Truth & Field Lineage Specification

**Document Version:** 1.0 (Phase 1 Remediation)  
**Date:** October 2026  
**Status:** Authoritative Architectural Baseline  
**Governing Principle:** *A missing financial value is better than a fake financial value. Never display, store, or calculate fabricated, synthetic, guessed, default, or misleading financial figures.*

---

## 1. Official Documentation Reference Baseline

This specification strictly adheres to the official National Stock Exchange of India (NSE) regulatory and integration standards:

1. **NSE API Specification:** `NSEMF_API_Details_V1.9.8.pdf` (Protocol for Non-NEAT Front End [NNF] Mutual Funds Service System, Version 1.9.8, August 2026).
2. **NSE Web/Master File Specification:** `NSE_MF_WebfileStructure.pdf` (Master layouts for SCH, NAV, SIP, STP, SWP, Settlement Calendar, and Transaction Reports).
3. **NSE Connectivity Specification:** `Connection level pre-requisite for API connection of NSEINVEST 1_Draft1.pdf` (TLS 1.3 strict ciphers, required proxy/Akamai headers, zero mock production routing).
4. **VikaOne Development Map:** `vikaone-mf-development-map.pdf` (Boundary definitions between NSE MF, MF Central, AMCs, RTAs, VikaOne Backend, and Flutter App).

---

## 2. Source-of-Truth Data Master Matrix

| Field | Source | NSE File / API Endpoint | Exact Field / Column | Transformation | Nullable | Current Status |
|---|---|---|---|---|---|---|
| **Scheme Code** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 2: `SCHEME CODE` (Varchar 30) | Exact string trim | No | **VERIFIED (Active)** |
| **ISIN** | NSE | `SCH` / `NAV` Master | `SCH` Col 5 / `NAV` Col 6: `ISIN` (Varchar 12) | Exact 12-char trim | No | **VERIFIED (Active)** |
| **Scheme Name** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 9: `SCHEME NAME` (Varchar 200) | Trim whitespace, preserve unaltered | No | **VERIFIED (Active)** |
| **Plan Type** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 8: `SCHEME PLAN` (Varchar 10) | `D` -> `DIRECT`, else `REGULAR` | No | **VERIFIED (Active)** |
| **Option** | NSE | `NAV` / `SCH` Master | `NAV` Col 5: `DIV. REINVEST FLAG` / `SCH` Col 28 | `Z` -> `GROWTH`, `Y` -> `IDCW_REINVESTMENT`, `N` -> `IDCW_PAYOUT` | No | **VERIFIED (Active)** |
| **Dividend Type** | NSE | `NAV` Master | Col 5: `DIV. REINVEST FLAG` | `Y` -> `REINVESTMENT`, `N` -> `PAYOUT`, `Z` -> `NONE` | No | **VERIFIED (Active)** |
| **NAV (Live)** | NSE | `MASTER_DOWNLOAD` (`file_type=NAV`) | Col 7: `NAV VALUE` (Number 14) | `parseFloat(col[6])` | Yes | **VERIFIED (Active)** |
| **NAV Date** | NSE | `MASTER_DOWNLOAD` (`file_type=NAV`) | Col 1: `NAV Date` (Datetime YYYY-MM-DD) | Date parse | Yes | **VERIFIED (Active)** |
| **Min Purchase Amount** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 12: `MINIMUM PURCHASE AMOUNT` (Numeric 20) | `parseFloat(col[11])` | Yes | **VERIFIED (Active)** |
| **Add Purchase Amount** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 13: `ADDITIONAL PURCHASE AMOUNT` (Numeric 12) | `parseFloat(col[12])` | Yes | **VERIFIED (Active)** |
| **Max Purchase Amount** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 14: `MAXIMUM PURCHASE AMOUNT` (Numeric 12) | `parseFloat(col[13])` | Yes | **VERIFIED (Active)** |
| **Purchase Multiplier** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 15: `PURCHASE AMOUNT MULTIPLIER` (Numeric 12)| `parseFloat(col[14])` | Yes | **VERIFIED (Active)** |
| **Purchase Cutoff Time**| NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 16: `PURCHASE CUTOFF TIME` (Varchar 8) | HH:MM:SS trim | Yes | **VERIFIED (Active)** |
| **Purchase Allowed** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 10: `PURCHASE ALLOWED` (Varchar 1) | `col[9] === 'Y'` | No | **VERIFIED (Active)** |
| **Redemption Allowed**| NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 17: `REDEMPTION ALLOWED` (Numeric 1) | `col[16] === '1' \|\| 'Y'` | No | **VERIFIED (Active)** |
| **Min Redemption Amount**| NSE | `MASTER_DOWNLOAD` (`file_type=SCH`)| Col 22: `REDEMPTION AMOUNT - MINIMUM` (Num 12)| `parseFloat(col[21])` | Yes | **VERIFIED (Active)** |
| **Redemption Cutoff** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 25: `REDEMPTION CUTOFF TIME` (Varchar 8) | HH:MM:SS trim | Yes | **VERIFIED (Active)** |
| **SIP Allowed Flag** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 29: `SIP FLAG` (Numeric 1) | `col[28] === '1' \|\| 'Y'` | No | **VERIFIED (Active)** |
| **STP Allowed Flag** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 30: `STP FLAG` (Numeric 1) | `col[29] === '1' \|\| 'Y'` | No | **VERIFIED (Active)** |
| **SWP Allowed Flag** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 31: `SWP FLAG` (Numeric 1) | `col[30] === '1' \|\| 'Y'` | No | **VERIFIED (Active)** |
| **Switch Allowed Flag**| NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 32: `SWITCH FLAG` (Varchar 1) | `col[31] === '1' \|\| 'Y'` | No | **VERIFIED (Active)** |
| **Min SIP Amount** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 12: `SIP MINIMUM INSTALLMENT AMOUNT` | `parseFloat(col[11])` | Yes | **VERIFIED (Active)** |
| **Max SIP Amount** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 13: `SIP MAXIMUM INSTALLMENT AMOUNT` | `parseFloat(col[12])` | Yes | **VERIFIED (Active)** |
| **SIP Multiplier** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 14: `SIP MULTIPLIER AMOUNT` (Numeric 5) | `parseFloat(col[13])` | Yes | **VERIFIED (Active)** |
| **SIP Frequency** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 6: `SIP FREQUENCY` (Varchar 15) | String trim (e.g. `MONTHLY`) | Yes | **VERIFIED (Active)** |
| **SIP Allowed Dates** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 7: `SIP DATES` (Varchar 100) | Split CSV to Array of ints | Yes | **VERIFIED (Active)** |
| **Min Installments** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 15: `SIP MINIMUM INSTALLMENT NUMBERS` | `parseInt(col[14])` | Yes | **VERIFIED (Active)** |
| **Max Installments** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 16: `SIP MAXIMUM INSTALLMENT NUMBERS` | `parseInt(col[15])` | Yes | **VERIFIED (Active)** |
| **SIP Pause Allowed** | NSE | `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 19: `PAUSE FLAG` | `col[18] !== 'N'` | Yes | **VERIFIED (Active)** |
| **Exit Load** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 39: `EXIT LOAD` (Varchar 500) | Raw string trim | Yes | **VERIFIED (Active)** |
| **Lock-in Period** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 41: `LOCK IN PERIOD` (Numeric 5) | `parseInt(col[40])` | Yes | **VERIFIED (Active)** |
| **Settlement Type** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 33: `SETTLEMENT TYPE` (Varchar 5) | Raw string trim (e.g. `T2`, `L0`) | Yes | **VERIFIED (Active)** |
| **RTA Agent Code** | NSE | `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 26: `RTA AGENT CODE` (Varchar 50) | Trim (`CAMS`/`KFINTECH`) | Yes | **VERIFIED (Active)** |
| **Allotted Units** | NSE | `ALLOTMENT_STATEMENT` API Report | Response `allottedqty` (Number 16) | `parseFloat(allottedqty)` | Yes | **VERIFIED (Active)** |
| **Allotted NAV** | NSE | `ALLOTMENT_STATEMENT` API Report | Response `allottednav` (Number 14) | `parseFloat(allottednav)` | Yes | **VERIFIED (Active)** |
| **AUM (Fund Size)** | External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **Rating (Stars)** | External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **Expense Ratio** | External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **Fund Manager** | External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **Holdings / Sectors**| External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **Benchmark** | External/3rd-party | NOT PROVIDED IN NSE MASTER FILES | N/A | None (`null` in Phase 1) | Yes | **NOT VERIFIED (Phase 1: null)** |
| **1M/6M/1Y/3Y/5Y Returns** | Computed Engine | NOT DIRECTLY SUPPLIED BY NSE | Verified calculation in Phase 2 | `null` in Phase 1 if uncalculated | Yes | **PENDING (Phase 2 Calculation)** |

---

## 3. End-to-End Field Lineage (From Source to Flutter Screen)

### Lineage A: Net Asset Value (NAV)
```text
Flutter Display
    ↳ `Text('₹${scheme.nav?.toStringAsFixed(2) ?? "—"}')` [mf_scheme_detail_view.dart]
Backend JSON Response
    ↳ `res.json({ scheme: { nav: scheme.nav, navDate: scheme.navDate } })` [/api/mutual-funds/:id]
MongoDB Field
    ↳ `MutualFundScheme.nav: Number (default: null)`
Ingestion Source
    ↳ `services/nse/nseMasterReconciliationService.js` (syncDailyNav)
NSE Master File
    ↳ `file_type: 'NAV'`, File: `NSE_NSEINVEST_NAV_<DDMMYYYY>.txt`
Exact Column
    ↳ Col 7: `NAV VALUE` (Numeric 14)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Page 83 (NAV Master)
```

### Lineage B: Minimum SIP Amount
```text
Flutter Display
    ↳ `Text('Min SIP: ₹${scheme.minSipAmount?.toStringAsFixed(0) ?? "—"}')` [mf_groww_widgets.dart]
Backend JSON Response
    ↳ `res.json({ scheme: { minSipAmount: scheme.minSipAmount } })` [/api/mutual-funds/:id]
MongoDB Field
    ↳ `MutualFundScheme.minSipAmount: Number (default: null)`
Master Collection
    ↳ `MfSipSchemeMaster.minInstallmentAmount: Number (default: null)`
Ingestion Source
    ↳ `services/nse/nseMasterReconciliationService.js` (ingestNseSipMaster)
NSE Master File
    ↳ `file_type: 'SIP'`, File: `NSE_NSEINVEST_SIP_<DDMMYYYY>.txt`
Exact Column
    ↳ Col 12: `SIP MINIMUM INSTALLMENT AMOUNT` (Numeric 12,2)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Pages 79–80 (SIP Scheme Master Report)
```

### Lineage C: Minimum Purchase Amount
```text
Flutter Display
    ↳ `Text('Min Investment: ₹${scheme.minPurchaseAmount?.toStringAsFixed(0) ?? "—"}')` [mf_scheme_detail_view.dart]
Backend JSON Response
    ↳ `res.json({ scheme: { minPurchaseAmount: scheme.minPurchaseAmount } })` [/api/mutual-funds/:id]
MongoDB Field
    ↳ `MutualFundScheme.minPurchaseAmount: Number (default: null)`
Ingestion Source
    ↳ `services/nse/nseMasterReconciliationService.js` (parseNseSchemeMasterText)
NSE Master File
    ↳ `file_type: 'SCH'`, File: `NSE_NSEINVEST_ALL_<DDMMYYYY>.txt`
Exact Column
    ↳ Col 12: `MINIMUM PURCHASE AMOUNT` (Numeric 20)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Pages 77–78 (Demat Scheme Master)
```

### Lineage D: SIP Allowed Dates & Frequency
```text
Flutter Display
    ↳ `Text(scheme.sipDates?.join(', ') ?? "Default Monthly")` [mf_sip_investment_view.dart]
Backend JSON Response
    ↳ `res.json({ scheme: { sipDates: scheme.sipDates, sipFrequency: scheme.sipFrequency } })`
MongoDB Field
    ↳ `MutualFundScheme.sipDates: [Number] (default: null)`, `sipFrequency: String (default: null)`
Master Collection
    ↳ `MfSipSchemeMaster.sipDates: String`, `sipFrequency: String`
Ingestion Source
    ↳ `services/nse/nseMasterReconciliationService.js` (ingestNseSipMaster)
NSE Master File
    ↳ `file_type: 'SIP'`, File: `NSE_NSEINVEST_SIP_<DDMMYYYY>.txt`
Exact Columns
    ↳ Col 6: `SIP FREQUENCY` (Varchar 15), Col 7: `SIP DATES` (Varchar 100)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Page 80
```

### Lineage E: Purchase & Redemption Allowed Flags
```text
Flutter Display
    ↳ Disabled "Invest Now" / "Redeem" button when `purchaseAllowed == false`
Backend JSON Response
    ↳ `res.json({ scheme: { purchaseAllowed: scheme.purchaseAllowed, redemptionAllowed: scheme.redemptionAllowed } })`
MongoDB Field
    ↳ `MutualFundScheme.purchaseAllowed: Boolean`, `redemptionAllowed: Boolean`
Ingestion Source
    ↳ `services/nse/nseMasterReconciliationService.js` (parseNseSchemeMasterText)
NSE Master File
    ↳ `file_type: 'SCH'`
Exact Columns
    ↳ Col 10: `PURCHASE ALLOWED` ('Y'/'N'), Col 17: `REDEMPTION ALLOWED` (Numeric 1)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Pages 77–78
```

### Lineage F: Fund Identity (Plan Type & Option)
```text
Flutter Display
    ↳ Plan badge ("REGULAR") + Option badge ("GROWTH")
Backend JSON Response
    ↳ `res.json({ scheme: { planType: "REGULAR", option: "GROWTH" } })`
MongoDB Field
    ↳ `MutualFundScheme.planType: String`, `option: String`
Ingestion Source
    ↳ Strict Mapping in `services/nse/nseMasterReconciliationService.js`:
        - `parsePlanType(col[7])`: 'D' -> DIRECT, all other -> REGULAR
        - `parseOption(col[27])`: 'Z' -> GROWTH, 'Y' -> IDCW REINVEST, 'N' -> IDCW PAYOUT
NSE Master File
    ↳ `file_type: 'SCH'`, Col 8 (`SCHEME PLAN`), Col 28 (`DIVIDEND REINVESTMENT FLAG`)
Source Specification Document
    ↳ `NSE_MF_WebfileStructure.pdf`, Pages 77–78
```

### Lineage G: Order Creation vs Allotment Units
```text
1. At Order Creation:
   - User inputs order amount: ₹10,000
   - Estimated units calculated for display only: `estimatedUnits = 10000 / scheme.nav`
   - Stored in MfOrder: `orderAmount: 10000`, `estimatedUnits: 10000 / nav`, `units: 0`, `allottedUnits: 0`, `allotmentStatus: 'PENDING'`
   - NEVER credited to user holdings or displayed as actual holdings.

2. At Allotment Statement Processing:
   - Polled via NSE API: `POST /nsemfdesk/api/v2/reports/ALLOTMENT_STATEMENT`
   - Exact Fields Received from NSE:
       ↳ `allottedqty` (Number 16) -> Stored in `MfOrder.allottedUnits` and `MfOrder.units`
       ↳ `allottednav` (Number 14) -> Stored in `MfOrder.allottedNav`
       ↳ `allotmentamt` (Numeric 15,2) -> Confirmed purchase consideration
       ↳ `allotmentStatus: 'ALLOTTED'`
   - Portfolio calculation (`getUserSchemeHoldings`, `getPortfolio`) counts ONLY confirmed orders (`allotmentStatus: 'ALLOTTED'`).
Source Specification Document
   ↳ `NSEMF_API_Details_V1.9.8.pdf`, Pages 111–115 & `NSE_MF_WebfileStructure.pdf`, Pages 119–121
```

### Lineage H: Unverified Third-Party & External Metrics (Phase 1 Remediation)
```text
AUM (Fund Size):
    ↳ Flutter: Displays '—' when null.
    ↳ Backend: Returns null.
    ↳ MongoDB: `aum: null`
    ↳ Status: NOT in NSE Master files. Any uncontracted third-party API value is rejected.

Rating:
    ↳ Flutter: Omits rating star display when null.
    ↳ Backend: Returns null.
    ↳ MongoDB: `rating: null`
    ↳ Status: NOT in NSE Master files. Defaults (e.g. 5 stars) completely eliminated.

Expense Ratio:
    ↳ Flutter: Displays '—' when null.
    ↳ Backend: Returns null.
    ↳ MongoDB: `expenseRatio: null`
    ↳ Status: NOT in NSE Master files.

Historical CAGR Returns (1M, 6M, 1Y, 3Y, 5Y):
    ↳ Flutter: Hides return pills or displays '—' when null.
    ↳ Backend: Returns null when verified historical timeseries is absent.
    ↳ Status: Synthetic calculations (delta off base, random, sine curve) completely deleted. Phase 2 calculation engine scheduled.
```
