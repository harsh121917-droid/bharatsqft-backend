# VikaOne Mutual Fund — Production Operations Runbook

**Document Version:** 1.0  
**Effective Date:** October 3, 2026  
**Audience:** Site Reliability Engineers, Backend Developers, and Production Operations

---

## 1. Operational Overview

The VikaOne Mutual Fund platform backend serves customer mutual fund catalogues, scheme intelligence, returns analysis, and transaction integration via NSE MFSS. This runbook details operational procedures, monitoring scripts, failure handling, and rollback strategies.

---

## 2. Ingestion & Audit Tooling

Run these commands from the root backend directory (`c:\Ashahad\Porwal\New folder\bharatsqft-backend`):

### 2.1 Production Database Audit
Performs a 360-degree audit of all 1,864 schemes in MongoDB (plan distribution, option distribution, ISIN integrity, NAV freshness, return coverage, statutory facts coverage, and sample List/Detail parity):
```bash
node scripts/mutual_fund_production_audit.js
```

### 2.2 AMC Source Health & Registry Monitor
Verifies that all 15 registered Asset Management Companies have active, verified official sources with valid SHA-256 checksums:
```bash
node scripts/mutual_fund_source_health.js
```

### 2.3 Return Coverage & Classification Audit
Audits return engine coverage across all Regular Growth schemes and classifies them into `RETURN_READY`, `STALE`, `INSUFFICIENT_HISTORY`, or `SOURCE_UNAVAILABLE`:
```bash
node scripts/mutual_fund_return_coverage.js
```

### 2.4 AMC Intelligence & Statutory Coverage Matrix
Generates an AMC-by-AMC breakdown of populated statutory fields (AUM, TER, manager, benchmark, exit load, riskometer, SIP, holdings):
```bash
node scripts/mutual_fund_intelligence_coverage.js
```

### 2.5 Comprehensive List vs. Detail Universe Parity
Verifies 100% numerical parity across all eligible schemes for 1M, 3M, 6M, 1Y, 3Y, 5Y, and All returns:
```bash
node scripts/phase5C_full_universe_parity.js
```

---

## 3. Automated Test Suites

Run the production test suite across all subsystems:
```bash
# Return Engine mathematical tests
node --test test/mf_return_engine_production.test.js

# Full catalogue List/Detail parity & peer isolation
node --test test/mf_full_catalogue_parity.test.js

# Field-level source provenance & lineage
node --test test/mf_source_provenance.test.js

# Statutory intelligence completeness
node --test test/mf_intelligence_completeness.test.js

# Data freshness, stale handling & non-destructive failure
node --test test/mf_stale_data.test.js

# Exact scheme identity & conflict rejection
node --test test/mf_identity.test.js
```

---

## 4. Failure Recovery & Troubleshooting

### 4.1 AMFI Daily NAV Feed Interruption
* **Symptom:** Ingestion job receives HTTP 5xx or connection timeout from AMFI portal.
* **Mitigation:** The ingestion engine retains existing valid NAVs and sets `status: LIVE_FETCH_FAILED`. It **never** replaces valid NAVs with null or 0.
* **Resolution:** Re-run the daily NAV sync after AMFI services restore.

### 4.2 AMC Factsheet Layout or Header Shift
* **Symptom:** PDF or spreadsheet table headers differ from expected catalog schema.
* **Mitigation:** The parser detects the mismatch and marks the source as `SOURCE_CHANGED`. Ingestion aborts for the affected AMC, preventing partial or corrupted data.
* **Resolution:** Update the parser in `services/amcSourceRegistry.js` to support the new column structure, verify the cryptographic checksum, and re-run ingestion.

### 4.3 Stale Data Alerting
* **Threshold:** Any fund with `navDate` older than 5 business days evaluates as `STALE`.
* **Action:** Investigate whether the scheme underwent merger, fundamental attribute change, or closure in official AMFI circulars.

---

## 5. Security & Sensitive Information Hygiene

1. **Zero Secret Leakage:** No database passwords, NSE API passwords, or private encryption keys are committed to Git. All credentials reside strictly in `.env`.
2. **Log Sanitization:** Client UCCs, bank account numbers, PANs, and phone numbers are masked in console output and application logs.
