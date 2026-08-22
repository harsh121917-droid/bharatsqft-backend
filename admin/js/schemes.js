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
                    <th style="text-align:right">Action</th>
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
                <button class="btn btn-secondary btn-sm" onclick="viewEnrollmentDetails('${e._id}')">
                    <i class="fas fa-list"></i> Milestones
                </button>
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

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading payment milestones...</div></div>`;
    modal.style.display = "flex";

    try {
        const res = await api(`/schemes/enrollments/${id}`);
        if (!res.success || !res.data) {
            body.innerHTML = `<div style="color:var(--danger)">Failed to load details</div>`;
            return;
        }

        const e = res.data;
        activeEnrollment = e;

        let paymentsHtml = `
        <div style="margin-bottom:1rem;background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
            <div style="font-size:15px;font-weight:700;color:#fff">${e.schemeName}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:3px">Customer: ${userNameEsc(e.user)} • Monthly: ${formatINR(e.monthlyAmount)}</div>
            <div style="font-size:13px;color:var(--gold);margin-top:3px">Total Credited: ${formatGrams(e.totalGoldGrams)} • Total Paid: ${formatINR(e.totalInvested)}</div>
        </div>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Amount</th>
                        <th>Rate Locked</th>
                        <th>Grams Credited</th>
                        <th>Type</th>
                        <th>Paid Date</th>
                    </tr>
                </thead>
                <tbody>`;

        (e.payments || []).forEach(p => {
            paymentsHtml += `
            <tr>
                <td style="font-family:var(--font-mono);font-weight:600">${p.installmentNo}</td>
                <td style="font-weight:700;color:#fff">${formatINR(p.amount)}</td>
                <td style="font-family:var(--font-mono)">${formatINR(p.ratePerGram)}/g</td>
                <td style="font-family:var(--font-mono);color:var(--gold)">${formatGrams(p.grams)}</td>
                <td><span class="badge ${p.isBonus ? 'badge-gold' : 'badge-success'}">${p.isBonus ? '★ Bonus Month' : 'Paid'}</span></td>
                <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(p.paidAt)}</td>
            </tr>`;
        });

        paymentsHtml += `</tbody></table></div>`;
        body.innerHTML = paymentsHtml;
    } catch (err) {
        body.innerHTML = `<div style="color:var(--danger)">Error: ${err.message}</div>`;
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
