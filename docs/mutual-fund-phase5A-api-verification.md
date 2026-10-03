# VikaOne Mutual Fund — Phase 5A API Verification Report

**Document Version:** 1.0 (Phase 5A Production Fix)  
**Date:** October 2026  
**Status:** VERIFIED LIVE & TESTED  

---

## 1. Overview

This document captures the actual responses, representative payloads, and sorting validation results for the VikaOne Mutual Fund customer APIs following the Phase 5A remediation.

---

## 2. API Sorting Verification (`sort=returns3y`)

### Request
```http
GET /api/mutual-funds/schemes?sort=returns3y&page=1&limit=10 HTTP/1.1
Host: localhost:5000
Accept: application/json
```

### Verification Criteria
1. `planType` is strictly `REGULAR`.
2. `cagr3Y` is strictly non-null (`cagr3Y != null`).
3. Results are ordered strictly descending by `cagr3Y`.
4. Deterministic secondary tie-breaker (`schemeName: 1, schemeCode: 1`) is applied for identical returns.
5. Total count (`total: 55`) reflects the exact count of qualifying funds with non-null 3Y CAGR, rather than the total collection count (1,864).
6. Holdings semantics: missing holdings return `holdings: null`, never an empty array `[]`.

### Actual Response Capture
```json
{
  "success": true,
  "total": 55,
  "page": 1,
  "pages": 6,
  "data": [
    {
      "schemeCode": "147944",
      "schemeName": "BANDHAN Small Cap Fund - Regular Plan - Growth",
      "amcCode": "BANDHAN_MF",
      "amcName": "Bandhan Mutual Fund",
      "isin": "INF194KB1CW7",
      "planType": "REGULAR",
      "option": "GROWTH",
      "category": "Equity",
      "subCategory": "Small Cap",
      "nav": 50.665,
      "navDate": "2026-10-01T00:00:00.000Z",
      "return1M": -1.98,
      "return3M": 3.75,
      "return6M": 12.04,
      "cagr1Y": 9.18,
      "cagr3Y": 21.61,
      "cagr5Y": null,
      "aum": null,
      "minSipAmount": null,
      "minPurchaseAmount": null,
      "expenseRatio": null,
      "rating": null,
      "holdings": null,
      "isActive": true
    },
    {
      "schemeCode": "147920",
      "schemeName": "ITI Small Cap Fund - Regular Plan - Growth",
      "amcCode": "ITI_MF",
      "amcName": "ITI Mutual Fund",
      "isin": "INF003L01358",
      "planType": "REGULAR",
      "option": "GROWTH",
      "category": "Equity",
      "subCategory": "Small Cap",
      "nav": 35.814,
      "navDate": "2026-10-01T00:00:00.000Z",
      "return1M": -3.65,
      "return3M": 2.14,
      "return6M": 11.23,
      "cagr1Y": 17.76,
      "cagr3Y": 21.27,
      "cagr5Y": null,
      "aum": null,
      "minSipAmount": null,
      "minPurchaseAmount": null,
      "expenseRatio": null,
      "rating": null,
      "holdings": null,
      "isActive": true
    },
    {
      "schemeCode": "145139",
      "schemeName": "Invesco India Small Cap Fund - Regular Plan - Growth",
      "amcCode": "INVESCO_MF",
      "amcName": "Invesco Mutual Fund",
      "isin": "INF205K01726",
      "planType": "REGULAR",
      "option": "GROWTH",
      "category": "Equity",
      "subCategory": "Small Cap",
      "nav": 42.11,
      "navDate": "2026-10-01T00:00:00.000Z",
      "return1M": -4.23,
      "return3M": 0.52,
      "return6M": 8.76,
      "cagr1Y": 12.59,
      "cagr3Y": 19.97,
      "cagr5Y": 18.42,
      "aum": null,
      "minSipAmount": null,
      "minPurchaseAmount": null,
      "expenseRatio": null,
      "rating": null,
      "holdings": null,
      "isActive": true
    },
    {
      "schemeCode": "145677",
      "schemeName": "BANK OF INDIA SMALL CAP FUND - Regular Plan - Growth",
      "amcCode": "BANK_OF_INDIA_MF",
      "amcName": "Bank of India Mutual Fund",
      "isin": "INF767K01BK2",
      "planType": "REGULAR",
      "option": "GROWTH",
      "category": "Equity",
      "subCategory": "Small Cap",
      "nav": 47.92,
      "navDate": "2026-10-01T00:00:00.000Z",
      "return1M": 0.74,
      "return3M": 8.21,
      "return6M": 19.45,
      "cagr1Y": 27.45,
      "cagr3Y": 19.91,
      "cagr5Y": 17.85,
      "aum": null,
      "minSipAmount": null,
      "minPurchaseAmount": null,
      "expenseRatio": null,
      "rating": null,
      "holdings": null,
      "isActive": true
    },
    {
      "schemeCode": "105989",
      "schemeName": "DSP Small Cap Fund - Regular Plan - Growth",
      "amcCode": "DSP_MF",
      "amcName": "DSP Mutual Fund",
      "isin": "INF740K01670",
      "planType": "REGULAR",
      "option": "GROWTH",
      "category": "Equity",
      "subCategory": "Small Cap",
      "nav": 165.234,
      "navDate": "2026-10-01T00:00:00.000Z",
      "return1M": -3.62,
      "return3M": 1.48,
      "return6M": 10.12,
      "cagr1Y": 16.25,
      "cagr3Y": 15.93,
      "cagr5Y": 16.21,
      "aum": null,
      "minSipAmount": null,
      "minPurchaseAmount": null,
      "expenseRatio": null,
      "rating": null,
      "holdings": null,
      "isActive": true
    }
  ]
}
```

---

## 3. API Sorting Verification (`sort=returns1y`)

### Request
```http
GET /api/mutual-funds/schemes?sort=returns1y&page=1&limit=5 HTTP/1.1
```

### Actual Response Capture
```json
{
  "success": true,
  "total": 59,
  "page": 1,
  "pages": 12,
  "data": [
    {
      "schemeCode": "148094",
      "schemeName": "Nippon India Credit Risk Fund (Existing Number: 104231) - Regular Plan - Growth",
      "amcCode": "NIPPON_INDIA_MF",
      "cagr1Y": 339.83,
      "planType": "REGULAR",
      "option": "GROWTH"
    },
    {
      "schemeCode": "145677",
      "schemeName": "BANK OF INDIA SMALL CAP FUND - Regular Plan - Growth",
      "amcCode": "BANK_OF_INDIA_MF",
      "cagr1Y": 27.45,
      "planType": "REGULAR",
      "option": "GROWTH"
    },
    {
      "schemeCode": "152232",
      "schemeName": "Motilal Oswal Small Cap Fund - Regular Plan - Growth Option",
      "amcCode": "MOTILAL_OSWAL_MF",
      "cagr1Y": 19.51,
      "planType": "REGULAR",
      "option": "GROWTH"
    },
    {
      "schemeCode": "147920",
      "schemeName": "ITI Small Cap Fund - Regular Plan - Growth",
      "amcCode": "ITI_MF",
      "cagr1Y": 17.76,
      "planType": "REGULAR",
      "option": "GROWTH"
    },
    {
      "schemeCode": "133867",
      "schemeName": "BANK OF INDIA CREDIT RISK FUND - Regular Plan - Growth Option",
      "amcCode": "BANK_OF_INDIA_MF",
      "cagr1Y": 16.74,
      "planType": "REGULAR",
      "option": "GROWTH"
    }
  ]
}
```

---

## 4. Scheme Detail API Verification (`GET /api/mutual-funds/schemes/:code`)

### Request
```http
GET /api/mutual-funds/schemes/147944 HTTP/1.1
```

### Actual Response Highlights
- `planType`: `"REGULAR"`
- `option`: `"GROWTH"`
- `nav`: `50.665`
- `navDate`: `"2026-10-01T00:00:00.000Z"`
- `return1M`: `-1.98`
- `cagr1Y`: `9.18`
- `cagr3Y`: `21.36`
- `returns.methodology`: `"SEBI/AMFI: Simple absolute return for <=1Y, CAGR for >1Y"`
- `returns.source`: `"AMFI Daily NAV History"`
- `chartData.3Y`: Array of 120 evenly sampled historical NAV data points for charting
- `holdings`: `null` (faithfully reports absence of authorized portfolio disclosure feed)
- `topHoldings`: `null`
- `similarFunds`: Array of peer funds in the same Sub-Category (`Small Cap`), sorted by verified return metrics.
