# VikaOne Mutual Fund — Phase 5C Data Coverage & Audit Report

## 1. Executive Summary

This report establishes the field-level data coverage and statutory intelligence status across the entire VikaOne Mutual Fund database universe following Phase 5C implementation.

- **Total Mutual Fund Schemes In DB**: 1,864
- **Regular Plan Schemes**: 1,864 (100%)
- **Direct Plan Schemes**: 0 in customer-facing catalogue
- **Current NAV Coverage**: 1,864 / 1,864 (100.00%)
- **Tier 2 Verified Statutory Schemes**: 15 schemes across 10 leading AMCs (expanded from 9 in Phase 5B)
- **Star Rating Coverage**: 0.00% (Strictly preserved as `null` with status `SOURCE_NOT_AUTHORIZED` until contracted)
- **List / Detail Parity**: 100.00% across all calculated return periods

---

## 2. Mandatory Section 32 Field Coverage Table

| Field Name | Populated | Null | Stale | Source Failed | Coverage % | Status / Authority |
|---|---:|---:|---:|---:|---:|---|
| **NAV (Current Daily)** | 1,864 | 0 | 0 | 0 | **100.00%** | VERIFIED (Tier 1 AMFI Feed) |
| **AUM / Fund Size** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official Factsheets) |
| **TER (Regular Plan)** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Statutory Disclosures) |
| **Fund Manager** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official SIDs) |
| **Benchmark** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official SIDs) |
| **Exit Load** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official SIDs) |
| **Riskometer** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (SEBI Mandated Disclosure) |
| **Inception Date** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official SIDs) |
| **Investment Objective** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Official SIDs) |
| **Min Purchase Amount** | 15 | 1,849 | 0 | 0 | **0.80%** | SOURCE_DEFINED (Official SIDs) |
| **Min SIP Amount** | 15 | 1,849 | 0 | 0 | **0.80%** | SOURCE_DEFINED (Official SIP Rules) |
| **Portfolio Holdings** | 15 | 1,849 | 0 | 0 | **0.80%** | TIER_2_VERIFIED (Monthly Disclosures) |
| **Fund Rating** | 0 | 1,864 | 0 | 0 | **0.00%** | SOURCE_NOT_AUTHORIZED |
| **Returns 1M** | 64 | 1,800 | 0 | 0 | **3.43%** | VERIFIED (Point-to-Point Exact Month) |
| **Returns 3M** | 64 | 1,800 | 0 | 0 | **3.43%** | VERIFIED (Point-to-Point Exact Month) |
| **Returns 6M** | 64 | 1,800 | 0 | 0 | **3.43%** | VERIFIED (Point-to-Point Exact Month) |
| **Returns 1Y** | 63 | 1,801 | 0 | 0 | **3.38%** | VERIFIED (Point-to-Point Exact Year) |
| **Returns 3Y** | 59 | 1,805 | 0 | 0 | **3.17%** | VERIFIED (Preceding Trading Day CAGR) |
| **Returns 5Y** | 57 | 1,807 | 0 | 0 | **3.06%** | VERIFIED (Preceding Trading Day CAGR) |

---

## 3. Before vs. After Phase 5C Comparison

| Metric / Dimension | Phase 5B Baseline | Phase 5C Implementation | Difference / Gain |
|---|---|---|---|
| **Tier 2 Verified Schemes** | 9 | 15 | +6 schemes (+66.7%) |
| **AMCs Covered** | 7 | 10 | +3 AMCs |
| **HDFC Small Cap (130502) Detail** | All null | Fully Populated & Verified | Complete Tier 2 intelligence |
| **Bandhan Small Cap (147944) Detail**| All null | Fully Populated & Verified | Complete Tier 2 intelligence |
| **3M Return Calculation** | 91-day offset (July 2) | Exact calendar month (July 1) | Fixed 1.11% calculation error |
| **6M Return Calculation** | 182-day offset (April 2) | Exact calendar month (April 1) | Fixed 0.34% calculation error |
| **3Y Return Calculation** | Forward trading day (Oct 3) | Preceding trading day (Sep 29) | Fixed 0.28% calculation error |
| **List / Detail Consistency** | Divergent (8.75% vs 8.45%) | 100% Parity (8.73% == 8.73%) | Single source of truth |
| **fundHouse.totalAum** | Populated with scheme AUM | Strictly null | Zero data contamination |
| **All Return Transparency** | Undocumented number | Exposed methodology & dates | Full provenance |
| **Regression Tests Passing** | 156 / 156 | 181 / 181 | 100% Pass rate, zero regressions |
