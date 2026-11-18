/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Corporate Fixed Deposits & IRIS Desk
   Executive Administration, KYC Review & IRIS Platform Puncher
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

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align:center;padding:3.5rem 1rem;color:var(--text-muted)">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#f59e0b;margin-bottom:12px;display:block"></i>
                <div style="font-weight:700;color:#fff;font-size:14px">Loading Fixed Deposit Applications...</div>
                <div style="font-size:12px;color:#64748b;margin-top:4px">Connecting to IRIS distribution database</div>
            </td>
        </tr>`;

    const searchInput = document.getElementById("fd-search-input");
    if (searchInput) {
        currentFdSearch = searchInput.value.trim();
        const clearBtn = document.getElementById("fd-search-clear");
        if (clearBtn) clearBtn.style.display = currentFdSearch ? "block" : "none";
    }

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
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;color:var(--danger);padding:2.5rem">
                        <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:10px;display:block"></i>
                        Failed to load applications: ${res?.message || 'Server error'}
                    </td>
                </tr>`;
            return;
        }

        // Render KPI Summary Stats & Status Tab Badges
        if (res.stats) {
            updateFdStats(res.stats, res.pagination?.total || 0);
        }

        const list = res.data || [];
        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:4rem 1rem;color:var(--text-muted)">
                        <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
                            <i class="fas fa-inbox" style="font-size:24px;color:#64748b"></i>
                        </div>
                        <div style="font-size:15px;font-weight:800;color:#fff">No Fixed Deposit Applications Found</div>
                        <div style="font-size:12.5px;color:#64748b;margin-top:4px">No submissions match the selected company or status criteria.</div>
                        <button class="btn btn-secondary btn-sm" onclick="resetFdFilters()" style="margin-top:16px;font-weight:700">
                            <i class="fas fa-undo"></i> Reset All Filters
                        </button>
                    </td>
                </tr>`;
            renderFdPagination(res.pagination);
            return;
        }

        tbody.innerHTML = list.map(app => renderFdRow(app)).join("");
        renderFdPagination(res.pagination);

    } catch (err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;color:var(--danger);padding:2.5rem">
                    <i class="fas fa-wifi fa-2x" style="margin-bottom:10px;display:block"></i>
                    Network error loading FD applications. Please check your connection.
                </td>
            </tr>`;
    }
}

// ── Update KPI Statistics & Status Tabs ───────────────────────
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

    // Sidebar navigation badge
    if (badge) {
        if (stats.pendingIrisCount > 0) {
            badge.style.display = "inline-flex";
            badge.textContent = stats.pendingIrisCount;
        } else {
            badge.style.display = "none";
        }
    }

    // Tab count badges
    const tabAll = document.getElementById("fd-tab-count-all");
    const tabPending = document.getElementById("fd-tab-count-pending");
    const tabApplied = document.getElementById("fd-tab-count-applied");
    const tabApproved = document.getElementById("fd-tab-count-approved");

    if (tabAll) tabAll.textContent = total || 0;
    if (tabPending) tabPending.textContent = stats.pendingIrisCount || 0;
    if (tabApplied) tabApplied.textContent = stats.appliedIrisCount || 0;
    if (tabApproved) tabApproved.textContent = stats.approvedCount || 0;
}

// ── Render Individual Table Row ──────────────────────────────
function renderFdRow(app) {
    const companyClass = app.company === 'BAJAJ_FINANCE' ? 'bajaj' :
        (app.company === 'SHRIRAM_FINANCE' ? 'shriram' :
        (app.company === 'MAHINDRA_FINANCE' ? 'mahindra' :
        (app.company === 'PNB_HOUSING' ? 'pnb' : 'lic')));

    const companyIcon = app.company === 'BAJAJ_FINANCE' ? 'shield-alt' :
        (app.company === 'SHRIRAM_FINANCE' ? 'star' :
        (app.company === 'MAHINDRA_FINANCE' ? 'building' :
        (app.company === 'PNB_HOUSING' ? 'home' : 'award')));

    const logoMap = {
        'BAJAJ_FINANCE': 'images/fd/bajaj_finance.png',
        'SHRIRAM_FINANCE': 'images/fd/shriram_finance.png',
        'MAHINDRA_FINANCE': 'images/fd/mahindra_finance.png',
        'PNB_HOUSING': 'images/fd/pnb_housing.png',
        'LIC_HOUSING': 'images/fd/lic_housing.png'
    };
    const logoSrc = logoMap[app.company] || '';

    const statusMap = {
        SUBMITTED: { label: 'New (Punch on IRIS)', class: 'submitted', icon: 'bolt' },
        IN_REVIEW: { label: 'In Review', class: 'in_review', icon: 'search' },
        APPLIED_ON_IRIS: { label: 'Applied on IRIS', class: 'applied_on_iris', icon: 'paper-plane' },
        APPROVED: { label: 'Approved (FDR Active)', class: 'approved', icon: 'check-circle' },
        REJECTED: { label: 'Rejected', class: 'rejected', icon: 'times-circle' },
        CANCELLED: { label: 'Cancelled', class: 'rejected', icon: 'ban' }
    };

    const st = statusMap[app.status] || { label: app.status, class: 'submitted', icon: 'circle' };
    const dateFormatted = new Date(app.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    const isSenior = app.seniorCitizen ? `<span class="fd-senior-star"><i class="fas fa-star" style="font-size:9px"></i> Senior</span>` : '';
    const avatarInitials = (app.fullName || "FD").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

    return `
    <tr>
        <!-- 1. Applicant & Contact -->
        <td>
            <div class="fd-customer-cell">
                <div class="fd-avatar">${avatarInitials}</div>
                <div>
                    <div class="fd-customer-name">${escapeHtml(app.fullName)}</div>
                    <div class="fd-customer-meta">
                        <span><i class="fas fa-phone" style="font-size:10px"></i> ${escapeHtml(app.mobileNumber)}</span>
                        <span class="fd-pan-pill">${escapeHtml(app.panNumber)}</span>
                        <button type="button" class="btn-copy-sm" onclick="copyFdText('${app.panNumber}', 'PAN Copied: ${app.panNumber}')" title="Copy PAN">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>
        </td>

        <!-- 2. Selected FD Plan & Company -->
        <td>
            <div style="display:flex;align-items:center;gap:8px">
                ${logoSrc ? `<img src="${logoSrc}" alt="${escapeHtml(app.companyName)}" style="width:26px;height:26px;object-fit:contain;background:#ffffff;border-radius:6px;padding:2px;box-shadow:0 2px 6px rgba(0,0,0,0.3);flex-shrink:0">` : ''}
                <span class="fd-badge-company ${companyClass}">
                    <i class="fas fa-${companyIcon}"></i> ${escapeHtml(app.companyName)}
                </span>
            </div>
            <div style="margin-top:6px">
                <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:5px">
                    <i class="fas fa-certificate" style="font-size:10px"></i> ${escapeHtml(app.schemeName || 'Corporate FD')}
                </span>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px;font-weight:500">
                ${app.depositType === 'CUMULATIVE' ? 'Cumulative (On Maturity)' : 'Non-Cumulative (' + (app.payoutFrequency || 'Monthly') + ')'}
            </div>
        </td>

        <!-- 3. Deposit Amount & Tenure -->
        <td>
            <div class="fd-amount-cell">₹${Number(app.amount).toLocaleString('en-IN')}</div>
            <div class="fd-tenure-tag">
                <i class="far fa-clock" style="font-size:10px"></i> ${app.tenureMonths} Months Tenure
            </div>
        </td>

        <!-- 4. Rate & Maturity -->
        <td>
            <div style="display:flex;align-items:center">
                <span class="fd-rate-cell">${app.interestRate}% p.a.</span>
                ${isSenior}
            </div>
            <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;font-family:'JetBrains Mono',monospace">
                Mat: ₹${Number(app.maturityAmount || app.amount).toLocaleString('en-IN')}
            </div>
        </td>

        <!-- 5. Status & Submission -->
        <td>
            <div>
                <span class="fd-badge-status ${st.class}">
                    <i class="fas fa-${st.icon}"></i> ${st.label}
                </span>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:4px">
                ${dateFormatted}
            </div>
            ${app.irisApplicationNumber ? `
                <div style="font-size:10.5px;color:#c084fc;font-family:'JetBrains Mono',monospace;margin-top:2px">
                    IRIS: ${escapeHtml(app.irisApplicationNumber)}
                </div>
            ` : ''}
        </td>

        <!-- 6. Actions -->
        <td style="text-align:right">
            <button type="button" class="fd-btn-review" onclick="openFdReviewModal('${app._id}')" title="Open complete details and copy for IRIS">
                <i class="fas fa-file-invoice"></i> <span>Review & IRIS</span>
            </button>
        </td>
    </tr>`;
}

// ── Filter Triggers ──────────────────────────────────────────
function filterFdStatus(status) {
    currentFdStatus = status;
    document.querySelectorAll(".fd-status-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-status") === status);
    });
    loadFixedDeposits(1);
}

function filterFdCompany(company) {
    currentFdCompany = company;
    document.querySelectorAll(".fd-chip-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-company") === company);
    });
    loadFixedDeposits(1);
}

function handleFdSearchKey(e) {
    if (e.key === "Enter") {
        loadFixedDeposits(1);
    } else {
        const clearBtn = document.getElementById("fd-search-clear");
        if (clearBtn) clearBtn.style.display = e.target.value.trim() ? "block" : "none";
    }
}

function clearFdSearch() {
    const input = document.getElementById("fd-search-input");
    if (input) input.value = "";
    const clearBtn = document.getElementById("fd-search-clear");
    if (clearBtn) clearBtn.style.display = "none";
    loadFixedDeposits(1);
}

function resetFdFilters() {
    currentFdCompany = "ALL";
    currentFdStatus = "ALL";
    currentFdSearch = "";

    const input = document.getElementById("fd-search-input");
    if (input) input.value = "";

    document.querySelectorAll(".fd-status-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-status") === "ALL");
    });
    document.querySelectorAll(".fd-chip-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-company") === "ALL");
    });

    loadFixedDeposits(1);
}

// ── Render Pagination ────────────────────────────────────────
function renderFdPagination(p) {
    const mount = document.getElementById("fd-pagination");
    if (!mount || !p) return;

    if (p.pages <= 1) {
        mount.innerHTML = `<span style="font-size:12px;color:#64748b">Showing ${p.total || 0} application${p.total === 1 ? '' : 's'}</span>`;
        return;
    }

    const startIdx = (p.page - 1) * p.limit + 1;
    const endIdx = Math.min(p.page * p.limit, p.total);

    let html = `
        <div style="font-size:12.5px;color:#94a3b8">
            Showing <strong style="color:#fff">${startIdx}–${endIdx}</strong> of <strong style="color:#fff">${p.total}</strong> applications
        </div>
        <div style="display:flex;gap:8px;align-items:center">`;

    if (p.page > 1) {
        html += `<button class="btn btn-sm btn-secondary" onclick="loadFixedDeposits(${p.page - 1})"><i class="fas fa-chevron-left"></i> Prev</button>`;
    }
    html += `<span style="font-size:12px;color:#cbd5e1;padding:0 8px;font-weight:700">Page ${p.page} of ${p.pages}</span>`;
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
        body.innerHTML = `
            <div style="text-align:center;padding:4rem;color:var(--text-muted)">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#f59e0b;margin-bottom:12px;display:block"></i>
                <div style="font-size:15px;font-weight:700;color:#fff">Loading Full Application Dossier...</div>
                <div style="font-size:12.5px;color:#64748b;margin-top:4px">Preparing complete customer & banking data for IRIS punching</div>
            </div>`;
    }

    try {
        const res = await api(`/admin/fixed-deposits/${appId}`);
        if (!res || !res.success || !res.data) {
            if (body) body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:2.5rem"><i class="fas fa-times-circle fa-2x"></i><br>Failed to load application details.</div>`;
            return;
        }

        activeFdApplicationData = res.data;
        renderFdModalContent(res.data);
    } catch (e) {
        if (body) body.innerHTML = `<div style="color:var(--danger);text-align:center;padding:2.5rem">Error: ${e.message || e}</div>`;
    }
}

function closeFdReviewModal() {
    const modal = document.getElementById("fd-review-modal");
    if (modal) modal.style.display = "none";
    activeFdApplicationData = null;
}

// ── Render Modal Content with Quick Copy & IRIS Stepper ──────
function renderFdModalContent(app) {
    const body = document.getElementById("fd-modal-body");
    if (!body) return;

    // Stepper active states
    const isSubmitted = true;
    const isInReview = app.status !== 'SUBMITTED';
    const isApplied = ['APPLIED_ON_IRIS', 'APPROVED'].includes(app.status);
    const isApproved = app.status === 'APPROVED';

    const companyClass = app.company === 'BAJAJ_FINANCE' ? 'bajaj' :
        (app.company === 'SHRIRAM_FINANCE' ? 'shriram' :
        (app.company === 'MAHINDRA_FINANCE' ? 'mahindra' :
        (app.company === 'PNB_HOUSING' ? 'pnb' : 'lic')));

    const logoMap = {
        'BAJAJ_FINANCE': 'images/fd/bajaj_finance.png',
        'SHRIRAM_FINANCE': 'images/fd/shriram_finance.png',
        'MAHINDRA_FINANCE': 'images/fd/mahindra_finance.png',
        'PNB_HOUSING': 'images/fd/pnb_housing.png',
        'LIC_HOUSING': 'images/fd/lic_housing.png'
    };
    const logoSrc = logoMap[app.company] || '';

    body.innerHTML = `
    <!-- 1. Sticky Quick-Copy Action Strip -->
    <div class="fd-quick-copy-bar" style="border-radius:10px;margin-bottom:18px">
        <span style="font-size:11px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:5px;margin-right:6px">
            <i class="fas fa-bolt"></i> Quick Copy:
        </span>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.fullName)}', 'Full Name')">
            <i class="far fa-copy"></i> Full Name
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.panNumber)}', 'PAN Number')">
            <i class="far fa-copy"></i> PAN
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.dob)}', 'Date of Birth')">
            <i class="far fa-copy"></i> DOB (${app.dob})
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.mobileNumber)}', 'Mobile')">
            <i class="far fa-copy"></i> Mobile
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.accountNumber)}', 'Account Number')">
            <i class="far fa-copy"></i> Bank A/C
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.ifscCode)}', 'IFSC Code')">
            <i class="far fa-copy"></i> IFSC
        </button>
        <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml([app.addressLine1, app.city, app.state, app.pincode].filter(Boolean).join(', '))}', 'Address')">
            <i class="far fa-copy"></i> Address
        </button>
        ${app.hasNominee && app.nomineeName ? `
            <button type="button" class="fd-copy-pill" onclick="copyFdPill(this, '${escapeHtml(app.nomineeName)}', 'Nominee Name')">
                <i class="far fa-copy"></i> Nominee
            </button>
        ` : ''}
        <button type="button" class="fd-copy-pill" onclick="copyCompleteFdForIris()" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8;color:#fff;margin-left:auto;font-weight:800">
            <i class="fas fa-paste"></i> COPY ALL FOR IRIS
        </button>
    </div>

    <!-- 2. IRIS Punching Stepper -->
    <div class="fd-iris-stepper">
        <div class="fd-step-item ${isSubmitted ? (isInReview ? 'completed' : 'active') : ''}">
            <div class="fd-step-num">${isInReview ? '✓' : '1'}</div>
            <span>1. Customer Submitted</span>
        </div>
        <div class="fd-step-item ${isInReview ? (isApplied ? 'completed' : 'active') : ''}">
            <div class="fd-step-num">${isApplied ? '✓' : '2'}</div>
            <span>2. Admin Review</span>
        </div>
        <div class="fd-step-item ${isApplied ? (isApproved ? 'completed' : 'active') : ''}">
            <div class="fd-step-num">${isApproved ? '✓' : '3'}</div>
            <span>3. Punched on IRIS</span>
        </div>
        <div class="fd-step-item ${isApproved ? 'completed active' : ''}">
            <div class="fd-step-num">${isApproved ? '✓' : '4'}</div>
            <span>4. FDR Issued & Active</span>
        </div>
    </div>

    <!-- 3. Customer Selected Plan & Overview Banner -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:12px;margin-bottom:20px">
        <div class="fd-field-box" style="background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(15,23,42,0.6));border:1px solid rgba(245,158,11,0.35)">
            <div class="fd-field-label" style="color:#fbbf24;font-weight:800;display:flex;align-items:center;gap:6px">
                <i class="fas fa-certificate"></i> Customer Selected Plan
            </div>
            <div style="font-size:14px;font-weight:800;color:#ffffff;margin-top:4px;line-height:1.3">
                ${escapeHtml(app.schemeName || 'Corporate Fixed Deposit')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                ${logoSrc ? `<img src="${logoSrc}" alt="${escapeHtml(app.companyName)}" style="height:18px;background:#fff;border-radius:4px;padding:1px">` : ''}
                <span class="fd-badge-company ${companyClass}" style="font-size:10.5px;padding:2px 7px">
                    ${escapeHtml(app.companyName)}
                </span>
            </div>
        </div>

        <div class="fd-field-box">
            <div class="fd-field-label">Deposit Principal</div>
            <div style="font-family:'JetBrains Mono',monospace;color:#34d399;font-size:17px;font-weight:800;margin-top:4px">
                ₹${Number(app.amount).toLocaleString('en-IN')}
            </div>
            <div style="font-size:11.5px;color:#94a3b8;margin-top:4px">
                <i class="far fa-clock"></i> ${app.tenureMonths} Months (${(app.tenureMonths / 12).toFixed(1)} Yrs)
            </div>
        </div>

        <div class="fd-field-box">
            <div class="fd-field-label">Yield & Payout Mode</div>
            <div style="color:#38bdf8;font-size:17px;font-weight:800;margin-top:4px">
                ${app.interestRate}% <span style="font-size:12px;font-weight:600;color:#94a3b8">p.a.</span>
            </div>
            <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px">
                ${app.depositType === 'CUMULATIVE' ? 'Cumulative (Compounded)' : 'Non-Cumulative (' + (app.payoutFrequency || 'Monthly') + ')'}
            </div>
        </div>

        <div class="fd-field-box">
            <div class="fd-field-label">Maturity Returns</div>
            <div style="font-family:'JetBrains Mono',monospace;color:#fbbf24;font-size:17px;font-weight:800;margin-top:4px">
                ₹${Number(app.maturityAmount || app.amount).toLocaleString('en-IN')}
            </div>
            <div style="font-size:11.5px;color:#34d399;margin-top:4px">
                ${app.seniorCitizen ? '★ Senior Citizen Benefit Included' : 'Standard Citizen Terms'}
            </div>
        </div>
    </div>

    <!-- 4. Main 2-Column Split: Detailed Customer Dossier & IRIS Status Console -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px">
        <!-- Left: Customer Form Details (All Captured Fields with Copy) -->
        <div>
            <!-- Section 1: Scheme & Deposit Parameters -->
            <div class="fd-modal-sec-card">
                <div class="fd-modal-sec-head" style="display:flex;align-items:center;justify-content:space-between">
                    <span><i class="fas fa-coins" style="color:#fbbf24;margin-right:6px"></i> 1. Selected Scheme & Deposit Parameters</span>
                    ${logoSrc ? `<img src="${logoSrc}" alt="${escapeHtml(app.companyName)}" style="height:22px;background:#ffffff;border-radius:4px;padding:2px">` : ''}
                </div>
                <div class="fd-grid-fields">
                    ${renderFieldBox("Company Name", app.companyName)}
                    ${renderFieldBox("Selected Scheme", app.schemeName)}
                    ${renderFieldBox("Deposit Type", app.depositType)}
                    ${renderFieldBox("Payout Frequency", app.payoutFrequency)}
                    ${renderFieldBox("Principal Amount", "₹" + Number(app.amount).toLocaleString('en-IN'), String(app.amount))}
                    ${renderFieldBox("Tenure (Months)", `${app.tenureMonths} Months`, String(app.tenureMonths))}
                    ${renderFieldBox("Interest Rate", `${app.interestRate}% p.a.`, String(app.interestRate))}
                    ${renderFieldBox("Maturity Value", "₹" + Number(app.maturityAmount).toLocaleString('en-IN'), String(app.maturityAmount))}
                    ${renderFieldBox("Auto Renewal Option", app.autoRenewal)}
                    ${renderFieldBox("Senior Citizen Benefit", app.seniorCitizen ? "YES (+Special Extra Rate)" : "NO")}
                </div>
            </div>
                    ${renderFieldBox("Interest Rate", `${app.interestRate}% p.a.`, String(app.interestRate))}
                    ${renderFieldBox("Maturity Value", "₹" + Number(app.maturityAmount).toLocaleString('en-IN'), String(app.maturityAmount))}
                    ${renderFieldBox("Auto Renewal Option", app.autoRenewal)}
                    ${renderFieldBox("Senior Citizen Benefit", app.seniorCitizen ? "YES (+Special Extra Rate)" : "NO")}
                </div>
            </div>

            <!-- Section 2: Personal & KYC Details -->
            <div class="fd-modal-sec-card">
                <div class="fd-modal-sec-head">
                    <span><i class="fas fa-id-card" style="color:#60a5fa;margin-right:6px"></i> 2. Applicant Personal & KYC Information</span>
                </div>
                <div class="fd-grid-fields">
                    ${renderFieldBox("Full Name (as per PAN)", app.fullName)}
                    ${renderFieldBox("PAN Number", app.panNumber)}
                    ${renderFieldBox("Date of Birth", app.dob)}
                    ${renderFieldBox("Gender", app.gender)}
                    ${renderFieldBox("Marital Status", app.maritalStatus)}
                    ${renderFieldBox("Father's / Spouse's Name", app.fatherOrSpouseName)}
                    ${renderFieldBox("Mother's Maiden Name", app.motherMaidenName || "—")}
                    ${renderFieldBox("Occupation", app.occupation)}
                    ${renderFieldBox("Annual Income", app.annualIncome)}
                    ${renderFieldBox("Residential Status", app.residentStatus)}
                    ${renderFieldBox("Politically Exposed (PEP)", app.isPep ? "YES" : "NO")}
                </div>
            </div>

            <!-- Section 3: Contact & Address Details -->
            <div class="fd-modal-sec-card">
                <div class="fd-modal-sec-head">
                    <span><i class="fas fa-map-marker-alt" style="color:#34d399;margin-right:6px"></i> 3. Contact & Address Details</span>
                </div>
                <div class="fd-grid-fields">
                    ${renderFieldBox("Mobile Number", app.mobileNumber)}
                    ${renderFieldBox("Email Address", app.email)}
                    ${renderFieldBox("Address Line 1", app.addressLine1)}
                    ${renderFieldBox("Address Line 2", [app.addressLine2, app.landmark].filter(Boolean).join(", ") || "—")}
                    ${renderFieldBox("City", app.city)}
                    ${renderFieldBox("State", app.state)}
                    ${renderFieldBox("PIN Code", app.pincode)}
                    ${renderFieldBox("Permanent Address", app.samePermanentAddress ? "Same as Communication" : `${app.permanentAddressLine1 || ''}, ${app.permanentCity || ''}, ${app.permanentState || ''} - ${app.permanentPincode || ''}`)}
                </div>
            </div>

            <!-- Section 4: Bank Account Details -->
            <div class="fd-modal-sec-card">
                <div class="fd-modal-sec-head">
                    <span><i class="fas fa-university" style="color:#a78bfa;margin-right:6px"></i> 4. Bank Account for Interest & Maturity Credits</span>
                </div>
                <div class="fd-grid-fields">
                    ${renderFieldBox("Bank Name", app.bankName)}
                    ${renderFieldBox("Account Number", app.accountNumber)}
                    ${renderFieldBox("IFSC Code", app.ifscCode)}
                    ${renderFieldBox("Branch Name", app.branchName || "—")}
                    ${renderFieldBox("Account Type", app.accountType)}
                    ${renderFieldBox("Account Holder Name", app.accountHolderName)}
                </div>
            </div>

            <!-- Section 5: Nominee Details & Tax Declarations -->
            <div class="fd-modal-sec-card">
                <div class="fd-modal-sec-head">
                    <span><i class="fas fa-user-friends" style="color:#f59e0b;margin-right:6px"></i> 5. Nominee Details & Tax Declarations</span>
                </div>
                <div class="fd-grid-fields">
                    ${renderFieldBox("Nominee Registered", app.hasNominee ? "YES" : "NO")}
                    ${renderFieldBox("Nominee Name", app.nomineeName || "—")}
                    ${renderFieldBox("Relationship", app.nomineeRelation || "—")}
                    ${renderFieldBox("Nominee Date of Birth", app.nomineeDob || "—")}
                    ${app.isNomineeMinor ? renderFieldBox("Guardian Name", app.guardianName) : ''}
                    ${app.isNomineeMinor ? renderFieldBox("Guardian Relation", app.guardianRelation) : ''}
                    ${renderFieldBox("Form 15G / 15H Submitted", app.form15G15H ? "YES (Zero TDS Claimed)" : "NO (Standard TDS)")}
                    ${renderFieldBox("Customer Special Notes", app.customerNotes || "None")}
                </div>
            </div>
        </div>

        <!-- Right: IRIS Console & Status Tracker -->
        <div>
            <div class="fd-iris-console-card">
                <div class="fd-console-title">
                    <i class="fas fa-tasks" style="color:#f59e0b"></i> IRIS Processing Console
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label class="form-label" style="font-size:12px;font-weight:700;color:#cbd5e1">Application Status</label>
                    <select class="form-control" id="modal-fd-status" style="background:#090e17;border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;padding:9px 12px;border-radius:8px">
                        <option value="SUBMITTED" ${app.status === 'SUBMITTED' ? 'selected' : ''}>New (Submitted by Customer)</option>
                        <option value="IN_REVIEW" ${app.status === 'IN_REVIEW' ? 'selected' : ''}>In Review</option>
                        <option value="APPLIED_ON_IRIS" ${app.status === 'APPLIED_ON_IRIS' ? 'selected' : ''}>Applied on IRIS Platform</option>
                        <option value="APPROVED" ${app.status === 'APPROVED' ? 'selected' : ''}>Approved (Active FDR Issued)</option>
                        <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
                        <option value="CANCELLED" ${app.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label class="form-label" style="font-size:12px;font-weight:700;color:#cbd5e1">IRIS Application Reference No</label>
                    <input class="form-control" id="modal-fd-iris-app" value="${escapeHtml(app.irisApplicationNumber || '')}" placeholder="e.g. IRIS-2026-981726" style="background:#090e17;border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;padding:9px 12px;border-radius:8px" />
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label class="form-label" style="font-size:12px;font-weight:700;color:#cbd5e1">IRIS Folio Number</label>
                    <input class="form-control" id="modal-fd-iris-folio" value="${escapeHtml(app.irisFolioNumber || '')}" placeholder="e.g. FOLIO-881923" style="background:#090e17;border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;padding:9px 12px;border-radius:8px" />
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label class="form-label" style="font-size:12px;font-weight:700;color:#cbd5e1">Fixed Deposit Receipt No (FDR No)</label>
                    <input class="form-control" id="modal-fd-iris-fdr" value="${escapeHtml(app.irisFDRNo || '')}" placeholder="e.g. FDR-BJF-771822" style="background:#090e17;border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;padding:9px 12px;border-radius:8px" />
                </div>

                <div class="form-group" style="margin-bottom:16px">
                    <label class="form-label" style="font-size:12px;font-weight:700;color:#cbd5e1">Admin Remarks & Audit Notes</label>
                    <textarea class="form-control" id="modal-fd-remarks" rows="3" placeholder="Add notes regarding cheque collection, KYC verification, or IRIS reference..." style="background:#090e17;border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;padding:9px 12px;border-radius:8px;resize:vertical">${escapeHtml(app.adminRemarks || '')}</textarea>
                </div>

                ${app.appliedAtIrisAt ? `
                    <div style="font-size:11.5px;color:#c084fc;margin-bottom:14px;padding:8px 12px;background:rgba(168,85,247,0.1);border-radius:6px;border:1px solid rgba(168,85,247,0.25)">
                        <i class="fas fa-check-circle"></i> Punched on IRIS on ${new Date(app.appliedAtIrisAt).toLocaleString('en-IN')}
                    </div>
                ` : ''}

                <button type="button" class="btn btn-success" id="btn-fd-save-status" onclick="saveFdStatusUpdate('${app._id}')" style="width:100%;font-weight:800;padding:11px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;background:#10b981;border:none;box-shadow:0 4px 15px rgba(16,185,129,0.3)">
                    <i class="fas fa-save"></i> Save IRIS Status & Update
                </button>
            </div>
        </div>
    </div>`;
}

// ── Helper to Render Individual Field Box with Copy Icon ─────
function renderFieldBox(label, displayVal, copyRawVal) {
    const raw = copyRawVal !== undefined ? copyRawVal : displayVal;
    const isBlank = !displayVal || displayVal === "—";

    return `
    <div class="fd-field-box">
        <div class="fd-field-label">${label}</div>
        <div class="fd-field-val-row">
            <span class="fd-field-value">${displayVal || '—'}</span>
            ${!isBlank ? `
                <button type="button" class="fd-inline-copy-btn" onclick="copyFdText('${escapeHtml(String(raw))}', '${label} copied: ${escapeHtml(String(raw))}')" title="Copy ${label}">
                    <i class="far fa-copy"></i>
                </button>
            ` : ''}
        </div>
    </div>`;
}

// ── Copy Helpers with Visual Feedback ────────────────────────
async function copyFdPill(btn, text, label) {
    if (!text || text === "—") return;
    try {
        await navigator.clipboard.writeText(text);
        const originalHtml = btn.innerHTML;
        btn.classList.add("success");
        btn.innerHTML = `<i class="fas fa-check"></i> ${label} Copied!`;
        toast(`${label} copied to clipboard!`, "success");
        setTimeout(() => {
            btn.classList.remove("success");
            btn.innerHTML = originalHtml;
        }, 1500);
    } catch (e) {
        copyFdText(text, `${label} copied!`);
    }
}

async function copyFdText(text, successMsg = "Copied to clipboard!") {
    try {
        await navigator.clipboard.writeText(text);
        toast(successMsg, "success");
    } catch (e) {
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
Senior Citizen: ${a.seniorCitizen ? "YES (+Senior Bonus)" : "NO"}
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
Permanent Address: ${a.samePermanentAddress ? "Same as Communication" : (a.permanentAddressLine1 || '') + ", " + (a.permanentCity || '') + ", " + (a.permanentState || '') + " - " + (a.permanentPincode || '')}

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
Form 15G / 15H: ${a.form15G15H ? "YES (Zero TDS Claimed)" : "NO"}
Customer Notes: ${a.customerNotes || "None"}
=====================================================`;

    await copyFdText(textToCopy, "🎉 All Application Details Copied! Ready to punch on IRIS platform.");
}

// ── Save Admin Status & IRIS Updates ─────────────────────────
async function saveFdStatusUpdate(appId) {
    const btn = document.getElementById("btn-fd-save-status");
    const status = document.getElementById("modal-fd-status")?.value;
    const irisApplicationNumber = document.getElementById("modal-fd-iris-app")?.value;
    const irisFolioNumber = document.getElementById("modal-fd-iris-folio")?.value;
    const irisFDRNo = document.getElementById("modal-fd-iris-fdr")?.value;
    const adminRemarks = document.getElementById("modal-fd-remarks")?.value;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving to IRIS Database...`;
    }

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
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> Save IRIS Status & Update`;
        }
    }
}

// ── Scheme Catalog Modal ─────────────────────────────────────
function openFdSchemeModal() {
    const modal = document.getElementById("fd-scheme-modal");
    if (modal) modal.style.display = "flex";
}

function closeFdSchemeModal() {
    const modal = document.getElementById("fd-scheme-modal");
    if (modal) modal.style.display = "none";
}

// ── Export CSV for IRIS / Records ────────────────────────────
function exportFdCsv() {
    const base = typeof API_BASE !== "undefined" ? API_BASE : "https://api.vikaone.com/api";
    const url = `${base}/admin/fixed-deposits/export-csv?company=${currentFdCompany}&status=${currentFdStatus}`;

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
window.filterFdStatus = filterFdStatus;
window.filterFdCompany = filterFdCompany;
window.handleFdSearchKey = handleFdSearchKey;
window.clearFdSearch = clearFdSearch;
window.resetFdFilters = resetFdFilters;
window.openFdReviewModal = openFdReviewModal;
window.closeFdReviewModal = closeFdReviewModal;
window.copyFdText = copyFdText;
window.copyFdPill = copyFdPill;
window.copyCompleteFdForIris = copyCompleteFdForIris;
window.saveFdStatusUpdate = saveFdStatusUpdate;
window.openFdSchemeModal = openFdSchemeModal;
window.closeFdSchemeModal = closeFdSchemeModal;
window.exportFdCsv = exportFdCsv;
