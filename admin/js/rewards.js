/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Reward Points System Controller
   ══════════════════════════════════════════════════════════════ */

let rewardsHistory = [];
let rewardsPage = 1;

async function loadRewardSettings() {
    try {
        const res = await api("/admin/rewards/settings");
        if (res.success && res.data) {
            const s = res.data;
            document.getElementById("reward-buy-points").value = s.pointsPer100Rupees || 1;
            document.getElementById("reward-referral-points").value = s.referralPoints || 50;
            document.getElementById("reward-kyc-points").value = s.kycCompletionPoints || 25;
            document.getElementById("reward-point-value").value = s.rupeesPerPoint || 0.25;
        }
    } catch (e) {
        console.error("Error loading reward settings:", e);
    }
}

async function saveRewardSettings() {
    const pointsPer100Rupees = Number(document.getElementById("reward-buy-points")?.value);
    const referralPoints = Number(document.getElementById("reward-referral-points")?.value);
    const kycCompletionPoints = Number(document.getElementById("reward-kyc-points")?.value);
    const rupeesPerPoint = Number(document.getElementById("reward-point-value")?.value);

    try {
        const res = await api("/admin/rewards/settings", {
            method: "POST",
            body: JSON.stringify({ pointsPer100Rupees, referralPoints, kycCompletionPoints, rupeesPerPoint })
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

async function loadRewardHistory(page = 1) {
    rewardsPage = page;
    const body = document.getElementById("rewards-history-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading point transactions...</div></div>`;

    try {
        const res = await api(`/admin/rewards/history?page=${page}&limit=20`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load history</div></div>`;
            return;
        }

        rewardsHistory = res.data || [];
        renderRewardHistoryTable(rewardsHistory);
        document.getElementById("rewards-pagination-info").textContent = `Page ${res.page} of ${res.pages || 1} (${res.total || 0} logs)`;
        document.getElementById("btn-prev-rewards").disabled = res.page <= 1;
        document.getElementById("btn-next-rewards").disabled = res.page >= res.pages;
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
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
        body.innerHTML = `<div class="loading-box"><i class="fas fa-gift" style="font-size:32px;color:var(--text-dim)"></i><div>No reward transactions found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Points</th>
                    <th>Reason / Event</th>
                    <th>Balance After</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>`;

    logs.forEach(l => {
        const u = l.user || {};
        const isCredit = (l.points || 0) >= 0;

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${isCredit ? 'var(--success)' : 'var(--danger)'}">
                ${isCredit ? '+' : ''}${l.points} pts
            </td>
            <td style="font-size:13px">${l.description || l.type || 'Activity Bonus'}</td>
            <td style="font-family:var(--font-mono);color:var(--text-dim)">${l.balanceAfter || 0} pts</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(l.createdAt)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function loadRewardsPage() {
    loadRewardSettings();
    loadRewardHistory(1);
}
