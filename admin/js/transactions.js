/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Investments, Withdrawals & Sell Approvals
   ══════════════════════════════════════════════════════════════ */

// ── 1. Digi Gold: User Investments (Gold & Silver Holdings) ─────
let userInvestmentsData = [];

async function loadUserInvestments() {
    const body = document.getElementById("userinvestments-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading Digi Gold & Silver user investments...</div></div>`;

    const search = document.getElementById("userinvestments-search")?.value.trim() || "";
    const metalFilter = document.getElementById("userinvestments-metal-filter")?.value || "";

    const params = new URLSearchParams({ hasInvestment: "true", limit: 50 });
    if (search) params.append("search", search);
    if (metalFilter) params.append("investmentType", metalFilter);

    try {
        const res = await api(`/admin/users?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load user investments"}</div></div>`;
            return;
        }

        userInvestmentsData = res.data || [];
        renderDigiGoldUserInvestmentsTable(userInvestmentsData);
        const badge = document.getElementById("userinvestments-count-badge");
        if (badge) badge.textContent = `${res.total || userInvestmentsData.length} Investors`;
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading user investments</div></div>`;
    }
}

function filterDigiGoldUserInvestments() {
    const query = document.getElementById("userinvestments-search")?.value.toLowerCase().trim() || "";
    const metalFilter = document.getElementById("userinvestments-metal-filter")?.value || "";

    let filtered = userInvestmentsData;
    if (query) {
        filtered = filtered.filter(u =>
            (u.name || "").toLowerCase().includes(query) ||
            (u.email || "").toLowerCase().includes(query) ||
            (u.phone || "").toLowerCase().includes(query)
        );
    }
    if (metalFilter === "gold") {
        filtered = filtered.filter(u => (u.goldInvestments?.grams || 0) > 0);
    } else if (metalFilter === "silver") {
        filtered = filtered.filter(u => (u.silverInvestments?.grams || 0) > 0);
    } else if (metalFilter === "copper") {
        filtered = filtered.filter(u => (u.copperInvestments?.grams || 0) > 0);
    }
    renderDigiGoldUserInvestmentsTable(filtered);
}

function renderDigiGoldUserInvestmentsTable(users) {
    const body = document.getElementById("userinvestments-body");
    if (!body) return;

    let totalGoldGrams = 0;
    let totalGoldInvested = 0;
    let totalGoldVal = 0;

    let totalSilverGrams = 0;
    let totalSilverInvested = 0;
    let totalSilverVal = 0;

    let totalCopperGrams = 0;
    let totalCopperInvested = 0;
    let totalCopperVal = 0;

    (users || []).forEach(u => {
        const gold = u.goldInvestments || {};
        const silver = u.silverInvestments || {};
        const copper = u.copperInvestments || {};

        totalGoldGrams += (gold.grams || 0);
        totalGoldInvested += (gold.totalInvested || 0);
        totalGoldVal += (gold.currentValue || 0);

        totalSilverGrams += (silver.grams || 0);
        totalSilverInvested += (silver.totalInvested || 0);
        totalSilverVal += (silver.currentValue || 0);

        totalCopperGrams += (copper.grams || 0);
        totalCopperInvested += (copper.totalInvested || 0);
        totalCopperVal += (copper.currentValue || 0);
    });

    const totalVal = (totalGoldVal + totalSilverVal + totalCopperVal);
    const totalInvested = (totalGoldInvested + totalSilverInvested + totalCopperInvested);
    const totalPl = parseFloat((totalVal - totalInvested).toFixed(2));
    const goldPl = parseFloat((totalGoldVal - totalGoldInvested).toFixed(2));
    const silverPl = parseFloat((totalSilverVal - totalSilverInvested).toFixed(2));
    const copperPl = parseFloat((totalCopperVal - totalCopperInvested).toFixed(2));

    // Update Gold Custody Vault Card
    const goldEl = document.getElementById("summary-total-gold");
    if (goldEl) goldEl.textContent = formatGrams(totalGoldGrams);

    const goldValEl = document.getElementById("summary-gold-valuation");
    if (goldValEl) goldValEl.textContent = formatINR(totalGoldVal);

    const goldInvEl = document.getElementById("summary-gold-invested");
    if (goldInvEl) goldInvEl.textContent = formatINR(totalGoldInvested);

    const goldPlEl = document.getElementById("summary-gold-pl");
    if (goldPlEl) {
        goldPlEl.style.color = goldPl >= 0 ? "var(--success)" : "var(--danger)";
        goldPlEl.textContent = `${goldPl >= 0 ? '+' : ''}${formatINR(goldPl)}`;
    }

    // Update Silver Custody Vault Card
    const silverEl = document.getElementById("summary-total-silver");
    if (silverEl) silverEl.textContent = formatGrams(totalSilverGrams);

    const silverValEl = document.getElementById("summary-silver-valuation");
    if (silverValEl) silverValEl.textContent = formatINR(totalSilverVal);

    const silverInvEl = document.getElementById("summary-silver-invested");
    if (silverInvEl) silverInvEl.textContent = formatINR(totalSilverInvested);

    const silverPlEl = document.getElementById("summary-silver-pl");
    if (silverPlEl) {
        silverPlEl.style.color = silverPl >= 0 ? "var(--success)" : "var(--danger)";
        silverPlEl.textContent = `${silverPl >= 0 ? '+' : ''}${formatINR(silverPl)}`;
    }

    // Update Copper Custody Vault Card
    const copperEl = document.getElementById("summary-total-copper");
    if (copperEl) copperEl.textContent = formatGrams(totalCopperGrams);

    const copperValEl = document.getElementById("summary-copper-valuation");
    if (copperValEl) copperValEl.textContent = formatINR(totalCopperVal);

    const copperInvEl = document.getElementById("summary-copper-invested");
    if (copperInvEl) copperInvEl.textContent = formatINR(totalCopperInvested);

    const copperPlEl = document.getElementById("summary-copper-pl");
    if (copperPlEl) {
        copperPlEl.style.color = copperPl >= 0 ? "var(--success)" : "var(--danger)";
        copperPlEl.textContent = `${copperPl >= 0 ? '+' : ''}${formatINR(copperPl)}`;
    }

    // Update Total Bullion Custody Card
    const totalValEl = document.getElementById("summary-total-valuation");
    if (totalValEl) totalValEl.textContent = formatINR(totalVal);

    const totalInvEl = document.getElementById("summary-total-invested");
    if (totalInvEl) totalInvEl.textContent = formatINR(totalInvested);

    const totalPlEl = document.getElementById("summary-total-pl");
    if (totalPlEl) {
        totalPlEl.style.color = totalPl >= 0 ? "var(--success)" : "var(--danger)";
        totalPlEl.textContent = `${totalPl >= 0 ? '+' : ''}${formatINR(totalPl)}`;
    }

    if (!users || users.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-coins" style="font-size:32px;color:var(--text-dim)"></i><div>No bullion investors found in this view</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Gold 24K Holdings</th>
                    <th>Silver 999 Holdings</th>
                    <th>Copper 999 Holdings</th>
                    <th>Total Invested</th>
                    <th>Current Value</th>
                    <th>Bullion P&L</th>
                    <th>Wallet Balance</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    users.forEach(u => {
        const gold = u.goldInvestments || {};
        const silver = u.silverInvestments || {};
        const copper = u.copperInvestments || {};

        const goldGrams = gold.grams || 0;
        const goldSpent = gold.totalInvested || 0;
        const goldVal = gold.currentValue || 0;

        const silverGrams = silver.grams || 0;
        const silverSpent = silver.totalInvested || 0;
        const silverVal = silver.currentValue || 0;

        const copperGrams = copper.grams || 0;
        const copperSpent = copper.totalInvested || 0;
        const copperVal = copper.currentValue || 0;

        const totalInvested = (goldSpent + silverSpent + copperSpent);
        const totalVal = (goldVal + silverVal + copperVal);
        const totalPl = parseFloat((totalVal - totalInvested).toFixed(2));
        const walletBal = u.walletBalance !== undefined ? u.walletBalance : 0;

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${formatGrams(goldGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(goldSpent)} • Val: ${formatINR(goldVal)}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--silver)">${formatGrams(silverGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(silverSpent)} • Val: ${formatINR(silverVal)}</div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--copper)">${formatGrams(copperGrams)}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">Spent: ${formatINR(copperSpent)} • Val: ${formatINR(copperVal)}</div>
            </td>
            <td style="font-weight:700;color:#fff">${formatINR(totalInvested)}</td>
            <td style="font-weight:700;color:var(--gold)">${formatINR(totalVal)}</td>
            <td>
                <span style="font-family:var(--font-mono);font-weight:700;color:${totalPl >= 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${totalPl >= 0 ? '+' : ''}${formatINR(totalPl)}
                </span>
            </td>
            <td style="font-family:var(--font-mono);font-weight:600">${formatINR(walletBal)}</td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u._id}')">
                        <i class="fas fa-edit"></i> Manage
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── 2. Real Estate: Bharat SQFT Property Investments Hub ───────
let allRealEstateInvestments = [];
let activeReCustomerId = null;
let reInvestmentFilters = {
    search: "",
    property: "all",
    status: "all",
    sortBy: "highest_amt",
    viewMode: "customers" // 'customers' (default) or 'txns'
};

async function loadInvestments() {
    const body = document.getElementById("investments-body");
    if (!body) return;
    body.innerHTML = `
    <div class="loading-box">
        <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
        <div>Loading Bharat SQFT real estate investments & customer portfolios...</div>
    </div>`;

    try {
        const res = await api("/admin/investments?limit=150");
        if (!res.success) {
            body.innerHTML = `
            <div class="loading-box">
                <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
                <div>${res.message || "Failed to load investments"}</div>
            </div>`;
            return;
        }

        allRealEstateInvestments = Array.isArray(res.data) ? res.data : [];

        // 1. Populate Property Projects Filter Dropdown
        populatePropertyFilterDropdown(allRealEstateInvestments);

        // 2. Update Top Executive KPI Cards
        updateInvestmentKpis(res);

        // 3. Filter & Render
        filterAndRenderInvestments();

    } catch (err) {
        body.innerHTML = `
        <div class="loading-box">
            <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
            <div>Network error loading investments</div>
        </div>`;
    }
}

function populatePropertyFilterDropdown(investments) {
    const select = document.getElementById("re-property-filter");
    if (!select) return;

    const uniqueProps = new Map();
    investments.forEach(inv => {
        const p = inv.property;
        if (p && p._id && !uniqueProps.has(String(p._id))) {
            uniqueProps.set(String(p._id), p.title || "Untitled Property");
        }
    });

    let opts = `<option value="all">All Real Estate Projects (${uniqueProps.size})</option>`;
    uniqueProps.forEach((title, id) => {
        opts += `<option value="${id}">${title}</option>`;
    });
    select.innerHTML = opts;
    select.value = reInvestmentFilters.property || "all";
}

function updateInvestmentKpis(apiRes) {
    const list = allRealEstateInvestments;
    const paidList = list.filter(x => x.status === "paid");

    const totalFunded = apiRes.totalRevenue !== undefined 
        ? apiRes.totalRevenue 
        : paidList.reduce((sum, x) => sum + (x.totalAmount || 0), 0);

    const totalBricks = apiRes.totalBricks !== undefined 
        ? apiRes.totalBricks 
        : paidList.reduce((sum, x) => sum + (x.bricks || 0), 0);

    const uniqueInvestors = new Set(paidList.map(x => x.user?._id || x.user)).size;
    const avgTicket = uniqueInvestors > 0 ? +(totalFunded / uniqueInvestors).toFixed(2) : 0;

    let totalYieldWeighted = 0;
    let totalWeightAmt = 0;
    paidList.forEach(inv => {
        const yieldPct = inv.property?.expectedRentalYield || 8.5;
        const amt = inv.totalAmount || 0;
        totalYieldWeighted += (yieldPct * amt);
        totalWeightAmt += amt;
    });
    const avgYield = totalWeightAmt > 0 ? +(totalYieldWeighted / totalWeightAmt).toFixed(1) : 8.5;
    const estAnnualDividend = +((totalFunded * (avgYield / 100))).toFixed(2);

    // Update DOM
    const elFunded = document.getElementById("re-stat-total-funded");
    if (elFunded) elFunded.textContent = formatINR(totalFunded);

    const elBricks = document.getElementById("re-stat-total-bricks");
    if (elBricks) elBricks.textContent = `${totalBricks.toLocaleString()} Bricks`;

    const elInvestors = document.getElementById("re-stat-total-investors");
    if (elInvestors) elInvestors.textContent = `${uniqueInvestors} Investors`;

    const elAvgTicket = document.getElementById("re-stat-avg-ticket");
    if (elAvgTicket) elAvgTicket.textContent = `Avg ticket: ${formatINR(avgTicket)} / investor`;

    const elYield = document.getElementById("re-stat-projected-yield");
    if (elYield) elYield.textContent = `~${avgYield}% p.a.`;

    const elDiv = document.getElementById("re-stat-annual-dividend");
    if (elDiv) elDiv.innerHTML = `<i class="fas fa-coins" style="color:#34d399"></i> ~${formatINR(estAnnualDividend)}/yr rental pool`;

    // Counts on pills
    const cntAll = document.getElementById("re-count-all");
    if (cntAll) cntAll.textContent = list.length;
    const cntPaid = document.getElementById("re-count-paid");
    if (cntPaid) cntPaid.textContent = paidList.length;
    const cntPending = document.getElementById("re-count-pending");
    if (cntPending) cntPending.textContent = list.length - paidList.length;
}

function filterAndRenderInvestments() {
    const body = document.getElementById("investments-body");
    if (!body) return;

    let filtered = [...allRealEstateInvestments];

    // 1. Status Filter
    if (reInvestmentFilters.status && reInvestmentFilters.status !== "all") {
        filtered = filtered.filter(x => x.status === reInvestmentFilters.status);
    }

    // 2. Property Filter
    if (reInvestmentFilters.property && reInvestmentFilters.property !== "all") {
        filtered = filtered.filter(x => String(x.property?._id || x.property) === String(reInvestmentFilters.property));
    }

    // 3. Search Query
    if (reInvestmentFilters.search) {
        const q = reInvestmentFilters.search.toLowerCase().trim();
        filtered = filtered.filter(inv => {
            const uName = (inv.user?.name || "").toLowerCase();
            const uPhone = (inv.user?.phone || "").toLowerCase();
            const uEmail = (inv.user?.email || "").toLowerCase();
            const pTitle = (inv.property?.title || "").toLowerCase();
            const pCity = (inv.property?.location?.city || "").toLowerCase();
            const pState = (inv.property?.location?.state || "").toLowerCase();
            return uName.includes(q) || uPhone.includes(q) || uEmail.includes(q) || pTitle.includes(q) || pCity.includes(q) || pState.includes(q);
        });
    }

    if (filtered.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3.5rem 1rem">
            <div style="width:60px;height:60px;border-radius:14px;background:rgba(168,85,247,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem auto">
                <i class="fas fa-building-circle-xmark" style="font-size:28px;color:#c084fc"></i>
            </div>
            <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:0.35rem">No Matching Real Estate Records</div>
            <div style="font-size:0.85rem;color:#94a3b8;max-width:400px;margin:0 auto">
                Try adjusting your search query or selecting a different project filter.
            </div>
        </div>`;
        return;
    }

    if (reInvestmentFilters.viewMode === "txns") {
        // Detailed All Transactions Table View
        if (reInvestmentFilters.sortBy === "highest_amt") {
            filtered.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));
        } else if (reInvestmentFilters.sortBy === "most_bricks") {
            filtered.sort((a, b) => (b.bricks || 0) - (a.bricks || 0));
        } else if (reInvestmentFilters.sortBy === "name_asc") {
            filtered.sort((a, b) => (a.user?.name || "").localeCompare(b.user?.name || ""));
        } else {
            filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        renderInvestmentsTableView(filtered, body);
    } else {
        // Customer-Wise Grouped View (DEFAULT & RECOMMENDED)
        const customerMap = new Map();
        filtered.forEach(inv => {
            const uid = String(inv.user?._id || inv.user || "anonymous");
            if (!customerMap.has(uid)) {
                customerMap.set(uid, {
                    userId: uid,
                    user: inv.user || { _id: uid, name: "Anonymous Customer" },
                    investments: [],
                    totalBricks: 0,
                    totalInvested: 0,
                    propertiesMap: new Map(),
                    estAnnualDividend: 0,
                    lastInvestmentDate: inv.createdAt
                });
            }
            const c = customerMap.get(uid);
            c.investments.push(inv);
            if (inv.status === "paid") {
                c.totalBricks += (inv.bricks || 0);
                c.totalInvested += (inv.totalAmount || 0);
                const yieldPct = inv.property?.expectedRentalYield || 8.5;
                c.estAnnualDividend += +((inv.totalAmount || 0) * (yieldPct / 100));

                const pId = String(inv.property?._id || inv.property || "");
                if (pId) {
                    if (!c.propertiesMap.has(pId)) {
                        c.propertiesMap.set(pId, {
                            property: inv.property || { title: "Property Project" },
                            bricks: 0,
                            invested: 0
                        });
                    }
                    const pm = c.propertiesMap.get(pId);
                    pm.bricks += (inv.bricks || 0);
                    pm.invested += (inv.totalAmount || 0);
                }
            }
            if (new Date(inv.createdAt) > new Date(c.lastInvestmentDate)) {
                c.lastInvestmentDate = inv.createdAt;
            }
        });

        const customerList = Array.from(customerMap.values());

        // Sort Customer List
        if (reInvestmentFilters.sortBy === "highest_amt") {
            customerList.sort((a, b) => b.totalInvested - a.totalInvested);
        } else if (reInvestmentFilters.sortBy === "most_bricks") {
            customerList.sort((a, b) => b.totalBricks - a.totalBricks);
        } else if (reInvestmentFilters.sortBy === "name_asc") {
            customerList.sort((a, b) => (a.user?.name || "").localeCompare(b.user?.name || ""));
        } else {
            // newest
            customerList.sort((a, b) => new Date(b.lastInvestmentDate) - new Date(a.lastInvestmentDate));
        }

        renderInvestmentsCustomersView(customerList, body);
    }
}

// ── CUSTOMER-WISE VIEW: Cards Grid ────────────────────────────
function renderInvestmentsCustomersView(customerList, mount) {
    let html = `<div class="re-customer-grid">`;

    customerList.forEach(c => {
        const u = c.user || {};
        const userName = u.name || "Verified Customer";
        const avatarLetter = userName.charAt(0).toUpperCase();
        const contactStr = u.phone || u.email || "No contact info";
        const propsCount = c.propertiesMap.size;
        const lastDateStr = formatDate(c.lastInvestmentDate);

        // Build property chips (up to 3)
        let propChipsHtml = "";
        let chipIdx = 0;
        c.propertiesMap.forEach((pData) => {
            if (chipIdx < 3) {
                const pTitle = pData.property?.title || "Property";
                propChipsHtml += `
                <span class="re-cust-chip" title="${pTitle}: ${pData.bricks} Bricks">
                    <i class="fas fa-building" style="color:#c084fc"></i>
                    <span>${pTitle.length > 18 ? pTitle.slice(0, 18) + '...' : pTitle}</span>
                    <strong>${pData.bricks}b</strong>
                </span>`;
                chipIdx++;
            }
        });
        if (c.propertiesMap.size > 3) {
            propChipsHtml += `<span class="re-cust-chip" style="background:rgba(255,255,255,0.06);color:#94a3b8">+${c.propertiesMap.size - 3} more</span>`;
        }
        if (c.propertiesMap.size === 0) {
            propChipsHtml = `<span style="font-size:11px;color:#64748b">No active paid properties</span>`;
        }

        html += `
        <div class="re-cust-card" onclick="openCustomerRealEstateDetails('${c.userId}')">
            <!-- Customer Header -->
            <div class="re-cust-header">
                <div class="re-cust-avatar">
                    ${u.avatar || u.profilePicture ? `
                        <img src="${u.avatar || u.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.outerHTML='${avatarLetter}'" />
                    ` : avatarLetter}
                </div>
                <div class="re-cust-info">
                    <div class="re-cust-name-row">
                        <span class="re-cust-name" title="${userName}">${userName}</span>
                        <span class="re-cust-badge"><i class="fas fa-check-circle"></i> Investor</span>
                    </div>
                    <div class="re-cust-contact">${contactStr}</div>
                </div>
            </div>

            <!-- 3 Core Financial Metrics -->
            <div class="re-cust-stats">
                <div class="re-cust-stat-item">
                    <span class="re-cust-stat-label">Bricks Owned</span>
                    <span class="re-cust-stat-val purple">${c.totalBricks.toLocaleString()}</span>
                </div>
                <div class="re-cust-stat-item">
                    <span class="re-cust-stat-label">Total Invested</span>
                    <span class="re-cust-stat-val gold">${formatINR(c.totalInvested)}</span>
                </div>
                <div class="re-cust-stat-item">
                    <span class="re-cust-stat-label">Annual Yield</span>
                    <span class="re-cust-stat-val green">~${formatINR(c.estAnnualDividend)}</span>
                </div>
            </div>

            <!-- Projects Funded Chips -->
            <div class="re-cust-props-strip">
                <div class="re-cust-props-label">
                    <i class="fas fa-city" style="color:#60a5fa"></i> Funded Projects (${propsCount})
                </div>
                <div class="re-cust-props-chips">
                    ${propChipsHtml}
                </div>
            </div>

            <!-- Footer & Call to Action -->
            <div class="re-cust-footer">
                <span class="re-cust-last-date"><i class="far fa-clock"></i> Last invested: ${lastDateStr}</span>
                <span class="re-cust-view-btn">
                    <span>View Real Estate Portfolio</span>
                    <i class="fas fa-arrow-right"></i>
                </span>
            </div>
        </div>`;
    });

    html += `</div>`;
    mount.innerHTML = html;
}

function reSetText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val !== undefined && val !== null) ? val : "—";
}

// ── DEDICATED CUSTOMER DETAILS SCREEN (NOT A POPUP) ───────────
function openCustomerRealEstateDetails(userId) {
    if (!userId) return;
    activeReCustomerId = userId;

    const directoryView = document.getElementById("re-investors-directory-view");
    const detailView = document.getElementById("re-investor-detail-view");
    if (directoryView) directoryView.style.display = "none";
    if (detailView) detailView.style.display = "block";

    // Find all investments for this user
    const userInvestments = allRealEstateInvestments.filter(x => String(x.user?._id || x.user) === String(userId));
    const firstObjUser = userInvestments.find(x => x.user && typeof x.user === "object")?.user;
    const u = firstObjUser || { _id: userId, name: `Customer #${String(userId).slice(-6).toUpperCase()}` };

    const userName = u.name || `Customer #${String(userId).slice(-6).toUpperCase()}`;
    reSetText("re-cust-bc-name", userName);
    reSetText("re-hero-name", userName);
    reSetText("re-hero-phone", u.phone || "No phone linked");
    reSetText("re-hero-email", u.email || "No email on file");
    reSetText("re-hero-id", String(userId).slice(-8).toUpperCase());

    const avatarMount = document.getElementById("re-hero-avatar");
    if (avatarMount) {
        if (u.avatar || u.profilePicture) {
            avatarMount.innerHTML = `<img src="${u.avatar || u.profilePicture}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.outerHTML='${userName.charAt(0).toUpperCase()}'" />`;
        } else {
            avatarMount.textContent = userName.charAt(0).toUpperCase();
        }
    }

    // Compute Customer Stats
    const paidList = userInvestments.filter(x => x.status === "paid");
    const totalBricks = paidList.reduce((s, x) => s + (x.bricks || 0), 0);
    const totalInvested = paidList.reduce((s, x) => s + (x.totalAmount || 0), 0);

    let estDividend = 0;
    paidList.forEach(inv => {
        const yieldPct = inv.property?.expectedRentalYield || 8.5;
        estDividend += ((inv.totalAmount || 0) * (yieldPct / 100));
    });

    // Group by property
    const propMap = new Map();
    paidList.forEach(inv => {
        const p = inv.property || {};
        const pid = String(p._id || "unknown");
        if (!propMap.has(pid)) {
            propMap.set(pid, {
                property: p,
                bricks: 0,
                invested: 0,
                allotments: []
            });
        }
        const pm = propMap.get(pid);
        pm.bricks += (inv.bricks || 0);
        pm.invested += (inv.totalAmount || 0);
        pm.allotments.push(inv);
    });

    reSetText("re-hero-total-bricks", `${totalBricks.toLocaleString()} Bricks`);
    reSetText("re-hero-total-invested", formatINR(totalInvested));
    reSetText("re-hero-annual-yield", `~${formatINR(estDividend)} /yr`);
    reSetText("re-hero-projects-count", `${propMap.size} Properties`);

    // 1. Render Property Projects Portfolio Breakdown
    renderCustomerProjectsBreakdown(propMap);

    // 2. Render Allotment Transactions Ledger
    renderCustomerTransactionsLedger(userInvestments);

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCustomerProjectsBreakdown(propMap) {
    const mount = document.getElementById("re-detail-projects-mount");
    if (!mount) return;

    if (propMap.size === 0) {
        mount.innerHTML = `
        <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:12px;padding:2rem;text-align:center;color:#64748b;font-size:13px">
            <i class="fas fa-building" style="font-size:28px;opacity:0.3;margin-bottom:6px"></i><br>
            No active confirmed property projects in this portfolio yet.
        </div>`;
        return;
    }

    let html = "";
    propMap.forEach((data, pid) => {
        const p = data.property || {};
        const coverImg = p.images?.find(i => i.isCover)?.url || p.images?.[0]?.url;
        const propTitle = p.title || "Untitled Property Project";
        const propType = p.propertyType || "Commercial";
        const cityStr = p.location?.city ? `${p.location.city}${p.location.state ? ', ' + p.location.state : ''}` : 'Prime Location';

        const yieldPct = p.expectedRentalYield || 8.5;
        const annualPayout = +((data.invested * (yieldPct / 100))).toFixed(2);
        const monthlyPayout = +(annualPayout / 12).toFixed(2);

        const ownershipPct = p.totalBricks ? +((data.bricks / p.totalBricks) * 100).toFixed(3) : 0;
        const latestAllotment = data.allotments[0] || {};

        html += `
        <div class="re-detail-project-card">
            <!-- Left: Property Project Info -->
            <div class="re-dproj-left">
                ${coverImg ? `
                    <img src="${coverImg}" class="re-dproj-img" alt="${propTitle}" onerror="this.outerHTML='<div class=\\'re-prop-thumb-fallback\\'><i class=\\'fas fa-building\\'></i></div>'" />
                ` : `
                    <div class="re-prop-thumb-fallback"><i class="fas fa-building"></i></div>
                `}
                <div class="re-dproj-info">
                    <span class="re-badge-type" style="margin-bottom:4px;display:inline-block">${propType}</span>
                    <h4 title="${propTitle}">${propTitle}</h4>
                    <p><i class="fas fa-map-marker-alt" style="color:#ef4444"></i> ${cityStr}</p>
                </div>
            </div>

            <!-- Middle: Financial Metrics & Equity Bar -->
            <div class="re-dproj-metrics">
                <div class="re-metric-item">
                    <span class="re-metric-label"><i class="fas fa-cubes" style="color:#c084fc"></i> Bricks Owned</span>
                    <span class="re-metric-val purple">${data.bricks} Bricks</span>
                </div>
                <div class="re-metric-item">
                    <span class="re-metric-label"><i class="fas fa-coins" style="color:#f59e0b"></i> Capital Invested</span>
                    <span class="re-metric-val gold">${formatINR(data.invested)}</span>
                </div>
                <div class="re-metric-item">
                    <span class="re-metric-label"><i class="fas fa-chart-pie" style="color:#60a5fa"></i> Fractional Stake</span>
                    <span class="re-metric-val blue">${ownershipPct}%</span>
                    <div class="re-progress-track" style="height:4px;margin-top:4px">
                        <div class="re-progress-fill" style="width:${Math.min(Math.max(ownershipPct * 2, 8), 100)}%"></div>
                    </div>
                </div>
                <div class="re-metric-item">
                    <span class="re-metric-label"><i class="fas fa-arrow-trend-up" style="color:#34d399"></i> Rental Yield</span>
                    <span class="re-metric-val green">${yieldPct}% p.a.</span>
                    <span style="font-size:10px;color:#34d399;font-family:var(--font-mono)">~${formatINR(monthlyPayout)} /mo</span>
                </div>
            </div>

            <!-- Right: Actions -->
            <div class="re-dproj-actions">
                ${latestAllotment._id ? `
                    <button class="btn-re-cert" onclick="openInvestmentCertificate('${latestAllotment._id}')">
                        <i class="fas fa-certificate"></i> View Certificate
                    </button>
                ` : ''}
            </div>
        </div>`;
    });

    mount.innerHTML = html;
}

function renderCustomerTransactionsLedger(allotments) {
    const mount = document.getElementById("re-detail-txns-mount");
    if (!mount) return;

    if (allotments.length === 0) {
        mount.innerHTML = `<div style="padding:1.5rem;color:#64748b;text-align:center;font-size:12px">No transaction records found.</div>`;
        return;
    }

    allotments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = `
    <div class="re-table-wrap">
        <table class="re-table">
            <thead>
                <tr>
                    <th>Allotment Reference</th>
                    <th>Property Project</th>
                    <th>Bricks</th>
                    <th>Price / Brick</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                    <th>Date & Time</th>
                    <th style="text-align:right">Certificate</th>
                </tr>
            </thead>
            <tbody>`;

    allotments.forEach(inv => {
        const p = inv.property || {};
        const isPaid = inv.status === "paid";
        const pricePerBrick = inv.pricePerBrick || (inv.bricks ? +(inv.totalAmount / inv.bricks).toFixed(2) : 0);

        html += `
        <tr>
            <td style="font-family:var(--font-mono);font-size:11.5px;color:#60a5fa">
                ${inv._id ? `BSQFT-${inv._id.slice(-6).toUpperCase()}` : '—'}
            </td>
            <td>
                <div style="font-weight:700;color:#fff">${p.title || 'Untitled Property'}</div>
                <div style="font-size:11px;color:#94a3b8">${p.location?.city || 'Prime Hub'}</div>
            </td>
            <td>
                <span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;font-weight:700;border:1px solid rgba(168,85,247,0.3)">
                    ${inv.bricks} Bricks
                </span>
            </td>
            <td style="font-family:var(--font-mono);color:#cbd5e1">${formatINR(pricePerBrick)}</td>
            <td style="font-family:var(--font-mono);font-weight:800;color:#f59e0b">${formatINR(inv.totalAmount)}</td>
            <td>
                <span class="re-status-pill ${isPaid ? 'paid' : 'pending'}">
                    <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-clock'}"></i> ${(inv.status || 'paid').toUpperCase()}
                </span>
            </td>
            <td style="font-size:11.5px;color:#94a3b8">${formatDateTime(inv.createdAt)}</td>
            <td style="text-align:right">
                <button class="btn-re-cert" onclick="openInvestmentCertificate('${inv._id}')">
                    <i class="fas fa-certificate"></i> Cert
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

function backToAllInvestors() {
    activeReCustomerId = null;
    const directoryView = document.getElementById("re-investors-directory-view");
    const detailView = document.getElementById("re-investor-detail-view");
    if (detailView) detailView.style.display = "none";
    if (directoryView) directoryView.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function viewCustomerFullAccount() {
    if (activeReCustomerId && typeof viewUserDetails === "function") {
        viewUserDetails(activeReCustomerId);
    }
}

function exportCustomerRealEstateCSV() {
    if (!activeReCustomerId) return;
    const userInvestments = allRealEstateInvestments.filter(x => String(x.user?._id || x.user) === String(activeReCustomerId));
    if (userInvestments.length === 0) {
        toast("No records found for this customer", "warning");
        return;
    }

    const u = userInvestments[0]?.user || {};
    const headers = ["Reference ID", "Customer Name", "Phone", "Property Project", "Bricks", "Price Per Brick", "Total Paid", "Status", "Date"];
    const rows = userInvestments.map(inv => {
        const p = inv.property || {};
        return [
            `BSQFT-${(inv._id || '').slice(-6).toUpperCase()}`,
            `"${(u.name || '').replace(/"/g, '""')}"`,
            `"${(u.phone || '').replace(/"/g, '""')}"`,
            `"${(p.title || '').replace(/"/g, '""')}"`,
            inv.bricks || 0,
            inv.pricePerBrick || 0,
            inv.totalAmount || 0,
            inv.status || 'paid',
            `"${new Date(inv.createdAt).toISOString()}"`
        ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `BharatSQFT_Customer_Portfolio_${String(u.name || 'Investor').replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Customer portfolio CSV exported ✓", "success");
}

// ── View 2: High Density Modern Table ─────────────────────────
function renderInvestmentsTableView(list, mount) {
    let html = `
    <div class="re-table-wrap">
        <table class="re-table">
            <thead>
                <tr>
                    <th>Property Project</th>
                    <th>Investor Customer</th>
                    <th>Bricks & Rate</th>
                    <th>Total Capital</th>
                    <th>Ownership %</th>
                    <th>Est. Rental Yield</th>
                    <th>Status & Date</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    list.forEach(inv => {
        const u = inv.user || {};
        const p = inv.property || {};
        const isPaid = inv.status === "paid";
        const statusClass = isPaid ? "paid" : "pending";
        const statusLabel = isPaid ? "Paid" : (inv.status || "Pending");
        const yieldPct = p.expectedRentalYield || 8.5;
        const ownershipPct = inv.ownershipPercent !== undefined ? inv.ownershipPercent : (p.totalBricks ? +((inv.bricks / p.totalBricks) * 100).toFixed(4) : 0);
        const coverImg = p.images?.find(i => i.isCover)?.url || p.images?.[0]?.url;

        html += `
        <tr>
            <!-- Property Column -->
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    ${coverImg ? `
                        <img src="${coverImg}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1)" />
                    ` : `
                        <div style="width:40px;height:40px;border-radius:8px;background:rgba(168,85,247,0.15);display:flex;align-items:center;justify-content:center;color:#c084fc;font-size:16px">
                            <i class="fas fa-building"></i>
                        </div>
                    `}
                    <div>
                        <div style="font-weight:700;color:#ffffff">${p.title || 'Untitled Property'}</div>
                        <div style="font-size:11.5px;color:#94a3b8"><i class="fas fa-map-marker-alt" style="color:#ef4444;font-size:10px"></i> ${p.location?.city || 'Prime Location'}</div>
                    </div>
                </div>
            </td>

            <!-- Investor Column -->
            <td>
                <div style="cursor:pointer" onclick="openCustomerRealEstateDetails('${u._id}')">
                    <div style="font-weight:700;color:#fff;display:flex;align-items:center;gap:4px">
                        <span>${u.name || 'Anonymous Investor'}</span>
                        <i class="fas fa-arrow-right" style="font-size:9px;color:#c084fc"></i>
                    </div>
                    <div style="font-size:11.5px;color:#94a3b8;font-family:var(--font-mono)">${u.phone || u.email || '—'}</div>
                </div>
            </td>

            <!-- Bricks & Rate -->
            <td>
                <div>
                    <span class="badge" style="background:rgba(168,85,247,0.2);color:#c084fc;font-weight:700;border:1px solid rgba(168,85,247,0.3)">
                        ${inv.bricks || 0} Bricks
                    </span>
                    <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-family:var(--font-mono)">
                        @ ${formatINR(inv.pricePerBrick || (inv.bricks ? +(inv.totalAmount / inv.bricks).toFixed(2) : 0))}
                    </div>
                </div>
            </td>

            <!-- Total Consideration -->
            <td>
                <div style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:#f59e0b">
                    ${formatINR(inv.totalAmount)}
                </div>
            </td>

            <!-- Ownership Progress Bar -->
            <td>
                <div style="min-width:110px">
                    <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#fff;margin-bottom:2px">
                        <span>${ownershipPct}%</span>
                    </div>
                    <div class="re-progress-track" style="height:5px">
                        <div class="re-progress-fill" style="width:${Math.min(Math.max(ownershipPct * 2, 8), 100)}%"></div>
                    </div>
                </div>
            </td>

            <!-- Rental Yield -->
            <td>
                <div style="font-weight:700;color:#34d399;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-arrow-trend-up"></i> ${yieldPct}% p.a.
                </div>
                <div style="font-size:11px;color:#94a3b8">Rental Yield</div>
            </td>

            <!-- Status & Date -->
            <td>
                <span class="re-status-pill ${statusClass}" style="margin-bottom:3px">
                    <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-clock'}"></i> ${statusLabel}
                </span>
                <div style="font-size:11px;color:#64748b">${formatDate(inv.createdAt)}</div>
            </td>

            <!-- Action -->
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-re-cert" onclick="openInvestmentCertificate('${inv._id}')" title="View Digital Certificate">
                        <i class="fas fa-certificate"></i> Cert
                    </button>
                    <button class="btn-re-user" onclick="openCustomerRealEstateDetails('${u._id}')" title="Open Customer Portfolio Screen">
                        <i class="fas fa-folder-open"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

// ── Event Handlers & View Modes ───────────────────────────────
function handleInvestmentsSearch(val) {
    reInvestmentFilters.search = val;
    filterAndRenderInvestments();
}

function handleInvestmentsPropertyFilter(val) {
    reInvestmentFilters.property = val;
    filterAndRenderInvestments();
}

function setInvestmentsStatusFilter(status) {
    reInvestmentFilters.status = status;
    ["all", "paid", "pending"].forEach(s => {
        const btn = document.getElementById(`re-pill-${s}`);
        if (btn) btn.classList.toggle("active", s === status);
    });
    filterAndRenderInvestments();
}

function handleInvestmentsSort(sortBy) {
    reInvestmentFilters.sortBy = sortBy;
    filterAndRenderInvestments();
}

function setInvestmentsViewMode(mode) {
    reInvestmentFilters.viewMode = mode;
    const custBtn = document.getElementById("re-view-customers-btn");
    const txnsBtn = document.getElementById("re-view-txns-btn");
    if (custBtn) custBtn.classList.toggle("active", mode === "customers");
    if (txnsBtn) txnsBtn.classList.toggle("active", mode === "txns");
    filterAndRenderInvestments();
}

// ── Official Digital Certificate Modal Handler ───────────────
function openInvestmentCertificate(invId) {
    const inv = allRealEstateInvestments.find(x => String(x._id) === String(invId));
    if (!inv) {
        toast("Investment details not found", "warning");
        return;
    }

    const u = inv.user || {};
    const p = inv.property || {};
    const yieldPct = p.expectedRentalYield || 8.5;
    const ownershipPct = inv.ownershipPercent !== undefined ? inv.ownershipPercent : (p.totalBricks ? +((inv.bricks / p.totalBricks) * 100).toFixed(4) : 0);
    const pricePerBrick = inv.pricePerBrick || (inv.bricks ? +(inv.totalAmount / inv.bricks).toFixed(2) : 0);

    const certRef = `BSQFT-BRK-${(inv._id || '').slice(-6).toUpperCase()}`;

    udSetText("cert-ref-id", certRef);
    udSetText("cert-investor-name", u.name || "Verified Bharat SQFT Investor");
    udSetText("cert-investor-contact", `${u.phone || u.email || 'On File'} · ID: ${String(u._id || '').slice(-6).toUpperCase()}`);
    udSetText("cert-prop-title", p.title || "Real Estate Project");
    udSetText("cert-prop-location", p.location?.city ? `${p.location.address ? p.location.address + ', ' : ''}${p.location.city}, ${p.location.state || ''}` : 'Prime Hub');
    udSetText("cert-bricks-count", `${(inv.bricks || 0).toLocaleString()} Fractional Bricks`);
    udSetText("cert-brick-price", `${formatINR(pricePerBrick)} / Brick`);
    udSetText("cert-total-amount", formatINR(inv.totalAmount));
    udSetText("cert-ownership-pct", `${ownershipPct}% Fractional Equity`);
    udSetText("cert-expected-yield", `~${yieldPct}% p.a. Projected Rental Yield`);
    udSetText("cert-allot-date", `${formatDateTime(inv.createdAt)} · Status: ${(inv.status || 'paid').toUpperCase()}`);

    const modal = document.getElementById("inv-certificate-modal");
    if (modal) modal.style.display = "flex";
}

function closeInvestmentCertificate() {
    const modal = document.getElementById("inv-certificate-modal");
    if (modal) modal.style.display = "none";
}

// ── Export Investments to CSV ─────────────────────────────────
function exportInvestmentsCSV() {
    if (!allRealEstateInvestments || allRealEstateInvestments.length === 0) {
        toast("No investment records to export", "warning");
        return;
    }

    const headers = [
        "Allotment ID",
        "Investor Name",
        "Phone",
        "Email",
        "Property Project",
        "City",
        "Bricks Allotted",
        "Price Per Brick",
        "Total Amount Paid",
        "Ownership Equity (%)",
        "Projected Rental Yield (%)",
        "Status",
        "Transaction Date"
    ];

    const rows = allRealEstateInvestments.map(inv => {
        const u = inv.user || {};
        const p = inv.property || {};
        const pricePerBrick = inv.pricePerBrick || (inv.bricks ? +(inv.totalAmount / inv.bricks).toFixed(2) : 0);
        return [
            inv._id,
            `"${(u.name || '').replace(/"/g, '""')}"`,
            `"${(u.phone || '').replace(/"/g, '""')}"`,
            `"${(u.email || '').replace(/"/g, '""')}"`,
            `"${(p.title || '').replace(/"/g, '""')}"`,
            `"${(p.location?.city || '').replace(/"/g, '""')}"`,
            inv.bricks || 0,
            pricePerBrick,
            inv.totalAmount || 0,
            inv.ownershipPercent || 0,
            p.expectedRentalYield || 8.5,
            inv.status || 'paid',
            `"${new Date(inv.createdAt).toISOString()}"`
        ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `BharatSQFT_Property_Investments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Investments CSV exported successfully ✓", "success");
}

// ── 3. Bank Withdrawals Queue ──────────────────────────────────
async function loadWithdrawals(status = "pending") {
    const body = document.getElementById("withdrawals-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading bank withdrawal requests...</div></div>`;

    try {
        const res = await api(`/admin/withdrawals?status=${status}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load withdrawals"}</div></div>`;
            return;
        }

        renderWithdrawalsTable(res.data || []);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderWithdrawalsTable(txns) {
    const body = document.getElementById("withdrawals-body");
    if (!body) return;

    if (!txns || txns.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-hand-holding-usd" style="font-size:32px;color:var(--text-dim)"></i><div>No withdrawal requests found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Balance Before / After</th>
                    <th>Status</th>
                    <th>Requested Time</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    txns.forEach(t => {
        const u = t.user || {};
        const isPending = t.status === "pending";

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--danger)">-${formatINR(t.amount)}</td>
            <td style="font-size:12.5px;color:var(--text-dim)">
                ${formatINR(t.balanceBefore)} → ${formatINR(t.balanceAfter || t.balanceBefore - t.amount)}
            </td>
            <td><span class="badge ${isPending ? 'badge-pending' : 'badge-success'}">${t.status}</span></td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(t.createdAt)}</td>
            <td style="text-align:right">
                ${isPending ? `<button class="btn btn-success btn-sm" onclick="completeWithdrawal('${t._id}', ${t.amount})"><i class="fas fa-check"></i> Mark Complete</button>` : `<span style="font-size:12px;color:var(--text-dim)">Processed</span>`}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function completeWithdrawal(id, amt) {
    if (!confirm(`Confirm releasing ₹${amt} bank payout for this user?`)) return;
    try {
        const res = await api(`/admin/withdrawals/${id}/complete`, { method: "PATCH" });
        if (res.success) {
            toast("Withdrawal marked complete", "success");
            loadWithdrawals();
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to complete withdrawal", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

// ── 4. Sell Payout Approvals (Gold + Silver + Copper) ─────────
let activeSellHoldingDays = 30;

async function loadSellSettings() {
    try {
        const res = await api("/admin/sell-settings");
        if (res.success && res.data) {
            activeSellHoldingDays = res.data.newUsersSellHoldingDays !== undefined ? res.data.newUsersSellHoldingDays : 30;
            const badge = document.getElementById("sell-holding-current-badge");
            const input = document.getElementById("sell-holding-days-input");
            if (badge) {
                badge.textContent = activeSellHoldingDays > 0 ? `Active: ${activeSellHoldingDays} Days` : "Active: Disabled (0d)";
                badge.className = activeSellHoldingDays > 0 ? "badge badge-gold" : "badge badge-gray";
            }
            if (input && document.activeElement !== input) {
                input.value = activeSellHoldingDays;
            }
        }
    } catch (e) {
        console.error("Error loading sell holding settings:", e);
    }
}

function setSellHoldingPreset(days) {
    const input = document.getElementById("sell-holding-days-input");
    if (input) {
        input.value = days;
        input.focus();
    }
}

async function saveSellHoldingSetting() {
    const input = document.getElementById("sell-holding-days-input");
    const val = Number(input?.value ?? 30);

    if (isNaN(val) || val < 0) {
        return toast("Please enter a valid non-negative number of days", "warning");
    }

    const btn = document.getElementById("btn-save-sell-holding");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        const res = await api("/admin/sell-settings", {
            method: "POST",
            body: JSON.stringify({ newUsersSellHoldingDays: val })
        });

        if (res.success) {
            activeSellHoldingDays = val;
            toast(res.message || `New user sell holding period updated to ${val} days!`, "success");
            const badge = document.getElementById("sell-holding-current-badge");
            if (badge) {
                badge.textContent = val > 0 ? `Active: ${val} Days` : "Active: Disabled (0d)";
                badge.className = val > 0 ? "badge badge-gold" : "badge badge-gray";
            }
            // Reload approvals table to reflect updated holding calculations
            loadSellApprovals(
                document.getElementById("sell-metal-filter")?.value || "all",
                document.getElementById("sell-status-filter")?.value || "processing"
            );
        } else {
            toast(res.message || "Failed to update holding period", "danger");
        }
    } catch (e) {
        toast("Network error updating holding period", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-check"></i> Save Holding Period`;
        }
    }
}

async function loadSellApprovals(metal = "all", status = "processing") {
    const body = document.getElementById("sellapprovals-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading sell payout approvals...</div></div>`;

    // Also sync sell holding period setting
    loadSellSettings();

    try {
        const res = await api(`/admin/sell-approvals?metal=${metal}&status=${status}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load approvals"}</div></div>`;
            return;
        }

        renderSellApprovalsTable(res.data || []);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderSellApprovalsTable(txns) {
    const body = document.getElementById("sellapprovals-body");
    if (!body) return;

    if (!txns || txns.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-check-double" style="font-size:32px;color:var(--text-dim)"></i><div>No sell transactions awaiting approval</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Holding Rule Status</th>
                    <th>Asset</th>
                    <th>Grams Sold</th>
                    <th>Rate Locked</th>
                    <th>Payout Amount</th>
                    <th>Status</th>
                    <th>Sold At</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    txns.forEach(t => {
        const u = t.user || {};
        const isProcessing = t.status === "processing";
        const holdingDays = t.holdingDaysConfigured !== undefined ? t.holdingDaysConfigured : activeSellHoldingDays;
        const meetsHold = t.isHoldingPeriodMet !== false;
        const daysSinceBuy = t.daysSinceFirstBuy !== null && t.daysSinceFirstBuy !== undefined ? t.daysSinceFirstBuy : null;
        const daysRemaining = t.daysRemainingInHold || 0;

        let holdingBadge = "";
        if (holdingDays <= 0) {
            holdingBadge = `<span class="badge" style="background:rgba(148,163,184,0.15);color:#94a3b8;font-size:10.5px"><i class="fas fa-infinity"></i> No Hold Policy</span>`;
        } else if (meetsHold) {
            holdingBadge = `<span class="badge badge-pill-success" style="font-size:10.5px" title="${daysSinceBuy !== null ? daysSinceBuy + ' days since 1st purchase' : 'Account active'}">
                <i class="fas fa-check-circle"></i> Meets ${holdingDays}d Rule ${daysSinceBuy !== null ? `(${daysSinceBuy}d)` : ''}
            </span>`;
        } else {
            holdingBadge = `<span class="badge badge-danger" style="font-size:10.5px" title="${daysRemaining} days remaining in lock-in period">
                <i class="fas fa-lock"></i> Under Hold (${daysSinceBuy || 0}/${holdingDays}d · ${daysRemaining}d left)
            </span>`;
        }

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.phone || u.email || ''}</div>
            </td>
            <td>
                ${holdingBadge}
            </td>
            <td>
                <span class="badge ${t.metal === 'silver' ? 'badge-silver' : (t.metal === 'copper' ? 'badge-purple' : 'badge-gold')}">
                    ${(t.metal || 'gold').toUpperCase()}
                </span>
            </td>
            <td style="font-family:var(--font-mono);font-size:13px">${formatGrams(t.grams)}</td>
            <td style="font-family:var(--font-mono)">${formatINR(t.ratePerGram)}/g</td>
            <td style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold)">${formatINR(t.value || t.goldValue || t.silverValue || t.copperValue)}</td>
            <td><span class="badge ${isProcessing ? 'badge-pending' : 'badge-success'}">${t.status}</span></td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(t.createdAt)}</td>
            <td style="text-align:right">
                ${isProcessing ? `<button class="btn btn-success btn-sm" onclick="approveSellPayout('${t._id}', '${t.metal}', ${t.value || t.goldValue || t.silverValue || t.copperValue})"><i class="fas fa-check"></i> Approve Payout</button>` : `<span style="font-size:12px;color:var(--text-dim)">Approved</span>`}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function approveSellPayout(id, metal, amt) {
    if (!confirm(`Approve ₹${amt} ${metal} sell payout release to user's wallet?`)) return;
    try {
        const res = await api(`/admin/sell-approvals/${id}/approve?metal=${metal}`, {
            method: "PATCH",
            body: JSON.stringify({ metal })
        });

        if (res.success) {
            toast("Sell payout approved and credited to wallet", "success");
            loadSellApprovals();
            if (typeof loadDashboard === "function") loadDashboard();
        } else {
            toast(res.message || "Failed to approve payout", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

// ── 5. WALLET TRANSACTION LEDGER & AUDIT TRAIL ────────────────
let allWalletLedger = [];
let ledgerPage = 1;
let ledgerSearchQuery = "";

async function loadWalletLedger(page = 1) {
    ledgerPage = page;
    const body = document.getElementById("wallet-ledger-table-body");
    if (!body) return;

    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading wallet transaction ledger...</div></div>`;

    const params = new URLSearchParams({ page, limit: 25 });
    if (ledgerSearchQuery) params.append("search", ledgerSearchQuery);

    const entryFilter = document.getElementById("ledger-entry-filter")?.value || "all";
    if (entryFilter !== "all") params.append("entryType", entryFilter);

    const typeFilter = document.getElementById("ledger-type-filter")?.value || "all";
    if (typeFilter !== "all") params.append("type", typeFilter);

    try {
        const res = await api(`/admin/wallet-ledger?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load wallet ledger"}</div></div>`;
            return;
        }

        allWalletLedger = res.data || [];

        // Update Summary KPI Cards
        if (res.stats) {
            setElText("ledger-stat-total", (res.stats.totalTxns || 0).toLocaleString("en-IN"));
            setElText("ledger-stat-credits", `+${formatINR(res.stats.totalCredits || 0)}`);
            setElHtml("ledger-stat-credit-count", `<i class="fas fa-plus-circle"></i> ${(res.stats.creditCount || 0).toLocaleString("en-IN")} credit entries`);
            setElText("ledger-stat-debits", `-${formatINR(res.stats.totalDebits || 0)}`);
            setElHtml("ledger-stat-debit-count", `<i class="fas fa-minus-circle"></i> ${(res.stats.debitCount || 0).toLocaleString("en-IN")} debit entries`);
            setElText("ledger-stat-net", formatINR(res.stats.netVolume || 0));
        }

        renderWalletLedgerTable(allWalletLedger);

        const info = document.getElementById("ledger-pagination-info");
        if (info) info.textContent = `Showing page ${res.pagination?.page || page} of ${res.pagination?.pages || 1} (${res.pagination?.total || allWalletLedger.length} total entries)`;

        const prevBtn = document.getElementById("btn-prev-ledger");
        const nextBtn = document.getElementById("btn-next-ledger");
        if (prevBtn) prevBtn.disabled = (res.pagination?.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.pagination?.page || 1) >= (res.pagination?.pages || 1);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading wallet ledger</div></div>`;
    }
}

function onLedgerSearch(val) {
    ledgerSearchQuery = (val || "").trim();
    loadWalletLedger(1);
}

function onLedgerFilterChange() {
    loadWalletLedger(1);
}

function prevLedgerPage() {
    if (ledgerPage > 1) loadWalletLedger(ledgerPage - 1);
}

function nextLedgerPage() {
    loadWalletLedger(ledgerPage + 1);
}

function renderWalletLedgerTable(items) {
    const body = document.getElementById("wallet-ledger-table-body");
    if (!body) return;

    if (!items || items.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-receipt" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No ledger transactions found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Adjust search or filters to locate specific ledger entries.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Transaction ID</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Previous Balance</th>
                    <th>New Balance</th>
                    <th>Reason / Remarks</th>
                    <th>Performed By</th>
                    <th>Date & Time</th>
                    <th style="text-align:right">Status</th>
                </tr>
            </thead>
            <tbody>`;

    const typeNames = {
        add: "Deposit / Credit",
        deduct: "Manual Deduction",
        gold_buy: "Gold Buy",
        gold_sell: "Gold Sell Payout",
        silver_buy: "Silver Buy",
        silver_sell: "Silver Sell Payout",
        copper_buy: "Copper Buy",
        copper_sell: "Copper Sell Payout",
        withdraw: "Bank Withdrawal",
        refund: "Refund / Reversal",
        coin_redeem: "Coin Redemption",
        manual_credit: "Manual Credit",
        manual_debit: "Manual Debit"
    };

    items.forEach(t => {
        const u = t.user || {};
        const isCredit = t.entryType === "credit";
        const amtStr = isCredit ? `+${formatINR(t.amount)}` : `-${formatINR(t.amount)}`;
        const amtColor = isCredit ? "#10b981" : "#ef4444";
        const typeLabel = typeNames[t.type] || t.type;
        const txnId = t.txnId || `TXN-WAL-${String(t._id).slice(-8).toUpperCase()}`;

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:11.5px;letter-spacing:0.5px">
                        ${txnId}
                    </span>
                    <button class="btn-icon-secondary" onclick="copyTxnIdToClipboard('${txnId}')" title="Copy Txn ID" style="width:24px;height:24px;padding:0">
                        <i class="fas fa-copy" style="font-size:10px"></i>
                    </button>
                </div>
            </td>
            <td>
                <div style="font-weight:700;color:#fff;font-size:13px">${u.name || 'Anonymous Customer'}</div>
                <div style="font-size:11px;color:var(--text-dim)">${u.phone || u.email || '—'}</div>
            </td>
            <td>
                <div style="display:flex;flex-direction:column;gap:3px">
                    <span class="badge ${isCredit ? 'badge-pill-success' : 'badge-danger'}" style="font-size:10px;font-weight:700;width:max-content">
                        ${isCredit ? '● Credit (+)' : '▼ Debit (-)'}
                    </span>
                    <span style="font-size:11px;color:var(--text-muted)">${typeLabel}</span>
                </div>
            </td>
            <td>
                <span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:${amtColor}">
                    ${amtStr}
                </span>
            </td>
            <td>
                <span style="font-family:var(--font-mono);font-size:12.5px;color:var(--text-muted)">
                    ${formatINR(t.balanceBefore || 0)}
                </span>
            </td>
            <td>
                <span style="font-family:var(--font-mono);font-size:13.5px;font-weight:800;color:#fff">
                    ${formatINR(t.balanceAfter || 0)}
                </span>
            </td>
            <td>
                <div style="font-weight:600;color:#e2e8f0;font-size:12.5px">${t.reason || t.note || '—'}</div>
            </td>
            <td>
                <div style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-dim)">
                    <i class="fas fa-user-shield" style="font-size:11px;color:var(--gold)"></i>
                    <span>${t.adminName || 'System'}</span>
                </div>
            </td>
            <td>
                <div style="font-size:12px;color:#fff;font-weight:600">${t.formattedDate || 'Today'}</div>
                <div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono)">${t.formattedTime || ''}</div>
            </td>
            <td style="text-align:right">
                <span class="badge ${t.status === 'success' ? 'badge-pill-success' : (t.status === 'pending' ? 'badge-amber' : 'badge-danger')}">
                    ${(t.status || 'success').toUpperCase()}
                </span>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function copyTxnIdToClipboard(txnId) {
    if (!txnId) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txnId).then(() => {
            toast(`Transaction ID "${txnId}" copied to clipboard!`, "success");
        }).catch(() => {
            prompt("Copy Transaction ID:", txnId);
        });
    } else {
        prompt("Copy Transaction ID:", txnId);
    }
}

// ── 6. User Modal & Details Embedded Live Ledger ───────────────
async function loadUserWalletLedger(userId, targetId = "user-modal-ledger-mount") {
    const mount = document.getElementById(targetId);
    if (!mount || !userId) return;

    mount.innerHTML = `<div style="padding:15px;text-align:center;color:var(--text-dim);font-size:12px"><i class="fas fa-spinner fa-spin"></i> Loading user wallet ledger...</div>`;

    try {
        const res = await api(`/admin/users/${userId}/wallet-ledger`);
        if (!res.success || !res.data || res.data.length === 0) {
            mount.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-dim);font-size:12px"><i class="fas fa-receipt" style="opacity:0.5"></i> No wallet transactions recorded yet for this customer.</div>`;
            return;
        }

        let html = `
        <table style="width:100%;font-size:11.5px;border-collapse:collapse">
            <thead>
                <tr style="border-bottom:1px solid var(--border);color:var(--text-dim);text-align:left">
                    <th style="padding:6px 8px">Type</th>
                    <th style="padding:6px 8px">Amount</th>
                    <th style="padding:6px 8px">Previous</th>
                    <th style="padding:6px 8px">New Balance</th>
                    <th style="padding:6px 8px">Reason</th>
                    <th style="padding:6px 8px">Admin</th>
                    <th style="padding:6px 8px;text-align:right">Date & Time</th>
                </tr>
            </thead>
            <tbody>`;

        res.data.forEach(t => {
            const isCredit = t.entryType === "credit";
            const amtStr = isCredit ? `+${formatINR(t.amount)}` : `-${formatINR(t.amount)}`;
            const amtColor = isCredit ? "#10b981" : "#ef4444";

            html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                <td style="padding:6px 8px">
                    <span class="badge ${isCredit ? 'badge-pill-success' : 'badge-danger'}" style="font-size:9.5px;padding:2px 6px">
                        ${isCredit ? 'Credit' : 'Debit'}
                    </span>
                </td>
                <td style="padding:6px 8px;font-family:var(--font-mono);font-weight:700;color:${amtColor}">
                    ${amtStr}
                </td>
                <td style="padding:6px 8px;font-family:var(--font-mono);color:var(--text-muted)">
                    ${formatINR(t.balanceBefore || 0)}
                </td>
                <td style="padding:6px 8px;font-family:var(--font-mono);font-weight:700;color:#fff">
                    ${formatINR(t.balanceAfter || 0)}
                </td>
                <td style="padding:6px 8px;color:#e2e8f0" title="${t.reason || t.note || ''}">
                    ${t.reason || t.note || 'Adjustment'}
                </td>
                <td style="padding:6px 8px;color:var(--text-dim)">
                    ${t.adminName || 'System'}
                </td>
                <td style="padding:6px 8px;text-align:right;color:var(--text-dim)">
                    ${t.formattedDate || ''} ${t.formattedTime || ''}
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        mount.innerHTML = html;
    } catch (e) {
        mount.innerHTML = `<div style="padding:10px;color:var(--danger);font-size:12px">Failed to load user ledger</div>`;
    }
}

