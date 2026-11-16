/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — SIP Systematic Investment Plans Controller
   ══════════════════════════════════════════════════════════════ */

let allSipsData = [];
let currentSipPage = 1;
let totalSipPages = 1;
let activeSipDetail = null;
let currentSipCategory = "all";

// Goal Icons Dictionary
const GOAL_ICONS = {
    baby: { icon: "fas fa-baby", label: "Baby Savings", color: "#ec4899" },
    travel: { icon: "fas fa-plane-departure", label: "Travel / Vacation", color: "#06b6d4" },
    wedding: { icon: "fas fa-ring", label: "Wedding / Shaadi", color: "#f59e0b" },
    festival: { icon: "fas fa-om", label: "Festive Gold", color: "#d97706" },
    home: { icon: "fas fa-home", label: "Dream Home", color: "#3b82f6" },
    education: { icon: "fas fa-graduation-cap", label: "Higher Education", color: "#8b5cf6" },
    wealth: { icon: "fas fa-coins", label: "Wealth Building", color: "#10b981" },
    soldier: { icon: "fas fa-medal", label: "Veer Jawan / Soldier Goal", color: "#f59e0b" },
    car: { icon: "fas fa-car", label: "Dream Vehicle", color: "#06b6d4" },
    custom: { icon: "fas fa-bullseye", label: "Custom Bullion Goal", color: "#eab308" }
};

/**
 * 1-Click Category Filter Switcher (All / Veer Jawan / Simple)
 */
function switchSipCategoryTab(category) {
    currentSipCategory = category || "all";

    // Update Tab UI
    document.querySelectorAll(".sip-category-tab-btn").forEach((btn) => {
        btn.classList.remove("active");
    });
    const targetBtn = document.getElementById(
        category === "veer_jawan"
            ? "tab-sip-veer-jawan-btn"
            : category === "simple"
            ? "tab-sip-simple-btn"
            : "tab-sip-all-btn"
    );
    if (targetBtn) targetBtn.classList.add("active");

    // Sync Dropdown
    const typeSelect = document.getElementById("sip-filter-type");
    if (typeSelect) typeSelect.value = currentSipCategory;

    // Update Category Label Notice
    const labelNotice = document.getElementById("sip-current-category-label");
    if (labelNotice) {
        labelNotice.textContent =
            category === "veer_jawan"
                ? "🎖️ Veer Jawan SIP (Soldier Welfare Plan)"
                : category === "simple"
                ? "💎 Simple SIP (Bullion Recurring Plans)"
                : "All SIP Categories";
    }

    loadSips(1);
}

function onSipTypeDropdownChange(val) {
    switchSipCategoryTab(val);
}

function resetSipFilters() {
    const searchInput = document.getElementById("sip-filter-search");
    const metalSelect = document.getElementById("sip-filter-metal");
    const freqSelect = document.getElementById("sip-filter-freq");
    const statusSelect = document.getElementById("sip-filter-status");

    if (searchInput) searchInput.value = "";
    if (metalSelect) metalSelect.value = "all";
    if (freqSelect) freqSelect.value = "all";
    if (statusSelect) statusSelect.value = "all";

    switchSipCategoryTab("all");
}

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
            const elTotalInvested = document.getElementById("sip-kpi-total-invested");
            const elActive = document.getElementById("sip-kpi-active");
            const elVjInvested = document.getElementById("sip-kpi-vj-invested");
            const elVjCount = document.getElementById("sip-kpi-vj-count");
            const elSimpleInvested = document.getElementById("sip-kpi-simple-invested");
            const elSimpleCount = document.getElementById("sip-kpi-simple-count");
            const elGold = document.getElementById("sip-kpi-gold");
            const elSilver = document.getElementById("sip-kpi-silver");
            const elDue = document.getElementById("sip-kpi-due");
            const badgeActive = document.getElementById("sips-active-badge");

            if (elTotalInvested) elTotalInvested.textContent = formatINR(d.totalInvested || 0);
            if (elActive) elActive.textContent = `${d.activeSips || 0} / ${d.totalSips || 0}`;

            const vj = d.categories?.veerJawan;
            if (elVjInvested) elVjInvested.textContent = formatINR(vj?.totalInvested || 0);
            if (elVjCount) elVjCount.textContent = `${vj?.activeSips || 0} Active (${vj?.totalSips || 0} Total)`;

            const sm = d.categories?.simple;
            if (elSimpleInvested) elSimpleInvested.textContent = formatINR(sm?.totalInvested || 0);
            if (elSimpleCount) elSimpleCount.textContent = `${sm?.activeSips || 0} Active (${sm?.totalSips || 0} Total)`;

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
    const sipType = currentSipCategory || "all";

    const queryParams = new URLSearchParams({
        page,
        limit: 15,
        ...(search && { search }),
        ...(metal !== "all" && { metal }),
        ...(status !== "all" && { status }),
        ...(frequency !== "all" && { frequency }),
        ...(sipType !== "all" && { sipType }),
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
                No user has enrolled in ${currentSipCategory === 'veer_jawan' ? 'Veer Jawan SIP' : currentSipCategory === 'simple' ? 'Simple SIP' : 'SIP'} with the current search/filter parameters.
            </div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer Name & ID</th>
                    <th>SIP Type</th>
                    <th>Goal & Bullion</th>
                    <th>Investment Amount</th>
                    <th>SIP Start Date</th>
                    <th>Milestone Progress</th>
                    <th>Total Invested</th>
                    <th>SIP Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    sips.forEach((sip) => {
        const u = sip.user || {};
        const userName = sip.customerName || u.name || "Customer";
        const userPhone = sip.customerPhone || u.phone || "—";
        const userEmail = sip.customerEmail || u.email || "";
        const customerId = sip.customerId || (u._id ? `USR${u._id.toString().slice(-6).toUpperCase()}` : "—");
        const userInitial = (userName[0] || "U").toUpperCase();

        const isVeerJawan = sip.sipType === "veer_jawan" || sip.goalCategory === "soldier" || /veer\s*jawan|soldier/i.test(sip.goalTitle || "");
        const sipTypeBadge = isVeerJawan
            ? `<span class="badge" style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);font-weight:700;font-size:11px;padding:4px 8px"><i class="fas fa-medal"></i> Veer Jawan SIP</span>`
            : `<span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.35);font-weight:700;font-size:11px;padding:4px 8px"><i class="fas fa-gem"></i> Simple SIP</span>`;

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

        let startDateText = "—";
        if (sip.startDate || sip.createdAt) {
            const sd = new Date(sip.startDate || sip.createdAt);
            startDateText = sd.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        }

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

        const uId = u._id || sip.user;

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-avatar" style="width:34px;height:34px;font-size:13px;background:rgba(212,160,23,0.15);color:var(--gold);border:1px solid rgba(212,160,23,0.3)">
                        ${userInitial}
                    </div>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px">
                            <span style="font-weight:700;color:#fff;font-size:13.5px;cursor:pointer" onclick="${uId ? `openUserDetailsModal('${uId}')` : ''}" title="View customer profile">
                                ${userName}
                            </span>
                            <span class="badge badge-secondary" style="font-size:9.5px;font-family:var(--font-mono);padding:1px 5px">${customerId}</span>
                        </div>
                        <div style="font-size:11.5px;color:var(--text-dim)">
                            <i class="fas fa-phone-alt" style="font-size:10px;margin-right:2px"></i> ${userPhone}
                        </div>
                    </div>
                </div>
            </td>
            <td>
                ${sipTypeBadge}
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
            <td>
                <div style="font-size:12.5px;color:#fff;font-weight:600">
                    <i class="fas fa-calendar-alt" style="color:var(--gold);font-size:11px;margin-right:4px"></i>${startDateText}
                </div>
                <div style="font-size:10.5px;color:var(--text-dim)">
                    Next Due: <span style="color:${isDue ? '#f87171' : 'var(--text-dim)'};font-weight:${isDue ? '700' : 'normal'}">${dueDateText}</span>
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
                <div style="font-family:var(--font-mono);font-weight:800;color:var(--gold);font-size:14px">
                    ${formatINR(sip.totalInvested || 0)}
                </div>
                <div style="font-size:11px;color:#94a3b8">
                    Vault: <strong style="color:#fff">${(sip.totalGrams || 0).toFixed(4)} g</strong>
                </div>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px;align-items:center">
                    <button class="btn btn-secondary btn-sm" onclick="viewSipMilestones('${sip._id}')" title="View Milestones & Complete Transaction History">
                        <i class="fas fa-history" style="color:var(--gold)"></i> Milestones & Txns
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
 * Export SIP Investment Reports in Excel (CSV) or PDF
 */
async function exportSipsReport(format = "csv") {
    try {
        toast(`Generating ${format.toUpperCase()} SIP Investment Report...`, "info");

        const search = document.getElementById("sip-filter-search")?.value.trim() || "";
        const metal = document.getElementById("sip-filter-metal")?.value || "all";
        const status = document.getElementById("sip-filter-status")?.value || "all";
        const frequency = document.getElementById("sip-filter-freq")?.value || "all";
        const sipType = currentSipCategory || "all";

        const queryParams = new URLSearchParams({
            page: 1,
            limit: 5000,
            ...(search && { search }),
            ...(metal !== "all" && { metal }),
            ...(status !== "all" && { status }),
            ...(frequency !== "all" && { frequency }),
            ...(sipType !== "all" && { sipType }),
        });

        let res = await api(`/admin/sips?${queryParams.toString()}`);
        if (!res || !res.success) {
            res = await api(`/sip/admin/all?${queryParams.toString()}`);
        }

        const data = res?.data || allSipsData || [];
        if (!data || data.length === 0) {
            toast("No SIP records to export with current filters", "warning");
            return;
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        const categoryLabel = sipType === "veer_jawan" ? "Veer_Jawan_SIP" : sipType === "simple" ? "Simple_SIP" : "All_SIPs";

        if (format === "csv") {
            const headers = [
                "Customer Name",
                "Customer ID",
                "Mobile Number",
                "Email",
                "SIP Type",
                "Goal Plan",
                "Metal",
                "Installment Amount (INR)",
                "Frequency",
                "Duration (Months)",
                "Completed Cycles",
                "Total Cycles",
                "Total Invested (INR)",
                "Accumulated Grams",
                "Current Valuation (INR)",
                "Start Date",
                "Next Due Date",
                "Status",
                "AutoPay Mandate"
            ];

            const rows = data.map((s) => {
                const u = s.user || {};
                const name = (s.customerName || u.name || "Customer").replace(/"/g, '""');
                const id = s.customerId || (u._id ? `USR${u._id.toString().slice(-6).toUpperCase()}` : "");
                const phone = s.customerPhone || u.phone || "";
                const email = (s.customerEmail || u.email || "").replace(/"/g, '""');
                const type = s.sipTypeLabel || (s.sipType === "veer_jawan" || s.goalCategory === "soldier" ? "Veer Jawan SIP" : "Simple SIP");
                const goal = (s.goalTitle || s.goalCategory || "Wealth Building").replace(/"/g, '""');
                const metal = (s.metal || "gold").toUpperCase();
                const installment = s.installmentAmount || 0;
                const freq = s.frequency || "monthly";
                const duration = s.durationMonths || 12;
                const completed = s.cyclesCompleted || 0;
                const total = s.totalCycles || 12;
                const invested = s.totalInvested || 0;
                const grams = (s.totalGrams || 0).toFixed(4);
                const valuation = s.currentValuation || 0;
                const start = s.startDate || s.createdAt ? new Date(s.startDate || s.createdAt).toISOString().slice(0, 10) : "";
                const due = s.nextDueDate ? new Date(s.nextDueDate).toISOString().slice(0, 10) : "";
                const status = (s.status || "active").toUpperCase();
                const autopay = s.isAutopay ? "YES" : "NO";

                return [
                    `"${name}"`,
                    `"${id}"`,
                    `"${phone}"`,
                    `"${email}"`,
                    `"${type}"`,
                    `"${goal}"`,
                    `"${metal}"`,
                    installment,
                    `"${freq}"`,
                    duration,
                    completed,
                    total,
                    invested,
                    grams,
                    valuation,
                    `"${start}"`,
                    `"${due}"`,
                    `"${status}"`,
                    `"${autopay}"`
                ].join(",");
            });

            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Payvika_SIP_Report_${categoryLabel}_${dateStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast("✅ Excel (CSV) report downloaded successfully!", "success");
        } else if (format === "pdf") {
            const printWindow = window.open("", "_blank");
            if (!printWindow) {
                toast("Pop-up blocked. Please allow pop-ups to print/export PDF.", "warning");
                return;
            }

            const totalInvestedSum = data.reduce((sum, item) => sum + (item.totalInvested || 0), 0);
            const totalGramsSum = data.reduce((sum, item) => sum + (item.totalGrams || 0), 0);

            let rowsHtml = "";
            data.forEach((s, idx) => {
                const u = s.user || {};
                const name = s.customerName || u.name || "Customer";
                const id = s.customerId || (u._id ? `USR${u._id.toString().slice(-6).toUpperCase()}` : "—");
                const phone = s.customerPhone || u.phone || "—";
                const type = s.sipTypeLabel || (s.sipType === "veer_jawan" || s.goalCategory === "soldier" ? "Veer Jawan SIP" : "Simple SIP");
                const goal = s.goalTitle || s.goalCategory || "Wealth Building";
                const metal = (s.metal || "gold").toUpperCase();
                const installment = `₹${(s.installmentAmount || 0).toLocaleString("en-IN")} / ${s.frequency || "mo"}`;
                const invested = `₹${(s.totalInvested || 0).toLocaleString("en-IN")}`;
                const grams = `${(s.totalGrams || 0).toFixed(4)} g`;
                const start = s.startDate || s.createdAt ? new Date(s.startDate || s.createdAt).toLocaleDateString("en-IN") : "—";
                const status = (s.status || "active").toUpperCase();

                rowsHtml += `
                <tr style="border-bottom:1px solid #e2e8f0;font-size:12px;">
                    <td style="padding:8px 6px;">${idx + 1}</td>
                    <td style="padding:8px 6px;"><strong>${name}</strong><br/><span style="font-size:10px;color:#64748b;">${id}</span></td>
                    <td style="padding:8px 6px;">${phone}</td>
                    <td style="padding:8px 6px;"><strong style="color:${type.includes('Veer') ? '#d97706' : '#0284c7'}">${type}</strong></td>
                    <td style="padding:8px 6px;">${goal}<br/><span style="font-size:10px;color:#64748b;">${metal}</span></td>
                    <td style="padding:8px 6px;">${installment}</td>
                    <td style="padding:8px 6px;">${start}</td>
                    <td style="padding:8px 6px;text-align:right;"><strong>${invested}</strong><br/><span style="font-size:10px;color:#64748b;">${grams}</span></td>
                    <td style="padding:8px 6px;text-align:center;">
                        <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;background:${status === 'ACTIVE' ? '#dcfce7;color:#166534;' : status === 'PAUSED' ? '#fef3c7;color:#92400e;' : '#f1f5f9;color:#475569;'}">${status}</span>
                    </td>
                </tr>`;
            });

            printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payvika - SIP Investment Report (${categoryLabel})</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #0f172a; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
                    .title { font-size: 22px; font-weight: 800; color: #0f172a; }
                    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
                    .kpi-row { display: flex; gap: 16px; margin-bottom: 20px; }
                    .kpi-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; background: #f8fafc; }
                    .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
                    .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background: #f1f5f9; color: #334155; font-size: 11px; text-transform: uppercase; text-align: left; padding: 8px 6px; border-bottom: 2px solid #cbd5e1; }
                    @media print {
                        body { margin: 0; }
                        @page { margin: 1.5cm; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">Payvika / Bharat SQFT — SIP Investment Report</div>
                        <div class="subtitle">Category: <strong>${categoryLabel.replace(/_/g, " ")}</strong> • Generated: ${new Date().toLocaleString("en-IN")}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px;color:#64748b;">Confidential Admin Audit Report</div>
                        <div style="font-size:14px;font-weight:700;">Records: ${data.length} Customers</div>
                    </div>
                </div>

                <div class="kpi-row">
                    <div class="kpi-box">
                        <div class="kpi-label">Total Subscriptions</div>
                        <div class="kpi-val">${data.length} Enrolled</div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-label">Total Investment Collected</div>
                        <div class="kpi-val">₹${totalInvestedSum.toLocaleString("en-IN")}</div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-label">Total Bullion Accumulated</div>
                        <div class="kpi-val">${totalGramsSum.toFixed(4)} g</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Customer Name & ID</th>
                            <th>Mobile</th>
                            <th>SIP Type</th>
                            <th>Goal & Bullion</th>
                            <th>Installment</th>
                            <th>Start Date</th>
                            <th style="text-align:right;">Invested & Bullion</th>
                            <th style="text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>`);
            printWindow.document.close();
            toast("✅ PDF print preview opened!", "success");
        }
    } catch (err) {
        toast("Error generating export report", "danger");
    }
}
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
    const userName = sip.customerName || u.name || "Customer";
    const userPhone = sip.customerPhone || u.phone || "—";
    const userEmail = sip.customerEmail || u.email || "—";
    const customerId = sip.customerId || (u._id ? `USR${u._id.toString().slice(-6).toUpperCase()}` : "—");
    const metal = (sip.metal || "gold").toLowerCase();
    const isGold = metal === "gold";
    const isSilver = metal === "silver";

    const isVeerJawan = sip.sipType === "veer_jawan" || sip.goalCategory === "soldier" || /veer\s*jawan|soldier/i.test(sip.goalTitle || "");
    const sipTypeLabel = isVeerJawan ? "🎖️ Veer Jawan SIP" : "💎 Simple SIP";

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

    let startDateText = "—";
    if (sip.startDate || sip.createdAt) {
        startDateText = new Date(sip.startDate || sip.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }

    let html = `
    <!-- Top Subscriber & Goal Banner -->
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
                <div style="width:44px;height:44px;border-radius:50%;background:rgba(212,160,23,0.15);color:var(--gold);border:1px solid rgba(212,160,23,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800">
                    <i class="${goalMeta.icon}"></i>
                </div>
                <div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:16px;font-weight:800;color:#fff">${sip.goalTitle || goalMeta.label}</span>
                        <span class="badge" style="background:${isVeerJawan ? 'rgba(245,158,11,0.2)' : 'rgba(56,189,248,0.2)'};color:${isVeerJawan ? '#f59e0b' : '#38bdf8'};border:1px solid ${isVeerJawan ? 'rgba(245,158,11,0.4)' : 'rgba(56,189,248,0.4)'};font-weight:700;font-size:11px;padding:3px 8px">
                            ${sipTypeLabel}
                        </span>
                    </div>
                    <div style="font-size:12.5px;color:var(--text-dim);margin-top:2px">
                        Customer: <strong style="color:#fff">${userName}</strong> <span class="badge badge-secondary" style="font-size:9.5px;font-family:var(--font-mono);margin-left:4px">${customerId}</span> • <i class="fas fa-phone-alt" style="font-size:10px"></i> ${userPhone} • ${userEmail}
                    </div>
                    <div style="font-size:11.5px;color:var(--text-dim);margin-top:2px">
                        <i class="fas fa-calendar-check" style="color:var(--gold);font-size:11px"></i> Started: <strong>${startDateText}</strong>
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
