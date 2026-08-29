/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — KYC Verification Controller
   ══════════════════════════════════════════════════════════════ */

let currentKycId = null;
let currentKycFilter = "pending";
let kycSearchQuery = "";
let kycSearchDebounce = null;

function setKycFilter(status) {
    currentKycFilter = status;
    document.querySelectorAll('.kyc-filter-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`kyc-pill-${status}`)?.classList.add('active');
    loadKyc(status);
}

function debouncedSearchKyc(query) {
    kycSearchQuery = (query || "").trim();
    clearTimeout(kycSearchDebounce);
    kycSearchDebounce = setTimeout(() => {
        loadKyc(currentKycFilter);
    }, 300);
}

async function loadKyc(status = currentKycFilter) {
    currentKycFilter = status;
    const body = document.getElementById("kyc-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading KYC queue...</div></div>`;

    try {
        let url = `/admin/kyc?status=${status}`;
        if (kycSearchQuery) url += `&search=${encodeURIComponent(kycSearchQuery)}`;

        const res = await api(url);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load KYC"}</div></div>`;
            return;
        }

        // Update badge counters
        if (res.pendingCount !== undefined) {
            const elP = document.getElementById("kyc-badge-pending");
            if (elP) elP.textContent = res.pendingCount;
        }
        if (res.approvedCount !== undefined) {
            const elA = document.getElementById("kyc-badge-approved");
            if (elA) elA.textContent = res.approvedCount;
        }
        if (res.rejectedCount !== undefined) {
            const elR = document.getElementById("kyc-badge-rejected");
            if (elR) elR.textContent = res.rejectedCount;
        }
        if (res.revokedCount !== undefined) {
            const elRev = document.getElementById("kyc-badge-revoked");
            if (elRev) elRev.textContent = res.revokedCount;
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
        body.innerHTML = `<div class="loading-box"><i class="fas fa-id-card" style="font-size:32px;color:var(--text-dim)"></i><div>No KYC requests in this category</div></div>`;
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
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    kycList.forEach(k => {
        let badgeClass = "badge-pending";
        let statusLabel = "Pending";
        if (k.status === "approved") {
            badgeClass = "badge-success";
            statusLabel = "Approved";
        } else if (k.status === "rejected") {
            badgeClass = "badge-danger";
            statusLabel = "Rejected";
        } else if (k.status === "revoked") {
            badgeClass = "badge-amber";
            statusLabel = "Revoked";
        }

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
            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px;align-items:center">
                    <button class="btn btn-secondary btn-sm" onclick="openKycModal('${k._id}')" title="Inspect Documents & Info">
                        <i class="fas fa-eye"></i> Review
                    </button>
                    ${k.status === 'pending' ? `
                        <button class="btn btn-success btn-sm" onclick="quickReviewKyc('${k._id}', 'approved')" title="Approve KYC">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="quickReviewKyc('${k._id}', 'rejected')" title="Reject KYC">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    ${k.status === 'approved' ? `
                        <button class="btn btn-revoke btn-sm" onclick="quickReviewKyc('${k._id}', 'revoked')" title="Revoke KYC" style="color:#ffffff !important">
                            <i class="fas fa-ban"></i> Revoke
                        </button>
                    ` : ''}
                    ${k.status === 'rejected' || k.status === 'revoked' ? `
                        <button class="btn btn-success btn-sm" onclick="quickReviewKyc('${k._id}', 'approved')" title="Re-Approve KYC">
                            <i class="fas fa-check"></i> Approve
                        </button>
                    ` : ''}
                </div>
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

        let statusBadge = `<span class="badge badge-warning">Pending Review</span>`;
        if (k.status === 'approved') statusBadge = `<span class="badge badge-success">Approved & Verified</span>`;
        else if (k.status === 'rejected') statusBadge = `<span class="badge badge-danger">Rejected</span>`;
        else if (k.status === 'revoked') statusBadge = `<span class="badge badge-amber">Revoked</span>`;

        body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1.25rem">
            <!-- User Basic Info -->
            <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Customer Profile</div>
                    <div>${statusBadge}</div>
                </div>
                <div style="font-size:16px;font-weight:700;color:#fff">${k.fullName || u.name}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${u.email || 'No email'} • ${u.phone || 'No phone'}</div>
                <div style="font-size:13px;color:var(--text-dim);margin-top:4px"><strong>DOB:</strong> ${formatDate(k.dob)}</div>
                <div style="font-size:13px;color:var(--text-dim);margin-top:2px"><strong>Address:</strong> ${addr.line1 || ''}, ${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}</div>
            </div>

            <!-- Documents Section -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem">
                <!-- PAN Card -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:6px">PAN: ${k.panNumber || '—'}</div>
                    ${k.panImage?.url ? `<a href="${k.panImage.url}" target="_blank" title="Click to view full image"><img src="${k.panImage.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No PAN image uploaded</div>'}
                </div>

                <!-- Aadhaar Front -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--info);margin-bottom:6px">Aadhaar Front</div>
                    ${k.aadhaarFront?.url ? `<a href="${k.aadhaarFront.url}" target="_blank" title="Click to view full image"><img src="${k.aadhaarFront.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No front image uploaded</div>'}
                </div>

                <!-- Aadhaar Back -->
                <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                    <div style="font-size:12px;font-weight:700;color:var(--info);margin-bottom:6px">Aadhaar Back</div>
                    ${k.aadhaarBack?.url ? `<a href="${k.aadhaarBack.url}" target="_blank" title="Click to view full image"><img src="${k.aadhaarBack.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>` : '<div style="color:var(--text-dim);font-size:12px">No back image uploaded</div>'}
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

            ${k.rejectionReason || k.revokedReason ? `
                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:0.75rem 1rem;border-radius:var(--radius-sm);color:#fca5a5;font-size:13px">
                    <strong><i class="fas fa-info-circle"></i> Reason / Note:</strong> ${k.rejectionReason || k.revokedReason}
                </div>
            ` : ''}
        </div>`;

        if (footer) {
            let actionButtons = '';
            
            if (k.status === 'pending') {
                actionButtons = `
                    <button class="btn btn-danger" onclick="reviewKyc('rejected')"><i class="fas fa-times"></i> Reject KYC</button>
                    <button class="btn btn-success" onclick="reviewKyc('approved')"><i class="fas fa-check"></i> Approve KYC</button>
                `;
            } else if (k.status === 'approved') {
                actionButtons = `
                    <button class="btn btn-revoke" onclick="reviewKyc('revoked')" style="color:#ffffff !important">
                        <i class="fas fa-ban"></i> Revoke KYC
                    </button>
                    <button class="btn btn-danger" onclick="reviewKyc('rejected')"><i class="fas fa-times"></i> Reject</button>
                `;
            } else if (k.status === 'rejected' || k.status === 'revoked') {
                actionButtons = `
                    <button class="btn btn-secondary" onclick="reviewKyc('pending')"><i class="fas fa-undo"></i> Reset to Pending</button>
                    <button class="btn btn-success" onclick="reviewKyc('approved')"><i class="fas fa-check"></i> Re-Approve KYC</button>
                `;
            }

            footer.innerHTML = `
                <button class="btn btn-secondary" onclick="closeKycModal()">Close</button>
                ${actionButtons}
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

async function quickReviewKyc(id, decision) {
    currentKycId = id;
    await reviewKyc(decision);
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
    } else if (decision === "revoked") {
        reason = prompt("Please provide a reason for REVOKING this verified KYC:");
        if (reason === null) return;
        if (!reason.trim()) {
            toast("Revocation reason is required", "warning");
            return;
        }
    }

    try {
        const res = await api(`/admin/kyc/${currentKycId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: decision, rejectionReason: reason })
        });

        if (res.success) {
            let msg = "KYC status updated";
            if (decision === "approved") msg = "KYC Approved successfully!";
            else if (decision === "rejected") msg = "KYC Rejected successfully";
            else if (decision === "revoked") msg = "KYC Verification Revoked successfully";
            else if (decision === "pending") msg = "KYC Reset to Pending Review";

            toast(msg, "success");
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
