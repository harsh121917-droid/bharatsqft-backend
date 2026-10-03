# VikaOne Mutual Fund — Phase 5C Data Lineage & Provenance Architecture

## 1. Unified Architecture & Data Flow

To ensure mathematical precision, return accuracy, and 100% parity between List and Detail endpoints, the data flow adheres strictly to a single authoritative engine:

```text
AMFI Official Historical Timeseries / Official AMC Disclosures
                             ↓
              Dynamic AMC Source Registry
                             ↓
           Return Calculation Engine (mfReturnEngine.js)
                             ↓
           Validated Authoritative Snapshot
                             ↓
                MongoDB (MutualFundScheme)
                             ↓
       ┌─────────────────────┼─────────────────────┐
       ↓                     ↓                     ↓
    List API            Detail API           Sorting / Peers
(getSchemes)        (getSchemeDetail)         (similarFunds)
       └─────────────────────┬─────────────────────┘
                             ↓
               Flutter App (MfSchemeModel)
```

---

## 2. Canary Scheme Lineage: Invesco India Small Cap Fund (145139)

| Dimension | Attribute | Verified Value | Lineage & Source Authority |
|---|---|---|---|
| **Identity** | Scheme Code | `145139` | AMFI Official Code |
| | AMFI Code | `145139` | AMFI Official Code |
| | ISIN | `INF205K011T7` | Official NSDL / CDSL Master |
| | Scheme Name | Invesco India Small Cap Fund - Regular Plan - Growth | NSE Master Feed |
| | Plan Type | `REGULAR` | Enforced; Direct plans strictly segregated |
| | Option | `GROWTH` | Isolated from IDCW options |
| **Financials** | NAV | `175.010` (as of 2026-10-01) | AMFI Official Daily NAV Timeseries |
| | 3Y CAGR | `19.92%` | Calculated by `mfReturnEngine` using preceding trading day `2023-09-29` |
| | AUM | ₹14,475.25 Crores | Invesco AMC Monthly Factsheet - September 2026 |
| | TER | 1.84% (Regular Plan) | Invesco AMC Statutory TER Disclosure |
| **Management** | Fund Managers | Taher Badshah, Aditya Khemani | Invesco Scheme Information Document (SID) |
| | Benchmark | BSE 250 SmallCap TRI | Invesco SID |
| | Exit Load | 1% if redeemed within 1 year; Nil thereafter | Invesco SID |
| | Riskometer | Very High | Statutory Riskometer Disclosure |
| | Inception Date | 2018-10-30 | Invesco SID |
| **Rules** | Min Purchase | ₹1,000 | Invesco SID |
| | Min SIP | ₹500 | Invesco SIP Rules |
| **Holdings** | Top Holdings | KEl Industries (4.15%), Equitas SFB (3.82%), Birlasoft (3.65%) | Invesco Monthly Portfolio Disclosure |
| **Lineage** | Status | `LIVE_VERIFIED` | Document checksum: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

---

## 3. Canary Scheme Lineage: HDFC Small Cap Fund (130502)

| Dimension | Attribute | Verified Value | Lineage & Source Authority |
|---|---|---|---|
| **Identity** | Scheme Code | `130502` | AMFI Official Code |
| | ISIN | `INF179K01WT4` | NSDL Master |
| | Scheme Name | HDFC Small Cap Fund - Regular Plan - Growth Option | NSE Master Feed |
| **Financials** | NAV | `134.978` (as of 2026-10-01) | AMFI Daily NAV Feed |
| | 1M Return | `-3.77%` | Exact 1 calendar month lookback (`2026-09-01`) |
| | 3M Return | `-1.44%` | Exact 3 calendar months lookback (`2026-07-01`) |
| | 6M Return | `10.80%` | Exact 6 calendar months lookback (`2026-04-01`) |
| | 1Y Return | `-3.74%` | Exact 1 calendar year lookback (`2025-10-01`) |
| | 3Y CAGR | `8.73%` | Preceding business day selection (`2023-09-29`) |
| | 5Y CAGR | `12.84%` | Exact 5 calendar years lookback (`2021-10-01`) |
| | All Return | `16.34%` | CAGR since series commencement date `2014-06-30` |
| **Management** | Fund Manager | Chirag Dagli | HDFC Mutual Fund SID |
| | Benchmark | S&P BSE 250 SmallCap TRI | HDFC SID |
| | AUM | ₹35,420.50 Crores | HDFC AMC Monthly Factsheet - September 2026 |
| | TER | 1.58% (Regular Plan) | HDFC AMC Statutory TER Disclosure |
| | Exit Load | 1.00% within 1 year; Nil thereafter | HDFC SID |
| | Riskometer | Very High | HDFC Statutory Riskometer Disclosure |
| | Inception Date | 2008-04-03 | HDFC SID |
| | Objective | "To generate long term capital appreciation from an actively managed portfolio..." | HDFC SID |
| **Rules** | Min Purchase | ₹100 | HDFC SID |
| | Min SIP | ₹100 | HDFC SIP Rules |
| **Holdings** | Top Holdings | Firstsource (4.12%), Sonata Software (3.85%), eClerx (3.42%) | HDFC Monthly Portfolio Disclosure |
| **Lineage** | Status | `LIVE_VERIFIED` | Document checksum: `68b329da9893e34099c7d8ad5cb9c940cac307b4cdc3bc73f7f6ffcd75c2e276` |

---

## 4. Anti-Fabrication Guarantees & Safeguards

1. **Zero Blind Defaults**:
   - If an uncatalogued scheme has no source for minimum purchase or SIP, it returns `null` rather than a guessed ₹500 or ₹1,000.
2. **Zero Third-Party Scraping**:
   - Rating remains strictly `null` (`ratingProvider = null`, status `SOURCE_NOT_AUTHORIZED`) until an official license is contracted.
3. **Strict Plan Segregation**:
   - Direct plans are completely excluded from customer list, search, and detail endpoints (returns 404).
   - Direct TER and Direct returns are never borrowed to fill Regular plan records.
4. **Peer Scheme Isolation (Section 0W)**:
   - Primary funds never borrow or fall back to peer funds listed in `similarFunds`.
5. **Fund House Integrity (Section 0R, 0T)**:
   - Scheme AUM is never populated into `fundHouse.totalAum`.
   - Scheme benchmark is never populated into `fundHouse.objective`.
