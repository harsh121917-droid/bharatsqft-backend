/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — KYC Verification Controller
   ══════════════════════════════════════════════════════════════ */

let currentKycId = null;

async function loadKyc(status = "pending") {
    const body = document.getElementById("kyc-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading KYC requests...</div></div>`;

    try {
        const res = await api(`/admin/kyc?status=${status}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load KYC"}</div></div>`;
            return;
        }

        renderKycTable(res.data || []);
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading KYC</div></div>`;
    }
}

function renderKycTable(kycList) {
    const body = document.getElementById("kyc-body");
    if (!body) return;

    if (!kycList || kycList.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-id-card" style="font-size:32px;color:var(--text-dim)"></i><div>No KYC requests in this filter</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>PAN Number</th>
                    <th>City / State</th>
                    <th>Bank Details</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    kycList.forEach(k => {
        let badgeClass = "badge-pending";
        if (k.status === "approved") badgeClass = "badge-success";
        if (k.status === "rejected") badgeClass = "badge-danger";

        const u = k.user || {};
        const bank = k.bankDetails || {};

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${k.fullName || u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.email || ''} • ${u.phone || ''}</div>
            </td>
            <td><span style="font-family:var(--font-mono);font-weight:600;color:var(--gold)">${k.panNumber || '—'}</span></td>
            <td style="font-size:12.5px">${k.address?.city || '—'}, ${k.address?.state || '—'}</td>
            <td>
                <div style="font-size:12.5px;font-weight:500">${bank.bankName || '—'}</div>
                <div style="font-size:11.5px;color:var(--text-dim);font-family:var(--font-mono)">${bank.accountNumber ? 'A/C: ' + bank.accountNumber : '—'}</div>
            </td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(k.submittedAt || k.createdAt)}</td>
            <td><span class="badge ${badgeClass}">${k.status}</span></td>
            <td style="text-align:right">
                <button class="btn btn-primary btn-sm" onclick="openKycModal('${k._id}')">
                    <i class="fas fa-eye"></i> Review
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function openKycModal(id) {
    currentKycId = id;
    const modal = document.getElementById("kyc-modal");
    const body = document.getElementById("kyc-modal-body");
    const footer = document.getElementById("kyc-modal-footer");
    if (!modal || !body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading document details...</div></div>`;
    modal.style.display = "flex";

    try {
        const res = await api(`/admin/kyc/${id}`);
        if (!res.success || !res.data) {
            body.innerHTML = `<div style="color:var(--danger)">Failed to load KYC record.</div>`;
            return;
        }

        const k = res.data;
        const u = k.user || {};
        const bank = k.bankDetails || {};
        const addr = k.address || {};

        body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1.25rem">
            <!-- User Basic Info -->
            <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Customer Information</div>
                <div style="font-size:15px;font-weight:700;color:#fff;margin-top:4px">${k.fullName || u.name}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${u.email || 'No email'} • ${u.phone || 'No phone'}</div>
                <div style="font-size:13px;color:var(--text-dim);margin-top:4px"><strong>DOB:</strong> ${formatDate(k.dob)}</div>
                <div style="font-size:13px;color:var(--text-dim);margin-top:2px"><strong>Address:</strong> ${addr.line1 || ''}, ${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}</div>
            </div>

            <!-- Documents Section -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem">
                <!-- PAN Card -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:6px">PAN: ${k.panNumber || '—'}</div>
                    ${k.panImage?.url ? `<a href="${k.panImage.url}" target="_blank"><img src="${k.panImage.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No PAN image</div>'}
                </div>

                <!-- Aadhaar Front -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--info);margin-bottom:6px">Aadhaar Front</div>
                    ${k.aadhaarFront?.url ? `<a href="${k.aadhaarFront.url}" target="_blank"><img src="${k.aadhaarFront.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No front image</div>'}
                </div>

                <!-- Aadhaar Back -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--info);margin-bottom:6px">Aadhaar Back</div>
                    ${k.aadhaarBack?.url ? `<a href="${k.aadhaarBack.url}" target="_blank"><img src="${k.aadhaarBack.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No back image</div>'}
                </div>
            </div>

            <!-- Bank Details -->
            <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Bank Account for Payouts</div>
                <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-top:8px;font-size:13px">
                    <div><strong>Bank:</strong> ${bank.bankName || '—'}</div>
                    <div><strong>Account Holder:</strong> ${bank.accountHolderName || '—'}</div>
                    <div><strong>A/C No:</strong> <span style="font-family:var(--font-mono)">${bank.accountNumber || '—'}</span></div>
                    <div><strong>IFSC:</strong> <span style="font-family:var(--font-mono)">${bank.ifscCode || '—'}</span></div>
                </div>
            </div>

            ${k.rejectionReason ? `<div style="background:var(--danger-bg);border:1px solid var(--danger-border);padding:0.75rem 1rem;border-radius:var(--radius-sm);color:var(--danger);font-size:13px"><strong>Rejection Reason:</strong> ${k.rejectionReason}</div>` : ''}
        </div>`;

        if (footer) {
            footer.innerHTML = `
                <button class="btn btn-secondary" onclick="closeKycModal()">Close</button>
                ${k.status !== 'approved' ? `<button class="btn btn-danger" onclick="reviewKyc('rejected')"><i class="fas fa-times"></i> Reject</button>` : ''}
                ${k.status !== 'approved' ? `<button class="btn btn-success" onclick="reviewKyc('approved')"><i class="fas fa-check"></i> Approve KYC</button>` : ''}
            `;
        }
    } catch (e) {
        body.innerHTML = `<div style="color:var(--danger)">Error loading KYC: ${e.message}</div>`;
    }
}

function closeKycModal() {
    const modal = document.getElementById("kyc-modal");
    if (modal) modal.style.display = "none";
    currentKycId = null;
}

async function reviewKyc(decision) {
    if (!currentKycId) return;

    let reason = "";
    if (decision === "rejected") {
        reason = prompt("Please provide a reason for rejecting this KYC application:");
        if (reason === null) return;
        if (!reason.trim()) {
            toast("Rejection reason is required", "warning");
            return;
        }
    }

    try {
        const res = await api(`/admin/kyc/${currentKycId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: decision, rejectionReason: reason })
        });

        if (res.success) {
            toast(`KYC ${decision === 'approved' ? 'Approved' : 'Rejected'} successfully`, "success");
            closeKycModal();
            loadKyc();
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to update KYC", "danger");
        }
    } catch (e) {
        toast("Network error updating KYC", "danger");
    }
}
