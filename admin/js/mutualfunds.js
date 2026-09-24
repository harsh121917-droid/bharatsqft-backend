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

            html += `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(0,208,156,0.15);color:#00D09C;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px">
                            ${(userObj.name || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight:700;color:#fff;font-size:13.5px">${userObj.name || 'Unnamed Investor'}</div>
                            <div style="font-size:11px;color:var(--text-dim)">${userObj.phone || userObj.email || '—'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <code style="background:var(--subBg,#0d1410);padding:4px 8px;border-radius:6px;font-size:12px;color:#00D09C;font-family:monospace;border:1px solid #1E2533">${u.clientCode}</code>
                </td>
                <td>
                    <span style="font-family:monospace;font-weight:600;color:#fff">${u.pan || '—'}</span>
                </td>
                <td>
                    <div style="font-size:12.5px;color:#fff">${bank.bankName || 'Bank'}</div>
                    <div style="font-size:11px;color:var(--text-dim);font-family:monospace">A/C: ${bank.accountNo ? '••••' + bank.accountNo.slice(-4) : '—'} | IFSC: ${bank.ifsc || '—'}</div>
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
                    <button class="btn btn-sm" onclick="cleanUserMutualFunds('${userObj._id}', '${(userObj.name || 'Investor').replace(/'/g, "\\'")}')" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:4px 9px;font-size:11.5px;font-weight:700;border-radius:6px;cursor:pointer" title="Clean all MF data, UCC, orders, and SIPs for this user">
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

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading mutual fund orders...</div></div>`;

    const search = document.getElementById('mforders-search')?.value.trim() || '';
    const status = currentOrderStatusFilter;

    try {
        const res = await api(`/admin/mutual-funds/orders?page=${page}&limit=20&paymentStatus=${status}&search=${encodeURIComponent(search)}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || 'Failed to load orders'}</div></div>`;
            return;
        }

        const orders = res.data || [];
        const total = res.total || 0;
        const pages = res.pages || 1;

        if (orders.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-file-invoice" style="font-size:36px;color:var(--text-dim)"></i><div style="margin-top:10px;font-weight:600">No mutual fund orders found</div><div style="font-size:12px;color:var(--text-dim)">Lumpsum purchases and redemptions will appear here.</div></div>`;
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
                        <th>Amount</th>
                        <th>Units & NAV</th>
                        <th>Payment Mode</th>
                        <th>Payment Status</th>
                        <th>Date</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>`;

        orders.forEach(o => {
            const u = o.user || {};
            const isSucc = o.paymentStatus === 'SUCCESS';
            const isPend = o.paymentStatus === 'PENDING';

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
                <td>
                    <div style="font-weight:600;color:#fff;font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.schemeName}">
                        ${o.schemeName}
                    </div>
                </td>
                <td>
                    <span class="badge ${o.transactionType === 'P' ? 'badge-blue' : 'badge-orange'}">
                        ${o.transactionType === 'P' ? 'PURCHASE' : 'REDEMPTION'}
                    </span>
                </td>
                <td>
                    <div style="font-weight:800;color:#00D09C;font-size:14px">${formatMfInr(o.orderAmount)}</div>
                </td>
                <td>
                    <div style="color:#fff;font-size:12.5px">${o.units || 0} units</div>
                    <div style="font-size:11px;color:var(--text-dim)">NAV: ₹${o.navAtOrder || '—'}</div>
                </td>
                <td>
                    <span class="badge badge-secondary">${o.paymentMode || 'UPI'}</span>
                </td>
                <td>
                    <span class="badge ${isSucc ? 'badge-success' : isPend ? 'badge-warning' : 'badge-danger'}">
                        ${o.paymentStatus}
                    </span>
                </td>
                <td style="font-size:12px;color:var(--text-dim)">
                    ${formatMfDate(o.createdAt)}
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:5px;align-items:center">
                        <button class="btn btn-sm btn-outline" style="color:#3B82F6;border-color:#3B82F6;font-size:11px;padding:3px 7px" onclick="syncMfOrderWithNse('${o._id}')" title="Call NSE GET_ORDER_STATUS and reconcile settlement">
                            <i class="fas fa-satellite-dish"></i> Sync NSE
                        </button>
                        ${isPend ? `
                            <button class="btn btn-sm btn-outline" style="color:#00D09C;border-color:#00D09C;font-size:11px;padding:3px 7px" onclick="reconcileMfOrder('${o._id}', 'SUCCESS')">
                                <i class="fas fa-check"></i> Mark Success
                            </button>` : 
                            `<span style="color:var(--text-dim);font-size:11px">Reconciled</span>`
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

function filterMfOrdersByStatus(status) {
    currentOrderStatusFilter = status;
    document.querySelectorAll('.mf-order-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-status') === status);
    });
    loadMfOrders(1);
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
    if (!userId) {
        toast('User ID is required to clean MF data', 'warning');
        return;
    }

    const confirmMsg = `⚠️ Are you sure you want to clean Mutual Funds data for "${userName}"?\n\nThis will permanently delete:\n• All Mutual Fund Orders\n• All SIP Schedules\n• Registered UCC & Mandates\n\nThe user will be able to test onboarding and investing fresh.`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await api(`/admin/mutual-funds/users/${userId}/clean`, { method: 'POST' });
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
                        <span style="color:#00D09C">${s.amcName || s.amcCode || 'AMC'}</span> · Code: <code>${s.schemeCode}</code>
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
                    <div style="font-weight:700;color:#00D09C;font-size:13px">${formatMfInr(s.minSipAmount || 500)}</div>
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


