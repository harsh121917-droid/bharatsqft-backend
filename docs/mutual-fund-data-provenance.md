# VikaOne Mutual Fund — Data Provenance & Lineage Framework

**Document Version:** 1.0  
**Effective Date:** October 3, 2026  
**Scope:** Data Integrity, Auditability, and Verification Lifecycle

---

## 1. Provenance Schema Architecture

Every populated intelligence and financial field in VikaOne exposes complete audit lineage metadata:

```json
{
  "value": 14475.25,
  "sourceType": "AMC_OFFICIAL_FACTSHEET",
  "sourceName": "Invesco Mutual Fund Monthly Factsheet",
  "sourceDocument": "Invesco_India_Smallcap_Fund_Factsheet_Sep_2026.pdf",
  "sourceSchemeCode": "145139",
  "isin": "INF205K011T7",
  "asOfDate": "2026-09-30T00:00:00.000Z",
  "fetchedAt": "2026-09-30T10:00:00.000Z",
  "verifiedAt": "2026-10-03T14:35:27.207Z",
  "parserVersion": "invesco_v1",
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "LIVE_VERIFIED"
}
```

---

## 2. Return Engine Provenance Contract

Every calculated trailing return exposes its exact reproducible components:

```json
"provenance": {
  "3Y": {
    "period": "3Y",
    "targetDate": "2023-10-01",
    "targetStartDate": "2023-10-01",
    "selectedNavDate": "2023-09-29",
    "selectedStartDate": "2023-09-29",
    "startNAV": 25.32,
    "selectedStartNav": 25.32,
    "endDate": "2026-10-01",
    "endNav": 45.69,
    "endNAV": 45.69,
    "elapsedDays": 1098,
    "elapsedYears": 3,
    "formula": "((endNav / startNav) ^ (1 / elapsedYears) - 1) * 100",
    "methodology": "CAGR",
    "calculatedReturn": 21.61,
    "matchType": "PRECEDING_TRADING_DAY",
    "status": "VERIFIED",
    "source": "AMFI_DAILY_NAV_TIMESERIES",
    "sourceSchemeCode": "145139",
    "planType": "REGULAR",
    "option": "GROWTH"
  }
}
```

---

## 3. Verification Status Hierarchy

To maintain complete audit integrity without falsely conflating testing stages:

| Verification Level | Scope & Definition | Criteria Required |
| :--- | :--- | :--- |
| **CODE_VERIFIED** | Unit & engine math logic | Unit tests pass mock series calculations in memory |
| **DATABASE_VERIFIED** | Persistence & schema integrity | Records exist in MongoDB collection with clean types |
| **SOURCE_VERIFIED** | Official document traceability | Scheme mapped to verified AMC SID / Factsheet document |
| **LIVE_FETCH_VERIFIED** | Real network API response | Actual HTTP/HTTPS request succeeds from official domain |
| **PRODUCTION_VERIFIED** | End-to-end customer readiness | All 15 acceptance criteria demonstrated with live data |

---

## 4. Freshness Policies & Staleness Thresholds

| Data Category | Freshness Cadence | Stale Threshold | Stale Behavior |
| :--- | :--- | :--- | :--- |
| **Daily NAV** | Daily on market days (by 23:00 IST) | $> 5$ business days | Mark `STALE`; preserve last NAV; display date |
| **Trailing Returns** | Daily upon NAV update | $> 5$ business days | Mark `STALE`; preserve last snapshot |
| **AUM & TER** | Monthly / Event-driven | $> 45$ days | Mark `STALE`; do not overwrite with null |
| **Holdings** | Monthly (by 10th of following month)| $> 45$ days | Mark `STALE`; do not clear holdings |
| **Riskometer** | Monthly | $> 45$ days | Mark `STALE` |
| **SIP / Purchase Rules** | Annual / SID addenda | On official addenda | Retain existing SID rules |
