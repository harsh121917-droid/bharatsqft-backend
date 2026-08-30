/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Gold & Silver Savings Schemes Controller
   ══════════════════════════════════════════════════════════════ */

let allSchemes = [];
let editingSchemeId = null;

async function loadSchemes() {
    const body = document.getElementById("schemes-plans-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading scheme plans...</div></div>`;

    try {
        const res = await api("/schemes/admin/all");
        if (!res.success) {
            // Fallback to public list if admin/all unavailable
            const fallbackRes = await api("/schemes");
            allSchemes = fallbackRes.data || [];
        } else {
            allSchemes = res.data || [];
        }

        renderSchemes(allSchemes);
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading schemes</div></div>`;
    }
}

function renderSchemes(schemes) {
    const body = document.getElementById("schemes-plans-body");
    if (!body) return;

    if (!schemes || schemes.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-award" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No savings scheme plans configured</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Click "+ New Scheme" to create a recurring savings plan (e.g. 11+1).</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Scheme Plan & Benefits</th>
                    <th>Metal</th>
                    <th>Duration & Bonus</th>
                    <th>Installment Range</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    schemes.forEach(s => {
        const isGold = (s.metal || "gold").toLowerCase() === "gold";
        const benefitsList = Array.isArray(s.benefits) ? s.benefits : (s.benefits ? String(s.benefits).split(",") : []);

        const statusBadge = s.active !== false
            ? `<span class="badge badge-success">● Active</span>`
            : `<span class="badge badge-danger">✕ Inactive</span>`;

        const maxCapText = (s.maxAmount && s.maxAmount > 0) ? `to ${formatINR(s.maxAmount)}` : `(No Cap)`;

        html += `
        <tr>
            <td>
                <div style="font-weight:700;color:#fff;font-size:14px">${s.name || 'Untitled Plan'}</div>
                <div style="font-size:11.5px;color:var(--text-dim);margin:3px 0 6px 0">${s.description || 'Recurring monthly savings plan with bonus metal.'}</div>
                ${benefitsList.length > 0 ? `
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                        ${benefitsList.slice(0, 3).map(b => `<span class="scheme-benefit-tag"><i class="fas fa-check-circle" style="color:var(--success)"></i> ${b.trim()}</span>`).join('')}
                        ${benefitsList.length > 3 ? `<span class="scheme-benefit-tag">+${benefitsList.length - 3} more</span>` : ''}
                    </div>
                ` : ''}
            </td>
            <td>
                <span class="badge ${isGold ? 'badge-gold' : 'badge-silver'}">
                    <i class="${isGold ? 'fas fa-coins' : 'fas fa-cubes'}"></i> ${(s.metal || 'gold').toUpperCase()}
                </span>
            </td>
            <td>
                <div style="font-weight:700;color:#fff">${s.durationMonths || 11} Months Pay</div>
                <div style="font-size:11px;color:var(--success);font-weight:700">+${s.bonusMonths || 1} Month Free Gold</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:#fff">Min ${formatINR(s.minAmount)}</div>
                <div style="font-size:11px;color:var(--text-dim)">${maxCapText}</div>
            </td>
            <td>${statusBadge}</td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" title="Toggle Active" onclick="toggleSchemeActive('${s._id}', ${s.active === false})">
                        <i class="fas ${s.active !== false ? 'fa-toggle-on' : 'fa-toggle-off'}" style="color:${s.active !== false ? 'var(--success)' : 'var(--danger)'}"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" title="Edit Scheme" onclick="openSchemeModal('${s._id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function openSchemeModal(id = null) {
    editingSchemeId = id;
    const modal = document.getElementById("scheme-modal");
    if (!modal) return;

    if (id) {
        const s = allSchemes.find(item => item._id === id);
        if (s) {
            document.getElementById("scheme-modal-title").textContent = "Edit Savings Scheme Plan";
            document.getElementById("scheme-name").value = s.name || "";
            document.getElementById("scheme-metal").value = s.metal || "gold";
            document.getElementById("scheme-duration").value = s.durationMonths || 11;
            document.getElementById("scheme-bonus").value = s.bonusMonths || 1;
            document.getElementById("scheme-min-amount").value = s.minAmount || 1000;
            document.getElementById("scheme-max-amount").value = s.maxAmount || 0;
            document.getElementById("scheme-benefits").value = Array.isArray(s.benefits) ? s.benefits.join(", ") : (s.benefits || "");
            document.getElementById("scheme-desc").value = s.description || "";
            document.getElementById("scheme-active").checked = s.active !== false;
        }
    } else {
        document.getElementById("scheme-modal-title").textContent = "Create New Savings Scheme Plan";
        document.getElementById("scheme-form")?.reset();
        document.getElementById("scheme-duration").value = 11;
        document.getElementById("scheme-bonus").value = 1;
        document.getElementById("scheme-min-amount").value = 1000;
        document.getElementById("scheme-max-amount").value = 0;
        document.getElementById("scheme-benefits").value = "Zero Making Charges on Maturity, 100% Insured Bullion, 1 Free Month Bonus";
        document.getElementById("scheme-active").checked = true;
    }

    modal.style.display = "flex";
}

function closeSchemeModal() {
    const modal = document.getElementById("scheme-modal");
    if (modal) modal.style.display = "none";
    editingSchemeId = null;
}

async function saveScheme() {
    const name = document.getElementById("scheme-name")?.value.trim();
    const metal = document.getElementById("scheme-metal")?.value || "gold";
    const durationMonths = Number(document.getElementById("scheme-duration")?.value);
    const bonusMonths = Number(document.getElementById("scheme-bonus")?.value);
    const minAmount = Number(document.getElementById("scheme-min-amount")?.value);
    const maxAmount = Number(document.getElementById("scheme-max-amount")?.value) || 0;
    const benefitsRaw = document.getElementById("scheme-benefits")?.value.trim() || "";
    const description = document.getElementById("scheme-desc")?.value.trim();
    const active = document.getElementById("scheme-active")?.checked;

    if (!name || !durationMonths || !minAmount) {
        toast("Please provide Scheme Name, Duration and Min Monthly Amount", "warning");
        return;
    }

    const benefits = benefitsRaw ? benefitsRaw.split(",").map(b => b.trim()).filter(Boolean) : [];

    const payload = {
        name,
        metal,
        durationMonths,
        bonusMonths,
        minAmount,
        maxAmount,
        benefits,
        description,
        active
    };

    try {
        let res;
        if (editingSchemeId) {
            res = await api(`/schemes/${editingSchemeId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/schemes", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res.success) {
            toast(`Scheme plan ${editingSchemeId ? 'updated' : 'created'} successfully`, "success");
            closeSchemeModal();
            loadSchemes();
        } else {
            toast(res.message || "Failed to save scheme plan", "danger");
        }
    } catch (e) {
        toast("Network error saving scheme plan", "danger");
    }
}

async function toggleSchemeActive(id, newStatus) {
    try {
        const res = await api(`/schemes/${id}`, {
            method: "PUT",
            body: JSON.stringify({ active: newStatus })
        });
        if (res.success) {
            toast(`Scheme marked as ${newStatus ? 'Active' : 'Inactive'}`, "success");
            loadSchemes();
        } else {
            toast(res.message || "Failed to update scheme status", "danger");
        }
    } catch (e) {
        toast("Network error updating status", "danger");
    }
}

// ── Enrollments ───────────────────────────────────────────────
async function loadEnrollments() {
    const body = document.getElementById("schemes-enrollments-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading subscriber enrollments...</div></div>`;

    try {
        const res = await api("/admin/schemes/enrollments");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load enrollments"}</div></div>`;
            return;
        }

        renderEnrollments(res.data || []);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderEnrollments(enrollments) {
    const body = document.getElementById("schemes-enrollments-body");
    if (!body) return;

    if (!enrollments || enrollments.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-users" style="font-size:32px;color:var(--text-dim)"></i><div>No active subscriptions found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Scheme</th>
                    <th>Monthly ₹</th>
                    <th>Progress</th>
                    <th>Gold/Silver Credited</th>
                    <th>Total Paid</th>
                    <th>Status</th>
                    <th style="text-align:right"><button class="btn btn-warning btn-sm" onclick="sendBulkSchemeReminders()"><i class="fas fa-bell"></i> Remind All Active</button></th>
                </tr>
            </thead>
            <tbody>`;

    enrollments.forEach(e => {
        const u = e.user || {};
        let badgeClass = "badge-success";
        if (e.status === "cancelled") badgeClass = "badge-danger";

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                <div style="font-weight:600">${e.schemeName}</div>
                <span class="badge ${e.metal === 'silver' ? 'badge-silver' : 'badge-gold'}" style="font-size:10.5px">${e.metal || 'gold'}</span>
            </td>
            <td style="font-weight:700;color:#fff">${formatINR(e.monthlyAmount)}</td>
            <td>
                <div style="font-weight:600">${e.installmentsPaid || 0} / ${e.durationMonths || 11}</div>
                <div style="width:70px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:3px">
                    <div style="width:${Math.min(((e.installmentsPaid || 0) / (e.durationMonths || 11)) * 100, 100)}%;height:100%;background:var(--gold)"></div>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-size:13px;color:var(--gold)">${formatGrams(e.totalGoldGrams || 0)}</td>
            <td style="font-weight:700;color:#fff">${formatINR(e.totalInvested || 0)}</td>
            <td><span class="badge ${badgeClass}">${e.status}</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="viewEnrollmentDetails('${e._id}')">
                    <i class="fas fa-list"></i> Milestones
                </button>
                ${e.status === 'active' ? `<button class="btn btn-warning btn-sm" onclick="sendSchemeReminder('${e._id}', '${(u.name || 'Customer').replace(/'/g, "\\'")}')"><i class="fas fa-bell"></i> Remind</button>` : ''}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

let activeEnrollment = null;

async function viewEnrollmentDetails(id) {
    const modal = document.getElementById("enrollment-detail-modal");
    const body = document.getElementById("enrollment-modal-body");
    if (!modal || !body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading subscriber milestones...</div></div>`;
    modal.style.display = "flex";

    try {
        let res = await api(`/schemes/enrollments/${id}`);
        if (!res.success || !res.data) {
            res = await api(`/admin/schemes/enrollments/${id}`);
        }

        if (!res.success || !res.data) {
            body.innerHTML = `<div style="color:var(--danger);padding:2rem;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:8px"></i><div>${res.message || "Failed to load enrollment details"}</div></div>`;
            return;
        }

        const e = res.data;
        activeEnrollment = e;

        const u = e.user || {};
        const custName = u.name || "Customer";
        const custPhone = u.phone || "—";
        const custEmail = u.email || "—";
        const isGold = (e.metal || "gold").toLowerCase() === "gold";
        const metalLabel = isGold ? "24K Gold (999)" : "Fine Silver (999)";

        const totalInstallments = e.durationMonths || 11;
        const paidCount = e.installmentsPaid || 0;
        const bonusCount = e.bonusMonths || 1;
        const progressPct = Math.min(Math.round((paidCount / totalInstallments) * 100), 100);

        let statusBadge = `<span class="badge badge-success">● Active Subscription</span>`;
        if (e.status === "completed") statusBadge = `<span class="badge badge-gold">★ Matured & Completed</span>`;
        else if (e.status === "cancelled") statusBadge = `<span class="badge badge-danger">✕ Cancelled</span>`;

        // Map payments by installment number
        const paymentsMap = {};
        let bonusPayment = null;
        (e.payments || []).forEach(p => {
            if (p.isBonus) {
                bonusPayment = p;
            } else if (p.installmentNo) {
                paymentsMap[p.installmentNo] = p;
            }
        });

        let html = `
        <div style="display:flex;flex-direction:column;gap:1.25rem">
            <!-- Header Summary Card -->
            <div style="background:var(--surface2);padding:1.25rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
                    <div>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span class="badge ${isGold ? 'badge-gold' : 'badge-silver'}">
                                <i class="${isGold ? 'fas fa-coins' : 'fas fa-cubes'}"></i> ${metalLabel}
                            </span>
                            ${statusBadge}
                        </div>
                        <div style="font-size:18px;font-weight:800;color:#fff;margin-top:6px">${e.schemeName || 'Savings Scheme'}</div>
                        <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
                            <strong style="color:#fff">${custName}</strong> • ${custPhone} • ${custEmail}
                        </div>
                    </div>

                    <div style="text-align:right">
                        <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Monthly Installment</div>
                        <div style="font-size:1.4rem;font-weight:800;color:var(--gold);font-family:var(--font-mono)">${formatINR(e.monthlyAmount)}</div>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div style="margin-top:1.25rem;background:var(--surface3);padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12.5px">
                        <span style="font-weight:700;color:#fff"><i class="fas fa-tasks" style="color:var(--gold)"></i> Milestone Progress</span>
                        <span style="font-weight:700;color:var(--gold)">${paidCount} of ${totalInstallments} Months Paid (${progressPct}%)</span>
                    </div>
                    <div style="width:100%;height:8px;background:var(--surface);border-radius:4px;overflow:hidden">
                        <div style="width:${progressPct}%;height:100%;background:linear-gradient(90deg, #f59e0b, #eab308);border-radius:4px;transition:width 0.3s ease"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--text-dim)">
                        <span>Started: <strong>${formatDate(e.startedAt || e.createdAt)}</strong></span>
                        <span>Total Paid: <strong style="color:#fff">${formatINR(e.totalInvested || 0)}</strong></span>
                        <span>Total Credited: <strong style="color:var(--gold);font-family:var(--font-mono)">${formatGrams(e.totalGoldGrams || 0)}</strong></span>
                    </div>
                </div>
            </div>

            <!-- Milestone Schedule Breakdown -->
            <div>
                <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:0.75rem;display:flex;align-items:center;gap:6px">
                    <i class="fas fa-calendar-check" style="color:var(--gold)"></i> Customer Monthly Milestone Schedule (${totalInstallments} + ${bonusCount} Free)
                </div>

                <div class="table-responsive" style="max-height:380px;overflow-y:auto">
                    <table>
                        <thead>
                            <tr>
                                <th style="width:70px">Month</th>
                                <th>Status</th>
                                <th>Amount</th>
                                <th>Rate Locked</th>
                                <th>Metal Credited</th>
                                <th>Payment Date</th>
                            </tr>
                        </thead>
                        <tbody>`;

        for (let m = 1; m <= totalInstallments; m++) {
            const p = paymentsMap[m];
            if (p) {
                // Paid Milestone
                html += `
                <tr style="background:rgba(46, 204, 113, 0.04)">
                    <td style="font-family:var(--font-mono);font-weight:700;color:#fff">M-${m}</td>
                    <td><span class="badge badge-success"><i class="fas fa-check-circle"></i> Paid</span></td>
                    <td style="font-weight:700;color:#fff">${formatINR(p.amount || e.monthlyAmount)}</td>
                    <td style="font-family:var(--font-mono);color:var(--text-dim)">${p.ratePerGram ? formatINR(p.ratePerGram) + '/g' : '—'}</td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${formatGrams(p.grams || 0)}</td>
                    <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(p.paidAt)}</td>
                </tr>`;
            } else if (m === paidCount + 1 && e.status === "active") {
                // Next Due Milestone
                html += `
                <tr style="background:rgba(245, 158, 11, 0.08);border-left:3px solid var(--gold)">
                    <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">M-${m}</td>
                    <td><span class="badge badge-warning"><i class="fas fa-clock"></i> Next Due</span></td>
                    <td style="font-weight:700;color:#fff">${formatINR(e.monthlyAmount)}</td>
                    <td style="font-size:12px;color:var(--text-dim)">Locked on pay</td>
                    <td style="font-size:12px;color:var(--text-dim)">Calculated live</td>
                    <td style="font-size:12px;color:var(--gold);font-weight:600">Awaiting customer payment</td>
                </tr>`;
            } else {
                // Future Upcoming Milestone
                html += `
                <tr style="opacity:0.65">
                    <td style="font-family:var(--font-mono);font-weight:600">M-${m}</td>
                    <td><span class="badge badge-secondary">○ Upcoming</span></td>
                    <td>${formatINR(e.monthlyAmount)}</td>
                    <td style="font-size:12px;color:var(--text-dim)">—</td>
                    <td style="font-size:12px;color:var(--text-dim)">—</td>
                    <td style="font-size:12px;color:var(--text-dim)">Pending milestone</td>
                </tr>`;
            }
        }

        // Bonus Month (Maturity Reward)
        if (bonusPayment) {
            html += `
            <tr style="background:rgba(245, 166, 35, 0.12);border-top:2px solid var(--gold)">
                <td style="font-family:var(--font-mono);font-weight:800;color:var(--gold)">M-${totalInstallments + 1}</td>
                <td><span class="badge badge-gold"><i class="fas fa-gift"></i> Bonus Credited</span></td>
                <td style="font-weight:700;color:var(--success)">FREE (₹0)</td>
                <td style="font-family:var(--font-mono);color:var(--text-dim)">${bonusPayment.ratePerGram ? formatINR(bonusPayment.ratePerGram) + '/g' : '—'}</td>
                <td style="font-family:var(--font-mono);font-weight:800;color:var(--gold)">+${formatGrams(bonusPayment.grams || 0)}</td>
                <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(bonusPayment.paidAt)}</td>
            </tr>`;
        } else {
            html += `
            <tr style="background:rgba(168, 85, 247, 0.08);border-top:1px dashed rgba(168, 85, 247, 0.35)">
                <td style="font-family:var(--font-mono);font-weight:800;color:#c084fc">M-${totalInstallments + 1}</td>
                <td><span class="badge badge-purple" style="background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.3)"><i class="fas fa-gift"></i> 1 Month Free Gold</span></td>
                <td style="font-weight:700;color:var(--success)">FREE (₹0)</td>
                <td style="font-size:12px;color:var(--text-dim)">Maturity rate</td>
                <td style="font-size:12px;color:#c084fc;font-weight:600">Worth ${formatINR(e.monthlyAmount)} Gold</td>
                <td style="font-size:12px;color:var(--text-dim)">Unlocks on Month ${totalInstallments} completion</td>
            </tr>`;
        }

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = `<div style="color:var(--danger);padding:2rem;text-align:center"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:8px"></i><div>Error loading subscriber details: ${err.message}</div></div>`;
    }
}

function closeEnrollmentModal() {
    const modal = document.getElementById("enrollment-detail-modal");
    if (modal) modal.style.display = "none";
}

function switchSchemeTab(tab) {
    document.querySelectorAll('.scheme-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (tab === 'plans') {
        document.getElementById('tab-scheme-plans-btn')?.classList.add('active');
        document.getElementById('schemes-plans-panel').style.display = 'block';
        document.getElementById('schemes-enrollments-panel').style.display = 'none';
        loadSchemes();
    } else {
        document.getElementById('tab-scheme-enrollments-btn')?.classList.add('active');
        document.getElementById('schemes-plans-panel').style.display = 'none';
        document.getElementById('schemes-enrollments-panel').style.display = 'block';
        loadEnrollments();
    }
}


async function sendSchemeReminder(enrollmentId, customerName) {
    if (!confirm(`Send installment payment reminder push notification to ${customerName}?`)) return;
    try {
        toast("Sending push reminder...", "info");
        const res = await api(`/schemes/enrollments/${enrollmentId}/remind`, { method: "POST" });
        if (res.success) {
            toast(res.message || "Reminder sent successfully!", "success");
        } else {
            toast(res.message || "Failed to send reminder", "danger");
        }
    } catch (e) {
        toast("Network error sending reminder", "danger");
    }
}

async function sendBulkSchemeReminders() {
    if (!confirm("Send installment due reminder push notifications to ALL active scheme subscribers?")) return;
    try {
        toast("Sending bulk reminders...", "info");
        const res = await api("/schemes/admin/remind-all", { method: "POST" });
        if (res.success) {
            toast(res.message || "Bulk reminders dispatched successfully!", "success");
        } else {
            toast(res.message || "Failed to send bulk reminders", "danger");
        }
    } catch (e) {
        toast("Network error sending bulk reminders", "danger");
    }
}
