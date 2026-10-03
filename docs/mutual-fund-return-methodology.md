# VikaOne Mutual Fund — Authoritative Return Calculation Methodology

**Document Version:** 1.0  
**Effective Date:** October 3, 2026  
**Implementation Engine:** [`services/mfReturnEngine.js`](file:///c:/Ashahad/Porwal/New%20folder/bharatsqft-backend/services/mfReturnEngine.js)

---

## 1. Regulatory Context & Framework

Under SEBI Master Circular for Mutual Funds (SEBI/HO/IMD/IMD-PoD-1/P/CIR/2023/74, Section 5.8) and AMFI Best Practices Guidelines (Circular No. 135/BP/24/2011-12):
1. **Trailing Performance Disclosures:** Performance for periods up to one year must be disclosed as point-to-point simple absolute returns. Performance for periods exceeding one year must be disclosed as Compounded Annualized Growth Rate (CAGR).
2. **Holiday / Weekend Convention:** When an anniversary or period target date falls on a non-business day (market holiday, Saturday, or Sunday), the NAV of the **immediately preceding business day** is selected.

---

## 2. Calendar-Aware Date Subtraction

VikaOne prohibits rough day-count approximations (such as fixed 30, 91, 182, 365, or 1095 days). All period lookbacks are computed via calendar date math:

### 2.1 Calendar Month Lookback (1M, 3M, 6M)
$$\text{Target Month} = \text{End Month} - M$$
* **Month-End Safe Clipping:** If the resulting month has fewer days than the end date (e.g., March 31 minus 1 month), the date is safely clipped to the last calendar day of the target month (February 28/29).

### 2.2 Calendar Year Lookback (1Y, 3Y, 5Y)
$$\text{Target Year} = \text{End Year} - Y$$
* **Leap Year Safe Clipping:** If the end date is a leap day (February 29), subtracting 1 year safely clips the target date to February 28 of the preceding year without month-overflow into March.

---

## 3. Trading Day NAV Selection Engine

For any computed target date:
1. **Exact Match:** If AMFI daily NAV exists on `targetDate`, that NAV is adopted (`matchType: 'EXACT'`).
2. **Preceding Trading Day:** If `targetDate` falls on a weekend, public holiday, or missing trading date, the algorithm scans backward up to 10 calendar days for the closest published business day NAV (`matchType: 'PRECEDING_TRADING_DAY'`).
3. **Subsequent Day Guard:** Only if the target date precedes the fund's inception date does the algorithm look forward up to 7 days for the first available trading day (`matchType: 'SUBSEQUENT_TRADING_DAY'`).

---

## 4. Mathematical Formulas

### 4.1 Short-Term Periods ($\le 1$ Year: 1M, 3M, 6M, 1Y)
Computed as point-to-point simple absolute percentage return:
$$\text{Return} = \left(\frac{\text{NAV}_{\text{end}} - \text{NAV}_{\text{start}}}{\text{NAV}_{\text{start}}}\right) \times 100$$

### 4.2 Multi-Year Periods ($> 1$ Year: 3Y, 5Y)
Computed as Compounded Annual Growth Rate (CAGR):
$$\text{CAGR} = \left[\left(\frac{\text{NAV}_{\text{end}}}{\text{NAV}_{\text{start}}}\right)^{\frac{1}{\text{elapsedYears}}} - 1\right] \times 100$$

#### Elapsed Years ($N$) Methodology
* **Standard Periodic Disclosures:** In alignment with SEBI annual disclosure guidelines, for standard intervals ($N = 3, 5$), when the elapsed calendar days between the selected preceding trading day and the end date fall within $N \times 365.25 \pm 10$ calendar days, the standard integer $N$ is applied. This eliminates fractional-day jitter resulting from weekend lookbacks and ensures 100% parity between List API and Detail API.
* **Non-Standard Periods:** For irregular intervals, exact day-count fraction $\frac{\text{elapsedDays}}{365.25}$ is applied.

---

## 5. "All" Period (Timeseries Inception Return)

* **Transparency Mandate:** Series-start CAGR is **never** labeled as "Since Inception" unless the earliest daily NAV in the timeseries actually begins on or within 10 days of the fund's statutory inception date.
* **Labeling Rule:**
  - If $|\text{allStartDate} - \text{inceptionDate}| \le 10\text{ days}$:  
    `allReturnMethodology: 'CAGR_SINCE_INCEPTION'` (UI: "Since inception")
  - If $\text{allStartDate} > \text{inceptionDate} + 10\text{ days}$:  
    `allReturnMethodology: 'CAGR_SINCE_AVAILABLE_SERIES_START'` (UI: "Since available history")

---

## 6. Single Source of Truth Guarantee

1. **Engine Unification:** `services/mfReturnEngine.js` is the sole calculator across the backend.
2. **Parity Pipeline:** When `getSchemeDetail` executes, it evaluates returns via `mfReturnEngine` and atomically synchronizes the resulting snapshot to MongoDB. Consequently, `getSchemes` (List API), `getSchemeDetail` (Detail API), `similarFunds`, sorting, and Flutter display identical values.
3. **Zero Synthetic Values:** If trading history is insufficient for a period, the return evaluates strictly to `null`.
