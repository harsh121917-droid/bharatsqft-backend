/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Coupons & App Config Controller
   ══════════════════════════════════════════════════════════════ */

let allCoupons = [];
let editingCouponId = null;

// ── Coupons Management ────────────────────────────────────────
async function loadCoupons() {
    const body = document.getElementById("coupons-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading coupon offers...</div></div>`;

    try {
        const res = await api("/coupons/admin-list");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load coupons</div></div>`;
            return;
        }

        allCoupons = res.coupons || res.data || [];
        renderCouponsTable(allCoupons);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderCouponsTable(coupons) {
    const body = document.getElementById("coupons-body");
    if (!body) return;

    if (!coupons || coupons.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-ticket-alt" style="font-size:32px;color:var(--text-dim)"></i><div>No coupon codes created</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Code & Description</th>
                    <th>Benefit</th>
                    <th>Applies To</th>
                    <th>Min Purchase</th>
                    <th>Expiry</th>
                    <th>Active</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    coupons.forEach(c => {
        let benefitStr = c.type === "extra_gold"
            ? (c.valueType === "percentage" ? `+${c.value}% Extra Metal` : `+₹${c.value} Extra Metal`)
            : (c.valueType === "percentage" ? `${c.value}% Discount` : `₹${c.value} Flat Off`);

        html += `
        <tr>
            <td>
                <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold)">${c.code}</div>
                <div style="font-size:12px;color:var(--text-dim);margin-top:2px">${c.description || ''}</div>
            </td>
            <td><span class="badge badge-success">${benefitStr}</span></td>
            <td><span class="badge ${c.metalType === 'silver' ? 'badge-silver' : (c.metalType === 'gold' ? 'badge-gold' : 'badge-info')}">${(c.metalType || 'both').toUpperCase()}</span></td>
            <td style="font-weight:600">${c.minPurchaseAmount ? formatINR(c.minPurchaseAmount) : 'No Min'}</td>
            <td style="font-size:12px;color:var(--text-dim)">${c.expiryDate ? formatDate(c.expiryDate) : 'Never'}</td>
            <td>
                <label class="switch">
                    <input type="checkbox" ${c.isActive !== false ? 'checked' : ''} onchange="toggleCouponActive('${c._id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-icon" onclick="openCouponModal('${c._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteCoupon('${c._id}')"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function openCouponModal(id = null) {
    editingCouponId = id;
    const modal = document.getElementById("coupon-modal");
    if (!modal) return;

    if (id) {
        const c = allCoupons.find(item => item._id === id);
        if (c) {
            document.getElementById("coupon-modal-title").textContent = "Edit Coupon Offer";
            document.getElementById("coupon-code").value = c.code || "";
            document.getElementById("coupon-desc").value = c.description || "";
            document.getElementById("coupon-type").value = c.type || "extra_gold";
            document.getElementById("coupon-val-type").value = c.valueType || "percentage";
            document.getElementById("coupon-val").value = c.value || "";
            document.getElementById("coupon-min-amt").value = c.minPurchaseAmount || 0;
            document.getElementById("coupon-max-disc").value = c.maxDiscountAmount || 0;
            document.getElementById("coupon-metal").value = c.metalType || "both";
            document.getElementById("coupon-expiry").value = c.expiryDate ? new Date(c.expiryDate).toISOString().split('T')[0] : "";
        }
    } else {
        document.getElementById("coupon-modal-title").textContent = "Create New Coupon";
        document.getElementById("coupon-form")?.reset();
    }

    modal.style.display = "flex";
}

function closeCouponModal() {
    const modal = document.getElementById("coupon-modal");
    if (modal) modal.style.display = "none";
    editingCouponId = null;
}

async function saveCoupon() {
    const code = document.getElementById("coupon-code")?.value.trim().toUpperCase();
    const description = document.getElementById("coupon-desc")?.value.trim();
    const type = document.getElementById("coupon-type")?.value;
    const valueType = document.getElementById("coupon-val-type")?.value;
    const value = Number(document.getElementById("coupon-val")?.value);
    const minPurchaseAmount = Number(document.getElementById("coupon-min-amt")?.value) || 0;
    const maxDiscountAmount = Number(document.getElementById("coupon-max-disc")?.value) || 0;
    const metalType = document.getElementById("coupon-metal")?.value || "both";
    const expiryDate = document.getElementById("coupon-expiry")?.value || null;

    if (!code || !description || !value) {
        toast("Please provide coupon code, description, and value", "warning");
        return;
    }

    const payload = { code, description, type, valueType, value, minPurchaseAmount, maxDiscountAmount, metalType, expiryDate };

    try {
        let res;
        if (editingCouponId) {
            res = await api(`/coupons/${editingCouponId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/coupons", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res.success) {
            toast("Coupon saved successfully", "success");
            closeCouponModal();
            loadCoupons();
        } else {
            toast(res.message || "Failed to save coupon", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function toggleCouponActive(id, isActive) {
    try {
        const res = await api(`/coupons/${id}/toggle-active`, {
            method: "PATCH",
            body: JSON.stringify({ isActive })
        });
        if (res.success) {
            toast("Coupon status updated", "success");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function deleteCoupon(id) {
    if (!confirm("Are you sure?")) return;
    try {
        const res = await api(`/coupons/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Coupon deleted", "success");
            loadCoupons();
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

// ── App Version Configuration ─────────────────────────────────
async function loadAppConfig() {
    try {
        const res = await api("/admin/app-config");
        if (res.success && res.data) {
            const cfg = res.data;
            document.getElementById("app-latest-version").value = cfg.latestVersion || "1.0.0";
            document.getElementById("app-force-update").checked = !!cfg.forceUpdate;
            document.getElementById("app-playstore-url").value = cfg.playStoreUrl || "";
        }
    } catch (e) {
        console.error("Error loading app config:", e);
    }
}

async function saveAppConfig() {
    const latestVersion = document.getElementById("app-latest-version")?.value.trim();
    const forceUpdate = document.getElementById("app-force-update")?.checked;
    const playStoreUrl = document.getElementById("app-playstore-url")?.value.trim();

    try {
        const res = await api("/admin/app-config", {
            method: "POST",
            body: JSON.stringify({ latestVersion, forceUpdate, playStoreUrl })
        });

        if (res.success) {
            toast("App configuration updated", "success");
        } else {
            toast(res.message || "Failed to save", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
