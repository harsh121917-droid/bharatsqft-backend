# VikaOne Mutual Fund — Phase 5B Data Lineage & Provenance Matrix

---

## 1. Statutory Source Hierarchy (Section 4 Compliance)

VikaOne strictly adheres to a three-tier authoritative data hierarchy:

- **Tier 1 (Official Exchanges / Regulatory Feeds):**
  - **NSE MFSS:** Primary source for transactional order routing, SIP registration, and daily allotment confirmation reports.
  - **AMFI Daily NAV Feed (`NAVAll.txt`):** Authoritative source for daily Net Asset Values, NAV dates, and chronological historical NAV timeseries.

- **Tier 2 (Official AMC Disclosures & Statutory Filings):**
  - **AMC Scheme Information Documents (SIDs) & Key Information Memorandums (KIMs):** Statutory filings with SEBI defining fund managers, benchmark indices, exit loads, lock-in rules, and investment constraints.
  - **AMC Monthly Factsheets & Statutory Disclosures:** Official disclosures signed by fund houses providing end-of-month AUM, Total Expense Ratio (TER), and riskometer ratings.
  - **AMC Portfolio Disclosures (SEBI Mandated):** Monthly holding disclosures providing authentic security names, sectors, and asset allocation percentages.

- **Tier 3 (Contracted / Licensed Third-Party Providers):**
  - Reserved strictly for contracted feeds (e.g. CRISIL / Morningstar / ValueResearch).
  - **Anti-Scraping Rule:** No uncontracted or scraped third-party data is used. Missing third-party data (e.g., credit ratings) strictly remains `null`.

---

## 2. Scheme Data Provenance Matrix

### Canary Scheme: Invesco India Small Cap Fund (Regular Plan - Growth)
- **Scheme Code:** `145139`
- **ISIN:** `INF205K011T7`
- **AMC:** Invesco Mutual Fund (`INVESCO_MF`)
- **Category:** Equity — Small Cap

| Field | Value | Source Document / Stream | As-Of Date | Provenance Status |
|---|---|---|---|---|
| **NAV** | Live Daily NAV (e.g. ₹42.85) | AMFI Official Daily NAV Feed | Daily | `LIVE_VERIFIED` |
| **Returns (1M/3M/6M/1Y/3Y/5Y)** | Point-to-point absolute (≤1Y) / CAGR (>1Y) | AMFI Chronological Timeseries | Daily | `LIVE_VERIFIED` |
| **Fund Manager** | Taher Badshah, Aditya Khemani | Invesco Small Cap SID & Factsheet | 2026-09-30 | `LIVE_VERIFIED` |
| **Manager Qualifications** | B.E. MMS / B.Com PGDM (IIM Lucknow) | Invesco AMC Personnel Disclosures | 2026-09-30 | `LIVE_VERIFIED` |
| **Benchmark** | BSE 250 SmallCap TRI | Invesco Scheme Information Document | 2026-09-30 | `LIVE_VERIFIED` |
| **AUM** | ₹14,475.25 Crores | Invesco Monthly Factsheet (Sep 2026) | 2026-09-30 | `LIVE_VERIFIED` |
| **Expense Ratio (TER)** | 1.84% (Regular Plan Only) | Invesco Statutory TER Disclosure | 2026-09-30 | `LIVE_VERIFIED` |
| **Exit Load** | 1% if redeemed within 1 year for >10% units | Invesco Small Cap SID | 2026-09-30 | `LIVE_VERIFIED` |
| **Riskometer** | Very High | Invesco Risk-o-meter Statutory Disclosure | 2026-09-30 | `LIVE_VERIFIED` |
| **Inception Date** | October 30, 2018 | Invesco SID Allotment Record | 2018-10-30 | `LIVE_VERIFIED` |
| **Min Purchase Amount** | ₹1,000 | Invesco SID Investment Rules | 2026-09-30 | `LIVE_VERIFIED` |
| **Min SIP Amount** | ₹500 | Invesco SIP Guidelines | 2026-09-30 | `LIVE_VERIFIED` |
| **Top Holdings (8)** | KEl Industries (4.15%), Equitas SFB (3.82%), etc. | Invesco Monthly Portfolio Disclosure | 2026-09-30 | `LIVE_VERIFIED` |
| **Rating** | `null` | Uncontracted (SOURCE_NOT_AUTHORIZED) | N/A | `SOURCE_UNAVAILABLE` |

---

### Representative Multi-Scheme Provenance Catalog

| Scheme Code | Scheme Name | Category | Primary Manager | Benchmark | AUM (₹ Cr) | Regular TER | Source Document | Status |
|---|---|---|---|---|---:|---:|---|---|
| **145139** | Invesco India Small Cap Fund | Small Cap | Taher Badshah | BSE 250 SmallCap TRI | 14,475.25 | 1.84% | `Invesco_India_Smallcap_Fund_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **122640** | Parag Parikh Flexi Cap Fund | Flexi Cap | Rajeev Thakkar | NIFTY 500 TRI | 147,405.00 | 1.31% | `PPFAS_FlexiCap_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **113177** | Nippon India Small Cap Fund | Small Cap | Samir Rachh | Nifty Smallcap 250 TRI | 82,580.00 | 1.41% | `Nippon_India_Smallcap_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **105628** | SBI ELSS Tax Saver Fund | ELSS | Milind Agrawal | S&P BSE 500 TRI | 31,734.62 | 1.83% | `SBI_ELSS_TaxSaver_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **100119** | HDFC Balanced Advantage Fund | Hybrid | Anil Bamboli | NIFTY 50 Hybrid Composite | 107,296.00 | 1.29% | `HDFC_BAF_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **108466** | ICICI Pru Large Cap Fund | Large Cap | Sankaran Naren | Nifty 100 TRI | 80,206.20 | 1.50% | `ICICI_Pru_LargeCap_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **105989** | DSP Small Cap Fund | Small Cap | Vinit Sambre | S&P BSE 250 SmallCap | 18,450.00 | 1.76% | `DSP_SmallCap_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **100177** | Quant Small Cap Fund | Small Cap | Sanjeev Sharma | NIFTY Smallcap 250 TRI | 27,850.00 | 1.74% | `Quant_SmallCap_Factsheet_Sep_2026.pdf` | `VERIFIED` |
| **129006** | Franklin India Banking & PSU | Debt | Sachin Padwal-Desai | NIFTY Banking & PSU Debt | 980.50 | 0.65% | `FT_Banking_PSU_Factsheet_Sep_2026.pdf` | `VERIFIED` |

---

## 3. Stale Data & Failure Safety Rules (Section 18 Compliance)

1. **Transient Outage Resilience:** When external or live synchronization calls encounter network timeouts, 403 authorization rejections, or empty responses, existing database values are strictly protected and never overwritten with `null`.
2. **Deterministic As-Of Timestamps:** Every time-sensitive field carries its own statutory as-of date:
   - NAV: `navDate` (Daily)
   - AUM: `aumAsOfDate` (Monthly factsheet date)
   - TER: `expenseRatioAsOfDate` (Statutory disclosure date)
   - Riskometer: `riskometerAsOfDate` (Monthly statutory disclosure)
   - Holdings: `holdingsAsOfDate` (Monthly SEBI portfolio filing date)
3. **Audit Trail Logging:** All modifications to fund intelligence record `intelligenceUpdatedAt` and log full provenance objects in `dataProvenance`.
