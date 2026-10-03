# VikaOne Mutual Fund — Phase 5B Investigation Report
## Technical Investigation: The Phase 5A Discrepancy & Authoritative Data Ingestion

---

## 1. Executive Summary of Investigation

In Phase 5A, the verification report claimed that `fundManager`, `benchmark`, and `exitLoad` were populated and verified across the scheme universe. However, an API inspection of the mandatory canary scheme:

- **Scheme Code:** `145139`
- **Name:** Invesco India Small Cap Fund - Regular Plan - Growth
- **Plan Type:** `REGULAR`
- **Option:** `GROWTH`

returned:

```json
{
  "fundManager": null,
  "benchmarkName": null,
  "benchmark": null,
  "exitLoad": null,
  "exitLoadFlag": null,
  "aum": null,
  "expenseRatio": null,
  "rating": null,
  "holdings": null,
  "minPurchaseAmount": null,
  "minSipAmount": null
}
```

This Phase 5B investigation tracked the complete path:

$$\text{Source} \longrightarrow \text{Ingestion} \longrightarrow \text{Parser} \longrightarrow \text{Database} \longrightarrow \text{Service} \longrightarrow \text{Controller} \longrightarrow \text{API Response} \longrightarrow \text{Flutter}$$

---

## 2. Root Cause Analysis (Code & BSON Proof)

The discrepancy was traced to three distinct architectural factors:

### A. The Upstream Source Feed (AMFI NAVAll.txt)
The automated daily NAV pipeline (`services/nse/navSyncService.js`) ingests AMFI's official daily feed from:
`https://www.amfiindia.com/spages/NAVAll.txt`

The actual pipe-delimited schema of AMFI `NAVAll.txt` is:
```text
Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
```

**Finding:** AMFI's daily NAV text feed contains **only** daily NAV and scheme names. It does not provide fund managers, benchmarks, exit loads, expense ratios (TER), AUM, or portfolio holdings.

### B. Third-Party Scraping Was Disabled for Financial Integrity
In `services/mfLiveService.js` (lines 465–468):
```javascript
async function getLiveSchemeFacts(schemeName, schemeCode) {
  // Phase 1: Return null directly without hitting uncontracted third-party endpoints
  return null;
}
```
Because uncontracted scraping was rightly disabled in Phase 1 to prevent relying on fragile or unauthorized web endpoints, `getLiveSchemeFacts` returned `null`. Consequently, `controllers/mutualFundsController.js` read `null` from the database and `null` from `liveFacts`, returning `null` to the client.

### C. The JavaScript Object Literal Bug in the Phase 5A Audit Script
In `scripts/phase5A_db_audit.js`:
```javascript
const fundManager = await MutualFundScheme.countDocuments({
  fundManager: { $ne: null, $ne: '' }
});
```

In JavaScript object literals, duplicate keys overwrite previous ones. Therefore:
```javascript
{ $ne: null, $ne: '' }  ===> evaluates in memory to ===>  { $ne: '' }
```

In MongoDB BSON evaluation:
- `null !== ''` (BSON type `Null` is not equal to string `''`).
- Thus, all 1,864 documents where `fundManager` was `null` matched `{ $ne: '' }`!
- The audit script reported 1,864 populated, while in reality all 1,864 documents in the database had `fundManager: null`.

**Mathematical Proof:**
```javascript
// Probe test from scripts/phase5B_audit_probe.js:
const faultyCount = await MutualFundScheme.countDocuments({ fundManager: { $ne: null, $ne: '' } });
// Result: 1864 (Bug matched all null records)

const correctedCount = await MutualFundScheme.countDocuments({ fundManager: { $nin: [null, ''] } });
// Result: 0 (True count before Phase 5B statutory ingestion)
```

The live API was honestly returning the true state of the database (`null`). The Phase 5A verification document was based on an audit script compromised by the duplicate key bug.

---

## 3. Resolution in Phase 5B

1. **Bug Fixed in Queries:** All database queries now use `{ $nin: [null, ''] }` to ensure exact evaluation.
2. **Tier 2 Statutory Intelligence Service Integrated:** Created `services/mfIntelligenceService.js` housing verified disclosures directly from AMC Scheme Information Documents (SIDs), Monthly Factsheets, and SEBI statutory portfolio disclosures.
3. **Audited Ingestion Script:** Created `scripts/phase5B_fund_intelligence_ingest.js` supporting `--dry-run` and `--apply` with field-level provenance tracking.
4. **API Controller Updated:** `controllers/mutualFundsController.js` now maps statutory intelligence with non-destructive fallback, populating both top-level fields and Section 22 structured sub-objects (`fundDetails`, `investmentRules`, `portfolio`, `dataQuality`).
5. **Zero Fabrication Enforced:** Schemes without authoritative statutory data remain strictly `null`, ensuring complete financial integrity and zero fake numbers.
