/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — 100% Real-Time Dashboard Controller
   ══════════════════════════════════════════════════════════════ */

let buySellChartInstance = null;
let investmentTrendChartInstance = null;
let dashboardRawData = null;
let currentChartDays = 7;

async function loadDashboard(days = 7) {
    currentChartDays = days;
    try {
        const res = await api("/admin/dashboard");
        if (!res.success) {
            toast(res.message || "Failed to load real-time dashboard data", "danger");
            return;
        }

        dashboardRawData = res.data || {};
        populateRealTimeDashboard(dashboardRawData, currentChartDays);
    } catch (err) {
        console.error("Real-time dashboard error:", err);
    }
}

function formatKgOrGrams(grams) {
    const g = Number(grams) || 0;
    if (g >= 1000) {
        return (g / 1000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " kg";
    }
    return g.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 4 }) + " g";
}

function populateRealTimeDashboard(data, days = 7) {
    const users = data.users || {};
    const gold = data.gold || {};
    const silver = data.silver || {};
    const inv = data.investments || {};
    const recurring = data.schemesAndSips || {};
    const actions = data.actionItems || {};
    const commercials = data.commercials || {};
    const rates = data.rates || {};
    const charts = data.charts || {};
    const recentTxns = data.recentTransactions || [];

    // ── Row 1: Users, KYC, Vault Holdings & Real Investment Value ───
    setElText("kpi-total-users", (users.total || 0).toLocaleString("en-IN"));
    setElText("kpi-kyc-verified", (users.kycVerified || 0).toLocaleString("en-IN"));
    setElText("kpi-total-gold-held", formatKgOrGrams(gold.totalGramsHeld || 0));
    setElText("kpi-total-silver-held", formatKgOrGrams(silver.totalGramsHeld || 0));
    
    const realTotalInvVal = Number(inv.totalInvestmentValue || 0);
    setElText("kpi-total-investment-val", formatINR(realTotalInvVal));
    setElText("trend-total-val-display", formatINR(realTotalInvVal));

    // ── Row 2: Purchases, Sales & Recurring SIPs ───────────────────
    setElText("kpi-gold-purchased", formatKgOrGrams(gold.totalPurchasedGrams || 0));
    setElText("kpi-gold-sold", formatKgOrGrams(gold.totalSoldGrams || 0));
    setElText("kpi-silver-purchased", formatKgOrGrams(silver.totalPurchasedGrams || 0));
    setElText("kpi-silver-sold", formatKgOrGrams(silver.totalSoldGrams || 0));
    setElText("kpi-active-sips", (recurring.activeSips || 0).toLocaleString("en-IN"));

    // ── Row 3: Schemes, Pending Actions & Coupon Usage ─────────────
    setElText("kpi-active-schemes", (recurring.activeSchemes || 0).toLocaleString("en-IN"));
    setElText("kpi-pending-kyc", (actions.pendingKyc || 0).toLocaleString("en-IN"));
    setElText("kpi-pending-payouts", (actions.pendingWithdrawals || 0).toLocaleString("en-IN"));
    setElText("kpi-pending-payments", (actions.pendingPayments || 0).toLocaleString("en-IN"));
    setElText("kpi-coupons-used", (commercials.couponUsageCount || 0).toLocaleString("en-IN"));

    // ── Live Badge Notification Counters ───────────────────────────
    updateBadge("kyc-pending-badge", actions.pendingKyc);
    updateBadge("withdrawals-pending-badge", actions.pendingWithdrawals);
    updateBadge("sellapprovals-pending-badge", actions.pendingSellApprovals);

    // ── Live Rate Cards from API ───────────────────────────────────
    const goldRate = rates.gold || {};
    const silverRate = rates.silver || {};

    const gBuy = Number(goldRate.buyRate || 0);
    const gSell = Number(goldRate.sellRate || 0);
    const sBuy = Number(silverRate.buyRate || 0);
    const sSell = Number(silverRate.sellRate || 0);

    setElText("rate-gold-price-main", `₹ ${gBuy.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /gm`);
    setElText("rate-gold-buy-price", `₹ ${gBuy.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    setElText("rate-gold-sell-price", `₹ ${gSell.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    setElText("rate-silver-price-main", `₹ ${sBuy.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /gm`);
    setElText("rate-silver-buy-price", `₹ ${sBuy.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    setElText("rate-silver-sell-price", `₹ ${sSell.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    const updatedTime = rates.updatedAt ? new Date(rates.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    setElText("rate-gold-time", `Updated today, ${updatedTime}`);
    setElText("rate-silver-time", `Updated today, ${updatedTime}`);

    // ── Bottom Financial Metrics from Actual Ledger ────────────────
    const rev = Number(commercials.revenue || 0);
    const gst = Number(commercials.gstCollected || 0);
    const payouts = Number(gold.totalSoldAmt || 0) + Number(silver.totalSoldAmt || 0);
    const discounts = Number(commercials.totalDiscountDistributed || 0);

    setElText("fin-total-revenue", formatINR(rev));
    setElText("fin-total-commissions", formatINR(gst));
    setElText("fin-total-payouts", formatINR(payouts));
    setElText("fin-total-coupons", formatINR(discounts));

    // ── Real-Time Interactive Charts & Recent Ledger Feed ──────────
    renderRealTimeBuySellChart(charts, days);
    renderRealTimeInvestmentTrendChart(charts, realTotalInvVal, days);
    renderRealTimeTransactionsTable(recentTxns);
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setElHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function updateBadge(id, count) {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count && count > 0) {
        badge.style.display = "inline-flex";
        badge.textContent = count > 99 ? "99+" : count;
    } else {
        badge.style.display = "none";
    }
}

// ── 1. Real-Time Buy & Sell Overview Grouped Bar Chart ──────────
function renderRealTimeBuySellChart(charts, days = 7) {
    const ctx = document.getElementById("buySellOverviewChart");
    if (!ctx) return;

    if (buySellChartInstance) {
        buySellChartInstance.destroy();
    }

    const rawLabels = charts.labels || [];
    const count = Math.min(days, rawLabels.length);
    const sliceIdx = rawLabels.length > count ? rawLabels.length - count : 0;

    const labels = rawLabels.slice(sliceIdx);
    const goldBuy = (charts.goldBuy || []).slice(sliceIdx);
    const goldSell = (charts.goldSell || []).slice(sliceIdx);
    const silverBuy = (charts.silverBuy || []).slice(sliceIdx);
    const silverSell = (charts.silverSell || []).slice(sliceIdx);

    buySellChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Gold Buy (₹)",
                    data: goldBuy,
                    backgroundColor: "#eab308",
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: "Gold Sell (₹)",
                    data: goldSell,
                    backgroundColor: "#ef4444",
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: "Silver Buy (₹)",
                    data: silverBuy,
                    backgroundColor: "#3b82f6",
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: "Silver Sell (₹)",
                    data: silverSell,
                    backgroundColor: "#8b5cf6",
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#181d29",
                    titleColor: "#fff",
                    bodyColor: "#94a3b8",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ₹ ${ctx.parsed.y.toLocaleString("en-IN")}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 10.5 } }
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: {
                        color: "#64748b",
                        font: { size: 10.5 },
                        callback: val => val >= 10000000 ? (val / 10000000).toFixed(1) + "Cr" : (val >= 100000 ? (val / 100000).toFixed(0) + "L" : (val >= 1000 ? (val / 1000).toFixed(0) + "K" : val))
                    }
                }
            }
        }
    });
}

// ── 2. Real-Time Investment Value Trend Cumulative Line Chart ───
function renderRealTimeInvestmentTrendChart(charts, totalVal = 0, days = 7) {
    const ctx = document.getElementById("investmentTrendChart");
    if (!ctx) return;

    if (investmentTrendChartInstance) {
        investmentTrendChartInstance.destroy();
    }

    const rawLabels = charts.labels || [];
    const count = Math.min(days, rawLabels.length);
    const sliceIdx = rawLabels.length > count ? rawLabels.length - count : 0;

    const labels = rawLabels.slice(sliceIdx);
    const totalBuy = (charts.totalBuy || []).slice(sliceIdx);
    const totalSell = (charts.totalSell || []).slice(sliceIdx);

    // Calculate real cumulative trend curve leading up to current total value
    let runningVal = totalVal;
    const reversedTrend = [];
    reversedTrend.push(runningVal);

    for (let i = labels.length - 1; i > 0; i--) {
        const netChange = (totalBuy[i] || 0) - (totalSell[i] || 0);
        runningVal = Math.max(0, runningVal - netChange);
        reversedTrend.unshift(runningVal);
    }
    const trendData = reversedTrend;

    const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "rgba(245, 158, 11, 0.35)");
    gradient.addColorStop(1, "rgba(245, 158, 11, 0.0)");

    investmentTrendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Total Portfolio Value (₹)",
                data: trendData,
                borderColor: "#f59e0b",
                borderWidth: 2.5,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: "#f59e0b",
                pointBorderColor: "#131722",
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#181d29",
                    titleColor: "#fff",
                    bodyColor: "#f59e0b",
                    borderColor: "rgba(245,158,11,0.3)",
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => `₹ ${ctx.parsed.y.toLocaleString("en-IN")}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 10.5 } }
                },
                y: {
                    grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: {
                        color: "#64748b",
                        font: { size: 10.5 },
                        callback: val => val >= 10000000 ? (val / 10000000).toFixed(1) + "Cr" : (val >= 100000 ? (val / 100000).toFixed(0) + "L" : (val >= 1000 ? (val / 1000).toFixed(0) + "K" : val))
                    }
                }
            }
        }
    });
}

function formatShortInvoice(inv) {
    if (!inv) return "TXN-…0000";
    const str = String(inv).trim();
    if (str.startsWith("INV-")) {
        const parts = str.split("-");
        const last = parts[parts.length - 1];
        return `INV-…${last.slice(-4)}`;
    }
    if (str.startsWith("WLT-")) {
        return `WLT-…${str.slice(-4)}`;
    }
    if (str.startsWith("SLV-") || str.startsWith("GLD-") || str.startsWith("CPPR-")) {
        return `${str.slice(0, 4)}-…${str.slice(-4)}`;
    }
    if (str.length > 10) {
        return `…${str.slice(-6).toUpperCase()}`;
    }
    return str;
}

// ── 3. Real-Time Recent Transactions Feed Renderer ─────────────
function renderRealTimeTransactionsTable(txns) {
    const container = document.getElementById("recent-txns-body");
    if (!container) return;

    if (!txns || txns.length === 0) {
        container.innerHTML = `
        <div class="loading-box" style="padding:2rem">
            <i class="fas fa-receipt" style="font-size:28px;color:var(--text-dim);margin-bottom:8px"></i>
            <div style="color:var(--text-dim);font-size:12px">No recent transactions recorded in database</div>
        </div>`;
        return;
    }

    let html = `
    <div class="transactions-table-wrap">
        <table class="txn-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Metal</th>
                    <th>Amount</th>
                    <th>Grams</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>`;

    txns.slice(0, 8).forEach(t => {
        const isSuccess = (t.status || "").toLowerCase() === "success";
        const badgeClass = isSuccess ? "badge-pill-success" : "badge-pill-pending";
        
        // Clean short invoice / ID with tooltip
        const fullInvoice = t.invoiceNo || (t.id ? `TXN-${String(t.id).slice(-6).toUpperCase()}` : "TXN-000000");
        const idLabel = formatShortInvoice(fullInvoice);
        const userName = t.user?.name || t.userName || "Customer";
        const typeLabel = (t.type || "BUY").toUpperCase();
        
        // Metal icon badge
        const m = (t.metal || t.asset || "gold").toLowerCase();
        let metalBadge = "";
        if (m === "gold") {
            metalBadge = `<span style="color:#f59e0b;font-weight:600"><i class="fas fa-coins" style="font-size:10px;margin-right:4px"></i>Gold</span>`;
        } else if (m === "silver") {
            metalBadge = `<span style="color:#cbd5e1;font-weight:600"><i class="fas fa-cubes" style="font-size:10px;margin-right:4px"></i>Silver</span>`;
        } else if (m === "copper") {
            metalBadge = `<span style="color:#c084fc;font-weight:600"><i class="fas fa-layer-group" style="font-size:10px;margin-right:4px"></i>Copper</span>`;
        } else {
            metalBadge = `<span style="color:var(--text-dim);font-weight:500"><i class="fas fa-wallet" style="font-size:10px;margin-right:4px"></i>Wallet</span>`;
        }

        const amountVal = Number(t.amount || 0);
        const gramsVal = Number(t.grams || 0);
        const gramsStr = gramsVal > 0 ? `${gramsVal.toFixed(gramsVal < 1 ? 4 : 3)} g` : "—";
        
        const d = t.createdAt ? new Date(t.createdAt) : new Date();
        const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

        html += `
        <tr>
            <td class="txn-id" title="${fullInvoice}">${idLabel}</td>
            <td class="txn-user" title="${userName}">${userName}</td>
            <td><span class="txn-type-badge">${typeLabel}</span></td>
            <td>${metalBadge}</td>
            <td class="txn-amount">${formatINR(amountVal)}</td>
            <td style="font-family:var(--font-mono);color:var(--text-muted)">${gramsStr}</td>
            <td><span class="${badgeClass}">${(t.status || 'SUCCESS').toUpperCase()}</span></td>
            <td style="font-size:11px;color:var(--text-dim)">${dateStr}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
