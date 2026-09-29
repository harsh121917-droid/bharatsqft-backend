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
        if (res.soldierPendingCount !== undefined) {
            const elSp = document.getElementById("kyc-badge-soldier-pending");
            if (elSp) elSp.textContent = res.soldierPendingCount;
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

        let soldierBadge = "";
        if (k.soldierDetails && k.soldierDetails.isSoldier) {
            const sStatus = k.soldierDetails.status || "pending";
            if (sStatus === "approved") {
                soldierBadge = `<div style="margin-top:4px"><span class="badge" style="background:#065F46;color:#6EE7B7;font-size:10px">🎖️ Soldier Verified</span></div>`;
            } else if (sStatus === "pending") {
                soldierBadge = `<div style="margin-top:4px"><span class="badge" style="background:#064E3B;color:#34D399;border:1px solid #10B981;font-size:10px">🎖️ Soldier Pending</span></div>`;
            } else if (sStatus === "rejected") {
                soldierBadge = `<div style="margin-top:4px"><span class="badge" style="background:#7F1D1D;color:#FCA5A5;font-size:10px">🎖️ Soldier Rejected</span></div>`;
            }
        }

        const u = k.user || {};
        const bank = k.bankDetails || {};

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${k.fullName || u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.email || ''} • ${u.phone || ''}</div>
            </td>
            <td>${k.panNumber === 'PHOTO_SUBMITTED' ? '<span class="badge" style="background:rgba(212,160,23,0.15);color:var(--gold);border:1px solid rgba(212,160,23,0.3);font-size:11px"><i class="fas fa-camera"></i> Photo KYC</span>' : `<span style="font-family:var(--font-mono);font-weight:600;color:var(--gold)">${k.panNumber || '—'}</span>`}</td>
            <td style="font-size:12.5px">${k.address?.city || '—'}, ${k.address?.state || '—'}</td>
            <td>
                <div style="font-size:12.5px;font-weight:500">${bank.bankName || '—'}</div>
                <div style="font-size:11.5px;color:var(--text-dim);font-family:var(--font-mono)">${bank.accountNumber ? 'A/C: ' + bank.accountNumber : '—'}</div>
            </td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(k.submittedAt || k.createdAt)}</td>
            <td>
                <span class="badge ${badgeClass}">${statusLabel}</span>
                ${soldierBadge}
            </td>
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
                    <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:6px">${k.panNumber === 'PHOTO_SUBMITTED' ? '📸 PAN Card (Photo Uploaded)' : `PAN: ${k.panNumber || '—'}`}</div>
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

            <!-- Upload / Replace Document Photos for Existing KYC -->
            <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">
                        <i class="fas fa-camera"></i> Upload / Replace Document Photos
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="toggleKycDocUploadForm()" style="font-size:11px;padding:3px 8px;cursor:pointer">
                        <i class="fas fa-cloud-upload-alt"></i> <span id="toggle-upload-docs-btn-text">Upload / Replace Photos</span>
                    </button>
                </div>

                <div id="kyc-doc-upload-form" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;font-size:12px">
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">PAN Card Photo</label>
                            <input type="file" id="replace-pan-file" accept="image/*,.pdf" class="form-control form-control-sm" style="font-size:11px" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Aadhaar Front Photo</label>
                            <input type="file" id="replace-aadhaar-front-file" accept="image/*,.pdf" class="form-control form-control-sm" style="font-size:11px" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Aadhaar Back Photo</label>
                            <input type="file" id="replace-aadhaar-back-file" accept="image/*,.pdf" class="form-control form-control-sm" style="font-size:11px" />
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:10px">
                        <button type="button" class="btn btn-sm btn-primary" onclick="uploadExistingKycDocs('${k._id}')" id="btn-save-kyc-docs" style="font-size:12px;padding:5px 14px;background:linear-gradient(135deg,#d4a017,#b8860b);color:#000;font-weight:700">
                            <i class="fas fa-cloud-upload-alt"></i> Upload & Replace Photos
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="toggleKycDocUploadForm()" style="font-size:12px;padding:5px 10px">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>

            <!-- Bank Details -->
            <div style="background:var(--surface2);padding:1rem;border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Bank Account for Payouts</div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEditBankForm()" style="font-size:11px;padding:3px 8px;cursor:pointer">
                        <i class="fas fa-edit"></i> Edit / Add Bank
                    </button>
                </div>
                <div id="kyc-bank-display" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-top:8px;font-size:13px">
                    <div><strong>Bank:</strong> <span id="kyc-bank-name">${bank.bankName || '—'}</span></div>
                    <div><strong>Account Holder:</strong> <span id="kyc-bank-holder">${bank.accountHolderName || '—'}</span></div>
                    <div><strong>A/C No:</strong> <span id="kyc-bank-acc" style="font-family:var(--font-mono)">${bank.accountNumber || '—'}</span></div>
                    <div><strong>IFSC:</strong> <span id="kyc-bank-ifsc" style="font-family:var(--font-mono)">${bank.ifscCode || '—'}</span></div>
                    <div><strong>Account Type:</strong> <span id="kyc-bank-type" style="text-transform:capitalize">${bank.accountType || 'Savings'}</span></div>
                </div>

                <!-- Hidden Inline Form to Edit / Add Bank -->
                <div id="kyc-bank-edit-form" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">
                    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px">
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Bank Name</label>
                            <input type="text" id="edit-bank-name" class="form-control form-control-sm" value="${bank.bankName || ''}" placeholder="e.g. State Bank of India" style="font-size:12px" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Account Holder Name</label>
                            <input type="text" id="edit-bank-holder" class="form-control form-control-sm" value="${bank.accountHolderName || k.fullName || u.name || ''}" placeholder="Full Name" style="font-size:12px" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Account Number</label>
                            <input type="text" id="edit-bank-acc" class="form-control form-control-sm" value="${bank.accountNumber || ''}" placeholder="e.g. 123456789012" style="font-size:12px;font-family:var(--font-mono)" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">IFSC Code</label>
                            <input type="text" id="edit-bank-ifsc" class="form-control form-control-sm" value="${bank.ifscCode || ''}" placeholder="e.g. SBIN0001234" style="font-size:12px;font-family:var(--font-mono);text-transform:uppercase" />
                        </div>
                        <div>
                            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Account Type</label>
                            <select id="edit-bank-type" class="form-control form-control-sm" style="font-size:12px">
                                <option value="savings" ${bank.accountType !== 'current' ? 'selected' : ''}>Savings Account</option>
                                <option value="current" ${bank.accountType === 'current' ? 'selected' : ''}>Current Account</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:10px">
                        <button type="button" class="btn btn-sm btn-success" onclick="saveKycBankDetails('${k._id}')" style="font-size:12px;padding:5px 14px">
                            <i class="fas fa-save"></i> Save Bank Details
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="toggleEditBankForm()" style="font-size:12px;padding:5px 10px">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>

            <!-- Soldier / Armed Forces & Police Verification Section -->
            ${k.soldierDetails && k.soldierDetails.isSoldier ? `
                <div style="background:linear-gradient(135deg, rgba(6,78,59,0.35) 0%, rgba(2,44,34,0.35) 100%);padding:1.25rem;border-radius:var(--radius-md);border:1.5px solid #10B981;box-shadow:0 4px 14px rgba(16,185,129,0.15)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div style="font-size:13px;font-weight:800;color:#10B981;display:flex;align-items:center;gap:8px">
                            <i class="fas fa-medal" style="font-size:16px"></i> ARMED FORCES / SOLDIER VERIFICATION (VEER JAWAN)
                        </div>
                        <div>
                            ${k.soldierDetails.status === 'approved' 
                                ? '<span class="badge badge-success" style="font-weight:700">🎖️ Soldier Verified (5% Extra)</span>' 
                                : (k.soldierDetails.status === 'rejected' 
                                    ? '<span class="badge badge-danger" style="font-weight:700">Soldier ID Rejected</span>' 
                                    : '<span class="badge badge-warning" style="font-weight:700">Soldier ID Pending Review</span>')}
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;font-size:13px;color:#fff;margin-bottom:12px">
                        <div><strong>Service Branch:</strong> <span style="color:var(--gold);font-weight:700">${k.soldierDetails.serviceBranch || '—'}</span></div>
                        <div><strong>Soldier / Service ID:</strong> <span style="font-family:var(--font-mono);font-weight:800;color:#34D399;letter-spacing:0.5px">${k.soldierDetails.soldierIdNumber || '—'}</span></div>
                        <div><strong>Submitted At:</strong> ${formatDateTime(k.soldierDetails.submittedAt || k.updatedAt)}</div>
                    </div>
                    
                    <div style="margin-top:10px">
                        <div style="font-size:11px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px">Soldier ID Card Photo:</div>
                        ${k.soldierDetails.soldierIdCardUrl ? `
                            <a href="${k.soldierDetails.soldierIdCardUrl}" target="_blank" title="Click to open full high-resolution image" style="display:inline-block">
                                <img src="${k.soldierDetails.soldierIdCardUrl}" style="max-height:180px;border-radius:8px;border:1.5px solid #10B981;object-fit:cover;box-shadow:0 4px 10px rgba(0,0,0,0.3)" />
                            </a>
                            <div style="font-size:11px;color:var(--text-dim);margin-top:4px"><i class="fas fa-external-link-alt"></i> Click image to open in high-res</div>
                        ` : '<div style="color:var(--text-dim);font-size:12px">No Soldier ID photo uploaded</div>'}
                    </div>

                    ${k.soldierDetails.rejectionReason ? `
                        <div style="margin-top:10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);padding:8px 12px;border-radius:6px;color:#fca5a5;font-size:12px">
                            <strong><i class="fas fa-exclamation-circle"></i> Soldier Rejection Reason:</strong> ${k.soldierDetails.rejectionReason}
                        </div>
                    ` : ''}

                    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed rgba(16,185,129,0.3);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                        <button class="btn btn-sm" style="background:#059669;color:#fff;font-weight:700;padding:6px 14px" onclick="reviewSoldierKyc('approved')">
                            <i class="fas fa-check-circle"></i> Approve Soldier ID (Unlock 5% Extra Return)
                        </button>
                        <button class="btn btn-danger btn-sm" style="font-weight:700;padding:6px 14px" onclick="reviewSoldierKyc('rejected')">
                            <i class="fas fa-times-circle"></i> Reject Soldier ID
                        </button>
                        ${k.soldierDetails.status !== 'pending' ? `
                            <button class="btn btn-secondary btn-sm" onclick="reviewSoldierKyc('pending')">
                                <i class="fas fa-undo"></i> Reset Soldier to Pending
                            </button>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

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

async function reviewSoldierKyc(decision) {
    if (!currentKycId) return;

    let reason = "";
    if (decision === "rejected") {
        reason = prompt("Please enter the reason for rejecting this Soldier ID card:");
        if (reason === null) return;
        if (!reason.trim()) reason = "Soldier ID document verification failed";
    }

    try {
        const res = await api(`/admin/kyc/${currentKycId}/soldier-status`, {
            method: "PATCH",
            body: JSON.stringify({ status: decision, rejectionReason: reason })
        });

        if (res.success) {
            toast(res.message || `Soldier ID verification ${decision}!`, "success");
            openKycModal(currentKycId);
            loadKyc(currentKycFilter);
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to update Soldier verification status", "danger");
        }
    } catch (e) {
        toast("Network error updating Soldier status: " + e.message, "danger");
    }
}



function toggleEditBankForm() {
    const form = document.getElementById("kyc-bank-edit-form");
    if (form) {
        form.style.display = form.style.display === "none" ? "block" : "none";
    }
}

async function saveKycBankDetails(kycId) {
    const bankName = document.getElementById("edit-bank-name")?.value.trim();
    const accountHolderName = document.getElementById("edit-bank-holder")?.value.trim();
    const accountNumber = document.getElementById("edit-bank-acc")?.value.trim();
    const ifscCode = document.getElementById("edit-bank-ifsc")?.value.trim().toUpperCase();
    const accountType = document.getElementById("edit-bank-type")?.value || "savings";

    if (!accountNumber || !ifscCode) {
        toast("Account number and IFSC code are required", "warning");
        return;
    }

    try {
        const res = await api(`/admin/kyc/${kycId}/bank`, {
            method: "PATCH",
            body: JSON.stringify({ bankName, accountHolderName, accountNumber, ifscCode, accountType }),
        });

        if (res && res.success) {
            toast("Bank details updated successfully!", "success");
            const bankNameEl = document.getElementById("kyc-bank-name");
            const bankHolderEl = document.getElementById("kyc-bank-holder");
            const bankAccEl = document.getElementById("kyc-bank-acc");
            const bankIfscEl = document.getElementById("kyc-bank-ifsc");
            const bankTypeEl = document.getElementById("kyc-bank-type");

            if (bankNameEl) bankNameEl.textContent = bankName || "Linked Bank";
            if (bankHolderEl) bankHolderEl.textContent = accountHolderName || "—";
            if (bankAccEl) bankAccEl.textContent = accountNumber;
            if (bankIfscEl) bankIfscEl.textContent = ifscCode;
            if (bankTypeEl) bankTypeEl.textContent = accountType === "current" ? "Current" : "Savings";

            toggleEditBankForm();
            loadKyc(currentKycFilter);
        } else {
            toast(res?.message || "Failed to update bank details", "danger");
        }
    } catch (e) {
        toast("Error updating bank details: " + e.message, "danger");
    }
}

function toggleKycDocUploadForm() {
    const form = document.getElementById("kyc-doc-upload-form");
    const btnText = document.getElementById("toggle-upload-docs-btn-text");
    if (!form) return;
    const isHidden = form.style.display === "none";
    form.style.display = isHidden ? "block" : "none";
    if (btnText) btnText.textContent = isHidden ? "Hide Upload Form" : "Upload / Replace Photos";
}

async function uploadExistingKycDocs(kycId) {
    const panFile = document.getElementById("replace-pan-file")?.files[0];
    const frontFile = document.getElementById("replace-aadhaar-front-file")?.files[0];
    const backFile = document.getElementById("replace-aadhaar-back-file")?.files[0];

    if (!panFile && !frontFile && !backFile) {
        toast("Please select at least one document photo to upload", "warning");
        return;
    }

    const btn = document.getElementById("btn-save-kyc-docs");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading...`;
    }

    try {
        const formData = new FormData();
        if (panFile) formData.append("panImage", panFile);
        if (frontFile) formData.append("aadhaarFront", frontFile);
        if (backFile) formData.append("aadhaarBack", backFile);

        const res = await api(`/admin/kyc/${kycId}/upload-docs`, {
            method: "POST",
            body: formData,
        });

        if (res && res.success) {
            toast(res.message || "Document photos updated successfully!", "success");
            openKycModal(kycId);
            loadKyc(currentKycFilter);
        } else {
            toast(res?.message || "Failed to upload document photos", "danger");
        }
    } catch (err) {
        toast("Upload error: " + err.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

/* ══════════════════════════════════════════════════════════════
   MANUAL KYC ENTRY MODAL CONTROLLER
   ══════════════════════════════════════════════════════════════ */

let manualKycUserDebounce = null;

function openManualKycModal() {
    const modal = document.getElementById("manual-kyc-modal");
    if (!modal) return;

    // Reset all fields
    clearSelectedUserForKyc();
    const searchInput = document.getElementById("manual-kyc-user-search");
    if (searchInput) searchInput.value = "";
    document.getElementById("manual-kyc-fullname").value = "";
    document.getElementById("manual-kyc-dob").value = "";
    document.getElementById("manual-kyc-pan").value = "";
    document.getElementById("manual-kyc-aadhaar").value = "";
    document.getElementById("manual-kyc-address-line1").value = "";
    document.getElementById("manual-kyc-city").value = "";
    document.getElementById("manual-kyc-state").value = "";
    document.getElementById("manual-kyc-pincode").value = "";
    document.getElementById("manual-kyc-bank-name").value = "";
    document.getElementById("manual-kyc-bank-holder").value = "";
    document.getElementById("manual-kyc-bank-acc").value = "";
    document.getElementById("manual-kyc-bank-ifsc").value = "";
    document.getElementById("manual-kyc-bank-type").value = "savings";
    document.getElementById("manual-kyc-is-soldier").checked = false;
    toggleManualSoldierSection(false);
    document.getElementById("manual-kyc-soldier-id").value = "";
    document.getElementById("manual-kyc-status").value = "approved";
    document.getElementById("manual-kyc-notes").value = "";

    // Clear file inputs and reset previews
    ["pan", "aadhaar-front", "aadhaar-back", "soldier"].forEach(key => {
        const fileInput = document.getElementById(`manual-kyc-${key}-file`);
        if (fileInput) fileInput.value = "";
        resetManualKycPreview(key);
    });

    modal.style.display = "flex";
}

function closeManualKycModal() {
    const modal = document.getElementById("manual-kyc-modal");
    if (modal) modal.style.display = "none";
}

function debouncedSearchUsersForKyc(query) {
    clearTimeout(manualKycUserDebounce);
    manualKycUserDebounce = setTimeout(() => {
        searchUsersForKyc(query);
    }, 250);
}

async function searchUsersForKyc(query) {
    const dropdown = document.getElementById("manual-kyc-user-dropdown");
    if (!dropdown) return;

    const trimmed = (query || "").trim();
    if (trimmed.length < 2) {
        dropdown.style.display = "none";
        dropdown.innerHTML = "";
        return;
    }

    try {
        const res = await api(`/admin/users?search=${encodeURIComponent(trimmed)}&limit=8`);
        const users = (res.success && res.data) ? res.data : (res.users || []);

        if (!users || users.length === 0) {
            dropdown.innerHTML = `<div style="padding:10px 12px;color:var(--text-dim);font-size:12px">No customer found matching "${trimmed}"</div>`;
            dropdown.style.display = "block";
            return;
        }

        let html = "";
        users.forEach(u => {
            const kycStatus = u.kycStatus || "not_submitted";
            let kycBadge = `<span class="badge badge-warning" style="font-size:9px">${kycStatus}</span>`;
            if (kycStatus === "approved") kycBadge = `<span class="badge badge-success" style="font-size:9px">Verified</span>`;
            else if (kycStatus === "rejected") kycBadge = `<span class="badge badge-danger" style="font-size:9px">Rejected</span>`;

            const userJson = JSON.stringify({
                _id: u._id,
                name: u.name || "",
                phone: u.phone || "",
                email: u.email || "",
                kycDoc: u.kycDoc?.[0] || null
            }).replace(/"/g, '&quot;');

            html += `
            <div class="user-search-item" onclick="selectUserForManualKyc(${userJson})" style="padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s">
                <div>
                    <div style="font-size:13px;font-weight:600;color:#fff">${u.name || 'Unnamed User'}</div>
                    <div style="font-size:11.5px;color:var(--text-dim)">${u.phone || ''} ${u.email ? '• ' + u.email : ''}</div>
                </div>
                <div>${kycBadge}</div>
            </div>`;
        });

        dropdown.innerHTML = html;
        dropdown.style.display = "block";
    } catch (err) {
        console.error("User search error:", err);
    }
}

function selectUserForManualKyc(u) {
    const dropdown = document.getElementById("manual-kyc-user-dropdown");
    if (dropdown) dropdown.style.display = "none";

    document.getElementById("manual-kyc-user-id").value = u._id || "";
    document.getElementById("manual-kyc-selected-user-name").textContent = u.name || "Customer";
    document.getElementById("manual-kyc-selected-user-contact").textContent = `${u.phone || 'No phone'} • ${u.email || 'No email'}`;
    document.getElementById("manual-kyc-selected-user-card").style.display = "block";
    document.getElementById("manual-kyc-user-search").style.display = "none";

    if (!document.getElementById("manual-kyc-fullname").value && u.name) {
        document.getElementById("manual-kyc-fullname").value = u.name;
    }
    if (!document.getElementById("manual-kyc-bank-holder").value && u.name) {
        document.getElementById("manual-kyc-bank-holder").value = u.name;
    }

    if (u.kycDoc) {
        const kd = u.kycDoc;
        if (kd.panNumber && kd.panNumber !== "PHOTO_SUBMITTED" && kd.panNumber !== "MANUAL_VERIFIED") {
            document.getElementById("manual-kyc-pan").value = kd.panNumber;
        }
        if (kd.dob) {
            document.getElementById("manual-kyc-dob").value = kd.dob.split("T")[0];
        }
        if (kd.address) {
            if (kd.address.line1) document.getElementById("manual-kyc-address-line1").value = kd.address.line1;
            if (kd.address.city) document.getElementById("manual-kyc-city").value = kd.address.city;
            if (kd.address.state) document.getElementById("manual-kyc-state").value = kd.address.state;
            if (kd.address.pincode) document.getElementById("manual-kyc-pincode").value = kd.address.pincode;
        }
        if (kd.bankDetails) {
            if (kd.bankDetails.bankName) document.getElementById("manual-kyc-bank-name").value = kd.bankDetails.bankName;
            if (kd.bankDetails.accountHolderName) document.getElementById("manual-kyc-bank-holder").value = kd.bankDetails.accountHolderName;
            if (kd.bankDetails.accountNumber) document.getElementById("manual-kyc-bank-acc").value = kd.bankDetails.accountNumber;
            if (kd.bankDetails.ifscCode) document.getElementById("manual-kyc-bank-ifsc").value = kd.bankDetails.ifscCode;
        }
    }
}

function clearSelectedUserForKyc() {
    document.getElementById("manual-kyc-user-id").value = "";
    document.getElementById("manual-kyc-selected-user-card").style.display = "none";
    const searchInput = document.getElementById("manual-kyc-user-search");
    if (searchInput) {
        searchInput.style.display = "block";
        searchInput.value = "";
    }
}

function previewManualKycPhoto(input, previewContainerId) {
    const container = document.getElementById(previewContainerId);
    if (!container) return;

    if (!input.files || !input.files[0]) {
        return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        container.innerHTML = `
            <div style="position:relative;width:100%;height:100px;overflow:hidden;border-radius:6px">
                <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover" />
                <button type="button" onclick="event.stopPropagation();resetManualKycFileInput('${input.id}', '${previewContainerId}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px" title="Remove image">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="font-size:10px;color:var(--text-dim);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${file.name}</div>
        `;
    };

    reader.readAsDataURL(file);
}

function resetManualKycFileInput(inputId, previewContainerId) {
    const input = document.getElementById(inputId);
    if (input) input.value = "";
    resetManualKycPreview(inputId.replace("manual-kyc-", "").replace("-file", ""));
}

function resetManualKycPreview(key) {
    const containerId = key === "pan" ? "preview-pan" : (key === "soldier" ? "preview-soldier" : `preview-${key}`);
    const container = document.getElementById(containerId);
    if (!container) return;

    if (key === "pan") {
        container.innerHTML = `
            <i class="fas fa-cloud-upload-alt" style="font-size:24px;color:var(--gold);margin-bottom:6px"></i>
            <span style="font-size:11px;color:var(--text-muted)">Click to select PAN photo</span>
        `;
    } else if (key === "soldier") {
        container.innerHTML = `
            <i class="fas fa-id-badge" style="font-size:22px;color:#34D399;margin-bottom:4px"></i>
            <div style="font-size:11px;color:#6ee7b7">Click to upload Soldier ID Card photo</div>
        `;
    } else {
        container.innerHTML = `
            <i class="fas fa-cloud-upload-alt" style="font-size:24px;color:var(--info);margin-bottom:6px"></i>
            <span style="font-size:11px;color:var(--text-muted)">Click to select ${key.includes('front') ? 'Front' : 'Back'}</span>
        `;
    }
}

function toggleManualSoldierSection(checked) {
    const wrap = document.getElementById("manual-kyc-soldier-details-wrap");
    if (wrap) wrap.style.display = checked ? "block" : "none";
}

async function submitManualKyc() {
    const userId = document.getElementById("manual-kyc-user-id")?.value.trim();
    const searchVal = document.getElementById("manual-kyc-user-search")?.value.trim();
    const fullName = document.getElementById("manual-kyc-fullname")?.value.trim();
    const panNumber = document.getElementById("manual-kyc-pan")?.value.trim().toUpperCase();

    if (!userId && !searchVal) {
        toast("Please select a customer or provide their phone/email", "warning");
        return;
    }
    if (!fullName) {
        toast("Customer Full Name is required", "warning");
        return;
    }
    if (!panNumber) {
        toast("PAN Number is required", "warning");
        return;
    }

    const btn = document.getElementById("btn-submit-manual-kyc");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting & Verifying...`;
    }

    try {
        const formData = new FormData();
        if (userId) formData.append("userId", userId);
        else if (searchVal) {
            if (searchVal.includes("@")) formData.append("email", searchVal);
            else formData.append("phone", searchVal);
        }

        formData.append("fullName", fullName);
        formData.append("panNumber", panNumber);

        const dob = document.getElementById("manual-kyc-dob")?.value;
        if (dob) formData.append("dob", dob);

        const aadhaar = document.getElementById("manual-kyc-aadhaar")?.value.replace(/\s+/g, "").trim();
        if (aadhaar) formData.append("aadhaarNumber", aadhaar);

        const line1 = document.getElementById("manual-kyc-address-line1")?.value.trim();
        const city = document.getElementById("manual-kyc-city")?.value.trim();
        const state = document.getElementById("manual-kyc-state")?.value.trim();
        const pincode = document.getElementById("manual-kyc-pincode")?.value.trim();
        if (line1) formData.append("address.line1", line1);
        if (city) formData.append("address.city", city);
        if (state) formData.append("address.state", state);
        if (pincode) formData.append("address.pincode", pincode);

        // Bank details
        const bankName = document.getElementById("manual-kyc-bank-name")?.value.trim();
        const bankHolder = document.getElementById("manual-kyc-bank-holder")?.value.trim();
        const bankAcc = document.getElementById("manual-kyc-bank-acc")?.value.trim();
        const bankIfsc = document.getElementById("manual-kyc-bank-ifsc")?.value.trim().toUpperCase();
        const bankType = document.getElementById("manual-kyc-bank-type")?.value || "savings";

        if (bankAcc && bankIfsc) {
            formData.append("bankDetails.bankName", bankName || "Linked Bank");
            formData.append("bankDetails.accountHolderName", bankHolder || fullName);
            formData.append("bankDetails.accountNumber", bankAcc);
            formData.append("bankDetails.ifscCode", bankIfsc);
            formData.append("bankDetails.accountType", bankType);
        }

        // File uploads
        const panFile = document.getElementById("manual-kyc-pan-file")?.files[0];
        const frontFile = document.getElementById("manual-kyc-aadhaar-front-file")?.files[0];
        const backFile = document.getElementById("manual-kyc-aadhaar-back-file")?.files[0];
        if (panFile) formData.append("panImage", panFile);
        if (frontFile) formData.append("aadhaarFront", frontFile);
        if (backFile) formData.append("aadhaarBack", backFile);

        // Soldier details
        const isSoldier = document.getElementById("manual-kyc-is-soldier")?.checked;
        if (isSoldier) {
            formData.append("isSoldier", "true");
            const branch = document.getElementById("manual-kyc-soldier-branch")?.value;
            const soldierId = document.getElementById("manual-kyc-soldier-id")?.value.trim();
            const soldierFile = document.getElementById("manual-kyc-soldier-file")?.files[0];
            if (branch) formData.append("serviceBranch", branch);
            if (soldierId) formData.append("soldierIdNumber", soldierId);
            if (soldierFile) formData.append("soldierIdCard", soldierFile);
        }

        // Status & Notes
        const status = document.getElementById("manual-kyc-status")?.value || "approved";
        const notes = document.getElementById("manual-kyc-notes")?.value.trim();
        formData.append("status", status);
        if (notes) formData.append("adminNotes", notes);

        const res = await api("/admin/kyc/manual-entry", {
            method: "POST",
            body: formData,
        });

        if (res && res.success) {
            toast(res.message || "Customer KYC manually recorded successfully!", "success");
            closeManualKycModal();
            loadKyc(status === "approved" ? "approved" : "all");
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res?.message || "Failed to submit manual KYC", "danger");
        }
    } catch (err) {
        toast("Submission error: " + err.message, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}
