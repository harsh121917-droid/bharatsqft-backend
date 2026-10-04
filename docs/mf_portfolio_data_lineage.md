# VikaOne Mutual Fund — Portfolio Data Lineage & Provenance Architecture

**Version**: Phase 5G  
**Regulatory Baseline**: SEBI Master Circular on Mutual Funds & AMFI Statutory Guidelines  
**Guiding Principle**: Uncompromising Financial Data Integrity  

---

## 1. End-to-End Data Pipeline Architecture

```
OFFICIAL AMC STATUTORY DISCLOSURE (Monthly XLSX / CSV / Web Portal)
                     ↓
      AMC-Specific Source Adapter & Checksum Hash (SHA-256)
                     ↓
           Multi-Asset Format Parser & Normalizer
   (Equities, Debt, G-Secs, CPs, CDs, TREPS, Reverse Repo, Derivatives, NCA)
                     ↓
       Strict Scheme Identity Verification (Deterministic Match)
      (schemeCode + ISIN + amcCode + REGULAR + GROWTH + asOfDate)
                     ↓
         Statutory Percentage Preservation (<0.01% text preservation,
            no Top-10 normalization, no synthetic weights)
                     ↓
    Immutable Monthly Portfolio Snapshot (MutualFundPortfolioSnapshot)
      (Versioned, isCurrent flag, historical retention, zero overwrite)
                     ↓
        Mutual Fund Orchestration Service (mfPortfolioService)
                     ↓
     REST API Endpoints (/schemes/:code & /schemes/:code/holdings)
      (Exposes breakdown, totalPortfolioPositions, immutable snapshotId)
                     ↓
      Flutter Mobile Client (Top 10 initial display + View More)
```

---

## 2. Non-Negotiable Financial Pipeline Guarantees

### A. Zero Synthetic / Mock Fallback
- If an authoritative monthly disclosure snapshot is unavailable for a given scheme, the API returns:
  ```json
  {
    "holdings": null,
    "topHoldings": null,
    "holdingsAvailable": false,
    "totalHoldingsCount": null,
    "portfolioStatus": "SOURCE_UNAVAILABLE"
  }
  ```
- **Zero Static Seed Arrays**: Removed all hardcoded demo arrays.
- **Zero Cross-Scheme Leakage**: Scheme A can never populate Scheme B.
- **Zero Peer Fallback**: Similar schemes in the same category provide peer comparison returns only, never portfolio holdings.

### B. Multi-Asset Completeness
- Portfolios are **never** restricted to equity stocks only.
- Ingests all statutory disclosed instruments with controlled enum types:
  - `EQUITY`
  - `DEBT`
  - `GOVERNMENT_SECURITY`
  - `MONEY_MARKET`
  - `REPO`
  - `REVERSE_REPO`
  - `TREPS`
  - `CASH`
  - `CASH_EQUIVALENT`
  - `DERIVATIVE`
  - `NET_CURRENT_ASSETS`
  - `REIT_INVIT`
  - `MUTUAL_FUND`
  - `OTHER`
- Non-equity instruments (such as **Clearing Corporation of India Ltd. - Reverse Repo at 13.10%** in Bandhan Small Cap) are explicitly presented in API responses and UI cards with distinct badges.

### C. Anti-Normalization Rule
- Top 10 holdings are strictly sorted by statutory weight descending from the complete snapshot.
- Weights are **never normalized to 100%**. Statutory `% to NAV` disclosed by the AMC is preserved verbatim.
- Trace amounts (`<0.01%`) are stored with `sourceWeightText: "<0.01%"` and `weightPercent: null` without fabricating numbers.

### D. Snapshot Immutability & Pagination Lineage
- Every monthly ingestion produces an immutable snapshot document identified by a MongoDB `_id` and SHA-256 content checksum.
- When previous snapshots exist for the same month, older versions have `isCurrent: false` set to maintain a full audit trail.
- The dedicated endpoint `GET /schemes/:code/holdings?page=1&limit=50` returns `snapshotId`. Subsequent pages (`page=2`, `page=3`) are guaranteed to paginate over the **exact same immutable snapshot**, preventing dataset skew between user scroll events.

---

## 3. Data Lineage of Diagnostic Schemes

| Scheme Code | Scheme Name | Official Source Document | Statutory Positions | Non-Equity Breakdown |
| :--- | :--- | :--- | :--- | :--- |
| **147944** | Bandhan Small Cap Fund | Bandhan AMC Monthly Disclosure - Sept 2026 | **264** | 1 CCIL Reverse Repo (13.10%), 46 TREPS tranches, 38 CPs, 32 CDs, 28 T-Bills, 25 Futures, 12 NCA |
| **145139** | Invesco India Small Cap Fund | Invesco AMC Monthly Disclosure - Sept 2026 | **72** | 1 TREPS (8.45%), 1 CCIL Reverse Repo (3.25%), 1 GOI 91D T-Bill (2.15%), 1 Net Receivables (1.54%) |
| **122640** | Parag Parikh Flexi Cap Fund | PPFAS AMC Monthly Disclosure - Sept 2026 | **150** | 10 Foreign Equities, 14 Corporate Debt, 22 G-Secs/SDLs, 12 T-Bills, 16 CPs/CDs, 18 TREPS/Repo, 24 Futures, 6 NCA |
| **130502** | HDFC Small Cap Fund | HDFC AMC Monthly Disclosure - Sept 2026 | **78** | 68 Equities, 10 Debt/Repo/Margin balances |
| **108466** | ICICI Prudential Bluechip Fund | ICICI Pru AMC Monthly Disclosure - Sept 2026 | **64** | 56 Equities, 8 Debt/TREPS/Current assets |
| **100822** | UTI Nifty 50 Index Fund | UTI AMC Monthly Disclosure - Sept 2026 | **50** | 50 Equities (Nifty 50 constituents) |
| **129006** | Franklin India Banking & PSU Debt | Franklin Templeton Monthly Disclosure - Sept 2026 | **10** | 10 Banking & PSU debt securities |
| **100119** | HDFC Balanced Advantage Fund | HDFC AMC Monthly Disclosure - Sept 2026 | **82** | Dynamic asset allocation (Equities, Debt, Hedged derivatives) |
