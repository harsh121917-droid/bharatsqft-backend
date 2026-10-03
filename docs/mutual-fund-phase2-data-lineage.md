# VikaOne Mutual Fund — Phase 2 Data Lineage Specification

## 1. Overview & Core Governing Principles

This document defines the verified source-of-truth and data lineage for every financial and scheme attribute in the VikaOne Mutual Fund module.

### Governing Rules:
1. **Regular Plans Only**: VikaOne exclusively exposes and computes metrics for **REGULAR mutual fund plans**. Direct plans are strictly excluded from catalog ingestion, customer APIs, and Flutter UI.
2. **Zero Fabricated Financial Data**: If an authoritative source does not provide a verified metric, it is strictly stored and returned as `null`, rendering as `—` or a clean unavailable state in the UI.
3. **No Synthetic Fallbacks**: Direct plan data is never copied, borrowed, or approximated into Regular scheme records.
4. **Timestamp Traceability**: `asOfDate` (when the source publisher generated the value) is maintained separately from `updatedAt` (when VikaOne synced or processed the record).

---

## 2. Authoritative Field Lineage Matrix

| Field | Source System / Provider | Source Endpoint / File | Source Field / Column | Transformation & Calculation Methodology | Update Frequency | As-of Date Lineage | Fallback Behavior | Validation Rules |
|---|---|---|---|---|---|---|---|---|
| **Current NAV** | AMFI Daily NAV Feed / NSE Master Download | `portal.amfiindia.com/spages/NAVAll.txt` & NSE `MASTER_DOWNLOAD` (`file_type=NAV`) | AMFI Col 5 / NSE Col 7 (`NAV`) | Parsed via `parseFloat()`. Cleaned of currency symbols and commas. | Daily (every trading day post 21:00 IST) | `navDate` extracted directly from source feed. | `null` | Must be numeric, positive (>0), and finite. NaN and $\le 0$ rejected. |
| **Historical NAV Series** | AMFI Official Archive Feed via verified AMFI Regular Scheme Code | `api.mfapi.in/mf/{regularAmfiCode}` | `data: [{ date, nav }]` | Chronological sort (oldest $\rightarrow$ newest). Standardized date format `YYYY-MM-DD`. Bounded sampling (max 30-180 points) per timeframe. | Daily (end of day) | Extracted point-by-point (`date`) from official record. | `null` / `[]` (UI renders "NAV chart data unavailable for this timeframe") | Strict verification that `schemeName` contains Regular/Growth and does NOT contain Direct/IDCW. |
| **1M Return** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 30\text{d}$ | SEBI Absolute Simple Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 30\text{d}$ or points missing) | Must be finite number. Missing points yield `null`. |
| **3M Return** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 91\text{d}$ | SEBI Absolute Simple Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 91\text{d}$) | Must be finite number. Missing points yield `null`. |
| **6M Return** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 182\text{d}$ | SEBI Absolute Simple Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 182\text{d}$) | Must be finite number. Missing points yield `null`. |
| **1Y Return** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 365\text{d}$ | SEBI Absolute Simple Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 365\text{d}$) | Must be finite number. Missing points yield `null`. |
| **3Y CAGR** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 1095\text{d}$ | SEBI Annualised CAGR: $\left(\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{3.0}} - 1\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 3\text{Y}$) | Must be finite number. Zero or negative NAV rejected. |
| **5Y CAGR** | VikaOne Dynamic Returns Engine (AMFI History) | Computed from AMFI Historical Series | NAV series at $t_{\text{end}}$ and $t_{\text{start}} \approx 1826\text{d}$ | SEBI Annualised CAGR: $\left(\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{5.0}} - 1\right) \times 100$. Closest trading point $\le 7\text{d}$ tolerance. | Computed on demand / daily cache | Latest NAV date | `null` (if series $< 5\text{Y}$) | Must be finite number. Zero or negative NAV rejected. |
| **AUM / Fund Size** | AMC Factsheet / NSE Master Feed | NSE `MASTER_DOWNLOAD` (`file_type=SCH`) or verified AMC feed | Col 32 / `AUM_INR_CR` | Parsed as numeric Crores ($\text{INR}$). | Monthly (post 10th of each month) | `aumAsOfDate` (last calendar day of previous month) | `null` (UI shows `—`) | Negative or non-numeric rejected. Never defaulted to ₹5,000 Cr. |
| **Minimum SIP** | NSE SIP Master File | NSE `MASTER_DOWNLOAD` (`file_type=SIP`) | Col 6 (`MIN_INSTALLMENT_AMT`) & Col 7 (`MAX_INSTALLMENT_AMT`) | Parsed via `parseFloat()`. | Daily / on Master refresh | As of master file timestamp | `null` | Reject if $< 0$. Never defaulted to ₹500 or ₹1,000. |
| **Minimum Purchase** | NSE Demat Scheme Master | NSE `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 12 (`MINIMUM_PURCHASE_AMOUNT`) | Parsed via `parseFloat()`. | Daily / on Master refresh | As of master file timestamp | `null` | Reject if $< 0$. Never defaulted to ₹1,000 or ₹5,000. |
| **Expense Ratio** | AMC Monthly Disclosure / Factsheet | Verified Regular Plan Factsheet / Feed | Regular Plan Total Expense Ratio (TER) % | Parsed as percentage (e.g. `1.85`). Regular-specific TER only. | Monthly / Regulatory update | `expenseRatioAsOfDate` | `null` (UI shows `—`) | Never assign Direct plan TER (e.g. 0.45%) to Regular plan. |
| **Fund Rating** | CRISIL / Value Research | Verified Rating Provider Feed | Rating stars / score (1 to 5) | Parsed as integer (1 to 5). Preserves `ratingProvider` identity. | Monthly / Quarterly | `ratingAsOfDate` | `null` (UI hides rating or shows `—`) | Reject if $< 1$ or $> 5$. Never default to 5 or 4.5 stars. |
| **Fund Manager** | AMC Statutory Filing / Scheme Information Document (SID) | Verified AMC Factsheet | Manager Name, Designation, Tenure | Trimmed string. Preserves `fundManagerRole` and `tenure`. | Quarterly / on manager transition | SID / Factsheet date | `null` (UI shows `—`) | Never use generic "Fund Manager" placeholder. |
| **Benchmark** | Scheme Information Document (SID) / NSE Master | NSE `MASTER_DOWNLOAD` (`file_type=SCH`) Col 42 or SID | `BENCHMARK_INDEX_NAME` | Trimmed string representation of official index (e.g., "NIFTY 50 TRI"). | Annual / SID amendment | SID filing date | `null` | Do NOT infer benchmark from category name. |
| **Exit Load** | NSE Demat Scheme Master / SID | NSE `MASTER_DOWNLOAD` (`file_type=SCH`) | Col 39 (`EXIT_LOAD_DESCRIPTION`) | Preserved as exact textual rule string (threshold period and exit penalty %). | On SID update | Master sync date | `null` | Do not reduce nuanced exit rule into a single misleading digit. |
| **Holdings** | AMC Monthly Portfolio Disclosure (SEBI Mandated) | AMC Monthly Portfolio XML/Excel Disclosure | Security Name, ISIN, Weight %, Sector | Array of `{ name, weight, sector, asOfDate, source }`. | Monthly (by 10th of each month) | `holdingsAsOfDate` | `[]` / `null` (UI renders unavailable state) | Weights must sum $\le 100\%$. Never synthesize sample portfolio. |

---

## 3. End-to-End Pipeline Traceability

```text
[Authoritative Feed: AMFI / NSE Webfile / AMC Disclosure]
                         │
                         ▼
             [Raw Response Validation]
       (Checks HTTP 200, Content-Type, Non-empty)
                         │
                         ▼
                  [Stream Parser]
        (Extracts pipe-delimited fields or JSON)
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

## 4. Staleness & Freshness Policy

1. **NAV Freshness**: NAV updates occur once per business day after market close (typically published by AMFI between 21:00 and 23:00 IST). Records older than 3 business days are displayed with their explicit `navDate`.
2. **Returns Freshness**: Dynamically computed from the latest available daily NAV history.
3. **Master Scheme Attributes**: Refreshed via NSE `MASTER_DOWNLOAD` pipeline on a daily scheduled cadence.
4. **Failure Safety**: In the event of source downtime or exchange network restriction (e.g. IP mapping requirement), **existing valid database values are preserved intact**. Valid records are never replaced by `null` or fabricated data due to a temporary ingestion failure.
