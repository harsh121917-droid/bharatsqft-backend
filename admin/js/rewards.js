/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Reward Points & Referral Tracking Suite
   ══════════════════════════════════════════════════════════════ */

let allAdminReferrals = [];
let rewardsHistory = [];
let referralsPage = 1;
let rewardsPage = 1;
let activeRewardTab = "referrals";
let referralsSearchTimer = null;
let pointsSearchTimer = null;

// ── Tab Switching ──────────────────────────────────────────────
function switchRewardTab(tab) {
    activeRewardTab = tab;

    const refTabBtn = document.getElementById("tab-btn-referrals");
    const ptsTabBtn = document.getElementById("tab-btn-points");
    const rulesTabBtn = document.getElementById("tab-btn-rules");

    const refPanel = document.getElementById("panel-reward-referrals");
    const ptsPanel = document.getElementById("panel-reward-points");
    const rulesPanel = document.getElementById("panel-reward-rules");

    if (refTabBtn) refTabBtn.classList.toggle("active", tab === "referrals");
    if (ptsTabBtn) ptsTabBtn.classList.toggle("active", tab === "points");
    if (rulesTabBtn) rulesTabBtn.classList.toggle("active", tab === "rules");

    if (refPanel) refPanel.style.display = tab === "referrals" ? "block" : "none";
    if (ptsPanel) ptsPanel.style.display = tab === "points" ? "block" : "none";
    if (rulesPanel) rulesPanel.style.display = tab === "rules" ? "block" : "none";

    if (tab === "referrals") loadAdminReferrals(1);
    else if (tab === "points") loadRewardHistory(1);
    else if (tab === "rules") loadRewardSettings();
}

// ── 1. Summary KPIs ────────────────────────────────────────────
async function loadRewardsSummary() {
    try {
        const res = await api("/admin/rewards/summary");
        if (res.success && res.data) {
            const d = res.data;
            const dist = d.totalRewardsDistributed || {};
            const ref = d.referralStats || {};

            setElText("summary-total-rewards-amt", formatINR(dist.overallTotalRupeesEquivalent || 0));
            setElText("summary-total-rewards-pts", `${(dist.totalPointsGiven || 0).toLocaleString("en-IN")} total points given`);
            setElText("summary-total-referrals-count", ref.totalReferralsCount || 0);
            setElText("summary-active-referrers-count", `${ref.uniqueActiveReferrers || 0} active referrers`);
            setElText("summary-referral-cash-distributed", formatINR(ref.totalCashDistributed || 0));
            setElText("summary-points-redeemed-count", `${(dist.totalPointsRedeemed || 0).toLocaleString("en-IN")} pts`);
            setElText("summary-active-points-count", `${(dist.netActivePoints || 0).toLocaleString("en-IN")} net points active`);
        }
    } catch (e) {
        console.error("Error loading rewards summary:", e);
    }
}

// ── 2. Referral Tracking (Who Referred Whom) ───────────────────
async function loadAdminReferrals(page = 1) {
    referralsPage = page;
    const body = document.getElementById("referrals-table-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading referral records...</div></div>`;

    const search = document.getElementById("referrals-search")?.value.trim() || "";
    const params = new URLSearchParams({ page, limit: 25 });
    if (search) params.append("search", search);

    try {
        const res = await api(`/admin/rewards/referrals?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load referrals"}</div></div>`;
            return;
        }

        allAdminReferrals = res.data || [];
        renderReferralsTable(allAdminReferrals);

        const badge = document.getElementById("referrals-count-badge");
        if (badge) badge.textContent = `${res.total || allAdminReferrals.length} Total Referrals`;

        const info = document.getElementById("referrals-pagination-info");
        if (info) info.textContent = `Showing page ${res.page || page} of ${res.pages || 1} (${res.total || allAdminReferrals.length} total referrals)`;

        const prevBtn = document.getElementById("btn-prev-referrals");
        const nextBtn = document.getElementById("btn-next-referrals");
        if (prevBtn) prevBtn.disabled = (res.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.page || 1) >= (res.pages || 1);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading referrals</div></div>`;
    }
}

function debounceReferralsSearch(val) {
    clearTimeout(referralsSearchTimer);
    referralsSearchTimer = setTimeout(() => {
        loadAdminReferrals(1);
    }, 350);
}

function prevReferralsPage() {
    if (referralsPage > 1) loadAdminReferrals(referralsPage - 1);
}

function nextReferralsPage() {
    loadAdminReferrals(referralsPage + 1);
}

function renderReferralsTable(referrals) {
    const body = document.getElementById("referrals-table-body");
    if (!body) return;

    if (!referrals || referrals.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3.5rem 2rem">
            <i class="fas fa-user-friends" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No referral records found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">When customers invite friends using their referral code, the full tracking link will appear here.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Referrer (Invited By)</th>
                    <th>Referral Code</th>
                    <th>Referred Person (New User)</th>
                    <th>Referrer Reward</th>
                    <th>New User Bonus</th>
                    <th>Status</th>
                    <th>Date & Time</th>
                </tr>
            </thead>
            <tbody>`;

    referrals.forEach(r => {
        const referrer = r.referrer || {};
        const referee = r.referredUser || {};
        const code = r.referralCode || referrer.referralCode || "—";
        const cashReward = r.rewardAmount !== undefined ? r.rewardAmount : 50;
        const ptsReward = r.rewardPoints !== undefined ? r.rewardPoints : 200;
        const refereePts = r.refereeBonusPoints !== undefined ? r.refereeBonusPoints : 100;

        html += `
        <tr>
            <td>
                <div style="font-weight:700;color:#fff;font-size:13.5px">${referrer.name || 'Unknown Referrer'}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">${referrer.phone ? referrer.phone + ' • ' : ''}${referrer.email || ''}</div>
                ${referrer.referralBalance !== undefined ? `<div style="font-size:10.5px;color:var(--gold);margin-top:2px"><i class="fas fa-wallet"></i> Total Ref Bal: ${formatINR(referrer.referralBalance)}</div>` : ''}
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="badge font-mono" style="background:rgba(212,160,23,0.15);color:var(--gold);font-size:12px;font-weight:700;letter-spacing:0.5px">
                        ${code}
                    </span>
                    <button class="btn-icon-secondary" onclick="copyReferralCode('${code}')" title="Copy Referral Code" style="width:22px;height:22px;padding:0">
                        <i class="fas fa-copy" style="font-size:10px"></i>
                    </button>
                </div>
            </td>
            <td>
                <div style="font-weight:700;color:#fff;font-size:13.5px">${referee.name || 'New Customer'}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">${referee.phone ? referee.phone + ' • ' : ''}${referee.email || ''}</div>
                <div style="font-size:10.5px;color:var(--text-dim);margin-top:2px">Joined: ${formatDate(referee.createdAt || r.createdAt)}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:var(--success)">+${formatINR(cashReward)}</div>
                <div style="font-size:11px;color:var(--purple);font-weight:600">+${ptsReward} Points</div>
            </td>
            <td>
                <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:11px">
                    +${refereePts} Welcome Pts
                </span>
            </td>
            <td>
                <span class="badge badge-pill-success" style="font-size:10.5px">
                    <i class="fas fa-check-circle"></i> ${(r.status || 'completed').toUpperCase()}
                </span>
            </td>
            <td style="font-size:12px;color:var(--text-dim)">
                ${formatDateTime(r.createdAt)}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function copyReferralCode(code) {
    if (!code || code === "—") return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            toast(`Referral code "${code}" copied to clipboard!`, "success");
        });
    } else {
        prompt("Referral Code:", code);
    }
}

// ── 3. Point Distribution Ledger ───────────────────────────────
async function loadRewardHistory(page = 1) {
    rewardsPage = page;
    const body = document.getElementById("rewards-history-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading point transactions...</div></div>`;

    const search = document.getElementById("points-search")?.value.trim() || "";
    const typeFilter = document.getElementById("points-type-filter")?.value || "";

    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.append("search", search);
    if (typeFilter) params.append("type", typeFilter);

    try {
        const res = await api(`/admin/rewards/history?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load history</div></div>`;
            return;
        }

        rewardsHistory = res.data || [];
        renderRewardHistoryTable(rewardsHistory);

        const info = document.getElementById("rewards-pagination-info");
        if (info) info.textContent = `Showing page ${res.page || page} of ${res.pages || 1} (${res.total || 0} logs)`;

        const prevBtn = document.getElementById("btn-prev-rewards");
        const nextBtn = document.getElementById("btn-next-rewards");
        if (prevBtn) prevBtn.disabled = (res.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.page || 1) >= (res.pages || 1);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function debouncePointsSearch(val) {
    clearTimeout(pointsSearchTimer);
    pointsSearchTimer = setTimeout(() => {
        loadRewardHistory(1);
    }, 350);
}

function onPointsFilterChange() {
    loadRewardHistory(1);
}

function prevRewardsPage() {
    if (rewardsPage > 1) loadRewardHistory(rewardsPage - 1);
}

function nextRewardsPage() {
    loadRewardHistory(rewardsPage + 1);
}

function renderRewardHistoryTable(logs) {
    const body = document.getElementById("rewards-history-body");
    if (!body) return;

    if (!logs || logs.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3.5rem 2rem">
            <i class="fas fa-gift" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No point transactions found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Adjust filters or search query to find specific reward logs.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Points</th>
                    <th>Type / Event</th>
                    <th>Description</th>
                    <th>Date & Time</th>
                </tr>
            </thead>
            <tbody>`;

    logs.forEach(l => {
        const u = l.user || {};
        const isCredit = (l.points || 0) >= 0;
        const ptsStr = `${isCredit ? '+' : ''}${l.points} pts`;

        let typeBadge = `<span class="badge badge-secondary">${l.type || 'activity'}</span>`;
        if (l.type === "referral") typeBadge = `<span class="badge badge-gold"><i class="fas fa-user-plus"></i> Referral</span>`;
        else if (l.type === "registration") typeBadge = `<span class="badge badge-info"><i class="fas fa-sparkles"></i> Welcome Bonus</span>`;
        else if (l.type === "spin_win") typeBadge = `<span class="badge badge-purple"><i class="fas fa-dice"></i> Spin & Win</span>`;
        else if (l.type === "redeem") typeBadge = `<span class="badge badge-danger"><i class="fas fa-arrow-down"></i> Redeemed</span>`;

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''} ${u.referralCode ? `• Code: <b>${u.referralCode}</b>` : ''}</div>
            </td>
            <td style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:${isCredit ? '#10b981' : '#ef4444'}">
                ${ptsStr}
            </td>
            <td>${typeBadge}</td>
            <td style="font-size:13px;color:#e2e8f0">${l.description || l.type || 'Activity Bonus'}</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(l.createdAt)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── 4. Reward Settings ─────────────────────────────────────────
async function loadRewardSettings() {
    try {
        const res = await api("/admin/rewards/settings");
        if (res.success && res.data) {
            const s = res.data;
            document.getElementById("reward-buy-points").value = s.pointsPer100Rupees || 1;
            document.getElementById("reward-referral-points").value = s.referralPoints || 200;
            document.getElementById("reward-kyc-points").value = s.registrationPoints || s.kycCompletionPoints || 100;
            document.getElementById("reward-point-value").value = s.pointToWalletRate || s.rupeesPerPoint || 0.05;
        }
    } catch (e) {
        console.error("Error loading reward settings:", e);
    }
}

async function saveRewardSettings() {
    const pointsPer100Rupees = Number(document.getElementById("reward-buy-points")?.value);
    const referralPoints = Number(document.getElementById("reward-referral-points")?.value);
    const registrationPoints = Number(document.getElementById("reward-kyc-points")?.value);
    const pointToWalletRate = Number(document.getElementById("reward-point-value")?.value);

    try {
        const res = await api("/admin/rewards/settings", {
            method: "POST",
            body: JSON.stringify({ pointsPer100Rupees, referralPoints, registrationPoints, pointToWalletRate })
        });

        if (res.success) {
            toast("Reward settings updated successfully", "success");
        } else {
            toast(res.message || "Failed to save reward settings", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

function loadRewardsPage() {
    loadRewardsSummary();
    loadRewardSettings();
    if (activeRewardTab === "referrals") {
        loadAdminReferrals(1);
    } else if (activeRewardTab === "points") {
        loadRewardHistory(1);
    }
}
