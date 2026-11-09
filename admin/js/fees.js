/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — GST & Platform Fee Breakdown Module
   ══════════════════════════════════════════════════════════════ */

let feesMasterData = {
    summary: {
        all: { totalAmount: 0, totalGst: 0, totalPlatformFee: 0, totalNet: 0, count: 0, uniqueCustomers: 0 },
        digiGold: { totalAmount: 0, totalGst: 0, totalPlatformFee: 0, totalNet: 0, count: 0, uniqueCustomers: 0 },
        realEstate: { totalAmount: 0, totalGst: 0, totalPlatformFee: 0, totalNet: 0, count: 0, uniqueCustomers: 0 },
    },
    transactions: [],
    customers: []
};

let currentFeeCategory = "all";       // "all" | "digi_gold" | "real_estate"
let currentFeeViewMode = "customers"; // "customers" | "transactions"
let currentFeeSearchQuery = "";
let activeModalCustomer = null;
let activeModalCategory = "all";

// ── 1. Fetch Master Data from Backend ───────────────────────────
async function loadFeeBreakdown() {
    const mount = document.getElementById("fees-body");
    if (!mount) return;

    mount.innerHTML = `
    <div class="loading-box">
        <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
        <div>Loading customer transactions, GST and platform fee breakdown...</div>
    </div>`;

    try {
        const res = await api("/admin/fee-breakdown?limit=500");
        if (!res || !res.success) {
            mount.innerHTML = `
            <div class="loading-box">
                <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
                <div>${res?.message || "Failed to load GST and fee breakdown"}</div>
            </div>`;
            return;
        }

        feesMasterData = {
            summary: res.summary || feesMasterData.summary,
            transactions: Array.isArray(res.transactions) ? res.transactions : [],
            customers: Array.isArray(res.customers) ? res.customers : []
        };

        // Update Category Count Pills
        const allCountEl = document.getElementById("fees-count-all");
        if (allCountEl) allCountEl.textContent = feesMasterData.summary.all.count || feesMasterData.transactions.length;

        const goldCountEl = document.getElementById("fees-count-gold");
        if (goldCountEl) goldCountEl.textContent = feesMasterData.summary.digiGold.count || 0;

        const reCountEl = document.getElementById("fees-count-re");
        if (reCountEl) reCountEl.textContent = feesMasterData.summary.realEstate.count || 0;

        // Update KPI Summary Cards
        updateFeeKpiCards();

        // Render Active View
        renderFeesContent();

    } catch (err) {
        console.error("loadFeeBreakdown error:", err);
        mount.innerHTML = `
        <div class="loading-box">
            <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
            <div>Network error loading fee breakdown: ${err.message || "Failed to reach server"}</div>
        </div>`;
    }
}

// ── 2. KPI Cards Synchronization ───────────────────────────────
function updateFeeKpiCards() {
    const sum = feesMasterData.summary;
    let target = sum.all;
    let labelSuffix = "Gross across All Assets";
    let gstSub = "3% GST on Digi Precious Metals";
    let feeSub = "1% Platform Fee on Real Estate";

    if (currentFeeCategory === "digi_gold") {
        target = sum.digiGold;
        labelSuffix = "Precious Metals Gross Value (Gold, Silver, Copper)";
        feeSub = "No platform fee applied on Digi Metals";
    } else if (currentFeeCategory === "real_estate") {
        target = sum.realEstate;
        labelSuffix = "Real Estate Fractional Bricks Funded";
        gstSub = "Direct fractional equity (GST exempt / 0%)";
    }

    const totalEl = document.getElementById("fees-kpi-total");
    if (totalEl) totalEl.textContent = formatINR(target.totalAmount || 0);

    const gstEl = document.getElementById("fees-kpi-gst");
    if (gstEl) gstEl.textContent = formatINR(target.totalGst || 0);

    const feeEl = document.getElementById("fees-kpi-fee");
    if (feeEl) feeEl.textContent = formatINR(target.totalPlatformFee || 0);

    const netEl = document.getElementById("fees-kpi-net");
    if (netEl) netEl.textContent = formatINR(target.totalNet || 0);

    const totalSubEl = document.getElementById("fees-kpi-total-sub");
    if (totalSubEl) totalSubEl.innerHTML = `<i class="fas fa-chart-line" style="color:#f59e0b"></i> ${labelSuffix} (${target.count} txns · ${target.uniqueCustomers} customers)`;

    const gstSubEl = document.getElementById("fees-kpi-gst-sub");
    if (gstSubEl) gstSubEl.innerHTML = `<i class="fas fa-coins" style="color:#38bdf8"></i> ${gstSub}`;

    const feeSubEl = document.getElementById("fees-kpi-fee-sub");
    if (feeSubEl) feeSubEl.innerHTML = `<i class="fas fa-building" style="color:#c084fc"></i> ${feeSub}`;

    const netSubEl = document.getElementById("fees-kpi-net-sub");
    if (netSubEl) netSubEl.innerHTML = `<i class="fas fa-check-double" style="color:#34d399"></i> Base Asset Realized after Deductions`;
}

// ── 3. Filters & View Toggles ──────────────────────────────────
function setFeesCategoryFilter(cat) {
    currentFeeCategory = cat;

    // Toggle active pill buttons
    const pillAll = document.getElementById("fees-pill-all");
    const pillGold = document.getElementById("fees-pill-gold");
    const pillRe = document.getElementById("fees-pill-re");

    if (pillAll) pillAll.classList.toggle("active", cat === "all");
    if (pillGold) pillGold.classList.toggle("active", cat === "digi_gold");
    if (pillRe) pillRe.classList.toggle("active", cat === "real_estate");

    updateFeeKpiCards();
    renderFeesContent();
}

function setFeesViewMode(mode) {
    currentFeeViewMode = mode;

    const btnCust = document.getElementById("fees-view-cust-btn");
    const btnTxns = document.getElementById("fees-view-txns-btn");

    if (btnCust) btnCust.classList.toggle("active", mode === "customers");
    if (btnTxns) btnTxns.classList.toggle("active", mode === "transactions");

    renderFeesContent();
}

function handleFeesSearch(val) {
    currentFeeSearchQuery = (val || "").toLowerCase().trim();
    renderFeesContent();
}

// ── 4. Main Render Dispatcher ──────────────────────────────────
function renderFeesContent() {
    const mount = document.getElementById("fees-body");
    if (!mount) return;

    if (currentFeeViewMode === "customers") {
        // Customer-wise filtering
        let list = feesMasterData.customers || [];

        // 1. Filter by category
        if (currentFeeCategory === "digi_gold") {
            list = list.filter(c => (c.digiGold?.count || 0) > 0);
        } else if (currentFeeCategory === "real_estate") {
            list = list.filter(c => (c.realEstate?.count || 0) > 0);
        }

        // 2. Filter by search query
        if (currentFeeSearchQuery) {
            list = list.filter(c => {
                const name = (c.customer?.name || "").toLowerCase();
                const phone = (c.customer?.phone || "").toLowerCase();
                const email = (c.customer?.email || "").toLowerCase();
                const cid = String(c.customerId || "").toLowerCase();
                return name.includes(currentFeeSearchQuery) ||
                    phone.includes(currentFeeSearchQuery) ||
                    email.includes(currentFeeSearchQuery) ||
                    cid.includes(currentFeeSearchQuery);
            });
        }

        renderFeesCustomersView(list, mount);
    } else {
        // Transaction-wise filtering
        let list = feesMasterData.transactions || [];

        // 1. Filter by category
        if (currentFeeCategory === "digi_gold") {
            list = list.filter(t => t.category === "digi_gold");
        } else if (currentFeeCategory === "real_estate") {
            list = list.filter(t => t.category === "real_estate");
        }

        // 2. Filter by search query
        if (currentFeeSearchQuery) {
            list = list.filter(t => {
                const name = (t.customer?.name || "").toLowerCase();
                const phone = (t.customer?.phone || "").toLowerCase();
                const email = (t.customer?.email || "").toLowerCase();
                const inv = (t.invoiceNo || "").toLowerCase();
                const order = (t.orderId || "").toLowerCase();
                const asset = (t.assetType || "").toLowerCase();
                return name.includes(currentFeeSearchQuery) ||
                    phone.includes(currentFeeSearchQuery) ||
                    email.includes(currentFeeSearchQuery) ||
                    inv.includes(currentFeeSearchQuery) ||
                    order.includes(currentFeeSearchQuery) ||
                    asset.includes(currentFeeSearchQuery);
            });
        }

        renderFeesTransactionsView(list, mount);
    }
}

// ── 5. Render Customer-Wise View ───────────────────────────────
function renderFeesCustomersView(customers, mount) {
    if (!customers || customers.length === 0) {
        mount.innerHTML = `
        <div class="loading-box">
            <i class="fas fa-users-slash" style="font-size:32px;color:var(--text-dim)"></i>
            <div style="margin-top:10px">No customer records matching selected category and filter</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive" style="margin-top:12px">
        <table class="re-table" style="width:100%">
            <thead>
                <tr>
                    <th style="min-width:200px">Customer</th>
                    <th style="text-align:center">Transactions</th>
                    <th style="text-align:right">Total Transaction Amount</th>
                    <th style="text-align:right">GST Charged (3%)</th>
                    <th style="text-align:right">Platform Fee (1%)</th>
                    <th style="text-align:right">Net Asset Amount</th>
                    <th>Asset Breakdown</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    customers.forEach(c => {
        const u = c.customer || {};
        const userName = u.name || "Customer";
        const userContact = u.phone || u.email || "—";
        const avatarLetter = userName.charAt(0).toUpperCase();

        // Calculate values based on current category selection
        let displayTotal = c.totalAmount;
        let displayGst = c.totalGst;
        let displayFee = c.totalPlatformFee;
        let displayNet = c.netAmount;
        let displayCount = c.transactionCount;

        if (currentFeeCategory === "digi_gold") {
            displayTotal = c.digiGold.totalAmount;
            displayGst = c.digiGold.totalGst;
            displayFee = c.digiGold.totalPlatformFee;
            displayNet = c.digiGold.netAmount;
            displayCount = c.digiGold.count;
        } else if (currentFeeCategory === "real_estate") {
            displayTotal = c.realEstate.totalAmount;
            displayGst = c.realEstate.totalGst;
            displayFee = c.realEstate.totalPlatformFee;
            displayNet = c.realEstate.netAmount;
            displayCount = c.realEstate.count;
        }

        const goldCount = c.digiGold?.count || 0;
        const reCount = c.realEstate?.count || 0;

        html += `
        <tr>
            <!-- Customer Details -->
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg, #3b82f6, #8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">
                        ${avatarLetter}
                    </div>
                    <div>
                        <div style="font-weight:700;color:#fff;cursor:pointer" onclick="openCustomerFeeDetails('${c.customerId}')">
                            ${escapeHtml(userName)}
                        </div>
                        <div style="font-size:11.5px;color:#94a3b8;font-family:var(--font-mono)">${escapeHtml(userContact)}</div>
                    </div>
                </div>
            </td>

            <!-- Transaction Count -->
            <td style="text-align:center">
                <span class="badge" style="background:rgba(255,255,255,0.08);color:#e2e8f0;font-weight:700;padding:3px 8px;border-radius:6px">
                    ${displayCount} txns
                </span>
            </td>

            <!-- Total Transaction Amount (Gross) -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13.5px;font-weight:800;color:#f59e0b">
                    ${formatINR(displayTotal)}
                </div>
            </td>

            <!-- GST Amount -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#38bdf8">
                    ${displayGst > 0 ? formatINR(displayGst) : '<span style="color:#64748b;font-weight:400">₹0</span>'}
                </div>
            </td>

            <!-- Platform Fee -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#c084fc">
                    ${displayFee > 0 ? formatINR(displayFee) : '<span style="color:#64748b;font-weight:400">₹0</span>'}
                </div>
            </td>

            <!-- Net Amount Received -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13.5px;font-weight:800;color:#34d399">
                    ${formatINR(displayNet)}
                </div>
            </td>

            <!-- Asset Category Chips -->
            <td>
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                    ${goldCount > 0 ? `
                        <span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);font-size:10px" title="Digi Gold Transactions">
                            <i class="fas fa-coins"></i> ${goldCount} DigiGold (${formatINR(c.digiGold.totalAmount)})
                        </span>
                    ` : ''}
                    ${reCount > 0 ? `
                        <span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:10px" title="Real Estate Investments">
                            <i class="fas fa-building"></i> ${reCount} RealEstate (${formatINR(c.realEstate.totalAmount)})
                        </span>
                    ` : ''}
                </div>
            </td>

            <!-- Actions -->
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-primary btn-sm" onclick="openCustomerFeeDetails('${c.customerId}')" style="font-size:11px;padding:4px 10px;font-weight:700;background:linear-gradient(135deg, #f59e0b, #d97706);border:none;color:#fff" title="Inspect Customer GST & Platform Fee Ledger">
                        <i class="fas fa-search-dollar"></i> Details
                    </button>
                    ${u._id ? `
                        <button class="btn btn-secondary btn-sm" onclick="viewUserDetails('${u._id}')" style="font-size:11px;padding:4px 8px" title="Open Full Account Profile">
                            <i class="fas fa-user"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

// ── 6. Render Transaction-Wise View ────────────────────────────
function renderFeesTransactionsView(txns, mount) {
    if (!txns || txns.length === 0) {
        mount.innerHTML = `
        <div class="loading-box">
            <i class="fas fa-receipt" style="font-size:32px;color:var(--text-dim)"></i>
            <div style="margin-top:10px">No transaction records matching selected category and filter</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive" style="margin-top:12px">
        <table class="re-table" style="width:100%">
            <thead>
                <tr>
                    <th>Invoice / ID</th>
                    <th>Customer</th>
                    <th>Category & Asset</th>
                    <th style="text-align:right">Total Amount</th>
                    <th style="text-align:right">GST Amount</th>
                    <th style="text-align:right">Platform Fee</th>
                    <th style="text-align:right">Net Amount</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    txns.forEach(t => {
        const u = t.customer || {};
        const userName = u.name || "Customer";
        const isGold = t.category === "digi_gold";
        const catBadge = isGold
            ? `<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);font-size:10px"><i class="fas fa-coins"></i> DIGI Gold</span>`
            : `<span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:10px"><i class="fas fa-building"></i> Real Estate</span>`;

        html += `
        <tr>
            <!-- Invoice / Ref -->
            <td>
                <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:#60a5fa">
                    ${escapeHtml(t.invoiceNo)}
                </div>
                ${t.orderId ? `
                    <div style="font-size:10px;color:#64748b;font-family:var(--font-mono)">${escapeHtml(t.orderId)}</div>
                ` : ''}
            </td>

            <!-- Customer -->
            <td>
                <div style="font-weight:700;color:#fff">${escapeHtml(userName)}</div>
                <div style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)">${escapeHtml(u.phone || u.email || '—')}</div>
            </td>

            <!-- Category & Asset Info -->
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    ${catBadge}
                    <strong style="color:#fff;font-size:12px">${escapeHtml(t.assetType)}</strong>
                </div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px">
                    ${t.propertyTitle ? escapeHtml(t.propertyTitle) : `${t.quantity || ''} ${t.ratePerGram ? `@ ${formatINR(t.ratePerGram)}/g` : ''}`}
                </div>
            </td>

            <!-- 1. Total Transaction Amount (Gross) -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13.5px;font-weight:800;color:#f59e0b">
                    ${formatINR(t.totalAmount)}
                </div>
            </td>

            <!-- 2. GST Amount -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#38bdf8">
                    ${t.gstAmount > 0 ? formatINR(t.gstAmount) : '<span style="color:#64748b;font-weight:400">₹0</span>'}
                </div>
                ${t.gstAmount > 0 ? `<div style="font-size:9.5px;color:#0284c7">3% Tax</div>` : ''}
            </td>

            <!-- 3. Platform Fee -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#c084fc">
                    ${t.platformFee > 0 ? formatINR(t.platformFee) : '<span style="color:#64748b;font-weight:400">₹0</span>'}
                </div>
                ${t.platformFee > 0 ? `<div style="font-size:9.5px;color:#a855f7">1% Fee</div>` : ''}
            </td>

            <!-- 4. Net Amount -->
            <td style="text-align:right">
                <div style="font-family:var(--font-mono);font-size:13.5px;font-weight:800;color:#34d399">
                    ${formatINR(t.netAmount)}
                </div>
                <div style="font-size:9.5px;color:#059669">Net Asset</div>
            </td>

            <!-- Date & Time -->
            <td style="font-size:11.5px;color:#94a3b8">
                <div>${formatDate(t.date)}</div>
                <div style="font-size:10px;color:#64748b">${formatDateTime(t.date).split(',')[1] || ''}</div>
            </td>

            <!-- Status -->
            <td>
                <span class="badge badge-success" style="font-size:10px">
                    <i class="fas fa-check-circle"></i> Paid
                </span>
            </td>

            <!-- Actions -->
            <td style="text-align:right">
                ${u.id ? `
                    <button class="btn btn-secondary btn-sm" onclick="openCustomerFeeDetails('${u.id}')" style="font-size:11px;padding:3px 8px" title="Inspect Customer Fee Ledger">
                        <i class="fas fa-search-dollar"></i>
                    </button>
                ` : '—'}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

// ── 7. Customer Drill-Down Modal ───────────────────────────────
function openCustomerFeeDetails(customerId) {
    const modal = document.getElementById("customer-fee-modal");
    const body = document.getElementById("cust-fee-modal-body");
    const title = document.getElementById("cust-fee-modal-title");
    const footerStats = document.getElementById("cust-fee-modal-footer-stats");
    if (!modal || !body) return;

    // Find customer in loaded data
    const c = (feesMasterData.customers || []).find(x => String(x.customerId) === String(customerId));
    if (!c) {
        toast("Customer records not found", "warning");
        return;
    }

    activeModalCustomer = c;
    activeModalCategory = "all";

    const u = c.customer || {};
    const userName = u.name || "Customer";

    if (title) {
        title.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-file-invoice-dollar" style="color:#f59e0b"></i>
            <span>Fee & Deduction Breakdown: <strong style="color:#fbbf24">${escapeHtml(userName)}</strong></span>
            <span class="badge" style="font-size:10.5px;background:rgba(59,130,246,0.15);color:#60a5fa">${escapeHtml(u.phone || u.email || '')}</span>
        </div>`;
    }

    renderModalCustomerContent();
    modal.style.display = "flex";
}

function renderModalCustomerContent() {
    const body = document.getElementById("cust-fee-modal-body");
    const footerStats = document.getElementById("cust-fee-modal-footer-stats");
    if (!body || !activeModalCustomer) return;

    const c = activeModalCustomer;
    const u = c.customer || {};

    // 4 Mini Financial Summary Cards for this customer
    let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase">Total Transaction Amount</div>
            <div style="font-size:18px;font-weight:800;color:#f59e0b;font-family:var(--font-mono);margin-top:4px">${formatINR(c.totalAmount)}</div>
            <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px">${c.transactionCount} total customer purchases</div>
        </div>
        <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase">Total GST Charged</div>
            <div style="font-size:18px;font-weight:800;color:#38bdf8;font-family:var(--font-mono);margin-top:4px">${formatINR(c.totalGst)}</div>
            <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px">From 3% Precious Metals purchases</div>
        </div>
        <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase">Total Platform Fee Charged</div>
            <div style="font-size:18px;font-weight:800;color:#c084fc;font-family:var(--font-mono);margin-top:4px">${formatINR(c.totalPlatformFee)}</div>
            <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px">From 1% Real Estate Brick allocations</div>
        </div>
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase">Net Asset Realized</div>
            <div style="font-size:18px;font-weight:800;color:#34d399;font-family:var(--font-mono);margin-top:4px">${formatINR(c.netAmount)}</div>
            <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px">Total Asset Capital Credited</div>
        </div>
    </div>

    <!-- Category Tabs within Modal -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px">
        <div style="display:flex;gap:6px">
            <button class="btn btn-sm ${activeModalCategory === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="setModalCategoryFilter('all')" style="font-size:11px;padding:4px 10px">
                All Transactions (${c.transactions.length})
            </button>
            <button class="btn btn-sm ${activeModalCategory === 'digi_gold' ? 'btn-primary' : 'btn-secondary'}" onclick="setModalCategoryFilter('digi_gold')" style="font-size:11px;padding:4px 10px">
                DIGI Gold (${c.digiGold.count})
            </button>
            <button class="btn btn-sm ${activeModalCategory === 'real_estate' ? 'btn-primary' : 'btn-secondary'}" onclick="setModalCategoryFilter('real_estate')" style="font-size:11px;padding:4px 10px">
                Real Estate (${c.realEstate.count})
            </button>
        </div>
        <div style="font-size:11.5px;color:#94a3b8">
            Customer ID: <code style="color:#60a5fa">${escapeHtml(c.customerId)}</code>
        </div>
    </div>`;

    // Filter transactions by modal category
    let txns = c.transactions || [];
    if (activeModalCategory === "digi_gold") txns = txns.filter(t => t.category === "digi_gold");
    if (activeModalCategory === "real_estate") txns = txns.filter(t => t.category === "real_estate");

    if (txns.length === 0) {
        html += `<div style="padding:2rem;text-align:center;color:#64748b;font-size:12px">No transactions found in this asset category.</div>`;
    } else {
        html += `
        <div class="table-responsive">
            <table class="re-table" style="width:100%;font-size:12px">
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Invoice / Ref</th>
                        <th>Category & Asset</th>
                        <th style="text-align:right">Transaction Amount</th>
                        <th style="text-align:right">GST Amount</th>
                        <th style="text-align:right">Platform Fee</th>
                        <th style="text-align:right">Net Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

        txns.forEach(t => {
            const isGold = t.category === "digi_gold";
            html += `
            <tr>
                <td style="color:#94a3b8">${formatDateTime(t.date)}</td>
                <td style="font-family:var(--font-mono);font-weight:700;color:#60a5fa">${escapeHtml(t.invoiceNo)}</td>
                <td>
                    <span class="badge" style="background:${isGold ? 'rgba(245,158,11,0.15)' : 'rgba(168,85,247,0.15)'};color:${isGold ? '#fbbf24' : '#c084fc'};font-size:10px">
                        ${isGold ? 'DIGI Gold' : 'Real Estate'}
                    </span>
                    <strong style="color:#fff;margin-left:4px">${escapeHtml(t.assetType)}</strong>
                    ${t.propertyTitle ? `<div style="font-size:10.5px;color:#94a3b8">${escapeHtml(t.propertyTitle)}</div>` : ''}
                </td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#f59e0b">${formatINR(t.totalAmount)}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#38bdf8">${t.gstAmount > 0 ? formatINR(t.gstAmount) : '—'}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#c084fc">${t.platformFee > 0 ? formatINR(t.platformFee) : '—'}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:800;color:#34d399">${formatINR(t.netAmount)}</td>
                <td><span class="badge badge-success" style="font-size:10px"><i class="fas fa-check-circle"></i> Paid</span></td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    body.innerHTML = html;

    if (footerStats) {
        footerStats.innerHTML = `Showing <b>${txns.length}</b> transaction${txns.length !== 1 ? 's' : ''} for ${escapeHtml(userName)}`;
    }
}

function setModalCategoryFilter(cat) {
    activeModalCategory = cat;
    renderModalCustomerContent();
}

function closeCustomerFeeDetails() {
    const modal = document.getElementById("customer-fee-modal");
    if (modal) modal.style.display = "none";
    activeModalCustomer = null;
}

// ── 8. Export CSV ──────────────────────────────────────────────
function exportFeesCSV() {
    const txns = feesMasterData.transactions || [];
    if (txns.length === 0) {
        toast("No transaction data available to export", "warning");
        return;
    }

    // Filter by active category
    let exportList = txns;
    if (currentFeeCategory === "digi_gold") exportList = txns.filter(t => t.category === "digi_gold");
    if (currentFeeCategory === "real_estate") exportList = txns.filter(t => t.category === "real_estate");

    let csv = "Invoice No,Customer Name,Phone,Email,Category,Asset Type,Quantity,Total Amount (INR),GST Amount (INR),Platform Fee (INR),Net Amount (INR),Date,Status,Order ID\n";

    exportList.forEach(t => {
        const u = t.customer || {};
        const row = [
            `"${t.invoiceNo || ''}"`,
            `"${(u.name || '').replace(/"/g, '""')}"`,
            `"${u.phone || ''}"`,
            `"${u.email || ''}"`,
            `"${t.categoryLabel || t.category || ''}"`,
            `"${t.assetType || ''}"`,
            `"${t.quantity || ''}"`,
            t.totalAmount || 0,
            t.gstAmount || 0,
            t.platformFee || 0,
            t.netAmount || 0,
            `"${formatDateTime(t.date)}"`,
            `"${t.status || ''}"`,
            `"${t.orderId || ''}"`
        ];
        csv += row.join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bharatsqft_gst_platform_fees_${currentFeeCategory}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast(`Exported ${exportList.length} fee records to CSV ✓`, "success");
}

// Global escape helper if not defined elsewhere
function escapeHtml(str) {
    if (!str && str !== 0) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
