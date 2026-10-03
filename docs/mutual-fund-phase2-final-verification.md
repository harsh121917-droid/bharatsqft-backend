# VikaOne Mutual Fund — Phase 2 Final Verification Report

## Executive Summary

Phase 2 of the VikaOne Mutual Fund module has been executed and verified in accordance with the Phase 2 Implementation Prompt and core non-negotiable product rules:
1. **Regular Plans Only**: Only Regular mutual fund plans are exposed, ingested, computed, and displayed. Direct plans are completely excluded from customer endpoints, database catalogs, search, and Flutter UI.
2. **Zero Fabricated Financial Data**: No NAVs, returns, CAGRs, ratings, expense ratios, AUMs, or chart points are estimated, copied from Direct plans, or visually faked. Missing metrics strictly resolve to `null` and display as `—` or an explicit unavailable state.
3. **Traceable & Validated**: All Phase 2 fields have documented lineage and quality validation rules.

---

## 1. Scope Completed

The following capabilities have been implemented, tested, and audited:
- **Authoritative Current NAV Handling**: Current NAV and NAV date extracted from official sources (AMFI Daily Feed & NSE Master). `navDate` is maintained distinctly from `navUpdatedAt` to prevent staleness deception.
- **Real Historical NAV Engine**: Retrieves genuine daily NAV histories strictly for verified Regular AMFI Scheme Codes across 1M, 3M, 6M, 1Y, 3Y, 5Y, and All timeframes. No synthetic Math.sin curves or interpolated filler points.
- **SEBI/AMFI Returns Calculation Engine**:
  - Simple absolute return for $\le 1\text{ Year}$ (1M, 3M, 6M, 1Y): $\left(\frac{\text{Ending NAV} - \text{Starting NAV}}{\text{Starting NAV}}\right) \times 100$.
  - CAGR for $> 1\text{ Year}$ (3Y, 5Y): $\left(\left(\frac{\text{Ending NAV}}{\text{Starting NAV}}\right)^{\frac{1}{\text{years}}} - 1\right) \times 100$.
  - Non-trading-day & weekend lookback handling: finds closest published trading NAV within $\pm 7\text{ days}$ tolerance window.
  - Insufficient history safety: returns `null` and `insufficientData: true` when a scheme lacks required history for a requested timeframe.
- **Financial Attribute Governance**:
  - Minimum SIP & Minimum Purchase: derived from NSE Master files (`file_type=SIP` and `file_type=SCH`), never defaulting to arbitrary ₹500, ₹1,000, or ₹5,000.
  - Exit Load: preserves nuanced rule text without reducing to a misleading single digit.
  - AUM, Expense Ratio, Rating, Fund Manager, Benchmark, Holdings: verified against source records; if unprovided, strictly stored as `null` with no mock fallbacks.
- **Customer API Contract**:
  - `GET /api/mutual-funds/schemes`: Regular-only filter, tokenized search, pagination, null-safe sorting.
  - `GET /api/mutual-funds/schemes/:code`: Exposes Phase 2 metrics, structured `returns` object, `chartData`, `periodReturns`, dynamic `similarFunds`, and source lineage metadata. Direct schemes return HTTP 404.
- **Flutter UI & Models**:
  - `MfSchemeModel`: Added `return1M`, `return3M`, `return6M`, `benchmark`, `exitLoad`, `navSource` with null-safety.
  - `mf_scheme_detail_view.dart`: Integrated `'3M'` timeframe pill, connected genuine returns for 1M/3M/6M/1Y/3Y/5Y, updated chart painter to handle unavailable and insufficient data states cleanly, and removed hardcoded `12.8%` and `12.0%` return calculator rates.
  - `mf_nfo_view.dart`: Replaced placeholder metrics (`rating: 5`, `fundManager: 'Fund Manager'`, `expenseRatio: 0.75`) with `null`.

---

## 2. Source Mapping Matrix

| Financial Field | Authoritative Source System | Source Endpoint / Identifier | Transformation / Calculation | As-of Date Metadata | Fallback |
|---|---|---|---|---|---|
| **NAV** | AMFI Daily Feed / NSE Master | `NAVAll.txt` / Col 7 `MASTER_DOWNLOAD` | `parseFloat()` | `navDate` | `null` |
| **Historical NAV** | AMFI Daily Archive | `api.mfapi.in/mf/{regularAmfiCode}` | Chronological parse `YYYY-MM-DD` | Historical point dates | `null` / `[]` |
| **1M Return** | VikaOne Returns Engine | AMFI Daily History | Absolute simple return $\le 1\text{Y}$ | Latest NAV Date | `null` |
| **3M Return** | VikaOne Returns Engine | AMFI Daily History | Absolute simple return $\le 1\text{Y}$ | Latest NAV Date | `null` |
| **6M Return** | VikaOne Returns Engine | AMFI Daily History | Absolute simple return $\le 1\text{Y}$ | Latest NAV Date | `null` |
| **1Y Return** | VikaOne Returns Engine | AMFI Daily History | Absolute simple return $\le 1\text{Y}$ | Latest NAV Date | `null` |
| **3Y Return** | VikaOne Returns Engine | AMFI Daily History | Annualised CAGR (3.0Y) | Latest NAV Date | `null` |
| **5Y Return** | VikaOne Returns Engine | AMFI Daily History | Annualised CAGR (5.0Y) | Latest NAV Date | `null` |
| **AUM** | AMC Factsheet / NSE Master | Col 32 / `AUM_INR_CR` | Numeric Crores | `aumAsOfDate` | `null` |
| **Min SIP** | NSE SIP Master | Col 6 `MASTER_DOWNLOAD(SIP)` | `parseFloat()` | Master file date | `null` |
| **Min Purchase**| NSE Demat Scheme Master | Col 12 `MASTER_DOWNLOAD(SCH)`| `parseFloat()` | Master file date | `null` |
| **Expense Ratio**| Regular Scheme Factsheet | Regular TER % | Numeric percentage | `expenseRatioAsOfDate` | `null` |
| **Rating** | CRISIL / Value Research | Rating feed | Integer (1 to 5) | `ratingAsOfDate` | `null` |
| **Fund Manager**| AMC Statutory Filing / SID | Factsheet | Trimmed string | `fundManagerAsOfDate` | `null` |
| **Benchmark** | Scheme Information Document | SID filing | Trimmed string | SID date | `null` |
| **Exit Load** | NSE Master / SID | Col 39 `MASTER_DOWNLOAD(SCH)`| Textual rule string | Master file date | `null` |
| **Holdings** | AMC Monthly Disclosure | SEBI mandated disclosure | Array of `{ name, weight, sector }` | `holdingsAsOfDate` | `[]` |

---

## 3. Data Flow Architecture

```text
[Authoritative Source (AMFI / NSE Webfile / AMC SID)]
                         │
                         ▼
             [Raw Response Validation]
       (HTTP 200, Content-Type, Non-empty body)
                         │
                         ▼
                  [Stream Parser]
           (Field splitting & normalization)
                         │
                         ▼
             [Strict Plan Classification]
     (D = DIRECT, R = REGULAR, Blank = REGULAR, Else = UNKNOWN)
                         │
                         ▼
             [Regular-Plan Only Filter]
      (Direct & Unknown discarded from customer catalog)
                         │
                         ▼
            [Financial Value Validation]
   (Rejects NaN, negative NAVs, invalid dates, malformed data)
                         │
                         ▼
               [MongoDB Atlas Storage]
 (Updates scheme with navSource, navDate, navUpdatedAt, lineage)
                         │
                         ▼
             [VikaOne Backend Service]
  (Dynamic Returns Engine calculates 1M, 3M, 6M, 1Y, 3Y, 5Y)
                         │
                         ▼
                [Customer REST API]
 (Exposes validated Regular data with structured returns & lineage)
                         │
                         ▼
                [Flutter Data Model]
     (MfSchemeModel parses null-safely without defaults)
                         │
                         ▼
                 [Flutter UI Screen]
  (Shows real metrics, high-def charts, or clean unavailable '—')
```

---

## 4. Database Audit Results

Audit script executed on MongoDB Atlas production cluster:
```bash
node scripts/audit_phase2.js
```

### Actual Results:
| Metric | Value | Status |
|---|---|---|
| **Total Schemes in DB** | 1,864 | Clean Regular Catalog |
| **Regular Plan Schemes** | 1,864 | 100% Regular |
| **Direct Plan Schemes** | 0 | Zero Direct exposed |
| **Unknown Plan Schemes** | 0 | Zero Unknown exposed |
| **Scheme Names Containing "direct"** | 0 | Verified Clean |
| **Valid Positive NAV Count** | 1,864 | 100% Valid NAVs |
| **Negative NAV Count** | 0 | Passed |
| **Null NAV Count** | 0 | Passed |
| **Suspicious Ratings (5, 4.8, 4.5)** | 0 | Passed |
| **Hardcoded AUM Defaults (₹5,000 Cr)** | 0 | Passed |
| **Hardcoded Min SIP Defaults (₹500, ₹1,000)** | 0 | Passed |
| **Hardcoded Min Purchase Defaults (₹1,000, ₹5,000)** | 0 | Passed |
| **Hardcoded Expense Ratio Defaults (0.85%)** | 0 | Passed |
| **Pending Orders with Non-Zero Units** | 0 | Units = 0 until allotment |
| **Synthetic / Fake Order IDs** | 0 | Real exchange IDs only |

---

## 5. Automated Test Results

### Phase 2 Implementation Test Suite
```bash
node --test test/phase2_implementation.test.js
```
- **Total Tests**: 15
- **Passed**: 15
- **Failed**: 0
- **Skipped**: 0
- **Duration**: ~3.5s

### Phase 1 Remediation & Anti-Regression Test Suite
```bash
node --test test/phase1_remediation.test.js
```
- **Total Tests**: 17
- **Passed**: 17
- **Failed**: 0
- **Skipped**: 0
- **Duration**: ~3.6s

**Combined Test Results: 32 tests executed, 32 passed, 0 failed.**

---

## 6. Flutter Analysis Results

```bash
flutter analyze lib/modules/mutual_funds lib/data/models/mf_scheme_model.dart
```
- **Errors**: 0
- **Warnings**: 0
- **Informational Lints**: 160 (deprecated withOpacity $\rightarrow$ withValues lints and super parameter suggestions across existing codebase)
- **Status**: **PASS (0 errors, 0 warnings)**

---

## 7. Production Source Status

> **CODE-INTEGRATED BUT NOT LIVE-VERIFIED**

### Rationale:
- The NSE MFSS API integration client, Master Webfile download handlers (`SCH`, `NAV`, `SIP`), and encryption pipelines are fully code-integrated.
- Direct synchronization with the live NSE production gateway (`POST /nsemfdesk/api/v2/reports/MASTER_DOWNLOAD`) yields HTTP 403 with message:
  `"Invalid authorization header or IP Address not mapped with user."`
- In strict adherence to Section 15 of the prompt:
  *Production NSE connectivity requires static IP whitelisting with the exchange.*
  *The system does not bypass security controls, mock live exchange responses, or falsely claim live exchange synchronization.*
- AMFI official historical NAV feeds are verified live and operating accurately.

---

## 8. Known Limitations

1. **Exchange IP Whitelisting Prerequisite**: Live daily NSE Master automated synchronization requires deployment on an authorized static server IP whitelisted by NSE India.
2. **Third-Party Ratings & Portfolios**: Ratings and granular equity holding percentages require commercial API licenses (e.g. Morningstar or CRISIL feed) or monthly AMC factsheet scraping. Because fake data is strictly prohibited, schemes without authorized feeds cleanly display `null` / `—`.
3. **New Fund Offers (NFO)**: NFO schemes have zero historical NAVs and zero AUM. They correctly display `—` for historical returns, ratings, and expense ratios.

---

## 9. Phase 3 Candidates (Future Work Only)

The following areas are candidate roadmap items for Phase 3 and have **NOT** been implemented in Phase 2:
1. Automated monthly AMC portfolio holdings parser from SEBI mandatory disclosure sheets.
2. Direct SIP auto-debit bank mandate reconciliation webhook handlers.
3. User portfolio capital gains tax reporting engine (STCG/LTCG computed on actual redemptions).
4. Automated AMFI daily NAV sync cron job running at 21:30 IST.
