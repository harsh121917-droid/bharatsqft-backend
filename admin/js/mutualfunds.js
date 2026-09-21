/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Mutual Funds Administration Controller
   ══════════════════════════════════════════════════════════════ */

let mfInvestorsCurrentPage = 1;
let mfSipsCurrentPage = 1;
let mfOrdersCurrentPage = 1;

let currentSipStatusFilter = 'ALL';
let currentOrderStatusFilter = 'ALL';

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
        <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;margin-bottom:24px">
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
                    <div class="kpi-stat-subtext">Monthly Volume: <b style="color:#fff">${formatMfInr(sum.monthlyVolume)}</b></div>
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
                    <span class="badge ${isAct ? 'badge-success' : isPaused ? 'badge-warning' : 'badge-danger'}">${s.status}</span>
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:6px">
                        ${isAct ? 
                            `<button class="btn btn-sm btn-outline" onclick="changeMfSipStatus('${s._id}', 'PAUSED')" title="Pause SIP"><i class="fas fa-pause"></i> Pause</button>` :
                          isPaused ?
                            `<button class="btn btn-sm btn-outline" style="color:#00D09C;border-color:#00D09C" onclick="changeMfSipStatus('${s._id}', 'ACTIVE')" title="Resume SIP"><i class="fas fa-play"></i> Resume</button>` :
                            `<span style="color:var(--text-dim);font-size:11px">Cancelled</span>`
                        }
                        ${s.status !== 'CANCELLED' ?
                            `<button class="btn btn-sm btn-danger" onclick="changeMfSipStatus('${s._id}', 'CANCELLED')" title="Cancel SIP"><i class="fas fa-times"></i></button>` : ''
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
                    ${o.nseTrxnOrderId ? `<div style="font-size:10px;color:var(--text-dim)">NSE: ${o.nseTrxnOrderId}</div>` : ''}
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
                    ${isPend ? `
                        <button class="btn btn-sm btn-outline" style="color:#00D09C;border-color:#00D09C;font-size:11px" onclick="reconcileMfOrder('${o._id}', 'SUCCESS')">
                            <i class="fas fa-check"></i> Mark Success
                        </button>` : 
                        `<span style="color:var(--text-dim);font-size:11px">Reconciled</span>`
                    }
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
