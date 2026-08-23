/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Investments, Withdrawals & Sell Approvals
   ══════════════════════════════════════════════════════════════ */

// ── 1. Digi Gold: User Investments (Gold & Silver Holdings) ─────
let userInvestmentsData = [];

async function loadUserInvestments() {
    const body = document.getElementById("userinvestments-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading Digi Gold & Silver user investments...</div></div>`;

    const search = document.getElementById("userinvestments-search")?.value.trim() || "";
    const metalFilter = document.getElementById("userinvestments-metal-filter")?.value || "";

    const params = new URLSearchParams({ hasInvestment: "true", limit: 50 });
    if (search) params.append("search", search);
    if (metalFilter) params.append("investmentType", metalFilter);

    try {
        const res = await api(`/admin/users?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load user investments"}</div></div>`;
            return;
        }

        userInvestmentsData = res.data || [];
        renderDigiGoldUserInvestmentsTable(userInvestmentsData);
        const badge = document.getElementById("userinvestments-count-badge");
        if (badge) badge.textContent = `${res.total || userInvestmentsData.length} Investors`;
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading user investments</div></div>`;
    }
}

function filterDigiGoldUserInvestments() {
    const query = document.getElementById("userinvestments-search")?.value.toLowerCase().trim() || "";
    const metalFilter = document.getElementById("userinvestments-metal-filter")?.value || "";

    let filtered = userInvestmentsData;
    if (query) {
        filtered = filtered.filter(u =>
            (u.name || "").toLowerCase().includes(query) ||
            (u.email || "").toLowerCase().includes(query) ||
            (u.phone || "").toLowerCase().includes(query)
        );
    }
    if (metalFilter === "gold") {
        filtered = filtered.filter(u => (u.goldInvestments?.grams || 0) > 0);
    } else if (metalFilter === "silver") {
        filtered = filtered.filter(u => (u.silverInvestments?.grams || 0) > 0);
    } else if (metalFilter === "copper") {
        filtered = filtered.filter(u => (u.copperInvestments?.grams || 0) > 0);
    }
    renderDigiGoldUserInvestmentsTable(filtered);
}

function renderDigiGoldUserInvestmentsTable(users) {
    const body = document.getElementById("userinvestments-body");
    if (!body) return;

    let totalGoldGrams = 0;
    let totalGoldInvested = 0;
    let totalGoldVal = 0;

    let totalSilverGrams = 0;
    let totalSilverInvested = 0;
    let totalSilverVal = 0;

    let totalCopperGrams = 0;
    let totalCopperInvested = 0;
    let totalCopperVal = 0;

    (users || []).forEach(u => {
        const gold = u.goldInvestments || {};
        const silver = u.silverInvestments || {};
        const copper = u.copperInvestments || {};

        totalGoldGrams += (gold.grams || 0);
        totalGoldInvested += (gold.totalInvested || 0);
        totalGoldVal += (gold.currentValue || 0);

        totalSilverGrams += (silver.grams || 0);
        totalSilverInvested += (silver.totalInvested || 0);
        totalSilverVal += (silver.currentValue || 0);

        totalCopperGrams += (copper.grams || 0);
        totalCopperInvested += (copper.totalInvested || 0);
        totalCopperVal += (copper.currentValue || 0);
    });

    const totalVal = (totalGoldVal + totalSilverVal + totalCopperVal);
    const totalInvested = (totalGoldInvested + totalSilverInvested + totalCopperInvested);
    const totalPl = parseFloat((totalVal - totalInvested).toFixed(2));
    const goldPl = parseFloat((totalGoldVal - totalGoldInvested).toFixed(2));
    const silverPl = parseFloat((totalSilverVal - totalSilverInvested).toFixed(2));
    const copperPl = parseFloat((totalCopperVal - totalCopperInvested).toFixed(2));

    // Update Gold Custody Vault Card
    const goldEl = document.getElementById("summary-total-gold");
    if (goldEl) goldEl.textContent = formatGrams(totalGoldGrams);

    const goldValEl = document.getElementById("summary-gold-valuation");
    if (goldValEl) goldValEl.textContent = formatINR(totalGoldVal);

    const goldInvEl = document.getElementById("summary-gold-invested");
    if (goldInvEl) goldInvEl.textContent = formatINR(totalGoldInvested);

    const goldPlEl = document.getElementById("summary-gold-pl");
    if (goldPlEl) {
        goldPlEl.style.color = goldPl >= 0 ? "var(--success)" : "var(--danger)";
        goldPlEl.textContent = `${goldPl >= 0 ? '+' : ''}${formatINR(goldPl)}`;
    }

    // Update Silver Custody Vault Card
    const silverEl = document.getElementById("summary-total-silver");
    if (silverEl) silverEl.textContent = formatGrams(totalSilverGrams);

    const silverValEl = document.getElementById("summary-silver-valuation");
    if (silverValEl) silverValEl.textContent = formatINR(totalSilverVal);

    const silverInvEl = document.getElementById("summary-silver-invested");
    if (silverInvEl) silverInvEl.textContent = formatINR(totalSilverInvested);

    const silverPlEl = document.getElementById("summary-silver-pl");
    if (silverPlEl) {
        silverPlEl.style.color = silverPl >= 0 ? "var(--success)" : "var(--danger)";
        silverPlEl.textContent = `${silverPl >= 0 ? '+' : ''}${formatINR(silverPl)}`;
    }

    // Update Copper Custody Vault Card
    const copperEl = document.getElementById("summary-total-copper");
    if (copperEl) copperEl.textContent = formatGrams(totalCopperGrams);

    const copperValEl = document.getElementById("summary-copper-valuation");
    if (copperValEl) copperValEl.textContent = formatINR(totalCopperVal);

    const copperInvEl = document.getElementById("summary-copper-invested");
    if (copperInvEl) copperInvEl.textContent = formatINR(totalCopperInvested);

    const copperPlEl = document.getElementById("summary-copper-pl");
    if (copperPlEl) {
        copperPlEl.style.color = copperPl >= 0 ? "var(--success)" : "var(--danger)";
        copperPlEl.textContent = `${copperPl >= 0 ? '+' : ''}${formatINR(copperPl)}`;
    }

    // Update Total Bullion Custody Card
    const totalValEl = document.getElementById("summary-total-valuation");
    if (totalValEl) totalValEl.textContent = formatINR(totalVal);

    const totalInvEl = document.getElementById("summary-total-invested");
    if (totalInvEl) totalInvEl.textContent = formatINR(totalInvested);

    const totalPlEl = document.getElementById("summary-total-pl");
    if (totalPlEl) {
        totalPlEl.style.color = totalPl >= 0 ? "var(--success)" : "var(--danger)";
        totalPlEl.textContent = `${totalPl >= 0 ? '+' : ''}${formatINR(totalPl)}`;
    }

    if (!users || users.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-coins" style="font-size:32px;color:var(--text-dim)"></i><div>No bullion investors found in this view</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Gold 24K Holdings</th>
                    <th>Silver 999 Holdings</th>
                    <th>Copper 999 Holdings</th>
                    <th>Total Invested</th>
                    <th>Current Value</th>
                    <th>Bullion P&L</th>
                    <th>Wallet Balance</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    users.forEach(u => {
        const gold = u.goldInvestments || {};
        const silver = u.silverInvestments || {};
        const copper = u.copperInvestments || {};

        const goldGrams = gold.grams || 0;
        const goldSpent = gold.totalInvested || 0;
        const goldVal = gold.currentValue || 0;

        const silverGrams = silver.grams || 0;
        const silverSpent = silver.totalInvested || 0;
        const silverVal = silver.currentValue || 0;

        const copperGrams = copper.grams || 0;
        const copperSpent = copper.totalInvested || 0;
        const copperVal = copper.currentValue || 0;

        const totalInvested = (goldSpent + silverSpent + copperSpent);
        const totalVal = (goldVal + silverVal + copperVal);
        const totalPl = parseFloat((totalVal - totalInvested).toFixed(2));
        const walletBal = u.walletBalance !== undefined ? u.walletBalance : 0;

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${formatGrams(goldGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(goldSpent)} • Val: ${formatINR(goldVal)}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--silver)">${formatGrams(silverGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(silverSpent)} • Val: ${formatINR(silverVal)}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--copper)">${formatGrams(copperGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(copperSpent)} • Val: ${formatINR(copperVal)}</div>
            </td>
            <td style="font-weight:700;color:#fff">${formatINR(totalInvested)}</td>
            <td style="font-weight:700;color:var(--gold)">${formatINR(totalVal)}</td>
            <td>
                <span style="font-family:var(--font-mono);font-weight:700;color:${totalPl >= 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${totalPl >= 0 ? '+' : ''}${formatINR(totalPl)}
                </span>
            </td>
            <td style="font-family:var(--font-mono);font-weight:600">${formatINR(walletBal)}</td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u._id}')">
                        <i class="fas fa-edit"></i> Manage
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── 2. Real Estate: Property Investments (Bricks Allocation) ───
async function loadInvestments() {
    const body = document.getElementById("investments-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading real estate brick investments...</div></div>`;

    try {
        const res = await api("/admin/investments");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load investments"}</div></div>`;
            return;
        }

        renderRealEstateInvestmentsTable(res.data || []);
        const revEl = document.getElementById("investments-total-revenue");
        if (revEl && res.totalRevenue !== undefined) {
            revEl.textContent = `Total Funded: ${formatINR(res.totalRevenue)}`;
        }
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderRealEstateInvestmentsTable(investments) {
    const body = document.getElementById("investments-body");
    if (!body) return;

    if (!investments || investments.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-building" style="font-size:32px;color:var(--text-dim)"></i><div>No property investments recorded</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Investor</th>
                    <th>Property</th>
                    <th>Bricks</th>
                    <th>Ownership %</th>
                    <th>Amount Paid</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>`;

    investments.forEach(inv => {
        const u = inv.user || {};
        const p = inv.property || {};
        const statusBadge = inv.status === "paid"
            ? `<span class="badge badge-success">Paid</span>`
            : `<span class="badge badge-pending">${inv.status}</span>`;

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                <div style="font-weight:600">${p.title || 'Untitled Property'}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">${p.location?.city || ''}</div>
            </td>
            <td style="font-family:var(--font-mono);font-size:13px;font-weight:600">${inv.bricks || 0}</td>
            <td style="font-weight:600;color:var(--gold)">${inv.ownershipPercent || 0}%</td>
            <td style="font-weight:700;color:#fff">${formatINR(inv.totalAmount)}</td>
            <td>${statusBadge}</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(inv.createdAt)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── 3. Bank Withdrawals Queue ──────────────────────────────────
async function loadWithdrawals(status = "pending") {
    const body = document.getElementById("withdrawals-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading bank withdrawal requests...</div></div>`;

    try {
        const res = await api(`/admin/withdrawals?status=${status}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load withdrawals"}</div></div>`;
            return;
        }

        renderWithdrawalsTable(res.data || []);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderWithdrawalsTable(txns) {
    const body = document.getElementById("withdrawals-body");
    if (!body) return;

    if (!txns || txns.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-hand-holding-usd" style="font-size:32px;color:var(--text-dim)"></i><div>No withdrawal requests found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Balance Before / After</th>
                    <th>Status</th>
                    <th>Requested Time</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    txns.forEach(t => {
        const u = t.user || {};
        const isPending = t.status === "pending";

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--danger)">-${formatINR(t.amount)}</td>
            <td style="font-size:12.5px;color:var(--text-dim)">
                ${formatINR(t.balanceBefore)} → ${formatINR(t.balanceAfter || t.balanceBefore - t.amount)}
            </td>
            <td><span class="badge ${isPending ? 'badge-pending' : 'badge-success'}">${t.status}</span></td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(t.createdAt)}</td>
            <td style="text-align:right">
                ${isPending ? `<button class="btn btn-success btn-sm" onclick="completeWithdrawal('${t._id}', ${t.amount})"><i class="fas fa-check"></i> Mark Complete</button>` : `<span style="font-size:12px;color:var(--text-dim)">Processed</span>`}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function completeWithdrawal(id, amt) {
    if (!confirm(`Confirm releasing ₹${amt} bank payout for this user?`)) return;
    try {
        const res = await api(`/admin/withdrawals/${id}/complete`, { method: "PATCH" });
        if (res.success) {
            toast("Withdrawal marked complete", "success");
            loadWithdrawals();
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to complete withdrawal", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

// ── 4. Sell Payout Approvals (Gold + Silver) ───────────────────
async function loadSellApprovals(metal = "all", status = "processing") {
    const body = document.getElementById("sellapprovals-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading sell payout approvals...</div></div>`;

    try {
        const res = await api(`/admin/sell-approvals?metal=${metal}&status=${status}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load approvals"}</div></div>`;
            return;
        }

        renderSellApprovalsTable(res.data || []);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderSellApprovalsTable(txns) {
    const body = document.getElementById("sellapprovals-body");
    if (!body) return;

    if (!txns || txns.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-check-double" style="font-size:32px;color:var(--text-dim)"></i><div>No sell transactions awaiting approval</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Asset</th>
                    <th>Grams Sold</th>
                    <th>Rate Locked</th>
                    <th>Payout Amount</th>
                    <th>Status</th>
                    <th>Sold At</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    txns.forEach(t => {
        const u = t.user || {};
        const isProcessing = t.status === "processing";

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                <span class="badge ${t.metal === 'silver' ? 'badge-silver' : 'badge-gold'}">
                    ${(t.metal || 'gold').toUpperCase()}
                </span>
            </td>
            <td style="font-family:var(--font-mono);font-size:13px">${formatGrams(t.grams)}</td>
            <td style="font-family:var(--font-mono)">${formatINR(t.ratePerGram)}/g</td>
            <td style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold)">${formatINR(t.value || t.goldValue || t.silverValue)}</td>
            <td><span class="badge ${isProcessing ? 'badge-pending' : 'badge-success'}">${t.status}</span></td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(t.createdAt)}</td>
            <td style="text-align:right">
                ${isProcessing ? `<button class="btn btn-success btn-sm" onclick="approveSellPayout('${t._id}', '${t.metal}', ${t.value || t.goldValue || t.silverValue})"><i class="fas fa-check"></i> Approve Payout</button>` : `<span style="font-size:12px;color:var(--text-dim)">Approved</span>`}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function approveSellPayout(id, metal, amt) {
    if (!confirm(`Approve ₹${amt} ${metal} sell payout release to user's wallet?`)) return;
    try {
        const res = await api(`/admin/sell-approvals/${id}/approve`, {
            method: "PATCH",
            body: JSON.stringify({ metal })
        });

        if (res.success) {
            toast("Sell payout approved and credited to wallet", "success");
            loadSellApprovals();
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to approve payout", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
