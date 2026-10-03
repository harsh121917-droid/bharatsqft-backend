# VikaOne Mutual Fund — Official Source of Truth

**Document Version:** 1.0  
**Effective Date:** October 3, 2026  
**Scope:** VikaOne Mutual Fund Platform Backend (`bharatsqft-backend`) & Frontend (`GoldVikaone`)

---

## 1. Regulatory & Architecture Philosophy

VikaOne operates strictly as a broker/distributor investment platform under SEBI and AMFI regulatory frameworks. The platform mandates that customer wealth portfolios and public catalogues display **only authentic, traceable, and current Regular Plan mutual funds**. 

Under no circumstances does VikaOne fabricate, estimate, copy unsupported values from peers, mix Direct and Regular plans, or substitute synthetic defaults (e.g. arbitrary ₹500 or ₹1,000 minimums, guessed 3-star ratings, or fabricated manager names).

---

## 2. Official Source Hierarchy

### Tier 1 — AMFI & Exchange Infrastructure
* **AMFI Daily NAV Feed:** Primary source for current daily NAV, daily price change, and historical NAV timeseries (`https://www.amfiindia.com/net-asset-value/nav-history`).
* **AMFI Total Expense Ratio (TER) Portal:** Statutory daily disclosures for Regular Plan Total Expense Ratios.
* **AMFI Riskometer Portal:** Official scheme risk ratings (Low to Very High) updated monthly.
* **NSE Mutual Fund Settlement Service (MFSS):** Order routing, client UCC registration, mandate authentication, and order status reconciliation. NSE infrastructure is used exclusively for order lifecycle execution, never as an unverified factsheet source.

### Tier 2 — Official AMC / SEBI-Filed Disclosures
Official statutory filings published by Asset Management Companies:
* **Scheme Information Document (SID) & Key Information Memorandum (KIM):**
  - Statutory benchmark index.
  - Exit load structure and lock-in period.
  - Investment objective and asset allocation guidelines.
  - Minimum initial purchase and minimum additional purchase amounts.
  - Official Systematic Investment Plan (SIP) rules, frequencies, dates, and minimum installment amounts.
* **Monthly Factsheets:**
  - Scheme-level Assets Under Management (AUM in ₹ Crores).
  - Fund manager designations, qualifications, tenures, and co-managers.
  - Month-end portfolio holdings and asset allocation percentages.
* **Monthly Portfolio Disclosures (SEBI Mandated):**
  - Complete security-level portfolio disclosures including ISIN, company name, asset class/sector, and exact percentage weight.

### Tier 3 — Contracted & Licensed Third-Party Providers
Proprietary ratings, qualitative research metrics, or third-party star ratings:
* **Contract Requirement:** Only ingested and displayed when VikaOne possesses an active, legally executed commercial data license (e.g., CRISIL, Morningstar, Value Research).
* **Strict Default:** In the absence of an authorized provider, rating fields remain strictly `null`:
  ```json
  "rating": null,
  "ratingProvider": null,
  "ratingStatus": "SOURCE_NOT_AUTHORIZED"
  ```
* **Anti-Fabrication:** VikaOne never converts riskometer levels into ratings, nor does it scrape unauthorized consumer websites.

---

## 3. Field-Level Source Mapping

| Field Name | Authoritative Source | Verification Mechanism | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| `nav`, `navDate` | AMFI Daily NAV Feed | AMFI scheme code & date match | Last known NAV retained; marked `STALE` if $> 5$ days |
| `return1M`, `3M`, `6M` | Point-to-Point Simple Absolute | `services/mfReturnEngine.js` calendar lookup | `null` if history $< \text{period}$ |
| `cagr1Y`, `3Y`, `5Y` | Multi-Year Annualized CAGR | `services/mfReturnEngine.js` calendar anniversary | `null` if history $< \text{period}$ |
| `returns.All` | Series Inception CAGR | `services/mfReturnEngine.js` earliest daily NAV | Explicitly labeled as available history start |
| `aum`, `aumAsOfDate` | Official AMC Monthly Factsheet | Factsheet extraction + checksum | `null` |
| `expenseRatio` | AMC Statutory TER Disclosure | Regular Plan TER disclosure | `null` |
| `fundManager` | AMC SID / Factsheet | Official disclosure parsing | `null` |
| `benchmark` | AMC SID Statutory Filing | Exact benchmark named in SID | `null` |
| `exitLoad` | AMC SID Statutory Filing | Exact exit load text | `null` |
| `riskometer` | AMFI / AMC Factsheet | Official monthly riskometer | `null` |
| `investmentObjective`| AMC SID Statutory Filing | Exact investment objective text | `null` |
| `minPurchaseAmount` | AMC SID Ingestion Rules | Exact SID purchase threshold | `null` (No ₹500 default) |
| `minSipAmount` | AMC SID SIP Rules | Exact SID SIP threshold | `null` (No ₹500 default) |
| `holdings` | SEBI Monthly Portfolio Disclosure | Monthly portfolio disclosure sheet | `null` (`portfolioStatus: SOURCE_UNAVAILABLE`) |
| `rating` | Contracted Licensed Provider | Data licensing agreement | Strictly `null` (`SOURCE_NOT_AUTHORIZED`) |

---

## 4. Exact Scheme Identity Resolution

VikaOne prohibits matching mutual fund schemes solely by title or keyword. Ingestion strictly verifies:
1. **AMFI Scheme Code:** 6-digit canonical code.
2. **ISIN:** Verified against NSDL/CDSL master for Regular Growth shares.
3. **AMC Code:** Verified against `AMC_REGISTRY`.
4. **Plan Isolation:** Must be strictly `REGULAR`. Any presence of "DIRECT" immediately aborts ingestion with `IDENTITY_AMBIGUOUS`.
5. **Option Isolation:** Must be strictly `GROWTH`. IDCW payout and reinvestment are segregated into distinct options.

---

## 5. Non-Destructive Ingestion & Stale Protection

* **Transient Failures:** Network timeouts, HTTP 5xx errors, or AMFI feed interruptions never overwrite existing valid database records. The system retains the last known verified data and logs `status: LIVE_FETCH_FAILED`.
* **Schema Shifts:** If an AMC alters spreadsheet layouts or PDF table headers, ingestion stops immediately with `status: SOURCE_CHANGED`, preventing partial or corrupted data from entering production.
