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
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading gateways</div></div>`;
    }
}

function renderGateways(gateways) {
    const body = document.getElementById("gateways-body");
    if (!body) return;

    if (!gateways || gateways.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-credit-card" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No payment gateways configured yet</div><div style="font-size:12px;color:var(--text-dim)">Click "+ Add Gateway" above to configure Razorpay or Cashfree.</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table class="table">
            <thead>
                <tr>
                    <th>Gateway & Environment</th>
                    <th>Key / Client ID</th>
                    <th>System Default</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    gateways.forEach(g => {
        const isLive = g.mode === "live";
        const isRzp = g.name === "razorpay";
        const keyDisplay = g.keyId || g.clientId || "—";
        const isDef = !!g.isDefault;

        html += `
        <tr style="${isDef ? 'background:rgba(212,160,23,0.06)' : ''}">
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:36px;height:36px;border-radius:10px;background:${isRzp ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)'};display:flex;align-items:center;justify-content:center;color:${isRzp ? '#3B82F6' : '#10B981'};font-size:16px">
                        <i class="${isRzp ? 'fas fa-bolt' : 'fas fa-wallet'}"></i>
                    </div>
                    <div>
                        <div style="font-weight:800;color:#fff;font-size:14px;text-transform:capitalize">
                            ${g.name}
                            <span class="badge ${isLive ? 'badge-success' : 'badge-warning'}" style="margin-left:6px;font-size:10px;text-transform:uppercase">${g.mode || 'live'}</span>
                        </div>
                        <div style="font-size:11px;color:var(--text-dim)">Updated: ${new Date(g.updatedAt || g.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
            </td>
            <td>
                <code style="background:var(--subBg);padding:4px 8px;border-radius:6px;font-size:12px;color:var(--gold);border:1px solid var(--border)">${keyDisplay}</code>
            </td>
            <td>
                ${isDef ? 
                    `<span class="badge badge-success" style="background:#10B981;color:#000;font-weight:900;padding:4px 10px;border-radius:8px"><i class="fas fa-check-circle"></i> ACTIVE DEFAULT</span>` : 
                    `<button class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px" onclick="setGatewayDefault('${g._id}')"><i class="fas fa-star"></i> Set as Default</button>`
                }
            </td>
            <td>
                <label class="switch">
                    <input type="checkbox" ${g.isActive ? 'checked' : ''} onchange="toggleGatewayActive('${g._id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-sm btn-outline" onclick="openGatewayModal('${g._id}')" title="Edit Gateway"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteGateway('${g._id}')" title="Delete Gateway"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function openGatewayModal(id = null) {
    editingGatewayId = id;
    const modal = document.getElementById("gateway-modal");
    if (!modal) return;

    if (id) {
        const g = allGateways.find(item => item._id === id);
        if (g) {
            document.getElementById("gateway-modal-title").textContent = "Edit Payment Gateway";
            document.getElementById("gateway-name").value = g.name || "razorpay";
            document.getElementById("gateway-mode").value = g.mode || "live";
            document.getElementById("gateway-key").value = g.keyId || g.clientId || "";
            document.getElementById("gateway-secret").value = "";
            document.getElementById("gateway-secret").placeholder = "Leave blank to keep existing secret";
            document.getElementById("gateway-is-default").checked = !!g.isDefault;
            document.getElementById("gateway-is-active").checked = !!g.isActive;
        }
    } else {
        document.getElementById("gateway-modal-title").textContent = "Add Payment Gateway";
        document.getElementById("gateway-name").value = "razorpay";
        document.getElementById("gateway-mode").value = "live";
        document.getElementById("gateway-key").value = "";
        document.getElementById("gateway-secret").value = "";
        document.getElementById("gateway-secret").placeholder = "Enter API Secret Key";
        document.getElementById("gateway-is-default").checked = allGateways.length === 0;
        document.getElementById("gateway-is-active").checked = true;
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
    const isDefault = document.getElementById("gateway-is-default")?.checked;
    const isActive = document.getElementById("gateway-is-active")?.checked;

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

    if (secretKey) {
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

        if (res.success) {
            toast(res.message || "Gateway saved successfully", "success");
            closeGatewayModal();
            loadGateways();
        } else {
            toast(res.message || "Failed to save gateway", "danger");
        }
    } catch (e) {
        toast("Network error saving gateway", "danger");
    }
}

async function toggleGatewayActive(id, isActive) {
    try {
        const res = await api(`/admin/payment-gateways/${id}/toggle`, {
            method: "PATCH",
            body: JSON.stringify({ isActive })
        });
        if (res.success) {
            toast(res.message || "Gateway status updated", "success");
            loadGateways();
        } else {
            toast(res.message || "Failed to toggle status", "danger");
            loadGateways();
        }
    } catch (e) {
        toast("Network error", "danger");
        loadGateways();
    }
}

async function setGatewayDefault(id) {
    try {
        const res = await api(`/admin/payment-gateways/${id}/set-default`, { method: "PATCH" });
        if (res.success) {
            toast(res.message || "Default gateway updated", "success");
            loadGateways();
        } else {
            toast(res.message || "Failed to set default", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function deleteGateway(id) {
    if (!confirm("Are you sure you want to delete this payment gateway configuration?")) return;
    try {
        const res = await api(`/admin/payment-gateways/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Gateway deleted successfully", "success");
            loadGateways();
        } else {
            toast(res.message || "Failed to delete gateway", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
