/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — SIP Systematic Investment Plans Controller
   ══════════════════════════════════════════════════════════════ */

let allSipsData = [];
let currentSipPage = 1;
let totalSipPages = 1;
let activeSipDetail = null;

// Goal Icons Dictionary
const GOAL_ICONS = {
    baby: { icon: "fas fa-baby", label: "Baby Savings", color: "#ec4899" },
    travel: { icon: "fas fa-plane-departure", label: "Travel / Vacation", color: "#06b6d4" },
    wedding: { icon: "fas fa-ring", label: "Wedding / Shaadi", color: "#f59e0b" },
    festival: { icon: "fas fa-om", label: "Festive Gold", color: "#d97706" },
    home: { icon: "fas fa-home", label: "Dream Home", color: "#3b82f6" },
    education: { icon: "fas fa-graduation-cap", label: "Higher Education", color: "#8b5cf6" },
    wealth: { icon: "fas fa-coins", label: "Wealth Building", color: "#10b981" },
    custom: { icon: "fas fa-bullseye", label: "Custom Bullion Goal", color: "#eab308" }
};

/**
 * Load SIP high-level portfolio summary metrics
 */
async function loadSipSummary() {
    try {
        let res = await api("/admin/sips/summary");
        if (!res || !res.success) {
            res = await api("/sip/admin/summary");
        }

        if (res && res.success && res.data) {
            const d = res.data;
            const elActive = document.getElementById("sip-kpi-active");
            const elInflow = document.getElementById("sip-kpi-inflow");
            const elGold = document.getElementById("sip-kpi-gold");
            const elSilver = document.getElementById("sip-kpi-silver");
            const elDue = document.getElementById("sip-kpi-due");
            const badgeActive = document.getElementById("sips-active-badge");

            if (elActive) elActive.textContent = `${d.activeSips || 0} / ${d.totalSips || 0}`;
            if (elInflow) elInflow.textContent = formatINR(d.totalMonthlyInflow || 0);
            if (elGold) elGold.textContent = `${(d.totalGramsGold || 0).toFixed(4)} g`;
            if (elSilver) elSilver.textContent = `${(d.totalGramsSilver || 0).toFixed(2)} g`;
            if (elDue) elDue.textContent = d.dueOrOverdueCount || 0;

            if (badgeActive) {
                if (d.activeSips > 0) {
                    badgeActive.textContent = d.activeSips;
                    badgeActive.style.display = "inline-block";
                } else {
                    badgeActive.style.display = "none";
                }
            }
        }
    } catch (err) {
        console.warn("Could not load SIP summary metrics:", err);
    }
}

/**
 * Load list of SIP subscriptions with filters and pagination
 */
async function loadSips(page = 1) {
    currentSipPage = page;
    const body = document.getElementById("sips-table-body");
    if (!body) return;

    body.innerHTML = `
    <div class="loading-box">
        <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
        <div>Loading SIP subscribers & milestones...</div>
    </div>`;

    const search = document.getElementById("sip-filter-search")?.value.trim() || "";
    const metal = document.getElementById("sip-filter-metal")?.value || "all";
    const status = document.getElementById("sip-filter-status")?.value || "all";
    const frequency = document.getElementById("sip-filter-freq")?.value || "all";

    const queryParams = new URLSearchParams({
        page,
        limit: 15,
        ...(search && { search }),
        ...(metal !== "all" && { metal }),
        ...(status !== "all" && { status }),
        ...(frequency !== "all" && { frequency }),
    });

    try {
        let res = await api(`/admin/sips?${queryParams.toString()}`);
        if (!res || !res.success) {
            res = await api(`/sip/admin/all?${queryParams.toString()}`);
        }

        if (res && res.success) {
            allSipsData = res.data || [];
            totalSipPages = res.pages || 1;
            renderSips(allSipsData);
            updateSipsPagination(res.total || 0, page, totalSipPages);
        } else {
            body.innerHTML = `
            <div class="loading-box">
                <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
                <div>${res?.message || "Failed to load SIPs"}</div>
            </div>`;
        }
    } catch (err) {
        body.innerHTML = `
        <div class="loading-box">
            <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
            <div>Network error loading SIP subscriptions</div>
        </div>`;
    }
}

/**
 * Render SIP table rows
 */
function renderSips(sips) {
    const body = document.getElementById("sips-table-body");
    if (!body) return;

    if (!sips || sips.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-bullseye" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:15px;color:#fff;font-weight:700">No SIP Subscriptions Found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
                No user has enrolled with the current search/filter parameters.
            </div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Subscriber Customer</th>
                    <th>Goal & Bullion</th>
                    <th>Installment & Frequency</th>
                    <th>Milestone Progress</th>
                    <th>Accumulated Vault</th>
                    <th>Next Due Date</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    sips.forEach((sip) => {
        const u = sip.user || {};
        const userName = u.name || "Customer";
        const userContact = u.phone || u.email || "—";
        const userInitial = (userName[0] || "U").toUpperCase();

        const metal = (sip.metal || "gold").toLowerCase();
        const isGold = metal === "gold";
        const isSilver = metal === "silver";
        const metalBadgeClass = isGold ? "badge-gold" : isSilver ? "badge-silver" : "badge-amber";
        const metalIcon = isGold ? "fas fa-coins" : isSilver ? "fas fa-cubes" : "fas fa-cube";

        const goalCat = (sip.goalCategory || "wealth").toLowerCase();
        const goalMeta = GOAL_ICONS[goalCat] || GOAL_ICONS.wealth;

        const totalCycles = sip.totalCycles || 12;
        const cyclesCompleted = sip.cyclesCompleted || 0;
        const progressPct = sip.progressPct || (totalCycles > 0 ? Math.min(Math.round((cyclesCompleted / totalCycles) * 100), 100) : 0);

        const isDue = sip.isDue || (sip.status === "active" && sip.nextDueDate && new Date(sip.nextDueDate) <= new Date());
        let dueDateText = "—";
        if (sip.nextDueDate) {
            const d = new Date(sip.nextDueDate);
            dueDateText = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        }

        let statusBadge = `<span class="badge badge-success">● Active</span>`;
        if (sip.status === "paused") {
            statusBadge = `<span class="badge badge-amber"><i class="fas fa-pause"></i> Paused</span>`;
        } else if (sip.status === "completed") {
            statusBadge = `<span class="badge badge-purple"><i class="fas fa-check-double"></i> Matured</span>`;
        } else if (sip.status === "cancelled") {
            statusBadge = `<span class="badge badge-danger">✕ Cancelled</span>`;
        }

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-avatar" style="width:34px;height:34px;font-size:13px;background:rgba(212,160,23,0.15);color:var(--gold);border:1px solid rgba(212,160,23,0.3)">
                        ${userInitial}
                    </div>
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13.5px">${userName}</div>
                        <div style="font-size:11.5px;color:var(--text-dim)">${userContact}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                    <i class="${goalMeta.icon}" style="color:${goalMeta.color};font-size:13px"></i>
                    <span style="font-weight:700;color:#fff;font-size:13px">${sip.goalTitle || goalMeta.label}</span>
                </div>
                <div style="display:flex;gap:4px;align-items:center">
                    <span class="badge ${metalBadgeClass}" style="font-size:10px;padding:2px 6px">
                        <i class="${metalIcon}"></i> ${metal.toUpperCase()}
                    </span>
                    ${sip.isAutopay ? `<span class="badge badge-blue" style="font-size:9.5px"><i class="fas fa-sync-alt"></i> AutoPay</span>` : `<span class="badge badge-secondary" style="font-size:9.5px">Manual</span>`}
                </div>
            </td>
            <td>
                <div style="font-weight:800;color:#fff;font-family:var(--font-mono);font-size:14px">
                    ${formatINR(sip.installmentAmount)}
                </div>
                <div style="font-size:11.5px;color:var(--text-dim);text-transform:capitalize">
                    Per ${sip.frequency || "month"} (${sip.durationMonths || 12}M)
                </div>
            </td>
            <td style="min-width:140px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;font-size:11.5px">
                    <span style="font-weight:700;color:#fff">${cyclesCompleted} / ${totalCycles} Cycles</span>
                    <span style="font-weight:700;color:var(--gold)">${progressPct}%</span>
                </div>
                <div style="width:100%;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;border:1px solid var(--border)">
                    <div style="width:${progressPct}%;height:100%;background:linear-gradient(90deg, #d4a017, #10b981);border-radius:3px"></div>
                </div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:800;color:var(--gold);font-size:13.5px">
                    ${(sip.totalGrams || 0).toFixed(4)} g
                </div>
                <div style="font-size:11px;color:var(--text-dim)">
                    Invested: ${formatINR(sip.totalInvested || 0)}
                </div>
            </td>
            <td>
                <div style="font-size:12.5px;color:${isDue ? '#f87171' : '#fff'};font-weight:${isDue ? '700' : '500'}">
                    ${isDue ? `<i class="fas fa-exclamation-circle" style="color:#ef4444;margin-right:3px"></i>` : ''}
                    ${dueDateText}
                </div>
                <div style="font-size:10.5px;color:var(--text-dim)">
                    ${isDue ? '<span style="color:#f87171;font-weight:700">Due / Overdue</span>' : 'Scheduled'}
                </div>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px;align-items:center">
                    <button class="btn btn-secondary btn-sm" onclick="viewSipMilestones('${sip._id}')" title="View Milestone Journey">
                        <i class="fas fa-road"></i> Milestones
                    </button>
                    ${sip.status === 'active' ? `
                    <button class="btn btn-warning btn-sm" onclick="sendSipReminder('${sip._id}', '${userName.replace(/'/g, "\\'")}')" title="Send Push Notification Reminder">
                        <i class="fas fa-bell"></i>
                    </button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="openSipStatusDropdown(event, '${sip._id}', '${sip.status}')" title="Change Status">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

/**
 * Update pagination UI
 */
function updateSipsPagination(total, page, pages) {
    const infoEl = document.getElementById("sips-pagination-info");
    const prevBtn = document.getElementById("btn-prev-sips");
    const nextBtn = document.getElementById("btn-next-sips");

    if (infoEl) {
        infoEl.textContent = `Showing page ${page} of ${pages || 1} (${total} total subscriptions)`;
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= pages;
}

function prevSipsPage() {
    if (currentSipPage > 1) {
        loadSips(currentSipPage - 1);
    }
}

function nextSipsPage() {
    if (currentSipPage < totalSipPages) {
        loadSips(currentSipPage + 1);
    }
}

/**
 * Open and load Step-by-Step Milestone Journey modal
 */
async function viewSipMilestones(sipId) {
    const modal = document.getElementById("sip-milestone-modal");
    const body = document.getElementById("sip-milestone-modal-body");
    if (!modal || !body) return;

    body.innerHTML = `
    <div class="loading-box" style="padding:3rem">
        <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
        <div>Loading subscriber roadmap and milestone history...</div>
    </div>`;

    modal.style.display = "flex";

    try {
        let res = await api(`/admin/sips/${sipId}`);
        if (!res || !res.success) {
            res = await api(`/sip/admin/${sipId}`);
        }
        if (!res || !res.success) {
            res = await api(`/sip/${sipId}`);
        }

        if (!res || !res.success || !res.data) {
            body.innerHTML = `
            <div style="color:var(--danger);padding:2rem;text-align:center">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:8px"></i>
                <div>${res?.message || "Failed to load milestone journey"}</div>
            </div>`;
            return;
        }

        activeSipDetail = res.data.sip;
        const journey = res.data.journey || [];
        renderSipMilestoneModalContent(activeSipDetail, journey);
    } catch (err) {
        body.innerHTML = `
        <div style="color:var(--danger);padding:2rem;text-align:center">
            <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:8px"></i>
            <div>Network error fetching SIP milestone details</div>
        </div>`;
    }
}

/**
 * Render Milestone Journey inside modal
 */
function renderSipMilestoneModalContent(sip, journey) {
    const body = document.getElementById("sip-milestone-modal-body");
    const footer = document.getElementById("sip-milestone-modal-footer");
    if (!body) return;

    const u = sip.user || {};
    const userName = u.name || "Customer";
    const userPhone = u.phone || "—";
    const userEmail = u.email || "—";
    const metal = (sip.metal || "gold").toLowerCase();
    const isGold = metal === "gold";
    const isSilver = metal === "silver";

    const goalCat = (sip.goalCategory || "wealth").toLowerCase();
    const goalMeta = GOAL_ICONS[goalCat] || GOAL_ICONS.wealth;

    const totalCycles = sip.totalCycles || 12;
    const cyclesCompleted = sip.cyclesCompleted || 0;
    const progressPct = sip.progressPct || (totalCycles > 0 ? Math.round((cyclesCompleted / totalCycles) * 100) : 0);

    const invested = sip.totalInvested || 0;
    const valuation = sip.currentValuation || 0;
    const returnsAmt = sip.returnsAmt || 0;
    const returnsPct = sip.returnsPct || 0;
    const isPositive = returnsAmt >= 0;

    let html = `
    <!-- Top Subscriber & Goal Banner -->
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
                <div style="width:44px;height:44px;border-radius:50%;background:rgba(212,160,23,0.15);color:var(--gold);border:1px solid rgba(212,160,23,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800">
                    <i class="${goalMeta.icon}"></i>
                </div>
                <div>
                    <div style="font-size:16px;font-weight:800;color:#fff">${sip.goalTitle || goalMeta.label}</div>
                    <div style="font-size:12.5px;color:var(--text-dim);margin-top:2px">
                        Subscriber: <strong style="color:#fff">${userName}</strong> • ${userPhone} • ${userEmail}
                    </div>
                </div>
            </div>
            <div style="text-align:right">
                <span class="badge ${isGold ? 'badge-gold' : isSilver ? 'badge-silver' : 'badge-amber'}" style="font-size:12px;padding:4px 10px">
                    <i class="${isGold ? 'fas fa-coins' : isSilver ? 'fas fa-cubes' : 'fas fa-cube'}"></i> ${(sip.metal || 'gold').toUpperCase()} SIP
                </span>
                <div style="font-size:11px;color:var(--text-dim);margin-top:4px">
                    ${sip.isAutopay ? '<span style="color:var(--blue)"><i class="fas fa-check-circle"></i> Razorpay AutoPay Mandate Active</span>' : 'Manual Recurring Wallet'}
                </div>
            </div>
        </div>
    </div>

    <!-- Financial Performance Strip (4 Metrics) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:1.5rem">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">Total Invested</div>
            <div style="font-size:16px;font-weight:800;color:#fff;font-family:var(--font-mono);margin-top:2px">${formatINR(invested)}</div>
            <div style="font-size:10.5px;color:var(--text-muted)">${cyclesCompleted} / ${totalCycles} Installments</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">Live Valuation</div>
            <div style="font-size:16px;font-weight:800;color:#10b981;font-family:var(--font-mono);margin-top:2px">${formatINR(valuation)}</div>
            <div style="font-size:10.5px;color:var(--text-muted)">@ ₹${(sip.currentLiveRate || 0).toLocaleString('en-IN')}/g</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">Bullion Vault</div>
            <div style="font-size:16px;font-weight:800;color:var(--gold);font-family:var(--font-mono);margin-top:2px">${(sip.totalGrams || 0).toFixed(4)} g</div>
            <div style="font-size:10.5px;color:var(--text-muted)">Pure Physical Gold/Silver</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;font-weight:700">Estimated Returns</div>
            <div style="font-size:16px;font-weight:800;color:${isPositive ? '#10b981' : '#f87171'};font-family:var(--font-mono);margin-top:2px">
                ${isPositive ? '+' : ''}${formatINR(returnsAmt)} (${isPositive ? '+' : ''}${returnsPct}%)
            </div>
            <div style="font-size:10.5px;color:var(--text-muted)">Capital Growth</div>
        </div>
    </div>

    <!-- Milestone Journey Timeline -->
    <div style="margin-bottom:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:13.5px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:0.5px">
                <i class="fas fa-flag-checkered" style="color:var(--gold)"></i> Step-by-Step Milestone Journey (${cyclesCompleted}/${totalCycles})
            </div>
            <span class="badge badge-gold" style="font-size:11px">${progressPct}% Goal Achieved</span>
        </div>

        <div class="table-responsive" style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-md)">
            <table>
                <thead>
                    <tr>
                        <th style="width:70px">Cycle #</th>
                        <th>Milestone Status</th>
                        <th>Scheduled / Paid Date</th>
                        <th>Installment Amount</th>
                        <th>Bullion Rate</th>
                        <th>Grams Credited</th>
                        <th>Payment Method / Txn</th>
                    </tr>
                </thead>
                <tbody>`;

    journey.forEach((m) => {
        const isCompleted = m.status === "completed";
        const isUpcoming = m.status === "upcoming";

        let statusBadge = `<span class="badge badge-secondary" style="font-size:10px"><i class="fas fa-clock"></i> Future Scheduled</span>`;
        let rowStyle = `opacity:0.65;`;

        if (isCompleted) {
            statusBadge = `<span class="badge badge-success" style="font-size:10px"><i class="fas fa-check-circle"></i> Paid & Credited</span>`;
            rowStyle = ``;
        } else if (isUpcoming) {
            statusBadge = `<span class="badge badge-amber" style="font-size:10px"><i class="fas fa-hourglass-half"></i> Due for Payment</span>`;
            rowStyle = `background:rgba(245,158,11,0.06);font-weight:600;`;
        }

        let dateFormatted = "—";
        if (m.date) {
            dateFormatted = new Date(m.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        } else if (m.dueDate) {
            dateFormatted = new Date(m.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        }

        html += `
        <tr style="${rowStyle}">
            <td style="font-weight:800;color:#fff;font-family:var(--font-mono)">
                #${m.cycleNo}
            </td>
            <td>${statusBadge}</td>
            <td style="font-size:12px;color:#fff">${dateFormatted}</td>
            <td style="font-weight:700;color:#fff;font-family:var(--font-mono)">${formatINR(m.amount)}</td>
            <td style="font-size:12px;color:var(--text-dim)">
                ${m.ratePerGram ? `₹${m.ratePerGram.toLocaleString('en-IN')}/g` : '—'}
            </td>
            <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">
                ${m.grams ? `${m.grams.toFixed(4)} g` : '—'}
            </td>
            <td style="font-size:11.5px;color:var(--text-dim)">
                ${isCompleted ? `
                    <span style="color:#fff;text-transform:uppercase;font-weight:600">${m.paymentMethod || 'wallet'}</span>
                    ${m.txnId ? `<div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">Txn: ${m.txnId.substring(0, 14)}...</div>` : ''}
                ` : isUpcoming ? `<span style="color:#f59e0b">Next in Queue</span>` : `<span>Scheduled</span>`}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;
    body.innerHTML = html;

    // Footer actions
    if (footer) {
        footer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;flex-wrap:wrap;gap:8px">
            <div style="display:flex;gap:8px">
                <button class="btn btn-warning btn-sm" onclick="sendSipReminder('${sip._id}', '${userName.replace(/'/g, "\\'")}')">
                    <i class="fas fa-bell"></i> Send Push Reminder
                </button>
                <button class="btn btn-success btn-sm" onclick="promptRecordSipInstallment('${sip._id}')">
                    <i class="fas fa-plus-circle"></i> Record Manual Installment
                </button>
            </div>
            <div style="display:flex;gap:8px">
                ${sip.status === 'active' ? `
                <button class="btn btn-secondary btn-sm" onclick="toggleSipStatusAdmin('${sip._id}', 'paused')">
                    <i class="fas fa-pause"></i> Pause SIP
                </button>` : sip.status === 'paused' ? `
                <button class="btn btn-success btn-sm" onclick="toggleSipStatusAdmin('${sip._id}', 'active')">
                    <i class="fas fa-play"></i> Resume SIP
                </button>` : ''}
                ${sip.status !== 'cancelled' && sip.status !== 'completed' ? `
                <button class="btn btn-danger btn-sm" onclick="toggleSipStatusAdmin('${sip._id}', 'cancelled')">
                    <i class="fas fa-ban"></i> Cancel SIP
                </button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="closeSipMilestoneModal()">Close</button>
            </div>
        </div>`;
    }
}

function closeSipMilestoneModal() {
    const modal = document.getElementById("sip-milestone-modal");
    if (modal) modal.style.display = "none";
}

/**
 * Send SIP Push Reminder to Single User
 */
async function sendSipReminder(id, userName) {
    try {
        toast(`Sending milestone reminder to ${userName}...`, "info");
        const res = await api(`/sip/${id}/remind`, { method: "POST" });
        if (res && res.success) {
            toast(`✅ Reminder sent to ${userName} successfully!`, "success");
        } else {
            toast(res?.message || "Failed to send reminder", "danger");
        }
    } catch (err) {
        toast("Network error dispatching reminder", "danger");
    }
}

/**
 * Send Bulk Reminders to All Active SIP Subscribers
 */
async function sendBulkSipReminders() {
    if (!confirm("Are you sure you want to broadcast SIP installment reminder notifications to ALL active subscribers?")) {
        return;
    }

    try {
        toast("Broadcasting SIP reminders to all active subscribers...", "info");
        const res = await api("/sip/admin/remind-all", { method: "POST" });
        if (res && res.success) {
            toast(res.message || "Dispatched SIP reminders successfully!", "success");
        } else {
            toast(res?.message || "Failed to dispatch bulk reminders", "danger");
        }
    } catch (err) {
        toast("Network error broadcasting reminders", "danger");
    }
}

/**
 * Update SIP Status (active / paused / cancelled / completed)
 */
async function toggleSipStatusAdmin(id, newStatus) {
    if (!confirm(`Are you sure you want to change this SIP subscription status to "${newStatus.toUpperCase()}"?`)) {
        return;
    }

    try {
        const res = await api(`/admin/sips/${id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: newStatus })
        });

        if (res && res.success) {
            toast(res.message || `SIP status changed to ${newStatus}`, "success");
            closeSipMilestoneModal();
            loadSips(currentSipPage);
            loadSipSummary();
        } else {
            toast(res?.message || "Failed to change SIP status", "danger");
        }
    } catch (err) {
        toast("Network error updating SIP status", "danger");
    }
}

/**
 * Prompt Admin to Record an Offline Installment Payment
 */
async function promptRecordSipInstallment(id) {
    const amount = prompt("Enter installment amount to credit (₹):", activeSipDetail?.installmentAmount || 1000);
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return;

    const note = prompt("Enter payment reference / Txn ID (e.g. Bank IMPS / UPI receipt):", "OFFLINE-MANUAL-ADMIN");

    try {
        toast("Recording milestone installment...", "info");
        const res = await api(`/admin/sips/${id}/record-installment`, {
            method: "POST",
            body: JSON.stringify({
                customAmount: parseFloat(amount),
                paymentMethod: "manual_admin",
                txnId: note || "OFFLINE-MANUAL-ADMIN",
            })
        });

        if (res && res.success) {
            toast(res.message || "Installment credited successfully!", "success");
            viewSipMilestones(id);
            loadSips(currentSipPage);
            loadSipSummary();
        } else {
            toast(res?.message || "Failed to credit installment", "danger");
        }
    } catch (err) {
        toast("Network error recording installment", "danger");
    }
}

/**
 * Status Action Dropdown
 */
function openSipStatusDropdown(e, id, currentStatus) {
    e.stopPropagation();
    const action = prompt(`Change SIP status to:\n1. active\n2. paused\n3. cancelled\n4. completed\n(Type the status name):`, currentStatus);
    if (!action) return;

    const target = action.trim().toLowerCase();
    if (["active", "paused", "cancelled", "completed"].includes(target)) {
        toggleSipStatusAdmin(id, target);
    } else {
        toast("Invalid status entered", "warning");
    }
}

// ── Search & Filter Listeners ─────────────────────────────────
let sipSearchDebounce = null;
function onSipSearchInput() {
    clearTimeout(sipSearchDebounce);
    sipSearchDebounce = setTimeout(() => {
        loadSips(1);
    }, 350);
}
