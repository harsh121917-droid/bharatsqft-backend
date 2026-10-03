# VikaOne Mutual Fund — Phase 5A Authoritative Data Lineage Matrix

**Document Version:** 1.0 (Phase 5A Production Fix)  
**Date:** October 2026  
**Status:** COMPLETE & AUTHORITATIVE  
**Governing Standard:** SEBI & AMFI Mutual Fund Regulations, NSE MFSS Protocol v1.9.8  

---

## 1. End-to-End Financial Field Lineage Matrix

| Field | Source System / Provider | Source Endpoint / File | Identity Mapping | Transformation & Calculation Methodology | As-of Date Lineage | Update Frequency | Fallback Behavior |
|---|---|---|---|---|---|---|---|
| **NAV** | AMFI Daily Feed / NSE Master | `https://portal.amfiindia.com/spages/NAVAll.txt` & NSE `file_type=NAV` | `schemeCode` (AMFI) / `ISIN` | `parseFloat(navStr)` (> 0, non-NaN) | `navDate` extracted from source | Daily post 21:00 IST | `null` |
| **NAV Date** | AMFI Daily Feed | `NAVAll.txt` (Last column) | `schemeCode` | ISO Date parse (`YYYY-MM-DD`) | Trade settlement date | Daily | `null` |
| **1M Return** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Simple Absolute Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Lookback: $30\text{d} \pm 7\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **3M Return** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Simple Absolute Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Lookback: $91\text{d} \pm 7\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **6M Return** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Simple Absolute Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Lookback: $182\text{d} \pm 7\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **1Y Return** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Simple Absolute Return: $\left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$. Lookback: $365\text{d} \pm 7\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **3Y CAGR** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Annualised CAGR: $\left(\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{3.0}} - 1\right) \times 100$. Lookback: $1095\text{d} \pm 10\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **5Y CAGR** | VikaOne Performance Engine | Chronological Daily NAV series (`api.mfapi.in/mf/{code}`) | Exact Scheme Code, REGULAR, GROWTH | SEBI Annualised CAGR: $\left(\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{5.0}} - 1\right) \times 100$. Lookback: $1826\text{d} \pm 10\text{d}$. | Latest published NAV date | Computed daily / cached | `null` |
| **AUM** | AMC Factsheet / NSE Master | Not provided in AMFI / NSE basic webfile | Exact Scheme Code | `parseFloat(aumInCr)` | Last day of preceding month | Monthly | `null` |
| **Min SIP** | NSE SIP Master Report | `MASTER_DOWNLOAD` (`file_type=SIP`) Col 12 | `schemeCode` + `MONTHLY` frequency | `parseFloat(col[11])` | SIP Master generation date | Daily / Master refresh | `null` |
| **Min Purchase** | NSE Demat Scheme Master | `MASTER_DOWNLOAD` (`file_type=SCH`) Col 12 | `schemeCode` (NSE) / `ISIN` | `parseFloat(col[11])` | Scheme Master generation date | Daily / Master refresh | `null` |
| **Expense Ratio**| AMC Statutory TER Disclosure | Monthly AMC TER Disclosure | Exact Scheme Code, REGULAR plan only | Parsed as numeric percentage | Regulatory filing date | Monthly | `null` |
| **Rating** | CRISIL / Value Research | Contracted Rating Provider Feed | `ISIN` / AMFI Code | Integer (1 to 5) with provider name | Rating review date | Quarterly | `null` |
| **Fund Manager** | AMC Statutory Filing (SID) | Statutory SID / Factsheet string | Exact Scheme Code | Sanitized manager name and tenure | SID amendment date | Quarterly / on transition | `null` |
| **Benchmark** | Statutory SID / NSE SCH | Statutory SID / Col 42 | Exact Scheme Code | Trimmed benchmark index name | SID filing date | Annual | `null` |
| **Exit Load** | NSE Demat Scheme Master | `file_type=SCH` Col 39 | Exact Scheme Code | Preserved exact regulatory text | Scheme Master date | On SID update | `null` |
| **Holdings** | AMC Monthly Portfolio Disclosure | SEBI Mandated Portfolio XML/Excel | `ISIN` / AMFI Code | Array of `{ name, weight, sector, asOfDate }` | Last day of preceding month | Monthly | `null` |

---

## 2. Calculation Engine Methodology & Lookback Rules

### 2.1 Point-to-Point Simple Absolute Return ($\le 1$ Year)
Per SEBI circular on mutual fund performance reporting, returns for periods of one year or less are expressed as absolute simple returns:
$$\text{Return } \% = \left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$$
Where:
- $\text{NAV}_{\text{end}}$ is the latest available published trading NAV.
- $\text{NAV}_{\text{start}}$ is the published trading NAV nearest to $t_{\text{end}} - \text{daysBack}$.
- Weekend/holiday tolerance: searches backwards/forwards up to $\mathbf{7\text{ calendar days}}$ from the exact historical cutoff to identify the closest active trading session.
- If the fund was incepted after the target cutoff date, the engine returns `null` with `insufficientData: true`.

### 2.2 Annualised Compound Annual Growth Rate ($> 1$ Year)
Per SEBI standards, returns for multi-year periods ($3\text{Y}$, $5\text{Y}$) must be compounded annually:
$$\text{CAGR } \% = \left(\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{\text{years}}} - 1\right) \times 100$$
Where:
- $\text{years} = 3.0$ for 3-Year CAGR ($\approx 1095\text{ days}$).
- $\text{years} = 5.0$ for 5-Year CAGR ($\approx 1826\text{ days}$).
- Weekend/holiday tolerance: $\mathbf{10\text{ calendar days}}$.
- If the fund was incepted less than $3\text{ years}$ or $5\text{ years}$ ago, the CAGR is strictly `null`. It is **never** approximated using shorter-term performance or category benchmarks.

---

## 3. Strict Identity & Isolation Rules

1. **Regular Plan Isolation:**
   - Every scheme record in VikaOne has `planType: 'REGULAR'`.
   - Ingestion filters discard any record containing `"Direct"` in name or code.
   - External timeseries feeds check `meta.scheme_name` to reject Direct plan feeds.
2. **Growth Option Isolation:**
   - All 1,864 active customer schemes are `option: 'GROWTH'` and `dividendType: 'NONE'`.
   - IDCW payout and reinvestment records are segregated and never mixed with Growth NAVs.
3. **No Cross-Plan or Category Copying:**
   - Direct plan metrics are NEVER copied into Regular plans.
   - Category average returns are NEVER presented as individual fund returns.
