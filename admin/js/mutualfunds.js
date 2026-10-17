/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Mutual Funds Administration Controller
   ══════════════════════════════════════════════════════════════ */

let mfInvestorsCurrentPage = 1;
let mfSipsCurrentPage = 1;
let mfOrdersCurrentPage = 1;
let mfMandatesCurrentPage = 1;
let mfCurationCurrentPage = 1;

let currentSipStatusFilter = 'ALL';
let currentOrderStatusFilter = 'ALL';
let currentOrderTypeFilter = 'ALL';
let currentMandateStatusFilter = 'ALL';
let currentSchemeCurationFilter = 'ALL';

// ── Format Currency helper ──
function formatMfInr(val) {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ── Format Date helper ──
function formatMfDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch (e) {
        return dateStr;
    }
}

// ══════════════════════════════════════════════════════════════
// 1. MUTUAL FUNDS OVERVIEW
// ══════════════════════════════════════════════════════════════
async function loadMfOverview() {
    const body = document.getElementById('mfoverview-body');
    if (!body) return;

    try {
        const res = await api('/admin/mutual-funds/overview');
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load Mutual Funds overview'}</div></div>`;
            return;
        }

        const sum = res.data.summary || {};
        const recentSips = res.data.recentSips || [];
        const recentOrders = res.data.recentOrders || [];

        // Update badge in sidebar if present
        const invBadge = document.getElementById('mf-investors-badge');
        if (invBadge) {
            invBadge.textContent = sum.totalInvestors || 0;
            invBadge.style.display = sum.totalInvestors > 0 ? 'inline-block' : 'none';
        }
        const sipsBadge = document.getElementById('mf-sips-badge');
        if (sipsBadge) {
            sipsBadge.textContent = sum.activeSipsCount || 0;
            sipsBadge.style.display = sum.activeSipsCount > 0 ? 'inline-block' : 'none';
        }

        // Render KPI summary and recent tables
        let html = `
        <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:24px">
            <div class="kpi-stat-card" onclick="showPage('mfinvestors')" style="cursor:pointer">
                <div class="kpi-stat-icon" style="background:rgba(0,208,156,0.15);color:#00D09C"><i class="fas fa-users"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">Total MF Investors</div>
                    <div class="kpi-stat-value">${sum.totalInvestors || 0}</div>
                    <div class="kpi-stat-subtext">Onboarded with UCC</div>
                </div>
            </div>

            <div class="kpi-stat-card" onclick="showPage('mfsips')" style="cursor:pointer">
                <div class="kpi-stat-icon" style="background:rgba(59,130,246,0.15);color:#3B82F6"><i class="fas fa-repeat"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">Active MF SIPs</div>
                    <div class="kpi-stat-value">${sum.activeSipsCount || 0}</div>
                    <div class="kpi-stat-subtext">Monthly: <b style="color:#fff">${formatMfInr(sum.monthlyVolume)}</b> ${sum.pendingPaymentSipsCount ? `(${sum.pendingPaymentSipsCount} Pending)` : ''}</div>
                </div>
            </div>

            <div class="kpi-stat-card">
                <div class="kpi-stat-icon" style="background:rgba(212,160,23,0.15);color:#D4A017"><i class="fas fa-wallet"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">Total MF Investment</div>
                    <div class="kpi-stat-value">${formatMfInr(sum.totalMfAum)}</div>
                    <div class="kpi-stat-subtext">SIP Paid: ${formatMfInr(sum.totalSipPaid)}</div>
                </div>
            </div>

            <div class="kpi-stat-card" onclick="showPage('mforders')" style="cursor:pointer">
                <div class="kpi-stat-icon" style="background:rgba(168,85,247,0.15);color:#A855F7"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">Total Orders</div>
                    <div class="kpi-stat-value">${sum.totalOrdersCount || 0}</div>
                    <div class="kpi-stat-subtext">Success: ${sum.successfulOrdersCount || 0} | Pending: ${sum.pendingOrdersCount || 0}</div>
                </div>
            </div>

            <div class="kpi-stat-card" onclick="showPage('mfmandates')" style="cursor:pointer">
                <div class="kpi-stat-icon" style="background:rgba(16,185,129,0.15);color:#10B981"><i class="fas fa-file-signature"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">eNACH Mandates</div>
                    <div class="kpi-stat-value">${sum.mandatesCount || 0}</div>
                    <div class="kpi-stat-subtext">Accepted: <b style="color:#00D09C">${sum.acceptedMandatesCount || 0}</b></div>
                </div>
            </div>

            <div class="kpi-stat-card" onclick="showPage('mfsettings')" style="cursor:pointer">
                <div class="kpi-stat-icon" style="background:rgba(99,102,241,0.15);color:#6366F1"><i class="fas fa-server"></i></div>
                <div class="kpi-stat-content">
                    <div class="kpi-stat-label">NSE Gateway (${sum.nseHealth?.env || 'UAT'})</div>
                    <div class="kpi-stat-value" style="font-size:17px;color:${sum.nseHealth?.status === 'ONLINE' ? '#00D09C' : sum.nseHealth?.status === 'SANDBOX_MOCKED' ? '#3B82F6' : '#f59e0b'}">
                        ${sum.nseHealth?.status === 'ONLINE' ? 'ONLINE' : sum.nseHealth?.status === 'SANDBOX_MOCKED' ? 'SANDBOX' : (sum.nseHealth?.status || 'READY')}
                    </div>
                    <div class="kpi-stat-subtext">Latency: ${sum.nseHealth?.latencyMs || 0}ms · Health Test</div>
                </div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
            <!-- Recent SIPs Table -->
            <div class="card" style="padding:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <div style="font-weight:700;color:#fff;font-size:15px"><i class="fas fa-repeat" style="color:#00D09C;margin-right:8px"></i> Recent SIP Registrations</div>
                    <button class="btn btn-sm btn-outline" onclick="showPage('mfsips')">View All</button>
                </div>
                ${renderRecentSipsMini(recentSips)}
            </div>

            <!-- Recent Orders Table -->
            <div class="card" style="padding:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <div style="font-weight:700;color:#fff;font-size:15px"><i class="fas fa-receipt" style="color:#3B82F6;margin-right:8px"></i> Recent Purchase Orders</div>
                    <button class="btn btn-sm btn-outline" onclick="showPage('mforders')">View All</button>
                </div>
                ${renderRecentOrdersMini(recentOrders)}
            </div>
        </div>`;

        body.innerHTML = html;
    } catch (e) {
        console.error('Error loading MF overview:', e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading Mutual Funds overview</div></div>`;
    }
}

function renderRecentSipsMini(sips) {
    if (!sips || sips.length === 0) {
        return `<div style="text-align:center;padding:24px;color:var(--text-dim)">No SIPs registered yet</div>`;
    }
    let rows = sips.map(s => {
        const u = s.user || {};
        return `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff;font-size:13px">${u.name || s.clientCode}</div>
                <div style="font-size:11px;color:var(--text-dim)">${u.phone || ''}</div>
            </td>
            <td>
                <div style="font-size:12.5px;color:#fff;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.schemeName}</div>
                <div style="font-size:11px;color:#00D09C">${s.frequency}</div>
            </td>
            <td style="font-weight:700;color:#00D09C">${formatMfInr(s.installmentAmount)}</td>
            <td><span class="badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${s.status}</span></td>
        </tr>`;
    }).join('');

    return `
    <div class="table-responsive">
        <table class="table" style="font-size:12px">
            <thead>
                <tr>
                    <th>Investor</th>
                    <th>Scheme</th>
                    <th>Amount</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function renderRecentOrdersMini(orders) {
    if (!orders || orders.length === 0) {
        return `<div style="text-align:center;padding:24px;color:var(--text-dim)">No orders placed yet</div>`;
    }
    let rows = orders.map(o => {
        const u = o.user || {};
        const isSuccess = o.paymentStatus === 'SUCCESS';
        return `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff;font-size:13px">${u.name || o.clientCode}</div>
                <div style="font-size:11px;color:var(--text-dim)">#${o.orderId}</div>
            </td>
            <td>
                <div style="font-size:12.5px;color:#fff;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.schemeName}</div>
                <div style="font-size:11px;color:var(--text-dim)">${o.paymentMode || 'UPI'}</div>
            </td>
            <td style="font-weight:700;color:#fff">${formatMfInr(o.orderAmount)}</td>
            <td><span class="badge ${isSuccess ? 'badge-success' : o.paymentStatus === 'PENDING' ? 'badge-warning' : 'badge-danger'}">${o.paymentStatus}</span></td>
        </tr>`;
    }).join('');

    return `
    <div class="table-responsive">
        <table class="table" style="font-size:12px">
            <thead>
                <tr>
                    <th>Investor</th>
                    <th>Scheme</th>
                    <th>Amount</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// 2. MUTUAL FUNDS INVESTORS & UCC
// ══════════════════════════════════════════════════════════════
async function loadMfInvestors(page = 1) {
    mfInvestorsCurrentPage = page;
    const body = document.getElementById('mfinvestors-body');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading mutual fund investors...</div></div>`;

    const search = document.getElementById('mfinvestors-search')?.value.trim() || '';

    try {
        const res = await api(`/admin/mutual-funds/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load investors'}</div></div>`;
            return;
        }

        const users = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;

        if (users.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-user-slash" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No mutual fund investors found</div><div style="font-size:12px;color:var(--text-dim)">Users who complete the one-time UCC onboarding will appear here.</div></div>`;
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Investor</th>
                        <th>Client Code (UCC)</th>
                        <th>PAN</th>
                        <th>Bank Account</th>
                        <th>Active SIPs</th>
                        <th>Total Invested</th>
                        <th>Onboarded Date</th>
                        <th>NSE Status</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        users.forEach(u => {
            const userObj = u.user || {};
            const bank = u.primaryBank || {};
            const stats = u.stats || {};
            const isNseActive = u.nseStatus === 'ACTIVE';

            // Resolve target identifier: prefer user ID, else clientCode, else UCC _id
            const investorId = (userObj && userObj._id) ? userObj._id : (u.clientCode || u._id);
            const investorName = userObj.name || (u.clientCode ? `Investor (${u.clientCode})` : 'Investor');
            const displayName = userObj.name || (u.clientCode ? `Investor (${u.clientCode})` : 'Unnamed Investor');
            const displayContact = userObj.phone || userObj.email || (u.pan ? `PAN: ${u.pan}` : '—');
            const avatarChar = (displayName.replace(/^Investor \(/i, '')[0] || 'U').toUpperCase();

            html += `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(0,208,156,0.15);color:#00D09C;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px">
                            ${avatarChar}
                        </div>
                        <div>
                            <div style="font-weight:700;color:#fff;font-size:13.5px">${displayName}</div>
                            <div style="font-size:11px;color:var(--text-dim)">${displayContact}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <code style="background:var(--subBg,#0d1410);padding:4px 8px;border-radius:6px;font-size:12px;color:#00D09C;font-family:monospace;border:1px solid #1E2533">${u.clientCode || '—'}</code>
                </td>
                <td>
                    <span style="font-family:monospace;font-weight:600;color:#fff">${u.pan || '—'}</span>
                </td>
                <td>
                    <div style="font-size:12.5px;color:#fff">${bank.bankName || 'Bank'}</div>
                    <div style="font-size:11px;color:var(--text-dim);font-family:monospace">A/C: ${bank.accountNo ? '••••' + String(bank.accountNo).slice(-4) : '—'} | IFSC: ${bank.ifsc || '—'}</div>
                </td>
                <td>
                    <span class="badge ${stats.activeSips > 0 ? 'badge-success' : 'badge-secondary'}" style="font-size:12px;font-weight:700">
                        ${stats.activeSips || 0} active
                    </span>
                </td>
                <td>
                    <div style="font-weight:700;color:#00D09C;font-size:13.5px">${formatMfInr(stats.totalInvested)}</div>
                </td>
                <td style="font-size:12px;color:var(--text-dim)">
                    ${formatMfDate(u.createdAt)}
                </td>
                <td>
                    <span class="badge ${isNseActive ? 'badge-success' : 'badge-warning'}">${u.nseStatus || 'ACTIVE'}</span>
                </td>
                <td style="text-align:right">
                    <button class="btn btn-sm btn-outline" onclick="openMfInvestorDrawer('${investorId}')" style="color:#00D09C;border-color:#00D09C;padding:4px 9px;font-size:11.5px;font-weight:700;border-radius:6px;cursor:pointer;margin-right:6px" title="View 360° Profile, Live UCC Status, Bank & Portfolio">
                        <i class="fas fa-eye"></i> View 360°
                    </button>
                    <button class="btn btn-sm" onclick="cleanUserMutualFunds('${investorId}', '${investorName.replace(/'/g, "\\'")}')" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:4px 9px;font-size:11.5px;font-weight:700;border-radius:6px;cursor:pointer" title="Clean all MF data, UCC, orders, and SIPs for this user">
                        <i class="fas fa-broom"></i> Clean MF
                    </button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;

        // Pagination controls
        if (pages > 1) {
            html += renderMfPagination(page, pages, 'loadMfInvestors');
        }

        body.innerHTML = html;
    } catch (e) {
        console.error('Error loading MF investors:', e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading investors list</div></div>`;
    }
}

// ══════════════════════════════════════════════════════════════
// 3. MUTUAL FUNDS ACTIVE SIPS
// ══════════════════════════════════════════════════════════════
async function loadMfSips(page = 1) {
    mfSipsCurrentPage = page;
    const body = document.getElementById('mfsips-body');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading mutual fund SIPs...</div></div>`;

    const search = document.getElementById('mfsips-search')?.value.trim() || '';
    const status = currentSipStatusFilter;

    try {
        const res = await api(`/admin/mutual-funds/sips?page=${page}&limit=20&status=${status}&search=${encodeURIComponent(search)}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load SIPs'}</div></div>`;
            return;
        }

        const sips = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;

        if (sips.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-calendar-times" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No mutual fund SIPs found</div><div style="font-size:12px;color:var(--text-dim)">Active and scheduled user SIPs will appear here.</div></div>`;
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Investor</th>
                        <th>SIP Reg No</th>
                        <th>Mutual Fund Scheme</th>
                        <th>Installment</th>
                        <th>Frequency</th>
                        <th>Next Due Date</th>
                        <th>Paid Total</th>
                        <th>Status</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        sips.forEach(s => {
            const u = s.user || {};
            const isAct = s.status === 'ACTIVE';
            const isPaused = s.status === 'PAUSED';
            const isPendingPay = s.status === 'PENDING_PAYMENT';
            const badgeClass = isAct ? 'badge-success' : isPaused ? 'badge-warning' : isPendingPay ? 'badge-amber' : 'badge-danger';

            html += `
            <tr>
                <td>
                    <div style="font-weight:700;color:#fff;font-size:13.5px">${u.name || 'Investor'}</div>
                    <div style="font-size:11px;color:var(--text-dim)">UCC: <code style="color:#00D09C">${s.clientCode}</code></div>
                </td>
                <td>
                    <code style="font-family:monospace;font-size:12px;color:var(--gold,#D4A017)">${s.sipRegNo}</code>
                </td>
                <td>
                    <div style="font-weight:600;color:#fff;font-size:13px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.schemeName}">
                        ${s.schemeName}
                    </div>
                    <div style="font-size:11px;color:var(--text-dim)">Code: ${s.schemeCode}</div>
                </td>
                <td>
                    <div style="font-weight:800;color:#00D09C;font-size:14px">${formatMfInr(s.installmentAmount)}</div>
                </td>
                <td>
                    <span class="badge badge-purple" style="font-size:11px">${s.frequency}</span>
                </td>
                <td style="font-size:12.5px;color:#fff">
                    ${formatMfDate(s.nextDueDate || s.startDate)}
                </td>
                <td>
                    <div style="font-weight:700;color:#fff">${formatMfInr(s.totalAmountPaid)}</div>
                    <div style="font-size:11px;color:var(--text-dim)">${s.installmentsPaid || 0} installments</div>
                </td>
                <td>
                    <span class="badge ${badgeClass}">${s.status}</span>
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:6px;align-items:center">
                        <button class="btn btn-sm btn-outline" onclick="syncMfSipWithNse('${s._id}')" title="Sync installment counts and registration status with NSE" style="font-size:11px;padding:3px 7px">
                            <i class="fas fa-satellite-dish" style="color:#3B82F6"></i> Sync
                        </button>
                        ${isAct ? 
                            `<button class="btn btn-sm btn-outline" onclick="changeMfSipStatus('${s._id}', 'PAUSED')" title="Pause SIP" style="font-size:11px;padding:3px 7px"><i class="fas fa-pause"></i> Pause</button>` :
                          isPaused ?
                            `<button class="btn btn-sm btn-outline" style="color:#00D09C;border-color:#00D09C;font-size:11px;padding:3px 7px" onclick="changeMfSipStatus('${s._id}', 'ACTIVE')" title="Resume SIP"><i class="fas fa-play"></i> Resume</button>` :
                          isPendingPay ?
                            `<button class="btn btn-sm btn-outline" style="color:#D4A017;border-color:#D4A017;font-size:11px;padding:3px 7px" onclick="changeMfSipStatus('${s._id}', 'ACTIVE')" title="Activate SIP Manually"><i class="fas fa-check"></i> Activate</button>` :
                            `<span style="color:var(--text-dim);font-size:11px">Cancelled</span>`
                        }
                        ${s.status !== 'CANCELLED' ?
                            `<button class="btn btn-sm btn-danger" onclick="changeMfSipStatus('${s._id}', 'CANCELLED')" title="Cancel SIP" style="font-size:11px;padding:3px 7px"><i class="fas fa-times"></i></button>` : ''
                        }
                    </div>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;

        if (pages > 1) {
            html += renderMfPagination(page, pages, 'loadMfSips');
        }

        body.innerHTML = html;
    } catch (e) {
        console.error('Error loading MF SIPs:', e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading SIPs list</div></div>`;
    }
}

async function changeMfSipStatus(sipId, newStatus) {
    if (!confirm(`Are you sure you want to change this SIP status to ${newStatus}?`)) return;

    try {
        const res = await api(`/admin/mutual-funds/sips/${sipId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: newStatus }),
        });
        if (res.success) {
            toast(`SIP status updated to ${newStatus}`, 'success');
            loadMfSips(mfSipsCurrentPage);
        } else {
            toast(res.message || 'Failed to update SIP status', 'danger');
        }
    } catch (e) {
        toast('Network error updating SIP status', 'danger');
    }
}

function filterMfSipsByStatus(status) {
    currentSipStatusFilter = status;
    document.querySelectorAll('.mf-sip-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-status') === status);
    });
    loadMfSips(1);
}

// ══════════════════════════════════════════════════════════════
// 4. MUTUAL FUNDS ORDERS & LUMPSUM
// ══════════════════════════════════════════════════════════════
async function loadMfOrders(page = 1) {
    mfOrdersCurrentPage = page;
    const body = document.getElementById('mforders-body');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading mutual fund transactions...</div></div>`;

    const search = document.getElementById('mforders-search')?.value.trim() || '';
    const status = currentOrderStatusFilter;
    const trxnType = currentOrderTypeFilter;

    // Concurrently load the latest reconciliation report banner
    loadMfReconciliationBar();

    try {
        let url = `/admin/mutual-funds/orders?page=${page}&limit=20&search=${encodeURIComponent(search)}`;
        if (status && status !== 'ALL') url += `&paymentStatus=${status}`;
        if (trxnType && trxnType !== 'ALL') url += `&transactionType=${trxnType}`;

        const res = await api(url);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load orders'}</div></div>`;
            return;
        }

        const orders = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;

        if (orders.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-file-invoice" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No mutual fund orders found</div><div style="font-size:12px;color:var(--text-dim)">Purchases, redemptions (sell), and fund switches will appear here.</div></div>`;
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Order Ref</th>
                        <th>Investor</th>
                        <th>Scheme</th>
                        <th>Type</th>
                        <th>Amount / Value</th>
                        <th>Units & NAV</th>
                        <th>Payment / Payout</th>
                        <th>Order Status</th>
                        <th>Date</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        orders.forEach(o => {
            const u = o.user || {};
            const isSucc = o.paymentStatus === 'SUCCESS';
            const isPend = o.paymentStatus === 'PENDING';
            const isRedeem = o.transactionType === 'R';
            const isSwitch = o.transactionType === 'S';

            let typeBadge = '';
            if (isRedeem) {
                typeBadge = `<span class="badge" style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);font-weight:700"><i class="fas fa-arrow-up"></i> REDEEM</span>`;
            } else if (isSwitch) {
                typeBadge = `<span class="badge" style="background:rgba(56,189,248,0.18);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);font-weight:700"><i class="fas fa-random"></i> SWITCH</span>`;
            } else {
                typeBadge = `<span class="badge" style="background:rgba(0,208,156,0.18);color:#00D09C;border:1px solid rgba(0,208,156,0.4);font-weight:700"><i class="fas fa-arrow-down"></i> PURCHASE</span>`;
            }

            let paymentCol = '';
            if (isRedeem) {
                const payoutProcessed = o.payoutStatus === 'PROCESSED';
                paymentCol = `
                    <div>
                        <span class="badge ${payoutProcessed ? 'badge-success' : 'badge-warning'}" style="font-size:10px">
                            ${payoutProcessed ? 'PAYOUT SENT' : 'PENDING AMC'}
                        </span>
                        ${o.payoutBank?.bankName ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">${o.payoutBank.bankName} ····${(o.payoutBank.accountNumber || '').slice(-4)}</div>` : ''}
                    </div>`;
            } else {
                paymentCol = `<span class="badge badge-secondary">${o.paymentMode || 'UPI'}</span>`;
            }

            let schemeDisplay = `
                <div style="font-weight:600;color:#fff;font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.schemeName}">
                    ${o.schemeName}
                </div>`;
            if (isSwitch && (o.targetSchemeName || o.targetSchemeCode)) {
                schemeDisplay += `
                    <div style="font-size:11px;color:#38bdf8;margin-top:2px">
                        <i class="fas fa-arrow-right"></i> ${o.targetSchemeName || o.targetSchemeCode}
                    </div>`;
            }

            let unitsDisplay = '';
            if (isRedeem) {
                unitsDisplay = `
                    <div style="color:#f59e0b;font-weight:700;font-size:12.5px">${o.redemptionUnits || o.units || 0} units ${o.allUnits ? '<span style="font-size:10px">(ALL)</span>' : ''}</div>
                    <div style="font-size:11px;color:var(--text-dim)">NAV: ₹${o.navAtOrder || '—'}</div>`;
            } else {
                unitsDisplay = `
                    <div style="color:#fff;font-size:12.5px">${o.units || 0} units</div>
                    <div style="font-size:11px;color:var(--text-dim)">NAV: ₹${o.navAtOrder || '—'}</div>`;
            }

            html += `
            <tr>
                <td>
                    <code style="font-family:monospace;font-size:12px;color:#fff">${o.orderId}</code>
                    ${o.nseTrxnOrderId ? `<div style="font-size:10px;color:var(--text-dim)">NSE Ref: ${o.nseTrxnOrderId}</div>` : ''}
                    <div style="font-size:10px;margin-top:2px"><span class="badge ${o.nseStatus?.includes('SUCCESS') || o.nseStatus?.includes('ALLOTTED') ? 'badge-success' : o.nseStatus?.includes('REJECTED') ? 'badge-danger' : 'badge-purple'}" style="font-size:9.5px;padding:2px 6px">${o.nseStatus || 'PENDING'}</span></div>
                </td>
                <td>
                    <div style="font-weight:700;color:#fff;font-size:13px">${u.name || 'Investor'}</div>
                    <div style="font-size:11px;color:var(--text-dim)">${o.clientCode}</div>
                </td>
                <td>${schemeDisplay}</td>
                <td>${typeBadge}</td>
                <td>
                    <div style="font-weight:800;color:${isRedeem ? '#f59e0b' : '#00D09C'};font-size:14px">
                        ${formatMfInr(o.orderAmount)}
                    </div>
                    ${isRedeem ? '<div style="font-size:10px;color:var(--text-dim)">Est. AMC Payout</div>' : ''}
                </td>
                <td>${unitsDisplay}</td>
                <td>${paymentCol}</td>
                <td>
                    <span class="badge ${isSucc ? 'badge-success' : isPend ? 'badge-warning' : 'badge-danger'}">
                        ${o.paymentStatus}
                    </span>
                </td>
                <td style="font-size:12px;color:var(--text-dim)">
                    ${formatMfDate(o.createdAt)}
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                        <button class="btn btn-sm btn-outline" style="color:#3B82F6;border-color:#3B82F6;font-size:11px;padding:3px 7px" onclick="syncMfOrderWithNse('${o._id}')" title="Call NSE GET_ORDER_STATUS and reconcile settlement">
                            <i class="fas fa-satellite-dish"></i> Sync NSE
                        </button>
                        ${isPend ? `
                            <button class="btn btn-sm btn-outline" style="color:#00D09C;border-color:#00D09C;font-size:11px;padding:3px 7px" onclick="reconcileMfOrder('${o._id}', 'SUCCESS')">
                                <i class="fas fa-check"></i> Mark Success
                            </button>` : ''
                        }
                        ${isRedeem && o.payoutStatus !== 'PROCESSED' ? `
                            <button class="btn btn-sm btn-outline" style="color:#f59e0b;border-color:#f59e0b;font-size:11px;padding:3px 7px" onclick="updateMfPayoutStatus('${o._id}', 'PROCESSED')" title="Mark AMC bank payout processed">
                                <i class="fas fa-check-double"></i> Payout Sent
                            </button>` : ''
                        }
                        ${(o.orderStatus === 'ALLOTTED' || isSucc) && o.orderStatus !== 'REFUNDED' ? `
                            <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;font-size:11px;padding:3px 7px" onclick="openMfReversalModal('${o._id}', '${o.orderId}', '${(o.schemeName || '').replace(/'/g, "\\'")}', '${o.orderAmount || 0}')" title="Controlled Financial Reversal">
                                <i class="fas fa-undo-alt"></i> Reversal
                            </button>` : ''
                        }
                    </div>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;

        if (pages > 1) {
            html += renderMfPagination(page, pages, 'loadMfOrders');
        }

        body.innerHTML = html;
    } catch (e) {
        console.error('Error loading MF orders:', e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading orders list</div></div>`;
    }
}

async function reconcileMfOrder(orderId, newStatus) {
    if (!confirm(`Are you sure you want to mark this order as ${newStatus}?`)) return;

    try {
        const res = await api(`/admin/mutual-funds/orders/${orderId}/verify`, {
            method: 'POST',
            body: JSON.stringify({ paymentStatus: newStatus }),
        });
        if (res.success) {
            toast(`Order status updated to ${newStatus}`, 'success');
            loadMfOrders(mfOrdersCurrentPage);
        } else {
            toast(res.message || 'Failed to update order', 'danger');
        }
    } catch (e) {
        toast('Network error reconciling order', 'danger');
    }
}

async function updateMfPayoutStatus(orderId, payoutStatus) {
    if (!confirm(`Mark redemption bank payout as ${payoutStatus}?`)) return;

    try {
        const res = await api(`/admin/mutual-funds/orders/${orderId}/payout-status`, {
            method: 'POST',
            body: JSON.stringify({ payoutStatus }),
        });
        if (res.success) {
            toast('Redemption payout status updated ✓', 'success');
            loadMfOrders(mfOrdersCurrentPage);
        } else {
            toast(res.message || 'Failed to update payout status', 'danger');
        }
    } catch (e) {
        toast('Network error updating payout status', 'danger');
    }
}

function filterMfOrdersByStatus(status) {
    currentOrderStatusFilter = status;
    document.querySelectorAll('.mf-order-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-status') === status);
    });
    loadMfOrders(1);
}

function filterMfOrdersByType(type) {
    currentOrderTypeFilter = type;
    document.querySelectorAll('.mf-order-type-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-type') === type);
    });
    loadMfOrders(1);
}

// ── Daily Automated Reconciliation Banner & Alert Handler ──
async function loadMfReconciliationBar() {
    const bar = document.getElementById('mforders-reconciliation-bar');
    if (!bar) return;

    try {
        const res = await api('/admin/mutual-funds/reconciliation');
        if (!res.success || !res.data) {
            bar.innerHTML = '';
            return;
        }

        const { latestRun, unresolvedAlerts, unresolvedCount } = res.data;
        if (!latestRun) {
            bar.innerHTML = `
            <div style="background:rgba(30,41,59,0.7);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                <div style="display:flex;align-items:center;gap:10px">
                    <i class="fas fa-satellite-dish" style="color:#3B82F6;font-size:18px"></i>
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13px">Daily Automated NSE Exchange Reconciliation</div>
                        <div style="font-size:11.5px;color:var(--text-dim)">Nightly cron scheduled at 01:00 AM IST. No reconciliation runs recorded yet.</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="triggerReconciliationManual()"><i class="fas fa-play"></i> Run Now</button>
            </div>`;
            return;
        }

        const hasAlerts = (unresolvedCount || 0) > 0;
        let html = '';

        if (hasAlerts) {
            html = `
            <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:14px 18px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span class="badge badge-danger" style="font-size:11px;padding:4px 8px"><i class="fas fa-exclamation-triangle"></i> RECONCILIATION ALERT</span>
                        <div style="font-weight:800;color:#fff;font-size:14px">${unresolvedCount} Exchange Discrepanc${unresolvedCount === 1 ? 'y' : 'ies'} Detected</div>
                    </div>
                    <div style="font-size:11px;color:var(--text-dim)">Last Run: ${formatMfDate(latestRun.executedAt)} (${latestRun.trigger})</div>
                </div>
                <div style="font-size:12px;color:#fca5a5;margin-bottom:10px">
                    Differences were detected between Payvika internal order records and live NSE MFSS settlement status.
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">`;

            unresolvedAlerts.slice(0, 5).forEach(alert => {
                html += `
                <div style="background:rgba(0,0,0,0.25);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;flex-wrap:wrap;gap:8px">
                    <div>
                        <b style="color:#fff">${alert.orderId || alert.sipRegNo || 'Order'}</b> · 
                        <span style="color:var(--text-dim)">NSE Status:</span> <code style="color:#f87171">${alert.nseStatus || 'MISMATCH'}</code> · 
                        <span style="color:var(--text-dim)">Local:</span> <code style="color:#cbd5e1">${alert.localStatus}</code>
                        <div style="font-size:11px;color:#fca5a5;margin-top:2px">${alert.reason || ''}</div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline" style="font-size:10.5px;padding:2px 8px;color:#00D09C;border-color:#00D09C" onclick="resolveReconciliationAlert('${alert._id}')">
                            <i class="fas fa-check"></i> Mark Resolved
                        </button>
                    </div>
                </div>`;
            });

            html += `</div></div>`;
        } else {
            html = `
            <div style="background:rgba(0,208,156,0.08);border:1px solid rgba(0,208,156,0.25);border-radius:10px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:34px;height:34px;border-radius:50%;background:rgba(0,208,156,0.18);display:flex;align-items:center;justify-content:center;color:#00D09C">
                        <i class="fas fa-check-circle" style="font-size:16px"></i>
                    </div>
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13.5px;display:flex;align-items:center;gap:8px">
                            Daily Exchange Reconciliation Clean
                            <span class="badge" style="background:rgba(0,208,156,0.2);color:#00D09C;font-size:10px;padding:2px 6px">100% Synced</span>
                        </div>
                        <div style="font-size:11.5px;color:var(--text-dim);margin-top:2px">
                            Scanned ${latestRun.stats?.totalScanned || 0} transactions (Auto-healed: ${latestRun.stats?.autoHealed || 0}, 0 Discrepancies) · Last run: ${formatMfDate(latestRun.executedAt)}
                        </div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:11px;color:var(--text-dim)">Nightly Cron: 01:00 AM IST</span>
                </div>
            </div>`;
        }

        bar.innerHTML = html;
    } catch (e) {
        console.error('loadMfReconciliationBar error:', e);
    }
}

async function triggerReconciliationManual() {
    const btn = document.getElementById('btn-reconcile-now');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reconciling with NSE...';
    }
    toast('Running daily exchange reconciliation engine against NSE MFSS...', 'info');

    try {
        const res = await api('/admin/mutual-funds/reconciliation/run', { method: 'POST' });
        if (res.success) {
            toast(res.message || 'Reconciliation completed successfully ✓', 'success');
            loadMfReconciliationBar();
            loadMfOrders(mfOrdersCurrentPage);
            if (typeof loadMfOverview === 'function') loadMfOverview();
        } else {
            toast(res.message || 'Reconciliation run completed with warnings', 'warning');
            loadMfReconciliationBar();
        }
    } catch (e) {
        toast('Network error during reconciliation run', 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync"></i> Run Reconciliation Engine';
        }
    }
}

async function resolveReconciliationAlert(discrepancyId) {
    if (!discrepancyId) return;
    try {
        const res = await api(`/admin/mutual-funds/reconciliation/resolve/${discrepancyId}`, { method: 'POST' });
        if (res.success) {
            toast('Discrepancy alert marked as resolved ✓', 'success');
            loadMfReconciliationBar();
        } else {
            toast(res.message || 'Failed to resolve discrepancy', 'danger');
        }
    } catch (e) {
        toast('Error resolving discrepancy alert', 'danger');
    }
}

// ── Generic pagination renderer ──
function renderMfPagination(curr, total, funcName) {
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 8px;border-top:1px solid var(--border)">
        <div style="color:var(--text-dim);font-size:12px">Page ${curr} of ${total}</div>
        <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" ${curr <= 1 ? 'disabled' : ''} onclick="${funcName}(${curr - 1})"><i class="fas fa-chevron-left"></i> Prev</button>
            <button class="btn btn-sm btn-outline" ${curr >= total ? 'disabled' : ''} onclick="${funcName}(${curr + 1})">Next <i class="fas fa-chevron-right"></i></button>
        </div>
    </div>`;
}

// ── 5. Clean & Reset User Mutual Funds Data ──
async function cleanUserMutualFunds(userId, userName = 'Investor') {
    if (!userId || userId === 'undefined' || userId === 'null') {
        toast('User ID or Client Code is required to clean MF data', 'warning');
        return;
    }

    const confirmMsg = `⚠️ Are you sure you want to clean Mutual Funds data for "${userName}"?\n\nThis will permanently delete:\n• All Mutual Fund Orders\n• All SIP Schedules\n• Registered UCC & Mandates\n\nThe user will be able to test onboarding and investing fresh.`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await api(`/admin/mutual-funds/users/${encodeURIComponent(userId)}/clean`, { method: 'POST' });
        if (res && res.success) {
            toast(res.message || `Mutual Funds data cleared for ${userName} ✓`, 'success');
            if (typeof loadMfInvestors === 'function') loadMfInvestors(mfInvestorsCurrentPage || 1);
            if (typeof loadMfOverview === 'function') loadMfOverview();
            if (typeof loadMfSips === 'function') loadMfSips(1);
            if (typeof loadMfOrders === 'function') loadMfOrders(1);
            if (typeof loadUsers === 'function') loadUsers(usersPage || 1);
            if (typeof viewUserDetails === 'function' && typeof activeUserId !== 'undefined' && activeUserId === userId) {
                viewUserDetails(userId);
            }
        } else {
            toast(res?.message || 'Failed to clean user Mutual Funds data', 'danger');
        }
    } catch (err) {
        console.error('cleanUserMutualFunds error:', err);
        toast('Error cleaning user Mutual Funds data', 'danger');
    }
}

// ── 6. Clean & Reset ALL Test Mutual Funds Data Platform-wide ──
async function cleanAllTestMfData() {
    const confirmMsg = `🚨 DANGER: Are you sure you want to wipe ALL Mutual Funds data across the entire platform?\n\nThis will permanently delete:\n• ALL Mutual Fund Orders\n• ALL SIP Schedules\n• ALL Registered UCCs & Mandates\n\nThis action cannot be undone!`;
    if (!confirm(confirmMsg)) return;

    const doubleConfirm = prompt(`Type "RESET" to confirm wiping all Mutual Funds records:`);
    if (doubleConfirm !== 'RESET') {
        toast('Reset cancelled', 'info');
        return;
    }

    try {
        const res = await api('/admin/mutual-funds/clean-all', { method: 'POST' });
        if (res && res.success) {
            toast(res.message || 'All Mutual Funds records cleared successfully ✓', 'success');
            if (typeof loadMfOverview === 'function') loadMfOverview();
            if (typeof loadMfInvestors === 'function') loadMfInvestors(1);
            if (typeof loadMfSips === 'function') loadMfSips(1);
            if (typeof loadMfOrders === 'function') loadMfOrders(1);
            if (typeof loadUsers === 'function') loadUsers(1);
        } else {
            toast(res?.message || 'Failed to reset all MF data', 'danger');
        }
    } catch (err) {
        console.error('cleanAllTestMfData error:', err);
        toast('Error resetting all MF data', 'danger');
    }
}

// ══════════════════════════════════════════════════════════════
// 7. LIVE NSE ORDER & SIP RE-QUERY / SYNCHRONIZATION
// ══════════════════════════════════════════════════════════════
async function syncMfOrderWithNse(orderId) {
    if (!orderId) return;
    try {
        toast('Syncing order with NSE MFSS Exchange...', 'info');
        const res = await api(`/admin/mutual-funds/orders/${orderId}/sync-nse`, { method: 'POST' });
        if (res.success) {
            toast(res.message || 'Order status synced with NSE ✓', 'success');
            loadMfOrders(mfOrdersCurrentPage);
        } else {
            toast(res.message || 'Failed to sync with NSE', 'danger');
        }
    } catch (e) {
        console.error('syncMfOrderWithNse error:', e);
        toast('Error communicating with NSE exchange', 'danger');
    }
}

async function syncMfSipWithNse(sipId) {
    if (!sipId) return;
    try {
        toast('Syncing SIP with NSE exchange...', 'info');
        const res = await api(`/admin/mutual-funds/sips/${sipId}/sync-nse`, { method: 'POST' });
        if (res.success) {
            toast(res.message || 'SIP synced with NSE ✓', 'success');
            loadMfSips(mfSipsCurrentPage);
        } else {
            toast(res.message || 'Failed to sync SIP with NSE', 'danger');
        }
    } catch (e) {
        console.error('syncMfSipWithNse error:', e);
        toast('Error syncing SIP with NSE', 'danger');
    }
}

// ══════════════════════════════════════════════════════════════
// 8. MUTUAL FUNDS MANDATES (eNACH / AutoPay)
// ══════════════════════════════════════════════════════════════
async function loadMfMandates(page = 1) {
    mfMandatesCurrentPage = page;
    const body = document.getElementById('mfmandates-body');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading bank mandates...</div></div>`;

    const search = document.getElementById('mfmandates-search')?.value.trim() || '';
    const status = currentMandateStatusFilter;

    try {
        const res = await api(`/admin/mutual-funds/mandates?page=${page}&limit=20&status=${status}&search=${encodeURIComponent(search)}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load mandates'}</div></div>`;
            return;
        }

        const mandates = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;

        if (mandates.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-file-signature" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No bank mandates found</div><div style="font-size:12px;color:var(--text-dim)">eNACH and physical SIP mandates registered by investors will appear here.</div></div>`;
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Investor</th>
                        <th>Mandate ID & UMRN</th>
                        <th>Bank & Account</th>
                        <th>Debit Limit</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Registered On</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        mandates.forEach(m => {
            const u = m.user || {};
            const isAccepted = m.status === 'ACCEPTED_BY_BANK' || m.status === 'APPROVED';
            const isPending = m.status === 'PENDING_AUTH' || m.status === 'PENDING';
            const statusClass = isAccepted ? 'badge-success' : isPending ? 'badge-warning' : 'badge-danger';
            const maskedAcc = m.accountNo ? `•••• ${m.accountNo.slice(-4)}` : '—';

            html += `
            <tr>
                <td>
                    <div style="font-weight:700;color:#fff;font-size:13.5px">${u.name || 'Investor'}</div>
                    <div style="font-size:11px;color:var(--text-dim)">UCC: <code style="color:#00D09C">${m.clientCode}</code></div>
                    ${u.phone ? `<div style="font-size:11px;color:var(--text-dim)"><i class="fas fa-phone-alt" style="font-size:9.5px"></i> ${u.phone}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight:700;color:var(--gold,#D4A017);font-family:monospace;font-size:12px">${m.mandateId}</div>
                    <div style="font-size:11px;color:var(--text-dim)">UMRN: <code>${m.umrn || 'Pending Bank Allocation'}</code></div>
                </td>
                <td>
                    <div style="font-weight:600;color:#fff;font-size:13px">${m.bankName || 'Bank Account'}</div>
                    <div style="font-size:11.5px;color:var(--text-dim)">Acc: ${maskedAcc} · IFSC: ${m.ifsc || '—'}</div>
                </td>
                <td>
                    <div style="font-weight:800;color:#00D09C;font-size:14px">${formatMfInr(m.amount || 50000)}</div>
                    <div style="font-size:10px;color:var(--text-dim)">Max Debit Limit</div>
                </td>
                <td>
                    <span class="badge ${m.mandateType === 'E' ? 'badge-blue' : 'badge-purple'}" style="font-size:10.5px">
                        ${m.mandateType === 'E' ? 'eNACH (NetBanking/Debit)' : 'Physical (X)'}
                    </span>
                </td>
                <td>
                    <span class="badge ${statusClass}">
                        ${m.status === 'ACCEPTED_BY_BANK' ? 'Accepted by Bank' : m.status === 'PENDING_AUTH' ? 'Pending Auth' : m.status}
                    </span>
                </td>
                <td style="font-size:12px;color:var(--text-dim)">
                    ${formatMfDate(m.createdAt)}
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:6px;align-items:center">
                        <button class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;color:#3B82F6;border-color:#3B82F6" onclick="syncMfMandateWithNse('${m._id}')" title="Query NSE for live mandate approval and UMRN allocation">
                            <i class="fas fa-satellite-dish"></i> Sync NSE
                        </button>
                        <button class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;color:#00D09C;border-color:#00D09C" onclick="resendMandateAuthLink('${m._id}')" title="Re-generate and copy Mandate Auth Link">
                            <i class="fas fa-link"></i> Auth Link
                        </button>
                        <button class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px" onclick="promptUpdateMandateStatus('${m._id}', '${m.status}')" title="Change status or set UMRN">
                            <i class="fas fa-edit"></i> Status
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;

        if (pages > 1) {
            html += renderMfPagination(page, pages, 'loadMfMandates');
        }

        body.innerHTML = html;
    } catch (e) {
        console.error('Error loading MF mandates:', e);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading mandates list</div></div>`;
    }
}

function filterMfMandatesByStatus(status) {
    currentMandateStatusFilter = status;
    document.querySelectorAll('.mf-mandate-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-status') === status);
    });
    loadMfMandates(1);
}

async function resendMandateAuthLink(mandateId) {
    try {
        toast('Generating mandate authorization link...', 'info');
        const res = await api(`/admin/mutual-funds/mandates/${mandateId}/resend-link`, { method: 'POST' });
        if (res && res.success && res.data?.authLink) {
            const link = res.data.authLink;
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(link);
                toast(`Auth Link copied to clipboard! ✓ Share with investor: ${res.data.investorPhone || ''}`, 'success');
            } else {
                prompt('Mandate Auth Link (Copy and send to investor):', link);
            }
        } else {
            toast(res?.message || 'Failed to generate mandate link', 'danger');
        }
    } catch (err) {
        console.error('resendMandateAuthLink error:', err);
        toast('Error generating mandate authorization link', 'danger');
    }
}

async function promptUpdateMandateStatus(mandateId, currentStatus) {
    const newStatus = prompt(
        `Update Mandate Status:\nOptions: ACCEPTED_BY_BANK, PENDING_AUTH, REJECTED, APPROVED\n\nCurrent status is: ${currentStatus}`,
        currentStatus
    );
    if (!newStatus || newStatus === currentStatus) return;

    const valid = ['ACCEPTED_BY_BANK', 'PENDING_AUTH', 'REJECTED', 'APPROVED'].includes(newStatus.toUpperCase());
    if (!valid) {
        toast('Invalid status entered. Must be ACCEPTED_BY_BANK, PENDING_AUTH, REJECTED, or APPROVED', 'warning');
        return;
    }

    let umrn = '';
    if (newStatus.toUpperCase() === 'ACCEPTED_BY_BANK' || newStatus.toUpperCase() === 'APPROVED') {
        umrn = prompt('Enter Bank UMRN (Unique Mandate Reference Number):', '') || '';
    }

    try {
        const res = await api(`/admin/mutual-funds/mandates/${mandateId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: newStatus.toUpperCase(), umrn }),
        });
        if (res && res.success) {
            toast(`Mandate updated to ${newStatus.toUpperCase()} ✓`, 'success');
            loadMfMandates(mfMandatesCurrentPage);
        } else {
            toast(res?.message || 'Failed to update mandate status', 'danger');
        }
    } catch (err) {
        toast('Error updating mandate status', 'danger');
    }
}

// ══════════════════════════════════════════════════════════════
// 9. NSE MFSS GATEWAY CREDENTIALS & HEALTH-CHECK PANEL
// ══════════════════════════════════════════════════════════════
async function loadNseConfig() {
    const body = document.getElementById('mfsettings-body');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading NSE MFSS configuration...</div></div>`;

    try {
        const res = await api('/admin/mutual-funds/nse-config');
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load NSE configuration'}</div></div>`;
            return;
        }

        const cfg = res.data || {};
        const isOnline = cfg.lastStatus === 'ONLINE';
        const isMocked = cfg.lastStatus === 'SANDBOX_MOCKED' || cfg.mockMode;
        const statusBadge = isOnline
            ? '<span class="badge badge-success" style="font-size:12px;padding:5px 12px"><i class="fas fa-check-circle"></i> Connected / Live</span>'
            : isMocked
            ? '<span class="badge badge-blue" style="font-size:12px;padding:5px 12px"><i class="fas fa-vial"></i> Sandbox Mock Active</span>'
            : '<span class="badge badge-danger" style="font-size:12px;padding:5px 12px"><i class="fas fa-exclamation-circle"></i> Offline / Unverified</span>';

        let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
            <!-- Active Connection Status Card -->
            <div class="card" style="padding:22px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#fff"><i class="fas fa-heartbeat" style="color:#00D09C;margin-right:8px"></i> Gateway Diagnostics</div>
                        <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Real-time status of exchange network socket & TLS 1.3 handshake</div>
                    </div>
                    <div>${statusBadge}</div>
                </div>

                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:16px;margin-bottom:18px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                        <span style="color:var(--text-dim)">Environment:</span>
                        <span style="font-weight:700;color:${cfg.env === 'PROD' ? '#ef4444' : '#00D09C'}">${cfg.env === 'PROD' ? 'PROD (Live Exchange)' : 'UAT (Sandbox)'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                        <span style="color:var(--text-dim)">Target Gateway URL:</span>
                        <code style="color:#fff;font-size:12px">${cfg.baseUrl}</code>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                        <span style="color:var(--text-dim)">Exchange Member Code:</span>
                        <span style="font-weight:700;color:#fff">${cfg.memberCode || '—'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                        <span style="color:var(--text-dim)">Network Latency:</span>
                        <span style="color:#00D09C;font-weight:700">${cfg.lastLatencyMs || 0} ms</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                        <span style="color:var(--text-dim)">Mock Simulation Mode:</span>
                        <span style="color:${cfg.mockMode ? '#3B82F6' : '#10B981'};font-weight:700">${cfg.mockMode ? 'ENABLED (Safe Sandbox)' : 'DISABLED (Real Exchange Calls)'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px">
                        <span style="color:var(--text-dim)">Last Diagnostic Check:</span>
                        <span style="color:var(--text-dim)">${cfg.lastTestedAt ? new Date(cfg.lastTestedAt).toLocaleString('en-IN') : 'Never'}</span>
                    </div>
                </div>

                <div style="display:flex;gap:10px">
                    <button class="btn btn-primary" onclick="testNseConnection()" id="btn-test-nse" style="flex:1">
                        <i class="fas fa-satellite-dish"></i> Test NSE Connection Now
                    </button>
                </div>
            </div>

            <!-- Pre-requisites & Exchange Guidelines Card -->
            <div class="card" style="padding:22px">
                <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px">
                    <i class="fas fa-shield-alt" style="color:#D4A017;margin-right:8px"></i> NSE INVEST (NNF v1.9.8) Specifications
                </div>
                <div style="font-size:12.5px;color:var(--text-dim);margin-bottom:16px">
                    Official technical requirements from NSE India Mutual Fund Service System:
                </div>

                <ul style="color:#cbd5e1;font-size:12.5px;line-height:1.7;padding-left:18px;margin-bottom:16px">
                    <li><b>TLS Version:</b> Mandatory strict <code>TLS v1.3</code> with <code>TLS_AES_256_GCM_SHA384</code> and <code>TLS_CHACHA20_POLY1305_SHA256</code> ciphers.</li>
                    <li><b>Encryption:</b> PBKDF2 with SHA-1 key derivation and AES-128-CBC encryption of dynamic API Secret + Random Salt.</li>
                    <li><b>IP Whitelisting:</b> For live production, ensure your hosting server's public outgoing IP is whitelisted by NSE.</li>
                    <li><b>Sandbox Mode:</b> Keep <i>Mock Simulation</i> checked to test end-to-end client registration, orders, and mandates without incurring real AMC debits.</li>
                </ul>

                <div style="background:rgba(212,160,23,0.1);border:1px solid rgba(212,160,23,0.3);border-radius:10px;padding:12px;font-size:12px;color:#D4A017">
                    <i class="fas fa-info-circle"></i> <b>Safe Testing:</b> In Sandbox mode, mock transactions generate valid order numbers and short links to test the mobile app seamlessly.
                </div>
            </div>
        </div>

        <!-- Credentials Form Card -->
        <div class="card" style="padding:24px">
            <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:6px">
                <i class="fas fa-key" style="color:#00D09C;margin-right:8px"></i> NSE Member Credentials & Environment
            </div>
            <div style="font-size:12.5px;color:var(--text-dim);margin-bottom:20px">
                Configure your NSE member code, login credentials, and encryption secrets. Values are securely stored in MongoDB and override .env settings.
            </div>

            <form onsubmit="saveNseConfig(event)">
                <div class="form-grid-2" style="margin-bottom:16px">
                    <div class="form-group">
                        <label class="form-label">NSE Environment</label>
                        <select class="form-control" id="nse-env">
                            <option value="UAT" ${cfg.env === 'UAT' ? 'selected' : ''}>UAT (Sandbox Gateway — https://nseinvestuat.nseindia.com)</option>
                            <option value="PROD" ${cfg.env === 'PROD' ? 'selected' : ''}>PROD (Production Gateway — https://www.nseinvest.com)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Mock Simulation Mode</label>
                        <select class="form-control" id="nse-mock-mode">
                            <option value="true" ${cfg.mockMode ? 'selected' : ''}>Enabled (Respond locally with test payloads — Recommended for dev)</option>
                            <option value="false" ${!cfg.mockMode ? 'selected' : ''}>Disabled (Send real HTTP calls to NSE servers)</option>
                        </select>
                    </div>
                </div>

                <div class="form-grid-2" style="margin-bottom:16px">
                    <div class="form-group">
                        <label class="form-label">Member Code</label>
                        <input class="form-control" id="nse-member-code" type="text" value="${cfg.memberCode || ''}" placeholder="e.g. 1031616" required />
                        <div style="font-size:11px;color:var(--text-dim);margin-top:3px">NSE Member ID or Broker Code</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Login User ID</label>
                        <input class="form-control" id="nse-user-id" type="text" value="${cfg.loginUserId || ''}" placeholder="e.g. ADMIN or your NSE User ID" required />
                        <div style="font-size:11px;color:var(--text-dim);margin-top:3px">User ID registered with NSEINVEST portal</div>
                    </div>
                </div>

                <div class="form-grid-2" style="margin-bottom:22px">
                    <div class="form-group">
                        <label class="form-label">API Secret / Password</label>
                        <div style="position:relative">
                            <input class="form-control" id="nse-api-secret" type="password" placeholder="${cfg.hasApiSecret ? '•••••••••••• (Leave blank to keep existing)' : 'Enter NSE API Secret'}" style="padding-right:40px" />
                            <i class="fas fa-eye" onclick="togglePasswordVisibility('nse-api-secret')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-dim)"></i>
                        </div>
                        <div style="font-size:11px;color:var(--text-dim);margin-top:3px">Encrypted dynamically with dynamic salt before every request</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Member License Key (Passkey)</label>
                        <div style="position:relative">
                            <input class="form-control" id="nse-license-key" type="password" placeholder="${cfg.hasLicenseKey ? '•••••••••••• (Leave blank to keep existing)' : 'Enter NSE Member License Key'}" style="padding-right:40px" />
                            <i class="fas fa-eye" onclick="togglePasswordVisibility('nse-license-key')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-dim)"></i>
                        </div>
                        <div style="font-size:11px;color:var(--text-dim);margin-top:3px">PBKDF2 passphrase key provided in official NSE Welcome Kit</div>
                    </div>
                </div>

                <div style="display:flex;gap:12px;align-items:center">
                    <button class="btn btn-primary" type="submit" id="btn-save-nse" style="padding:10px 24px">
                        <i class="fas fa-save"></i> Save NSE Configuration
                    </button>
                    <button class="btn btn-secondary" type="button" onclick="loadNseConfig()">
                        Reset Changes
                    </button>
                </div>
            </form>
        </div>`;

        body.innerHTML = html;
    } catch (err) {
        console.error('loadNseConfig error:', err);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading NSE settings</div></div>`;
    }
}

function togglePasswordVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveNseConfig(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('btn-save-nse');

    const env = document.getElementById('nse-env')?.value;
    const mockMode = document.getElementById('nse-mock-mode')?.value === 'true';
    const memberCode = document.getElementById('nse-member-code')?.value.trim();
    const loginUserId = document.getElementById('nse-user-id')?.value.trim();
    const apiSecret = document.getElementById('nse-api-secret')?.value.trim();
    const licenseKey = document.getElementById('nse-license-key')?.value.trim();

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
        }

        const res = await api('/admin/mutual-funds/nse-config', {
            method: 'POST',
            body: JSON.stringify({
                env,
                mockMode,
                memberCode,
                loginUserId,
                apiSecret,
                licenseKey,
            }),
        });

        if (res && res.success) {
            toast('NSE MFSS configuration saved successfully ✓', 'success');
            loadNseConfig();
        } else {
            toast(res?.message || 'Failed to save NSE config', 'danger');
        }
    } catch (err) {
        console.error('saveNseConfig error:', err);
        toast('Error saving NSE configuration', 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-save"></i> Save NSE Configuration`;
        }
    }
}

async function testNseConnection() {
    const btnHeader = document.getElementById('btn-test-nse-header');
    const btnCard = document.getElementById('btn-test-nse');

    try {
        if (btnHeader) {
            btnHeader.disabled = true;
            btnHeader.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Probing...`;
        }
        if (btnCard) {
            btnCard.disabled = true;
            btnCard.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Testing Connection...`;
        }

        toast('Dispatching TLS 1.3 handshake and exchange ping...', 'info');

        const res = await api('/admin/mutual-funds/nse-health-check', { method: 'POST' });
        if (res && res.success) {
            const d = res.data || {};
            toast(`NSE Connection: ${d.status} (${d.latencyMs} ms) ✓`, 'success');
            loadNseConfig();
        } else {
            toast(res?.message || 'NSE Connection test encountered errors', 'danger');
            loadNseConfig();
        }
    } catch (err) {
        console.error('testNseConnection error:', err);
        toast('Error testing NSE connection', 'danger');
    } finally {
        if (btnHeader) {
            btnHeader.disabled = false;
            btnHeader.innerHTML = `<i class="fas fa-satellite-dish"></i> Test NSE Connection`;
        }
        if (btnCard) {
            btnCard.disabled = false;
            btnCard.innerHTML = `<i class="fas fa-satellite-dish"></i> Test NSE Connection Now`;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// 10. MUTUAL FUNDS SCHEME CURATION & RECOMMENDATION PANEL
// ══════════════════════════════════════════════════════════════
async function loadMfCurationSchemes(page = 1) {
    mfCurationCurrentPage = page;
    const body = document.getElementById('mfschemes-body');
    const statsBar = document.getElementById('mfschemes-stats-bar');
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading mutual fund schemes catalog...</div></div>`;

    const search = document.getElementById('mfschemes-search')?.value.trim() || '';
    const category = document.getElementById('mfschemes-category')?.value || 'ALL';
    const filter = currentSchemeCurationFilter;

    try {
        const res = await api(`/admin/mutual-funds/schemes?page=${page}&limit=20&filter=${filter}&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load schemes'}</div></div>`;
            return;
        }

        const schemes = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;
        const stats = res.stats || {};

        // Render Stats Bar
        if (statsBar) {
            statsBar.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px">
                <div class="kpi-stat-card" style="padding:14px 18px" onclick="filterMfCurationSchemes('ALL')">
                    <div style="font-size:11.5px;color:var(--text-dim);font-weight:600">Total In Database</div>
                    <div style="font-size:22px;font-weight:800;color:#fff">${stats.totalSchemes || total}</div>
                    <div style="font-size:11px;color:var(--text-dim)">Indian Direct Schemes</div>
                </div>
                <div class="kpi-stat-card" style="padding:14px 18px;border-color:rgba(212,160,23,0.3)" onclick="filterMfCurationSchemes('FEATURED')">
                    <div style="font-size:11.5px;color:#D4A017;font-weight:600"><i class="fas fa-star"></i> Featured / Carousel</div>
                    <div style="font-size:22px;font-weight:800;color:#D4A017">${stats.featuredCount || 0}</div>
                    <div style="font-size:11px;color:var(--text-dim)">Shown in App Home</div>
                </div>
                <div class="kpi-stat-card" style="padding:14px 18px;border-color:rgba(0,208,156,0.3)" onclick="filterMfCurationSchemes('RECOMMENDED')">
                    <div style="font-size:11.5px;color:#00D09C;font-weight:600"><i class="fas fa-thumbs-up"></i> Recommended</div>
                    <div style="font-size:22px;font-weight:800;color:#00D09C">${stats.recommendedCount || 0}</div>
                    <div style="font-size:11px;color:var(--text-dim)">With Trust Badge</div>
                </div>
                <div class="kpi-stat-card" style="padding:14px 18px;border-color:rgba(239,68,68,0.3)" onclick="filterMfCurationSchemes('HIDDEN')">
                    <div style="font-size:11.5px;color:#ef4444;font-weight:600"><i class="fas fa-eye-slash"></i> Hidden / Disabled</div>
                    <div style="font-size:22px;font-weight:800;color:#ef4444">${stats.hiddenCount || 0}</div>
                    <div style="font-size:11px;color:var(--text-dim)">Invisible to Users</div>
                </div>
            </div>`;
        }

        if (schemes.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-search" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No mutual fund schemes matched your filter</div><div style="font-size:12px;color:var(--text-dim)">Try adjusting search keywords or selecting another category.</div></div>`;
            return;
        }

        let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Scheme & AMC</th>
                        <th>Category</th>
                        <th>NAV & 3Y Return</th>
                        <th>AUM</th>
                        <th>Min SIP</th>
                        <th style="text-align:center">Featured (App Carousel)</th>
                        <th style="text-align:center">Recommended Badge</th>
                        <th style="text-align:center">Status / Visibility</th>
                        <th style="text-align:center">Details</th>
                    </tr>
                </thead>
                <tbody>`;

        schemes.forEach(s => {
            const isFeat = Boolean(s.isFeatured);
            const isRec = Boolean(s.isRecommended);
            const isAct = s.isActive !== false;

            html += `
            <tr style="${!isAct ? 'opacity:0.6;background:rgba(239,68,68,0.04)' : ''}">
                <td>
                    <div style="font-weight:700;color:#fff;font-size:13.5px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.schemeName}">
                        ${s.schemeName}
                    </div>
                    <div style="font-size:11px;color:var(--text-dim)">
                        <span style="color:#00D09C">${s.amcName || s.amcCode || 'AMC'}</span> · Code: <code>${s.schemeCode}</code> · <span class="badge" style="background:rgba(0,208,156,0.15);color:#00D09C;font-size:10px;padding:2px 6px">Regular Plan</span>
                    </div>
                </td>
                <td>
                    <span class="badge badge-secondary" style="font-size:11px">${s.category || 'Equity'}</span>
                    ${s.subCategory ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">${s.subCategory}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight:700;color:#fff;font-size:13px">₹${(s.nav || 0).toFixed(2)}</div>
                    <div style="font-size:11px;color:${(s.cagr3Y || 0) >= 0 ? '#00D09C' : '#ef4444'};font-weight:600">
                        3Y: ${(s.cagr3Y || 0) > 0 ? '+' : ''}${(s.cagr3Y || 0).toFixed(1)}%
                    </div>
                </td>
                <td>
                    <div style="font-weight:600;color:#cbd5e1;font-size:12.5px">${s.aum ? '₹' + s.aum.toLocaleString('en-IN') + ' Cr' : '—'}</div>
                </td>
                <td>
                    <div style="font-weight:700;color:#00D09C;font-size:13px">${s.minSipAmount ? formatMfInr(s.minSipAmount) : '—'}</div>
                </td>
                <td style="text-align:center">
                    <button class="btn btn-sm" onclick="toggleSchemeCurationField('${s._id}', 'isFeatured', ${!isFeat})" style="${isFeat ? 'background:rgba(212,160,23,0.22);color:#D4A017;border:1px solid rgba(212,160,23,0.6);font-weight:700;' : 'background:transparent;color:var(--text-dim);border:1px solid rgba(255,255,255,0.15);'}font-size:11px;padding:4px 10px;border-radius:20px;cursor:pointer" title="${isFeat ? 'Featured in Home Carousel. Click to Remove' : 'Click to Feature in Home Carousel'}">
                        <i class="${isFeat ? 'fas fa-star' : 'far fa-star'}"></i> ${isFeat ? 'Featured' : 'Add to Carousel'}
                    </button>
                </td>
                <td style="text-align:center">
                    <button class="btn btn-sm" onclick="toggleSchemeCurationField('${s._id}', 'isRecommended', ${!isRec})" style="${isRec ? 'background:rgba(0,208,156,0.22);color:#00D09C;border:1px solid rgba(0,208,156,0.6);font-weight:700;' : 'background:transparent;color:var(--text-dim);border:1px solid rgba(255,255,255,0.15);'}font-size:11px;padding:4px 10px;border-radius:20px;cursor:pointer" title="${isRec ? 'Recommended Badge Active. Click to Remove' : 'Click to Set Recommended Badge'}">
                        <i class="${isRec ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'}"></i> ${isRec ? 'Recommended' : 'Set Rec'}
                    </button>
                </td>
                <td style="text-align:center">
                    <button class="btn btn-sm" onclick="toggleSchemeCurationField('${s._id}', 'isActive', ${!isAct})" style="${isAct ? 'background:rgba(16,185,129,0.15);color:#10B981;border:1px solid rgba(16,185,129,0.3);' : 'background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);'}font-size:11px;padding:4px 9px;border-radius:6px;cursor:pointer" title="${isAct ? 'Scheme is Active and purchasable. Click to Hide.' : 'Scheme is Hidden from users. Click to Enable.'}">
                        <i class="${isAct ? 'fas fa-eye' : 'fas fa-eye-slash'}"></i> ${isAct ? 'Active' : 'Hidden'}
                    </button>
                </td>
                <td style="text-align:center">
                    <button class="btn btn-sm btn-outline" onclick="openMfSchemeDetails('${s._id}')" style="font-size:11px;padding:3px 8px;color:#00D09C;border-color:#00D09C" title="View Scheme Specifications">
                        <i class="fas fa-info-circle"></i> Info
                    </button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;

        if (pages > 1) {
            html += renderMfPagination(page, pages, 'loadMfCurationSchemes');
        }

        body.innerHTML = html;
    } catch (err) {
        console.error('loadMfCurationSchemes error:', err);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading schemes list</div></div>`;
    }
}

function filterMfCurationSchemes(filter) {
    currentSchemeCurationFilter = filter;
    document.querySelectorAll('.mf-scheme-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === filter);
    });
    loadMfCurationSchemes(1);
}

async function toggleSchemeCurationField(schemeId, field, newValue) {
    try {
        const res = await api(`/admin/mutual-funds/schemes/${schemeId}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ field, value: newValue }),
        });

        if (res && res.success) {
            toast(res.message || 'Scheme updated successfully ✓', 'success');
            loadMfCurationSchemes(mfCurationCurrentPage);
        } else {
            toast(res?.message || 'Failed to update scheme', 'danger');
        }
    } catch (err) {
        console.error('toggleSchemeCurationField error:', err);
        toast('Error updating scheme curation', 'danger');
    }
}

// ══════════════════════════════════════════════════════════════
// 11. INVESTOR 360° PROFILE DRAWER & ACTIONS
// ══════════════════════════════════════════════════════════════
let currentInvestorProfileData = null;
let currentInvestorActiveTab = 'portfolio';

async function openMfInvestorDrawer(userId) {
    if (!userId || userId === 'undefined' || userId === 'null') {
        toast('Investor identifier is missing', 'warning');
        return;
    }
    const modal = document.getElementById('mf-investor-modal');
    const body = document.getElementById('mf-inv-modal-body');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading investor 360° profile...</div></div>`;

    try {
        const res = await api(`/admin/mutual-funds/users/${encodeURIComponent(userId)}/details`);
        if (!res || !res.success || !res.data) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res?.message || 'Failed to load investor profile'}</div></div>`;
            return;
        }

        currentInvestorProfileData = res.data;
        const u = res.data.user || {};
        const ucc = res.data.ucc || {};

        const nameEl = document.getElementById('mf-inv-name');
        const uccEl = document.getElementById('mf-inv-ucc');
        const panEl = document.getElementById('mf-inv-pan');
        const contactEl = document.getElementById('mf-inv-contact');
        const avatarEl = document.getElementById('mf-inv-avatar');

        if (nameEl) nameEl.textContent = u.name || ucc.fullName || (ucc.clientCode ? `Investor (${ucc.clientCode})` : 'Investor Profile');
        if (uccEl) uccEl.textContent = ucc.clientCode || '— (No UCC yet)';
        if (panEl) panEl.textContent = ucc.pan || u.pan || '—';
        if (contactEl) contactEl.textContent = `${u.phone || ucc.mobile || '—'} · ${u.email || ucc.email || '—'}`;
        const rawInitial = (u.name || ucc.fullName || ucc.clientCode || 'U').replace(/^Investor \(/i, '');
        if (avatarEl) avatarEl.textContent = (rawInitial[0] || 'U').toUpperCase();

        const nseBadge = document.getElementById('mf-inv-nse-badge');
        if (nseBadge) {
            const isAct = ucc.nseStatus === 'ACTIVE';
            nseBadge.className = `badge ${isAct ? 'badge-success' : 'badge-warning'}`;
            nseBadge.textContent = ucc.nseStatus || (ucc.clientCode ? 'PENDING' : 'NOT ONBOARDED');
        }

        switchMfInvestorTab('portfolio');
    } catch (err) {
        console.error('openMfInvestorDrawer error:', err);
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Error loading investor profile</div></div>`;
    }
}

function closeMfInvestorModal() {
    const modal = document.getElementById('mf-investor-modal');
    if (modal) modal.style.display = 'none';
    currentInvestorProfileData = null;
}

function switchMfInvestorTab(tabName) {
    currentInvestorActiveTab = tabName;
    document.querySelectorAll('.mf-inv-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    renderMfInvestorProfileContent(tabName);
}

function renderMfInvestorProfileContent(tab) {
    const body = document.getElementById('mf-inv-modal-body');
    if (!body || !currentInvestorProfileData) return;

    const data = currentInvestorProfileData;
    const u = data.user || {};
    const ucc = data.ucc || {};
    const p = data.portfolio || {};
    const bank = ucc.primaryBank || {};

    if (tab === 'portfolio') {
        const holdings = p.holdings || [];
        body.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:14px;margin-bottom:20px">
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Total Invested</div>
                    <div style="font-size:20px;font-weight:800;color:#fff;margin-top:2px">${formatMfInr(p.totalInvested)}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Current Valuation</div>
                    <div style="font-size:20px;font-weight:800;color:#00D09C;margin-top:2px">${formatMfInr(p.totalCurrentValue)}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Overall P&L</div>
                    <div style="font-size:20px;font-weight:800;color:${p.totalReturns >= 0 ? '#00D09C' : '#ef4444'};margin-top:2px">
                        ${p.totalReturns >= 0 ? '+' : ''}${formatMfInr(p.totalReturns)} <span style="font-size:12px;font-weight:600">(${p.returnsPercentage || 0}%)</span>
                    </div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Active Holdings</div>
                    <div style="font-size:20px;font-weight:800;color:#38bdf8;margin-top:2px">${p.holdingsCount || 0} Schemes</div>
                </div>
            </div>

            <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:12px"><i class="fas fa-layer-group" style="color:#00D09C;margin-right:6px"></i> Materialized Scheme Holdings</div>
            ${holdings.length === 0 ? '<div style="color:var(--text-dim);font-size:13px;padding:20px;background:#0F172A;border-radius:8px;text-align:center">No active scheme holdings found for this investor.</div>' : `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Scheme Name</th>
                            <th>Units</th>
                            <th>Avg / Latest NAV</th>
                            <th>Invested</th>
                            <th>Current Value</th>
                            <th>P&L</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${holdings.map(h => {
                            const pl = (h.currentValue || 0) - (h.investedAmount || 0);
                            const plPct = h.investedAmount > 0 ? ((pl / h.investedAmount) * 100).toFixed(2) : 0;
                            return `
                            <tr>
                                <td>
                                    <div style="font-weight:700;color:#fff;font-size:13px">${h.schemeName}</div>
                                    <div style="font-size:11px;color:var(--text-dim)">ISIN: <code>${h.isin || '—'}</code> · Code: <code>${h.schemeCode}</code></div>
                                </td>
                                <td style="font-weight:600;color:#fff">${(h.units || 0).toFixed(3)}</td>
                                <td>
                                    <div style="font-size:12.5px;color:#fff">₹${(h.currentNav || h.averageNav || 0).toFixed(2)}</div>
                                    <div style="font-size:10.5px;color:var(--text-dim)">Avg: ₹${(h.averageNav || 0).toFixed(2)}</div>
                                </td>
                                <td style="font-weight:600;color:#fff">${formatMfInr(h.investedAmount)}</td>
                                <td style="font-weight:700;color:#00D09C">${formatMfInr(h.currentValue)}</td>
                                <td style="font-weight:700;color:${pl >= 0 ? '#00D09C' : '#ef4444'}">
                                    ${pl >= 0 ? '+' : ''}${formatMfInr(pl)} (${plPct}%)
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
        `;
    } else if (tab === 'ucc') {
        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:18px">
                    <div style="font-weight:700;color:#fff;margin-bottom:12px;font-size:14px"><i class="fas fa-id-badge" style="color:#00D09C;margin-right:6px"></i> Investor Master Profile</div>
                    <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:12.5px">
                        <span style="color:var(--text-dim)">Client Code:</span><strong style="color:#00D09C;font-family:monospace">${ucc.clientCode || '—'}</strong>
                        <span style="color:var(--text-dim)">Full Name:</span><span style="color:#fff">${ucc.fullName || u.name || '—'}</span>
                        <span style="color:var(--text-dim)">PAN:</span><span style="color:#fff;font-family:monospace;font-weight:600">${ucc.pan || '—'}</span>
                        <span style="color:var(--text-dim)">Date of Birth:</span><span style="color:#fff">${ucc.dob || '—'}</span>
                        <span style="color:var(--text-dim)">Gender:</span><span style="color:#fff">${ucc.gender || '—'}</span>
                        <span style="color:var(--text-dim)">Holding Nature:</span><span style="color:#fff">${ucc.holdingNature || 'Single (SI)'}</span>
                        <span style="color:var(--text-dim)">Tax Status:</span><span style="color:#fff">${ucc.taxStatus || 'Individual (01)'}</span>
                        <span style="color:var(--text-dim)">Occupation:</span><span style="color:#fff">${ucc.occupationCode || 'Business / Professional (01)'}</span>
                    </div>
                </div>

                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:18px">
                    <div style="font-weight:700;color:#fff;margin-bottom:12px;font-size:14px"><i class="fas fa-satellite-dish" style="color:#3B82F6;margin-right:6px"></i> NSE Registration & Compliance</div>
                    <div style="display:grid;grid-template-columns:160px 1fr;gap:8px;font-size:12.5px">
                        <span style="color:var(--text-dim)">NSE Status:</span><span class="badge ${ucc.nseStatus === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${ucc.nseStatus || 'ACTIVE'}</span>
                        <span style="color:var(--text-dim)">Holder OTP Auth:</span><span class="badge ${ucc.firstHolderAuthStatus === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${ucc.firstHolderAuthStatus || 'SUCCESS'}</span>
                        <span style="color:var(--text-dim)">Nominee Status:</span><span style="color:#fff">${ucc.nominee?.name ? `Registered (${ucc.nominee.name})` : 'Opted Out (N)'}</span>
                        <span style="color:var(--text-dim)">Onboarded At:</span><span style="color:#fff">${formatMfDate(ucc.createdAt)}</span>
                        <span style="color:var(--text-dim)">Registered Mobile:</span><span style="color:#fff;font-family:monospace">${u.phone || '—'}</span>
                        <span style="color:var(--text-dim)">Registered Email:</span><span style="color:#fff">${u.email || '—'}</span>
                    </div>
                    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1E293B">
                        <div style="font-size:11.5px;color:var(--text-dim);margin-bottom:6px">Communication Address:</div>
                        <div style="font-size:12.5px;color:#cbd5e1;line-height:1.4">
                            ${ucc.address?.address1 || ''} ${ucc.address?.address2 || ''}, ${ucc.address?.city || ''}, ${ucc.address?.state || ''} - ${ucc.address?.pincode || ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (tab === 'bank') {
        const isBankActive = bank.bankStatus === 'ACTIVE' || ucc.nseStatus === 'ACTIVE';
        body.innerHTML = `
            <div style="background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:20px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div style="font-weight:700;color:#fff;font-size:15px"><i class="fas fa-university" style="color:#00D09C;margin-right:8px"></i> Registered Bank Account (Primary)</div>
                    <span class="badge ${isBankActive ? 'badge-success' : 'badge-danger'}" style="font-size:12px;padding:4px 10px">
                        ${isBankActive ? 'PENNY DROP ACTIVE' : 'VERIFICATION PENDING / REJECTED'}
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
                    <div><span style="color:var(--text-dim)">Bank Name:</span> <strong style="color:#fff">${bank.bankName || 'Kotak Mahindra Bank'}</strong></div>
                    <div><span style="color:var(--text-dim)">Account Number:</span> <code style="color:#00D09C;font-size:13px">${bank.accountNo || '—'}</code></div>
                    <div><span style="color:var(--text-dim)">IFSC Code:</span> <code style="color:#fff;font-size:13px">${bank.ifsc || '—'}</code></div>
                    <div><span style="color:var(--text-dim)">Account Type:</span> <strong style="color:#fff">${bank.accountType === 'CA' ? 'Current (CA)' : 'Savings (SB)'}</strong></div>
                    <div style="grid-column:1 / -1"><span style="color:var(--text-dim)">Penny Drop Remark:</span> <span style="color:${isBankActive ? '#00D09C' : '#f87171'}">${bank.pennyDropRemark || 'Customer identity verified successfully'}</span></div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end">
                <button class="btn btn-primary" onclick="openCurrentInvestorBankUpdate()"><i class="fas fa-edit"></i> Replace / Update Bank via UCC Modification</button>
            </div>
        `;
    } else if (tab === 'mandates') {
        const mandates = data.mandates || [];
        const sips = data.sips || [];
        body.innerHTML = `
            <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:10px"><i class="fas fa-file-signature" style="color:#00D09C;margin-right:6px"></i> Bank Debit Mandates (eNACH)</div>
            ${mandates.length === 0 ? '<div style="color:var(--text-dim);font-size:12.5px;padding:14px;background:#0F172A;border-radius:8px;margin-bottom:20px">No mandates registered.</div>' : `
            <div class="table-responsive" style="margin-bottom:20px">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Mandate ID</th>
                            <th>UMRN</th>
                            <th>Debit Limit</th>
                            <th>Status</th>
                            <th style="text-align:right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${mandates.map(m => `
                        <tr>
                            <td><code style="color:#D4A017">${m.mandateId}</code></td>
                            <td><code>${m.umrn || 'Pending Allocation'}</code></td>
                            <td style="font-weight:700;color:#00D09C">${formatMfInr(m.amount || 50000)}</td>
                            <td><span class="badge ${m.status === 'ACCEPTED_BY_BANK' ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
                            <td style="text-align:right">
                                <button class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 7px" onclick="syncMfMandateWithNse('${m._id}')"><i class="fas fa-sync"></i> Sync NSE</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}

            <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:10px"><i class="fas fa-repeat" style="color:#38bdf8;margin-right:6px"></i> Active & Past SIP Schedules</div>
            ${sips.length === 0 ? '<div style="color:var(--text-dim);font-size:12.5px;padding:14px;background:#0F172A;border-radius:8px">No SIP schedules found.</div>' : `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Scheme Name</th>
                            <th>Monthly Amount</th>
                            <th>Installments</th>
                            <th>Next Due</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sips.map(s => `
                        <tr>
                            <td><div style="font-weight:700;color:#fff">${s.schemeName}</div><div style="font-size:11px;color:var(--text-dim)">Reg No: ${s.sipRegNo}</div></td>
                            <td style="font-weight:700;color:#00D09C">${formatMfInr(s.installmentAmount)}</td>
                            <td>${s.installmentsPaid || 0} Paid</td>
                            <td>${formatMfDate(s.nextDueDate)}</td>
                            <td><span class="badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${s.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}
        `;
    } else if (tab === 'orders') {
        const orders = data.recentOrders || [];
        body.innerHTML = `
            <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:10px"><i class="fas fa-receipt" style="color:#00D09C;margin-right:6px"></i> Recent Transactions</div>
            ${orders.length === 0 ? '<div style="color:var(--text-dim);font-size:12.5px;padding:14px;background:#0F172A;border-radius:8px">No orders found.</div>' : `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Scheme</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Units</th>
                            <th>Payment</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th style="text-align:right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(o => `
                        <tr>
                            <td><code style="color:#fff">${o.orderId}</code></td>
                            <td><div style="font-weight:600;color:#fff;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.schemeName}</div></td>
                            <td><span class="badge ${o.transactionType === 'R' ? 'badge-warning' : 'badge-success'}">${o.transactionType === 'R' ? 'REDEEM' : 'BUY'}</span></td>
                            <td style="font-weight:700;color:#00D09C">${formatMfInr(o.orderAmount)}</td>
                            <td>${o.units || o.redemptionUnits || 0}</td>
                            <td><span class="badge badge-secondary">${o.paymentStatus}</span></td>
                            <td><span class="badge ${o.nseStatus?.includes('ALLOTTED') ? 'badge-success' : 'badge-purple'}">${o.nseStatus || 'PENDING'}</span></td>
                            <td style="font-size:11.5px;color:var(--text-dim)">${formatMfDate(o.createdAt)}</td>
                            <td style="text-align:right">
                                <button class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 6px" onclick="syncMfOrderWithNse('${o._id}')"><i class="fas fa-sync"></i> Sync</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}
        `;
    }
}

async function syncCurrentInvestorUccLive() {
    if (!currentInvestorProfileData) return;
    const uid = currentInvestorProfileData.ucc?.clientCode || currentInvestorProfileData.user?._id || currentInvestorProfileData.ucc?._id;
    if (!uid) {
        toast('No client code or user ID available to sync', 'warning');
        return;
    }
    const btn = document.getElementById('btn-sync-ucc-modal');
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Probing NSE...`; }
        toast('Calling NSE client authorization & detail reports...', 'info');
        const res = await api(`/admin/mutual-funds/users/${encodeURIComponent(uid)}/sync-ucc`, { method: 'POST' });
        if (res && res.success) {
            toast(res.message || 'UCC status synchronized with NSE ✓', 'success');
            await openMfInvestorDrawer(uid);
        } else {
            toast(res?.message || 'Failed to sync UCC status', 'danger');
        }
    } catch (e) {
        toast('Error querying live UCC status', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-satellite-dish"></i> Verify Live on NSE`; }
    }
}

async function resendCurrentInvestorUccAuth() {
    if (!currentInvestorProfileData) return;
    const uid = currentInvestorProfileData.ucc?.clientCode || currentInvestorProfileData.user?._id || currentInvestorProfileData.ucc?._id;
    if (!uid) {
        toast('No client code or user ID available', 'warning');
        return;
    }
    const btn = document.getElementById('btn-resend-auth-modal');
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatching...`; }
        toast('Re-dispatching NSE authorization communication...', 'info');
        const res = await api(`/admin/mutual-funds/users/${encodeURIComponent(uid)}/resend-auth`, { method: 'POST' });
        if (res && res.success) {
            toast('Official OTP Authorization SMS/Email sent to investor ✓', 'success');
            if (res.data?.authLink) {
                if (navigator.clipboard) await navigator.clipboard.writeText(res.data.authLink);
                prompt('Official NSE Authorization Link (Share with investor):', res.data.authLink);
            }
        } else {
            toast(res?.message || 'Failed to resend authorization communication', 'danger');
        }
    } catch (e) {
        toast('Error resending authorization communication', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-paper-plane"></i> Resend Auth OTP`; }
    }
}

function openCurrentInvestorBankUpdate() {
    if (!currentInvestorProfileData) return;
    const u = currentInvestorProfileData.user || {};
    const ucc = currentInvestorProfileData.ucc || {};
    const bank = ucc.primaryBank || {};

    const uidEl = document.getElementById('mf-bank-user-id');
    const ccEl = document.getElementById('mf-bank-client-code');
    const nameEl = document.getElementById('mf-bank-name');
    const accEl = document.getElementById('mf-bank-account-no');
    const ifscEl = document.getElementById('mf-bank-ifsc');
    const typeEl = document.getElementById('mf-bank-account-type');

    if (uidEl) uidEl.value = u._id || '';
    if (ccEl) ccEl.value = ucc.clientCode || '';
    if (nameEl) nameEl.value = bank.bankName || 'Kotak Mahindra Bank';
    if (accEl) accEl.value = bank.accountNo || '';
    if (ifscEl) ifscEl.value = bank.ifsc || '';
    if (typeEl) typeEl.value = bank.accountType || 'SB';

    const modal = document.getElementById('mf-bank-update-modal');
    if (modal) modal.style.display = 'flex';
}

function closeMfBankUpdateModal() {
    const modal = document.getElementById('mf-bank-update-modal');
    if (modal) modal.style.display = 'none';
}

async function submitMfBankUpdate(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('btn-save-mf-bank');
    const clientCode = document.getElementById('mf-bank-client-code')?.value;
    const userId = document.getElementById('mf-bank-user-id')?.value;
    const bankName = document.getElementById('mf-bank-name')?.value.trim();
    const accountNo = document.getElementById('mf-bank-account-no')?.value.trim();
    const ifsc = document.getElementById('mf-bank-ifsc')?.value.trim().toUpperCase();
    const accountType = document.getElementById('mf-bank-account-type')?.value;

    try {
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`; }
        toast('Submitting bank update and checking UCC modification status...', 'info');

        const res = await api('/admin/mutual-funds/client-action', {
            method: 'POST',
            body: JSON.stringify({
                action: 'UPDATE_BANK',
                clientCode,
                accountNo,
                ifsc,
                bankName,
                accountType,
            }),
        });

        if (res && res.success) {
            toast('Bank details updated on NSE & DB successfully ✓', 'success');
            closeMfBankUpdateModal();
            const targetId = userId || clientCode;
            if (targetId) await openMfInvestorDrawer(targetId);
            loadMfInvestors(mfInvestorsCurrentPage || 1);
        } else {
            toast(res?.message || 'Failed to update bank details', 'danger');
        }
    } catch (err) {
        toast('Error updating bank details', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-save"></i> Submit Bank Update`; }
    }
}

async function cleanCurrentInvestorMf() {
    if (!currentInvestorProfileData) return;
    const uid = currentInvestorProfileData.user?._id || currentInvestorProfileData.ucc?.clientCode || currentInvestorProfileData.ucc?._id;
    const name = currentInvestorProfileData.user?.name || currentInvestorProfileData.ucc?.fullName || (currentInvestorProfileData.ucc?.clientCode ? `Investor (${currentInvestorProfileData.ucc.clientCode})` : 'Investor');
    if (!uid) {
        toast('No investor ID available to clean', 'warning');
        return;
    }
    await cleanUserMutualFunds(uid, name);
    closeMfInvestorModal();
}

async function syncMfMandateWithNse(mandateId) {
    try {
        toast('Querying NSE exchange for mandate approval & UMRN...', 'info');
        const res = await api(`/admin/mutual-funds/mandates/${mandateId}/sync-nse`, { method: 'POST' });
        if (res && res.success) {
            toast(res.message || 'Mandate status synchronized with NSE ✓', 'success');
            loadMfMandates(mfMandatesCurrentPage || 1);
        } else {
            toast(res?.message || 'Failed to sync mandate with NSE', 'danger');
        }
    } catch (e) {
        toast('Error syncing mandate with NSE', 'danger');
    }
}

function openMfReversalModal(orderId, orderRef, schemeName, amount) {
    const idEl = document.getElementById('mf-reversal-order-id');
    const refEl = document.getElementById('mf-reversal-order-ref');
    const infoEl = document.getElementById('mf-reversal-scheme-info');
    const reasonEl = document.getElementById('mf-reversal-reason');

    if (idEl) idEl.value = orderId || '';
    if (refEl) refEl.value = orderRef || orderId;
    if (infoEl) infoEl.value = `${schemeName} (${formatMfInr(amount)})`;
    if (reasonEl) reasonEl.value = '';

    const modal = document.getElementById('mf-reversal-modal');
    if (modal) modal.style.display = 'flex';
}

function closeMfReversalModal() {
    const modal = document.getElementById('mf-reversal-modal');
    if (modal) modal.style.display = 'none';
}

async function submitMfControlledReversal(e) {
    if (e) e.preventDefault();
    const btn = document.getElementById('btn-submit-reversal');
    const orderId = document.getElementById('mf-reversal-order-id')?.value;
    const reason = document.getElementById('mf-reversal-reason')?.value.trim();

    if (!reason) {
        toast('Audit justification reason is required', 'warning');
        return;
    }

    try {
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Reversing...`; }
        toast('Executing controlled financial reversal...', 'info');

        const res = await api(`/admin/mutual-funds/orders/${orderId}/controlled-reversal`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        });

        if (res && res.success) {
            toast('Order reversed in ledger & portfolio updated ✓', 'success');
            closeMfReversalModal();
            loadMfOrders(mfOrdersCurrentPage || 1);
        } else {
            toast(res?.message || 'Controlled reversal failed', 'danger');
        }
    } catch (err) {
        toast('Error executing controlled reversal', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-undo-alt"></i> Execute Reversal`; }
    }
}

async function syncMfNavsAndMaster() {
    const btn = document.getElementById('btn-sync-nav-header');
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Syncing NAVs...`; }
        toast('Triggering official AMFI/NSE consolidated Scheme Master & NAV Ingestion...', 'info');

        const res = await api('/admin/mutual-funds/schemes/sync-nav', {
            method: 'POST',
            body: JSON.stringify({ dryRun: false }),
        });

        if (res && res.success) {
            const report = res.data || {};
            toast(`Master & NAV Sync completed! ${report.navDiscrepanciesFlagged || 0} updated, ${report.matchedAccurately || 0} matched ✓`, 'success');
            loadMfCurationSchemes(1);
        } else {
            toast(res?.message || 'NAV Sync encountered an issue', 'danger');
        }
    } catch (err) {
        toast('Error synchronizing NAVs and master', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-sync"></i> Sync NAVs & Master`; }
    }
}

async function openMfSchemeDetails(schemeId) {
    const modal = document.getElementById('mf-scheme-detail-modal');
    const body = document.getElementById('mf-scheme-modal-body');
    const title = document.getElementById('mf-scheme-modal-title');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading scheme specifications...</div></div>`;

    try {
        const res = await api(`/mutual-funds/schemes/${schemeId}`);
        const s = res?.data || {};

        if (title) title.textContent = s.schemeName || 'Scheme Details';

        body.innerHTML = `
            <div style="background:#0F172A;border:1px solid #1E293B;border-radius:12px;padding:20px;margin-bottom:18px">
                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:4px">${s.schemeName}</div>
                <div style="font-size:12px;color:var(--text-dim)">
                    <span style="color:#00D09C;font-weight:700">${s.amcName || s.amcCode || 'AMC'}</span> · Category: <b>${s.category || 'Equity'}</b> (${s.subCategory || 'Regular'})
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px">
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Scheme Code (NSE)</div>
                    <code style="color:#00D09C;font-size:13px">${s.schemeCode}</code>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">ISIN Code</div>
                    <code style="color:#fff;font-size:13px">${s.isin || '—'}</code>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Current NAV</div>
                    <div style="font-size:18px;font-weight:800;color:#fff">₹${(s.nav || 0).toFixed(2)}</div>
                    <div style="font-size:11px;color:var(--text-dim)">NAV Date: ${formatMfDate(s.navDate)}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Fund Size (AUM)</div>
                    <div style="font-size:18px;font-weight:800;color:#cbd5e1">${s.aum ? '₹' + s.aum.toLocaleString('en-IN') + ' Cr' : '—'}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Minimum SIP Amount</div>
                    <div style="font-size:16px;font-weight:700;color:#00D09C">${s.minSipAmount ? formatMfInr(s.minSipAmount) : '₹500'}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px">
                    <div style="font-size:11.5px;color:var(--text-dim)">Minimum Lumpsum Purchase</div>
                    <div style="font-size:16px;font-weight:700;color:#fff">${s.minPurchaseAmount ? formatMfInr(s.minPurchaseAmount) : '₹1,000'}</div>
                </div>
                <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:14px;grid-column:1 / -1">
                    <div style="font-size:11.5px;color:var(--text-dim)">Exit Load Policy</div>
                    <div style="font-size:12.5px;color:#fff;margin-top:2px">${s.exitLoad || 'Nil after 1 year, 1% if redeemed within 365 days'}</div>
                </div>
            </div>
        `;
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load scheme details</div></div>`;
    }
}

function closeMfSchemeDetailModal() {
    const modal = document.getElementById('mf-scheme-detail-modal');
    if (modal) modal.style.display = 'none';
}


