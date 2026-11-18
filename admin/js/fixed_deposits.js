/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Fixed Deposits & IRIS Portal Controller
   ══════════════════════════════════════════════════════════════ */

let currentFdPage = 1;
let currentFdCompany = "ALL";
let currentFdStatus = "ALL";
let currentFdSearch = "";
let activeFdApplicationData = null;

// ── 1. Fetch & Render All FD Applications ────────────────────
async function loadFixedDeposits(page = 1) {
    currentFdPage = page;
    const tbody = document.getElementById("fd-table-body");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading Fixed Deposit Applications...</td></tr>`;

    const searchInput = document.getElementById("fd-search-input");
    const companySelect = document.getElementById("fd-company-filter");
    const statusSelect = document.getElementById("fd-status-filter");

    if (searchInput) currentFdSearch = searchInput.value.trim();
    if (companySelect) currentFdCompany = companySelect.value;
    if (statusSelect) currentFdStatus = statusSelect.value;

    try {
        const queryParams = new URLSearchParams({
            page: currentFdPage,
            limit: 20,
            company: currentFdCompany,
            status: currentFdStatus,
            search: currentFdSearch
        });

        const res = await api(`/admin/fixed-deposits?${queryParams.toString()}`);
        if (!res || !res.success) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:1.5rem">Failed to load applications: ${res?.message || 'Server error'}</td></tr>`;
            return;
        }

        // Render KPI Summary Stats
        if (res.stats) {
            updateFdStats(res.stats, res.pagination?.total || 0);
        }

        const list = res.data || [];
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:3rem 1rem;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:8px;display:block;opacity:0.4"></i>No Fixed Deposit applications found matching filters.</td></tr>`;
            renderFdPagination(res.pagination);
            return;
        }

        tbody.innerHTML = list.map(app => renderFdRow(app)).join("");
        renderFdPagination(res.pagination);

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:1.5rem"><i class="fas fa-exclamation-triangle"></i> Network error loading FD applications</td></tr>`;
    }
}

// ── Update KPI Statistics ────────────────────────────────────
function updateFdStats(stats, total) {
    const elTotal = document.getElementById("fd-stat-total-apps");
    const elAmount = document.getElementById("fd-stat-total-amount");
    const elBajaj = document.getElementById("fd-stat-bajaj-count");
    const elShriram = document.getElementById("fd-stat-shriram-count");
    const elMahindra = document.getElementById("fd-stat-mahindra-count");
    const elPending = document.getElementById("fd-stat-pending-iris");
    const badge = document.getElementById("fd-pending-badge");

    if (elTotal) elTotal.textContent = total || 0;
    if (elAmount) elAmount.textContent = "₹" + Number(stats.totalAmount || 0).toLocaleString("en-IN");
    if (elBajaj) elBajaj.textContent = stats.bajajCount || 0;
    if (elShriram) elShriram.textContent = stats.shriramCount || 0;
    if (elMahindra) elMahindra.textContent = stats.mahindraCount || 0;
    if (elPending) elPending.textContent = stats.pendingIrisCount || 0;

    if (badge) {
        if (stats.pendingIrisCount > 0) {
            badge.style.display = "inline-flex";
            badge.textContent = stats.pendingIrisCount;
        } else {
            badge.style.display = "none";
        }
    }
}

// ── Render Individual Table Row ──────────────────────────────
function renderFdRow(app) {
    const companyBadges = {
        BAJAJ_FINANCE: `<span class="badge" style="background:rgba(2,132,199,0.18);color:#38bdf8;border:1px solid rgba(2,132,199,0.35);font-weight:700"><i class="fas fa-shield-alt"></i> Bajaj Finance</span>`,
        SHRIRAM_FINANCE: `<span class="badge" style="background:rgba(217,119,6,0.18);color:#fbbf24;border:1px solid rgba(217,119,6,0.35);font-weight:700"><i class="fas fa-star"></i> Shriram Finance</span>`,
        MAHINDRA_FINANCE: `<span class="badge" style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.35);font-weight:700"><i class="fas fa-building"></i> Mahindra Finance</span>`
    };

    const statusBadges = {
        SUBMITTED: `<span class="badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.35)"><i class="fas fa-clock"></i> New (Punch on IRIS)</span>`,
        IN_REVIEW: `<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.35)"><i class="fas fa-search"></i> In Review</span>`,
        APPLIED_ON_IRIS: `<span class="badge" style="background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.35);font-weight:700"><i class="fas fa-paper-plane"></i> Applied on IRIS</span>`,
        APPROVED: `<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.35);font-weight:700"><i class="fas fa-check-circle"></i> Approved (FDR Active)</span>`,
        REJECTED: `<span class="badge" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.35)"><i class="fas fa-times-circle"></i> Rejected</span>`,
        CANCELLED: `<span class="badge" style="background:rgba(100,116,139,0.15);color:#94a3b8"><i class="fas fa-ban"></i> Cancelled</span>`
    };

    const companyBadge = companyBadges[app.company] || `<span class="badge">${app.companyName}</span>`;
    const statusBadge = statusBadges[app.status] || `<span class="badge">${app.status}</span>`;
    const dateFormatted = new Date(app.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    const isSenior = app.seniorCitizen ? `<span style="font-size:10px;color:#f59e0b;font-weight:700;margin-left:4px">★ Senior</span>` : '';

    return `
    <tr>
        <td>
            <div style="font-family:var(--font-mono);font-size:12.5px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px">
                ${app.applicationId}
                <button type="button" class="btn-copy-sm" onclick="copyFdText('${app.applicationId}', 'Application ID copied')" title="Copy ID">
                    <i class="far fa-copy"></i>
                </button>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${dateFormatted}</div>
        </td>
        <td>
            <div style="font-weight:700;color:#fff;font-size:13px">${escapeHtml(app.fullName)}</div>
            <div style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px">
                <span><i class="fas fa-phone" style="font-size:10px"></i> ${app.mobileNumber}</span>
                <span>•</span>
                <span style="font-family:var(--font-mono);color:#cbd5e1">${app.panNumber}</span>
            </div>
        </td>
        <td>
            <div>${companyBadge}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${app.depositType === 'CUMULATIVE' ? 'Cumulative (At Maturity)' : 'Non-Cumulative (' + app.payoutFrequency + ')'}</div>
        </td>
        <td>
            <div style="font-weight:800;font-size:14px;color:var(--gold);font-family:var(--font-mono)">₹${Number(app.amount).toLocaleString('en-IN')}</div>
            <div style="font-size:11px;color:var(--text-dim)">${app.tenureMonths} Months Tenure</div>
        </td>
        <td>
            <div style="font-weight:800;font-size:13px;color:#34d399">${app.interestRate}% p.a.${isSenior}</div>
            <div style="font-size:11px;color:var(--text-dim)">Maturity: ₹${Number(app.maturityAmount || app.amount).toLocaleString('en-IN')}</div>
        </td>
        <td>
            ${statusBadge}
            ${app.irisApplicationNumber ? `<div style="font-size:10.5px;color:#c084fc;font-family:var(--font-mono);margin-top:3px">Ref: ${escapeHtml(app.irisApplicationNumber)}</div>` : ''}
        </td>
        <td style="text-align:right">
            <button class="btn btn-sm btn-primary" onclick="openFdReviewModal('${app._id}')" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px">
                <i class="fas fa-file-invoice"></i> <span>Review & Copy for IRIS</span>
            </button>
        </td>
    </tr>`;
}

// ── Render Pagination ────────────────────────────────────────
function renderFdPagination(p) {
    const mount = document.getElementById("fd-pagination");
    if (!mount || !p) return;

    if (p.pages <= 1) {
        mount.innerHTML = "";
        return;
    }

    let html = `<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">`;
    if (p.page > 1) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadFixedDeposits(${p.page - 1})"><i class="fas fa-chevron-left"></i> Prev</button>`;
    }
    html += `<span style="font-size:12px;color:var(--text-muted);padding:0 8px">Page ${p.page} of ${p.pages} (${p.total} Total)</span>`;
    if (p.page < p.pages) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadFixedDeposits(${p.page + 1})">Next <i class="fas fa-chevron-right"></i></button>`;
    }
    html += `</div>`;
    mount.innerHTML = html;
}

// ── 2. Open Deep Review & Copy Modal for IRIS ────────────────
async function openFdReviewModal(appId) {
    const modal = document.getElementById("fd-review-modal");
    if (!modal) return;

    modal.style.display = "flex";
    const body = document.getElementById("fd-modal-body");
    if (body) {
        body.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:10px">Loading complete application details...</div></div>`;
    }

    try {
        const res = await api(`/admin/fixed-deposits/${appId}`);
        if (!res || !res.success || !res.data) {
            if (body) body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:2rem">Failed to load application details.</div>`;
            return;
        }

        activeFdApplicationData = res.data;
        renderFdModalContent(res.data);
    } catch (e) {
        if (body) body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:2rem">Error loading application: ${e.message || e}</div>`;
    }
}

function closeFdReviewModal() {
    const modal = document.getElementById("fd-review-modal");
    if (modal) modal.style.display = "none";
    activeFdApplicationData = null;
}

// ── Render Modal Content with 1-Click Copy Buttons ───────────
function renderFdModalContent(app) {
    const body = document.getElementById("fd-modal-body");
    if (!body) return;

    body.innerHTML = `
    <!-- Top Action Card: 1-Click Copy All for IRIS -->
    <div style="background:linear-gradient(135deg, rgba(2,132,199,0.15), rgba(15,23,42,0.9));border:1px solid rgba(2,132,199,0.35);border-radius:12px;padding:14px 18px;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
            <div style="font-size:14px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px">
                <i class="fas fa-clipboard-check" style="color:#38bdf8"></i> Instant IRIS Form Auto-Copy
            </div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px">
                Copies all customer fields into formatted text so you can seamlessly paste and punch on the IRIS portal.
            </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="copyCompleteFdForIris()" style="background:linear-gradient(135deg, #0284c7, #0369a1);border:none;font-weight:800;padding:8px 18px;border-radius:8px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(2,132,199,0.35);cursor:pointer">
            <i class="fas fa-copy"></i> <span>Copy All Fields for IRIS</span>
        </button>
    </div>

    <!-- Application Overview Header -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:1.5rem">
        <div style="background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase">Application ID</div>
            <div style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:var(--gold);margin-top:2px;display:flex;align-items:center;justify-content:space-between">
                <span>${app.applicationId}</span>
                <button type="button" class="btn-copy-sm" onclick="copyFdText('${app.applicationId}')"><i class="far fa-copy"></i></button>
            </div>
        </div>
        <div style="background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase">Deposit Amount</div>
            <div style="font-family:var(--font-mono);font-size:15px;font-weight:800;color:#34d399;margin-top:2px">₹${Number(app.amount).toLocaleString('en-IN')}</div>
        </div>
        <div style="background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase">Company & Tenure</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px">${escapeHtml(app.companyName)} (${app.tenureMonths}M)</div>
        </div>
        <div style="background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase">Interest Rate</div>
            <div style="font-size:14px;font-weight:800;color:#38bdf8;margin-top:2px">${app.interestRate}% p.a. ${app.seniorCitizen ? '(Senior)' : ''}</div>
        </div>
    </div>

    <!-- 2-Column Split: Detailed Customer Sections & IRIS Status Controls -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:1.5rem">
        <!-- Left: Customer Form Details -->
        <div>
            <!-- Section 1: Scheme & Deposit Details -->
            <div class="fd-modal-section">
                <div class="fd-modal-sec-title"><i class="fas fa-coins" style="color:var(--gold)"></i> 1. Scheme & Deposit Parameters</div>
                <div class="fd-field-grid">
                    ${renderCopyField("Company Name", app.companyName)}
                    ${renderCopyField("Scheme Name", app.schemeName)}
                    ${renderCopyField("Deposit Type", app.depositType)}
                    ${renderCopyField("Payout Frequency", app.payoutFrequency)}
                    ${renderCopyField("Principal Amount", "₹" + Number(app.amount).toLocaleString('en-IN'), String(app.amount))}
                    ${renderCopyField("Tenure (Months)", `${app.tenureMonths} Months`, String(app.tenureMonths))}
                    ${renderCopyField("Interest Rate", `${app.interestRate}% p.a.`, String(app.interestRate))}
                    ${renderCopyField("Maturity Value", "₹" + Number(app.maturityAmount).toLocaleString('en-IN'), String(app.maturityAmount))}
                    ${renderCopyField("Auto Renewal Option", app.autoRenewal)}
                    ${renderCopyField("Senior Citizen Benefit", app.seniorCitizen ? "YES (+Special Extra Rate Applied)" : "NO")}
                </div>
            </div>

            <!-- Section 2: Personal & KYC Details -->
            <div class="fd-modal-section">
                <div class="fd-modal-sec-title"><i class="fas fa-id-card" style="color:#60a5fa"></i> 2. Applicant Personal & KYC Information</div>
                <div class="fd-field-grid">
                    ${renderCopyField("Full Name (as per PAN)", app.fullName)}
                    ${renderCopyField("PAN Number", app.panNumber)}
                    ${renderCopyField("Date of Birth", app.dob)}
                    ${renderCopyField("Gender", app.gender)}
                    ${renderCopyField("Marital Status", app.maritalStatus)}
                    ${renderCopyField("Father's / Spouse's Name", app.fatherOrSpouseName)}
                    ${renderCopyField("Mother's Maiden Name", app.motherMaidenName || "—")}
                    ${renderCopyField("Occupation", app.occupation)}
                    ${renderCopyField("Annual Income", app.annualIncome)}
                    ${renderCopyField("Residential Status", app.residentStatus)}
                    ${renderCopyField("Politically Exposed (PEP)", app.isPep ? "YES" : "NO")}
                </div>
            </div>

            <!-- Section 3: Contact & Address Details -->
            <div class="fd-modal-section">
                <div class="fd-modal-sec-title"><i class="fas fa-map-marker-alt" style="color:#34d399"></i> 3. Contact & Address Details</div>
                <div class="fd-field-grid">
                    ${renderCopyField("Mobile Number", app.mobileNumber)}
                    ${renderCopyField("Email Address", app.email)}
                    ${renderCopyField("Address Line 1", app.addressLine1)}
                    ${renderCopyField("Address Line 2 / Landmark", [app.addressLine2, app.landmark].filter(Boolean).join(", ") || "—")}
                    ${renderCopyField("City", app.city)}
                    ${renderCopyField("State", app.state)}
                    ${renderCopyField("PIN Code", app.pincode)}
                    ${renderCopyField("Permanent Address Match", app.samePermanentAddress ? "Same as Communication" : `${app.permanentAddressLine1}, ${app.permanentCity}, ${app.permanentState} - ${app.permanentPincode}`)}
                </div>
            </div>

            <!-- Section 4: Bank Details for Payouts -->
            <div class="fd-modal-section">
                <div class="fd-modal-sec-title"><i class="fas fa-university" style="color:#a78bfa"></i> 4. Bank Account for Interest & Maturity Credits</div>
                <div class="fd-field-grid">
                    ${renderCopyField("Bank Name", app.bankName)}
                    ${renderCopyField("Account Number", app.accountNumber)}
                    ${renderCopyField("IFSC Code", app.ifscCode)}
                    ${renderCopyField("Branch Name", app.branchName || "—")}
                    ${renderCopyField("Account Type", app.accountType)}
                    ${renderCopyField("Account Holder Name", app.accountHolderName)}
                </div>
            </div>

            <!-- Section 5: Nominee Details & Declarations -->
            <div class="fd-modal-section">
                <div class="fd-modal-sec-title"><i class="fas fa-user-friends" style="color:#f59e0b"></i> 5. Nominee Details & Tax Declarations</div>
                <div class="fd-field-grid">
                    ${renderCopyField("Nominee Registered", app.hasNominee ? "YES" : "NO")}
                    ${renderCopyField("Nominee Name", app.nomineeName || "—")}
                    ${renderCopyField("Relationship with Applicant", app.nomineeRelation || "—")}
                    ${renderCopyField("Nominee Date of Birth", app.nomineeDob || "—")}
                    ${app.isNomineeMinor ? renderCopyField("Guardian Name", app.guardianName) : ''}
                    ${app.isNomineeMinor ? renderCopyField("Guardian Relation", app.guardianRelation) : ''}
                    ${renderCopyField("Form 15G / 15H Submitted", app.form15G15H ? "YES (Zero TDS Requested)" : "NO (Standard TDS)")}
                    ${renderCopyField("Customer Special Notes", app.customerNotes || "None")}
                </div>
            </div>
        </div>

        <!-- Right: Admin IRIS Punching Controls & Status Tracking -->
        <div>
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;position:sticky;top:10px">
                <div style="font-size:13.5px;font-weight:800;color:#fff;margin-bottom:12px;display:flex;align-items:center;gap:6px">
                    <i class="fas fa-tasks" style="color:var(--gold)"></i> IRIS Processing & Status
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">Application Status</label>
                    <select class="form-control" id="modal-fd-status">
                        <option value="SUBMITTED" ${app.status === 'SUBMITTED' ? 'selected' : ''}>New (Submitted by Customer)</option>
                        <option value="IN_REVIEW" ${app.status === 'IN_REVIEW' ? 'selected' : ''}>In Review</option>
                        <option value="APPLIED_ON_IRIS" ${app.status === 'APPLIED_ON_IRIS' ? 'selected' : ''}>Applied on IRIS Platform</option>
                        <option value="APPROVED" ${app.status === 'APPROVED' ? 'selected' : ''}>Approved (Active Deposit)</option>
                        <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
                        <option value="CANCELLED" ${app.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">IRIS Application / Ref Number</label>
                    <input class="form-control" id="modal-fd-iris-app" value="${escapeHtml(app.irisApplicationNumber || '')}" placeholder="e.g. IRIS-2026-981726" />
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">IRIS Folio Number</label>
                    <input class="form-control" id="modal-fd-iris-folio" value="${escapeHtml(app.irisFolioNumber || '')}" placeholder="e.g. FOLIO-881923" />
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">Fixed Deposit Receipt No (FDR No)</label>
                    <input class="form-control" id="modal-fd-iris-fdr" value="${escapeHtml(app.irisFDRNo || '')}" placeholder="e.g. FDR-BJF-771822" />
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">Admin Internal Notes / Remarks</label>
                    <textarea class="form-control" id="modal-fd-remarks" rows="3" placeholder="Notes on IRIS verification, cheque collection, or reason for delay...">${escapeHtml(app.adminRemarks || '')}</textarea>
                </div>

                ${app.appliedAtIrisAt ? `<div style="font-size:11px;color:#c084fc;margin-bottom:12px"><i class="fas fa-check-circle"></i> Punched on IRIS on ${new Date(app.appliedAtIrisAt).toLocaleString('en-IN')}</div>` : ''}

                <button type="button" class="btn btn-success" onclick="saveFdStatusUpdate('${app._id}')" style="width:100%;font-weight:700;padding:10px;display:flex;align-items:center;justify-content:center;gap:8px">
                    <i class="fas fa-save"></i> Save IRIS Status & Update
                </button>
            </div>
        </div>
    </div>`;
}

// ── Helper to Render Individual Field with Copy Icon ─────────
function renderCopyField(label, displayVal, copyRawVal) {
    const raw = copyRawVal !== undefined ? copyRawVal : displayVal;
    const isBlank = !displayVal || displayVal === "—";

    return `
    <div style="background:rgba(0,0,0,0.2);padding:7px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.04)">
        <div style="font-size:10.5px;color:var(--text-dim)">${label}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:2px">
            <span style="font-size:12.5px;font-weight:700;color:#fff;word-break:break-word">${displayVal || '—'}</span>
            ${!isBlank ? `
                <button type="button" class="btn-copy-sm" onclick="copyFdText('${escapeHtml(String(raw))}', '${label} copied')" title="Copy ${label}">
                    <i class="far fa-copy"></i>
                </button>
            ` : ''}
        </div>
    </div>`;
}

// ── Copy Individual String to Clipboard ──────────────────────
async function copyFdText(text, successMsg = "Copied to clipboard!") {
    try {
        await navigator.clipboard.writeText(text);
        toast(successMsg, "success");
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        toast(successMsg, "success");
    }
}

// ── Copy Complete Structured Form for IRIS Platform ─────────
async function copyCompleteFdForIris() {
    if (!activeFdApplicationData) {
        toast("No active application loaded", "warning");
        return;
    }

    const a = activeFdApplicationData;
    const textToCopy = `=====================================================
VIKAONE / PAYVIKA — FIXED DEPOSIT APPLICATION FOR IRIS
=====================================================
Application ID: ${a.applicationId}
Submission Date: ${new Date(a.createdAt).toLocaleString('en-IN')}

[1. SCHEME & DEPOSIT DETAILS]
Company: ${a.companyName} (${a.company})
Scheme: ${a.schemeName}
Deposit Type: ${a.depositType}
Payout Frequency: ${a.payoutFrequency}
Principal Amount: INR ${a.amount}
Tenure: ${a.tenureMonths} Months
Interest Rate: ${a.interestRate}% p.a.
Maturity Amount: INR ${a.maturityAmount}
Senior Citizen: ${a.seniorCitizen ? "YES" : "NO"}
Auto-Renewal: ${a.autoRenewal}

[2. APPLICANT PERSONAL & KYC DETAILS]
Full Legal Name: ${a.fullName}
PAN Number: ${a.panNumber}
Date of Birth: ${a.dob}
Gender: ${a.gender}
Marital Status: ${a.maritalStatus}
Father / Spouse Name: ${a.fatherOrSpouseName}
Mother's Maiden Name: ${a.motherMaidenName || "N/A"}
Occupation: ${a.occupation}
Annual Income: ${a.annualIncome}
Resident Status: ${a.residentStatus}
Politically Exposed (PEP): ${a.isPep ? "YES" : "NO"}

[3. CONTACT & ADDRESS DETAILS]
Mobile: ${a.mobileNumber}
Email: ${a.email}
Address Line 1: ${a.addressLine1}
Address Line 2: ${a.addressLine2 || "N/A"}
Landmark: ${a.landmark || "N/A"}
City: ${a.city}
State: ${a.state}
Pincode: ${a.pincode}
Permanent Address: ${a.samePermanentAddress ? "Same as Communication" : a.permanentAddressLine1 + ", " + a.permanentCity + ", " + a.permanentState + " - " + a.permanentPincode}

[4. BANK DETAILS (FOR INTEREST & REDEMPTION)]
Bank Name: ${a.bankName}
Account Number: ${a.accountNumber}
IFSC Code: ${a.ifscCode}
Account Type: ${a.accountType}
Account Holder: ${a.accountHolderName}
Branch: ${a.branchName || "N/A"}

[5. NOMINEE DETAILS]
Has Nominee: ${a.hasNominee ? "YES" : "NO"}
Nominee Name: ${a.nomineeName || "N/A"}
Relationship: ${a.nomineeRelation || "N/A"}
Nominee DOB: ${a.nomineeDob || "N/A"}
Is Minor: ${a.isNomineeMinor ? "YES" : "NO"}
Guardian: ${a.guardianName || "N/A"} (${a.guardianRelation || "N/A"})

[6. TAX & DECLARATIONS]
Form 15G / 15H: ${a.form15G15H ? "YES" : "NO"}
Customer Notes: ${a.customerNotes || "None"}
=====================================================`;

    await copyFdText(textToCopy, "🎉 All Application Details Copied! Ready to punch on IRIS platform.");
}

// ── Save Admin Status & IRIS Updates ─────────────────────────
async function saveFdStatusUpdate(appId) {
    const status = document.getElementById("modal-fd-status")?.value;
    const irisApplicationNumber = document.getElementById("modal-fd-iris-app")?.value;
    const irisFolioNumber = document.getElementById("modal-fd-iris-folio")?.value;
    const irisFDRNo = document.getElementById("modal-fd-iris-fdr")?.value;
    const adminRemarks = document.getElementById("modal-fd-remarks")?.value;

    try {
        const res = await api(`/admin/fixed-deposits/${appId}`, {
            method: "PATCH",
            body: JSON.stringify({
                status,
                irisApplicationNumber,
                irisFolioNumber,
                irisFDRNo,
                adminRemarks
            })
        });

        if (res && res.success) {
            toast(res.message || "Fixed Deposit application updated successfully! ✓", "success");
            closeFdReviewModal();
            loadFixedDeposits(currentFdPage);
        } else {
            toast(res?.message || "Failed to update application", "danger");
        }
    } catch (e) {
        toast("Error updating application: " + (e.message || e), "danger");
    }
}

// ── Export CSV for IRIS / Records ────────────────────────────
function exportFdCsv() {
    const company = document.getElementById("fd-company-filter")?.value || "ALL";
    const status = document.getElementById("fd-status-filter")?.value || "ALL";
    const base = typeof API_BASE !== "undefined" ? API_BASE : "https://api.vikaone.com/api";
    const url = `${base}/admin/fixed-deposits/export-csv?company=${company}&status=${status}`;

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `VikaOne_FD_Applications_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Exporting Fixed Deposit applications CSV...", "info");
}

// Attach to window
window.loadFixedDeposits = loadFixedDeposits;
window.openFdReviewModal = openFdReviewModal;
window.closeFdReviewModal = closeFdReviewModal;
window.copyFdText = copyFdText;
window.copyCompleteFdForIris = copyCompleteFdForIris;
window.saveFdStatusUpdate = saveFdStatusUpdate;
window.exportFdCsv = exportFdCsv;
