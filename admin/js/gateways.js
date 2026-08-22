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
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load gateways</div></div>`;
            return;
        }

        allGateways = res.data || [];
        renderGateways(allGateways);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderGateways(gateways) {
    const body = document.getElementById("gateways-body");
    if (!body) return;

    if (!gateways || gateways.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-credit-card" style="font-size:32px;color:var(--text-dim)"></i><div>No payment gateways configured</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Gateway</th>
                    <th>Supported Metals / Ops</th>
                    <th>Priority</th>
                    <th>Active</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    gateways.forEach(g => {
        html += `
        <tr>
            <td>
                <div style="font-weight:700;color:#fff;font-size:14px">${g.name || 'Custom Gateway'}</div>
                <div style="font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">Key: ${g.keyId ? g.keyId.slice(0, 8) + '...' : '—'}</div>
            </td>
            <td><span class="badge badge-info">${g.type || 'payment'}</span></td>
            <td style="font-weight:600">${g.priority || 1}</td>
            <td>
                <label class="switch">
                    <input type="checkbox" ${g.isActive ? 'checked' : ''} onchange="toggleGatewayActive('${g._id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-icon" onclick="openGatewayModal('${g._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteGateway('${g._id}')"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
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
            document.getElementById("gateway-name").value = g.name || "";
            document.getElementById("gateway-type").value = g.type || "razorpay";
            document.getElementById("gateway-key").value = g.keyId || "";
            document.getElementById("gateway-secret").value = "";
        }
    } else {
        document.getElementById("gateway-modal-title").textContent = "Add Payment Gateway";
        document.getElementById("gateway-form")?.reset();
    }

    modal.style.display = "flex";
}

function closeGatewayModal() {
    const modal = document.getElementById("gateway-modal");
    if (modal) modal.style.display = "none";
    editingGatewayId = null;
}

async function saveGateway() {
    const name = document.getElementById("gateway-name")?.value.trim();
    const type = document.getElementById("gateway-type")?.value;
    const keyId = document.getElementById("gateway-key")?.value.trim();
    const secretKey = document.getElementById("gateway-secret")?.value.trim();

    if (!name || !keyId) {
        toast("Please provide gateway name and Key ID", "warning");
        return;
    }

    const payload = { name, type, keyId };
    if (secretKey) payload.secretKey = secretKey;

    try {
        let res;
        if (editingGatewayId) {
            res = await api(`/admin/payment-gateways/${editingGatewayId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/admin/payment-gateways", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res.success) {
            toast("Gateway saved successfully", "success");
            closeGatewayModal();
            loadGateways();
        } else {
            toast(res.message || "Failed to save gateway", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function toggleGatewayActive(id, isActive) {
    try {
        const res = await api(`/admin/payment-gateways/${id}/toggle`, {
            method: "PATCH",
            body: JSON.stringify({ isActive })
        });
        if (res.success) {
            toast("Gateway status updated", "success");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function deleteGateway(id) {
    if (!confirm("Are you sure?")) return;
    try {
        const res = await api(`/admin/payment-gateways/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Gateway deleted", "success");
            loadGateways();
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
