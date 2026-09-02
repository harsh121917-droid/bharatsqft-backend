/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Payment Gateways Controller
   ══════════════════════════════════════════════════════════════ */

let allGateways = [];
let editingGatewayId = null;

async function loadGateways() {
    const body = document.getElementById("gateways-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading payment gateways...</div></div>`;

    try {
        const res = await api("/admin/payment-gateways");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load gateways"}</div></div>`;
            return;
        }

        allGateways = res.data || [];
        renderGateways(allGateways);
    } catch (e) {
        console.error("Error loading gateways:", e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading gateways</div></div>`;
    }
}

function renderGateways(gateways) {
    const body = document.getElementById("gateways-body");
    if (!body) return;

    if (!gateways || gateways.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-credit-card" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No payment gateways configured yet</div><div style="font-size:12px;color:var(--text-dim)">Click "+ Add Gateway" above to configure HDFC Razorpay, Normal Razorpay, or Cashfree.</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th>Gateway Provider & Purpose</th>
                    <th>Key / Client ID</th>
                    <th>Assigned Flows</th>
                    <th>System Default</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    gateways.forEach((g, idx) => {
        const isLive = g.mode === "live";
        const rawName = (g.name || "").toLowerCase();
        const isRzp = rawName.includes("razorpay");
        const isHdfc = rawName === "razorpay_hdfc";
        const isStandard = rawName === "razorpay_standard";
        const isPayout = rawName === "cashfree_payout";
        const keyDisplay = g.keyId || g.clientId || "—";
        const isDef = !!g.isDefault;
        const gatewayId = g._id || g.id || idx;

        let iconClass = "fas fa-bolt";
        let iconBg = "rgba(59,130,246,0.15)";
        let iconColor = "#3B82F6";
        let title = g.label || g.name || "Gateway";
        let purposeBadge = `<span class="badge badge-blue"><i class="fas fa-bolt"></i> General</span>`;

        if (isHdfc) {
            iconClass = "fas fa-building-columns";
            iconBg = "rgba(212,160,23,0.18)";
            iconColor = "#D4A017";
            title = "🏛️ HDFC Razorpay (0% Fee)";
            purposeBadge = `<span class="badge badge-gold" style="font-size:11px;font-weight:700"><i class="fas fa-coins"></i> Buy Metals & Wallet Add</span>`;
        } else if (isStandard) {
            iconClass = "fas fa-sync-alt";
            iconBg = "rgba(168,85,247,0.18)";
            iconColor = "#A855F7";
            title = "🔄 Normal Razorpay (Sub Fee)";
            purposeBadge = `<span class="badge badge-purple" style="font-size:11px;font-weight:700"><i class="fas fa-calendar-alt"></i> SIP AutoPay & Savings Schemes</span>`;
        } else if (isPayout) {
            iconClass = "fas fa-money-bill-transfer";
            iconBg = "rgba(16,185,129,0.18)";
            iconColor = "#10B981";
            title = "🏦 Cashfree Payouts";
            purposeBadge = `<span class="badge badge-success" style="font-size:11px"><i class="fas fa-hand-holding-dollar"></i> Bank Payouts</span>`;
        } else if (rawName === "cashfree") {
            iconClass = "fas fa-wallet";
            iconBg = "rgba(16,185,129,0.18)";
            iconColor = "#10B981";
            title = "💳 Cashfree PG";
            purposeBadge = `<span class="badge badge-success" style="font-size:11px"><i class="fas fa-credit-card"></i> Card & UPI</span>`;
        }

        html += `
        <tr style="${isDef ? 'background:rgba(212,160,23,0.06)' : ''}">
            <td>
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:38px;height:38px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;color:${iconColor};font-size:17px;flex-shrink:0">
                        <i class="${iconClass}"></i>
                    </div>
                    <div>
                        <div style="font-weight:800;color:#fff;font-size:13.5px">
                            ${title}
                            <span class="badge ${isLive ? 'badge-success' : 'badge-warning'}" style="margin-left:6px;font-size:9.5px;text-transform:uppercase">${g.mode || 'live'}</span>
                        </div>
                        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">Key ID: <code style="font-family:monospace;color:var(--gold)">${keyDisplay.slice(0, 18)}${keyDisplay.length > 18 ? '...' : ''}</code></div>
                    </div>
                </div>
            </td>
            <td>
                <code style="background:var(--subBg, #0d1410);padding:4px 8px;border-radius:6px;font-size:12px;color:var(--gold, #d4a017);border:1px solid var(--border, #2a4736)">${keyDisplay}</code>
            </td>
            <td>
                ${purposeBadge}
            </td>
            <td>
                ${isDef ? 
                    `<span class="badge badge-success" style="background:#10B981;color:#000;font-weight:900;padding:4px 10px;border-radius:8px"><i class="fas fa-check-circle"></i> ACTIVE DEFAULT</span>` : 
                    `<button type="button" class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;cursor:pointer;" onclick="setGatewayDefault('${gatewayId}')"><i class="fas fa-star"></i> Set as Default</button>`
                }
            </td>
            <td>
                <label class="switch">
                    <input type="checkbox" ${g.isActive ? 'checked' : ''} onchange="toggleGatewayActive('${gatewayId}', this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button type="button" class="btn btn-sm btn-outline" onclick="openGatewayModal('${gatewayId}')" title="Edit Gateway" style="cursor:pointer;"><i class="fas fa-edit"></i> Edit</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deleteGateway('${gatewayId}')" title="Delete Gateway" style="cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function openGatewayModal(id = null) {
    editingGatewayId = id ? id.toString() : null;
    const secretInput = document.getElementById("gateway-secret");
    const secretIcon = document.getElementById("toggle-gateway-secret-icon");
    if (secretInput) secretInput.type = "password";
    if (secretIcon) {
        secretIcon.className = "fas fa-eye";
        secretIcon.style.color = "var(--text-dim, #94a3b8)";
    }
    const modal = document.getElementById("gateway-modal");
    if (!modal) {
        console.error("Critical: #gateway-modal element not found in DOM!");
        toast("Gateway modal not found in DOM", "danger");
        return;
    }

    if (id) {
        const g = allGateways.find(item => (item._id && item._id.toString() === id.toString()) || (item.id && item.id.toString() === id.toString()));
        if (g) {
            const titleEl = document.getElementById("gateway-modal-title");
            if (titleEl) titleEl.innerHTML = '<i class="fas fa-edit" style="color:var(--gold);margin-right:8px"></i> Edit Payment Gateway';
            
            const nameEl = document.getElementById("gateway-name");
            if (nameEl) nameEl.value = (g.name || "razorpay").toLowerCase();
            
            const modeEl = document.getElementById("gateway-mode");
            if (modeEl) modeEl.value = (g.mode || "live").toLowerCase();
            
            const keyEl = document.getElementById("gateway-key");
            if (keyEl) keyEl.value = g.keyId || g.clientId || "";
            
            const secretEl = document.getElementById("gateway-secret");
            if (secretEl) {
                secretEl.value = "";
                secretEl.placeholder = "Leave blank to keep existing (" + (g.keySecret || g.clientSecret || "••••") + ")";
            }
            
            const defEl = document.getElementById("gateway-is-default");
            if (defEl) defEl.checked = !!g.isDefault;
            
            const actEl = document.getElementById("gateway-is-active");
            if (actEl) actEl.checked = g.isActive !== false;
        }
    } else {
        const titleEl = document.getElementById("gateway-modal-title");
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus" style="color:var(--gold);margin-right:8px"></i> Add Payment Gateway';
        
        const formEl = document.getElementById("gateway-form");
        if (formEl) formEl.reset();
        
        const nameEl = document.getElementById("gateway-name");
        if (nameEl) nameEl.value = "razorpay";
        
        const modeEl = document.getElementById("gateway-mode");
        if (modeEl) modeEl.value = "live";
        
        const keyEl = document.getElementById("gateway-key");
        if (keyEl) keyEl.value = "";
        
        const secretEl = document.getElementById("gateway-secret");
        if (secretEl) {
            secretEl.value = "";
            secretEl.placeholder = "Enter API Secret Key";
        }
        
        const defEl = document.getElementById("gateway-is-default");
        if (defEl) defEl.checked = allGateways.length === 0;
        
        const actEl = document.getElementById("gateway-is-active");
        if (actEl) actEl.checked = true;
    }

    modal.style.display = "flex";
}

function closeGatewayModal() {
    const modal = document.getElementById("gateway-modal");
    if (modal) modal.style.display = "none";
    editingGatewayId = null;
}

async function saveGateway() {
    const name = document.getElementById("gateway-name")?.value.trim().toLowerCase();
    const mode = document.getElementById("gateway-mode")?.value.trim().toLowerCase() || "live";
    const keyId = document.getElementById("gateway-key")?.value.trim();
    const secretKey = document.getElementById("gateway-secret")?.value.trim();
    const isDefault = !!document.getElementById("gateway-is-default")?.checked;
    const isActive = !!document.getElementById("gateway-is-active")?.checked;

    if (!name || !keyId) {
        toast("Please provide gateway name and Key ID / Client ID", "warning");
        return;
    }

    const payload = {
        name,
        mode,
        keyId,
        clientId: keyId,
        isActive,
        isDefault,
    };

    if (secretKey && secretKey.length > 0 && !secretKey.includes("••••")) {
        payload.keySecret = secretKey;
        payload.clientSecret = secretKey;
    }

    try {
        let res;
        if (editingGatewayId) {
            res = await api(`/admin/payment-gateways/${editingGatewayId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/admin/payment-gateways", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res && res.success) {
            toast(res.message || "Gateway saved successfully", "success");
            closeGatewayModal();
            loadGateways();
        } else {
            toast(res?.message || "Failed to save gateway", "danger");
        }
    } catch (e) {
        console.error("Save gateway error:", e);
        toast(e.message || "Network error saving gateway", "danger");
    }
}

async function toggleGatewayActive(id, isActive) {
    try {
        const res = await api(`/admin/payment-gateways/${id}/toggle`, {
            method: "PATCH",
            body: JSON.stringify({ isActive })
        });
        if (res && res.success) {
            toast(res.message || "Gateway status updated", "success");
            loadGateways();
        } else {
            toast(res?.message || "Failed to toggle status", "danger");
            loadGateways();
        }
    } catch (e) {
        console.error("Toggle gateway error:", e);
        toast("Network error", "danger");
        loadGateways();
    }
}

async function setGatewayDefault(id) {
    try {
        const res = await api(`/admin/payment-gateways/${id}/set-default`, { method: "PATCH" });
        if (res && res.success) {
            toast(res.message || "Default gateway updated", "success");
            loadGateways();
        } else {
            toast(res?.message || "Failed to set default", "danger");
        }
    } catch (e) {
        console.error("Set default error:", e);
        toast("Network error", "danger");
    }
}

async function deleteGateway(id) {
    if (!confirm("Are you sure you want to delete this payment gateway configuration?")) return;
    try {
        const res = await api(`/admin/payment-gateways/${id}`, { method: "DELETE" });
        if (res && res.success) {
            toast("Gateway deleted successfully", "success");
            loadGateways();
        } else {
            toast(res?.message || "Failed to delete gateway", "danger");
        }
    } catch (e) {
        console.error("Delete gateway error:", e);
        toast("Network error", "danger");
    }
}

function toggleSecretVisibility() {
    const input = document.getElementById("gateway-secret");
    const icon = document.getElementById("toggle-gateway-secret-icon");
    if (!input || !icon) return;

    if (input.type === "password") {
        input.type = "text";
        icon.className = "fas fa-eye-slash";
        icon.style.color = "var(--gold, #d4a017)";
    } else {
        input.type = "password";
        icon.className = "fas fa-eye";
        icon.style.color = "var(--text-dim, #94a3b8)";
    }
}
