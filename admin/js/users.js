/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — User Management Controller
   ══════════════════════════════════════════════════════════════ */

let usersPage = 1;
let usersTotal = 0;
let userSearchTimeout = null;
let allUsers = [];

async function loadUsers(page = 1) {
    usersPage = page;
    const body = document.getElementById("users-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading users...</div></div>`;

    const search = document.getElementById("user-search")?.value.trim() || "";
    const role = document.getElementById("user-role-filter")?.value || "";
    const active = document.getElementById("user-active-filter")?.value || "";

    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.append("search", search);
    if (role) params.append("role", role);
    if (active) params.append("active", active);

    try {
        const res = await api(`/admin/users?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load users"}</div></div>`;
            return;
        }

        allUsers = res.data || [];
        usersTotal = res.total || 0;
        renderUsersTable(allUsers);
        
        const countBadge = document.getElementById("user-count-badge");
        if (countBadge) countBadge.textContent = `${res.total || 0} Total`;
        
        const pagInfo = document.getElementById("users-pagination-info");
        if (pagInfo) pagInfo.textContent = `Showing ${allUsers.length} of ${res.total || 0} users (Page ${res.page} of ${res.pages || 1})`;
        
        const prevBtn = document.getElementById("btn-prev-users");
        if (prevBtn) prevBtn.disabled = res.page <= 1;
        
        const nextBtn = document.getElementById("btn-next-users");
        if (nextBtn) nextBtn.disabled = res.page >= res.pages;
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading users</div></div>`;
    }
}

function resetAndLoadUsers() {
    usersPage = 1;
    loadUsers(1);
}

function debouncedSearchUsers() {
    clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(() => {
        usersPage = 1;
        loadUsers(1);
    }, 350);
}

function prevUsersPage() {
    if (usersPage > 1) loadUsers(usersPage - 1);
}

function nextUsersPage() {
    loadUsers(usersPage + 1);
}

function renderUsersTable(users) {
    const body = document.getElementById("users-body");
    if (!body) return;

    if (!users || users.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-user-slash" style="font-size:32px;color:var(--text-dim)"></i><div>No users found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>KYC</th>
                    <th>Wallet Balance</th>
                    <th>Gold (24K)</th>
                    <th>Silver (999)</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    users.forEach(u => {
        const rawStatus = (u.kycStatus || (u.kycVerified ? "approved" : "not_submitted")).toLowerCase().trim();
        let kycBadge = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.06);color:var(--text-dim)"><i class="fas fa-minus-circle"></i> Not Submitted</span>`;

        if (rawStatus === "approved" || rawStatus === "verified" || u.kycVerified === true) {
            kycBadge = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Approved</span>`;
        } else if (rawStatus === "pending") {
            kycBadge = `<span class="badge badge-warning"><i class="fas fa-clock"></i> Pending Review</span>`;
        } else if (rawStatus === "rejected") {
            kycBadge = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Rejected</span>`;
        }

        const statusBadge = u.isActive !== false
            ? `<span class="badge badge-success">Active</span>`
            : `<span class="badge badge-danger">Inactive</span>`;

        const goldGrams = u.goldInvestments?.grams || 0;
        const silverGrams = u.silverInvestments?.grams || 0;
        const walletBal = u.walletBalance !== undefined ? u.walletBalance : (u.wallet?.balance || 0);

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${u.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${u.email || ''} ${u.phone ? `• ${u.phone}` : ''}</div>
            </td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-info'}">${u.role || 'user'}</span></td>
            <td>${kycBadge}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${formatINR(walletBal)}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--gold)">${formatGrams(goldGrams)}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--silver)">${formatGrams(silverGrams)}</td>
            <td>${statusBadge}</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDate(u.createdAt)}</td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u._id}')">
                        <i class="fas fa-edit"></i> Manage
                    </button>
                    <button class="btn-icon" title="Delete User" onclick="deleteUser('${u._id}')">
                        <i class="fas fa-trash" style="color:var(--danger)"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── User Management Modal ──────────────────────────────────────
let activeUserId = null;

async function openUserModal(id) {
    activeUserId = id;
    let u = allUsers.find(x => x._id === id);

    if (!u && typeof userInvestmentsData !== "undefined") {
        u = userInvestmentsData.find(x => x._id === id);
    }

    const modal = document.getElementById("user-modal");
    if (!modal) return;

    // Fallback fetch if user not in current page memory
    if (!u) {
        try {
            const res = await api(`/admin/users/${id}`);
            if (res.success && res.data) {
                u = res.data;
            }
        } catch (e) {
            console.error("Error fetching user details", e);
        }
    }

    if (!u) return;

    // 1. Basic Details
    document.getElementById("user-id").value = u._id;
    document.getElementById("user-name").value = u.name || "";
    document.getElementById("user-email").value = u.email || "";
    document.getElementById("user-phone").value = u.phone || "";
    document.getElementById("user-role").value = u.role || "user";
    document.getElementById("user-active").checked = u.isActive !== false;

    const kycSelect = document.getElementById("user-kyc-status");
    if (kycSelect) {
        kycSelect.value = u.kycStatus || (u.kycVerified ? "approved" : "not_submitted");
    }

    // 2. User Wallet
    const walletBal = u.walletBalance !== undefined ? u.walletBalance : (u.wallet?.balance || 0);
    const balEl = document.getElementById("user-wallet-balance");
    if (balEl) balEl.textContent = formatINR(walletBal);
    
    const addAmtInput = document.getElementById("user-wallet-add-amt");
    if (addAmtInput) addAmtInput.value = "";
    
    const showTxCheck = document.getElementById("user-wallet-show-tx");
    if (showTxCheck) showTxCheck.checked = true;

    // 3. Investment Breakdown
    const breakdownEl = document.getElementById("user-investment-breakdown");
    if (breakdownEl) {
        let breakHtml = "";

        // Gold breakdown
        if (u.goldInvestments) {
            const goldAmt = u.goldInvestments.totalInvested || 0;
            const goldGrams = u.goldInvestments.grams || 0;
            const goldAvg = u.goldInvestments.avgBuyPrice || 0;
            const goldVal = u.goldInvestments.currentValue || 0;
            const goldPL = u.goldInvestments.profitLoss || 0;
            const goldPLC = goldPL >= 0 ? "var(--success)" : "var(--danger)";

            breakHtml += `
            <div style="margin-top:10px;padding:12px;background:var(--surface2);border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="font-weight:700;color:var(--gold);margin-bottom:6px;display:flex;align-items:center;gap:6px">
                    <i class="fas fa-coins"></i> Digital Gold Holdings (24K)
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12.5px">
                    <div>Weight: <strong style="font-family:var(--font-mono)">${formatGrams(goldGrams)}</strong></div>
                    <div>Avg Buy Price: <strong style="font-family:var(--font-mono)">${formatINR(goldAvg)}/g</strong></div>
                    <div>Total Spent: <strong style="font-family:var(--font-mono);color:#fff">${formatINR(goldAmt)}</strong></div>
                    <div>Current Value: <strong style="font-family:var(--font-mono);color:var(--gold)">${formatINR(goldVal)}</strong></div>
                </div>
                <div style="font-size:12.5px;margin-top:6px;color:${goldPLC}">
                    Profit/Loss: <strong style="font-family:var(--font-mono)">${goldPL >= 0 ? '+' : ''}${formatINR(goldPL)}</strong>
                </div>
            </div>`;
        }

        // Silver breakdown
        if (u.silverInvestments) {
            const silverAmt = u.silverInvestments.totalInvested || 0;
            const silverGrams = u.silverInvestments.grams || 0;
            const silverAvg = u.silverInvestments.avgBuyPrice || 0;
            const silverVal = u.silverInvestments.currentValue || 0;
            const silverPL = u.silverInvestments.profitLoss || 0;
            const silverPLC = silverPL >= 0 ? "var(--success)" : "var(--danger)";

            breakHtml += `
            <div style="margin-top:10px;padding:12px;background:var(--surface2);border-radius:var(--radius-md);border:1px solid var(--border)">
                <div style="font-weight:700;color:var(--silver);margin-bottom:6px;display:flex;align-items:center;gap:6px">
                    <i class="fas fa-cubes"></i> Digital Silver Holdings (999)
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12.5px">
                    <div>Weight: <strong style="font-family:var(--font-mono)">${formatGrams(silverGrams)}</strong></div>
                    <div>Avg Buy Price: <strong style="font-family:var(--font-mono)">${formatINR(silverAvg)}/g</strong></div>
                    <div>Total Spent: <strong style="font-family:var(--font-mono);color:#fff">${formatINR(silverAmt)}</strong></div>
                    <div>Current Value: <strong style="font-family:var(--font-mono);color:var(--silver)">${formatINR(silverVal)}</strong></div>
                </div>
                <div style="font-size:12.5px;margin-top:6px;color:${silverPLC}">
                    Profit/Loss: <strong style="font-family:var(--font-mono)">${silverPL >= 0 ? '+' : ''}${formatINR(silverPL)}</strong>
                </div>
            </div>`;
        }

        const totalInv = (u.goldInvestments?.totalInvested || 0) + (u.silverInvestments?.totalInvested || 0);
        const totalVal = (u.goldInvestments?.currentValue || 0) + (u.silverInvestments?.currentValue || 0);
        // Real Estate Bricks Breakdown
        const propItems = u.propertyInvestments?.items || [];
        if (propItems.length > 0) {
            breakHtml += `
            <div style="font-size:12.5px;font-weight:700;color:#fff;margin-bottom:6px;display:flex;align-items:center;gap:6px">
                <i class="fas fa-building" style="color:var(--purple)"></i> Fractional Real Estate (${propItems.length} Bricks)
            </div>
            <div class="table-wrap" style="margin-bottom:1rem;background:var(--surface2);border-radius:var(--radius-sm)">
                <table style="font-size:12px">
                    <thead>
                        <tr>
                            <th>Property</th>
                            <th>Bricks</th>
                            <th>Invested</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${propItems.map(p => `
                            <tr>
                                <td style="font-weight:600;color:#fff">${p.title}</td>
                                <td><span class="badge badge-info">${p.bricks} Bricks</span></td>
                                <td style="color:var(--gold);font-family:var(--font-mono)">${formatINR(p.amount)}</td>
                                <td style="color:var(--text-dim)">${formatDate(p.date)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
        } else {
            breakHtml += `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:1rem">
                <i class="fas fa-building" style="opacity:0.5"></i> No active real estate brick investments.
            </div>`;
        }

        // Digi Bullion Breakdown (Gold, Silver, Copper)
        const goldGrams = u.goldInvestments?.grams || 0;
        const goldWorth = u.goldInvestments?.totalInvested || 0;
        const silverGrams = u.silverInvestments?.grams || 0;
        const silverWorth = u.silverInvestments?.totalInvested || 0;
        const copperGrams = u.copperInvestments?.grams || 0;
        const copperWorth = u.copperInvestments?.totalInvested || 0;

        breakHtml += `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:0.5rem">
            <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);padding:10px;border-radius:var(--radius-sm)">
                <div style="font-size:10.5px;color:var(--gold);font-weight:700;text-transform:uppercase"><i class="fas fa-coins"></i> 24K Digital Gold</div>
                <div style="font-size:1.05rem;font-weight:800;color:var(--gold);margin-top:2px;font-family:var(--font-mono)">${formatGrams(goldGrams)}</div>
                <div style="font-size:10.5px;color:var(--text-dim)">Invested: ${formatINR(goldWorth)}</div>
            </div>
            <div style="background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.2);padding:10px;border-radius:var(--radius-sm)">
                <div style="font-size:10.5px;color:var(--silver);font-weight:700;text-transform:uppercase"><i class="fas fa-cubes"></i> 999 Fine Silver</div>
                <div style="font-size:1.05rem;font-weight:800;color:var(--silver);margin-top:2px;font-family:var(--font-mono)">${formatGrams(silverGrams)}</div>
                <div style="font-size:10.5px;color:var(--text-dim)">Invested: ${formatINR(silverWorth)}</div>
            </div>
            <div style="background:rgba(234,88,12,0.06);border:1px solid rgba(234,88,12,0.25);padding:10px;border-radius:var(--radius-sm)">
                <div style="font-size:10.5px;color:var(--copper);font-weight:700;text-transform:uppercase"><i class="fas fa-layer-group"></i> 999 Pure Copper</div>
                <div style="font-size:1.05rem;font-weight:800;color:var(--copper);margin-top:2px;font-family:var(--font-mono)">${formatGrams(copperGrams)}</div>
                <div style="font-size:10.5px;color:var(--text-dim)">Invested: ${formatINR(copperWorth)}</div>
            </div>
        </div>`;

        breakdownEl.innerHTML = breakHtml;
    }

    // Load customer's wallet audit ledger in modal
    if (typeof loadUserWalletLedger === "function") {
        loadUserWalletLedger(u._id);
    }

    modal.style.display = "flex";
}

function closeUserModal() {
    const modal = document.getElementById("user-modal");
    if (modal) modal.style.display = "none";
    activeUserId = null;
}

// ── Wallet Management: Add (+) and Deduct (-) Money ───────────
async function adjustUserWallet(action = "add") {
    const id = document.getElementById("user-id")?.value || activeUserId;
    if (!id) {
        toast("No user selected", "warning");
        return;
    }

    const amtInput = document.getElementById("user-wallet-amt") || document.getElementById("user-wallet-add-amt");
    const amount = parseFloat(amtInput?.value);
    const note = document.getElementById("user-wallet-note")?.value?.trim() || "";

    if (isNaN(amount) || amount <= 0) {
        toast("Please enter a valid amount greater than ₹0", "warning");
        if (amtInput) amtInput.focus();
        return;
    }

    const isAdd = action === "add";
    const btn = document.getElementById(isAdd ? "user-wallet-add-btn" : "user-wallet-deduct-btn");
    const otherBtn = document.getElementById(isAdd ? "user-wallet-deduct-btn" : "user-wallet-add-btn");

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isAdd ? "Crediting..." : "Debiting..."}`;
    }
    if (otherBtn) otherBtn.disabled = true;

    const endpoint = isAdd ? `/admin/users/${id}/add-money` : `/admin/users/${id}/deduct-money`;

    try {
        const data = await api(endpoint, {
            method: "POST",
            body: JSON.stringify({ amount, reason: note, note })
        });

        if (data.success) {
            toast(data.message || (isAdd ? "Money credited successfully ✓" : "Money debited successfully ✓"), "success");
            
            const balEl = document.getElementById("user-wallet-balance");
            if (balEl) balEl.textContent = formatINR(data.balance);
            
            if (amtInput) amtInput.value = "";
            const noteInput = document.getElementById("user-wallet-note");
            if (noteInput) noteInput.value = "";

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) u.walletBalance = data.balance;
            if (typeof userInvestmentsData !== "undefined") {
                let ui = userInvestmentsData.find(x => x._id === id);
                if (ui) ui.walletBalance = data.balance;
            }

            // Real-time refresh of embedded modal audit ledger and global ledger
            if (typeof loadUserWalletLedger === "function") loadUserWalletLedger(id);
            if (typeof loadWalletLedger === "function") loadWalletLedger(ledgerPage || 1);
            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || (isAdd ? "Failed to add money" : "Failed to deduct money"), "danger");
        }
    } catch (err) {
        toast(`Network error ${isAdd ? "adding" : "deducting"} money`, "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = isAdd ? `<i class="fas fa-plus-circle"></i> Add Money (+)` : `<i class="fas fa-minus-circle"></i> Deduct Money (-)`;
        }
        if (otherBtn) otherBtn.disabled = false;
    }
}

// Backward compatibility alias
function addMoneyToUserWallet() {
    return adjustUserWallet("add");
}

async function recalculateUserVault(paramId) {
    const id = paramId || document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    const btn = document.getElementById("user-recalculate-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Recalculating...`;
    }

    try {
        const data = await api(`/admin/users/${id}/recalculate-vault`, {
            method: "POST"
        });

        if (data.success) {
            toast(data.message || "Vault balance recalculated successfully ✓", "success");
            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to recalculate vault balance", "danger");
        }
    } catch (err) {
        toast("Network error", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-sync-alt"></i> Recalculate Vault Balance`;
        }
    }
}

// ── Developer / Admin Testing Reset Functions ──────────────────────────────
async function resetUserWalletData(paramId) {
    const id = paramId || document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    if (!confirm("Are you sure you want to reset this user's wallet balance and transaction history to ₹0?")) {
        return;
    }

    const btn = document.getElementById("user-reset-wallet-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resetting...`;
    }

    try {
        const data = await api(`/admin/users/${id}/reset-wallet`, { method: "POST" });
        if (data.success) {
            toast(data.message || "Wallet reset to ₹0 successfully ✓", "success");
            
            const balEl = document.getElementById("user-wallet-balance");
            if (balEl) balEl.textContent = formatINR(0);

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) u.walletBalance = 0;
            if (typeof userInvestmentsData !== "undefined") {
                let ui = userInvestmentsData.find(x => x._id === id);
                if (ui) ui.walletBalance = 0;
            }

            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to reset wallet", "danger");
        }
    } catch (err) {
        toast("Network error resetting wallet", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-wallet"></i> Reset Wallet & Logs (₹0)`;
        }
    }
}

async function resetUserVaultData(paramId) {
    const id = paramId || document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    if (!confirm("Are you sure you want to clear all Gold, Silver, and Copper trades and reset vault holdings to 0.0000g for this user?")) {
        return;
    }

    const btn = document.getElementById("user-reset-vault-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Clearing...`;
    }

    try {
        const data = await api(`/admin/users/${id}/reset-vault`, { method: "POST" });
        if (data.success) {
            toast(data.message || "Bullion trades and vault holdings reset to 0 ✓", "success");

            // Update modal breakdown if open
            const breakdownEl = document.getElementById("user-investment-breakdown");
            if (breakdownEl) {
                breakdownEl.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:0.5rem">
                    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--gold);font-weight:700;text-transform:uppercase"><i class="fas fa-coins"></i> 24K Digital Gold</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--gold);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                    <div style="background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.2);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--silver);font-weight:700;text-transform:uppercase"><i class="fas fa-cubes"></i> 999 Fine Silver</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--silver);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                    <div style="background:rgba(234,88,12,0.06);border:1px solid rgba(234,88,12,0.25);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--copper);font-weight:700;text-transform:uppercase"><i class="fas fa-layer-group"></i> 999 Pure Copper</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--copper);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                </div>`;
            }

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) {
                u.goldInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.silverInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.copperInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.totalInvested = 0;
            }
            if (typeof userInvestmentsData !== "undefined") {
                let ui = userInvestmentsData.find(x => x._id === id);
                if (ui) {
                    ui.goldInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.silverInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.copperInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.totalInvested = 0;
                }
            }

            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to reset vault", "danger");
        }
    } catch (err) {
        toast("Network error resetting vault", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-coins"></i> Clear Bullion Trades & Vault (0g)`;
        }
    }
}

async function resetUserRewardsData(paramId) {
    const id = paramId || document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    if (!confirm("Are you sure you want to reset Reward Points (0 pts), Spin Count (3 spins available), and clear all points history for this user?")) {
        return;
    }

    const btn = document.getElementById("user-reset-rewards-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resetting Rewards...`;
    }

    try {
        const data = await api(`/admin/users/${id}/reset-rewards`, { method: "POST" });
        if (data.success) {
            toast(data.message || "Reward points, spins, and history reset to 0 ✓", "success");

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) {
                u.rewardPoints = 0;
                u.referralBalance = 0;
            }
            if (typeof loadUsers === "function") loadUsers(usersPage);
        } else {
            toast(data.message || "Failed to reset rewards", "danger");
        }
    } catch (err) {
        toast("Network error resetting rewards", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-gift"></i> Reset Rewards & Spins (0 pts, 3 spins)`;
        }
    }
}

async function resetAllUserTestingData(paramId) {
    const id = paramId || document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    if (!confirm("⚠️ FULL RESET CONFIRMATION:\n\nAre you sure you want to completely wipe all testing data for this user?\n\n• Bullion Vault (Gold, Silver, Copper → 0.0000g)\n• All Buy/Sell Trade Logs (Purged)\n• Wallet Balance (→ ₹0) & Logs (Purged)\n• Reward Points (→ 0 pts) & Spin Count (→ 3 Spins)\n• Reward & Referral History (Purged)\n\nThis action cannot be undone.")) {
        return;
    }

    const btn = document.getElementById("user-reset-all-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Wiping Data...`;
    }

    try {
        const data = await api(`/admin/users/${id}/reset-all`, { method: "POST" });
        if (data.success) {
            toast(data.message || "All user testing data reset to 0 ✓", "success");

            // Update UI elements in modal
            const balEl = document.getElementById("user-wallet-balance");
            if (balEl) balEl.textContent = formatINR(0);

            const breakdownEl = document.getElementById("user-investment-breakdown");
            if (breakdownEl) {
                breakdownEl.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:0.5rem">
                    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--gold);font-weight:700;text-transform:uppercase"><i class="fas fa-coins"></i> 24K Digital Gold</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--gold);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                    <div style="background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.2);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--silver);font-weight:700;text-transform:uppercase"><i class="fas fa-cubes"></i> 999 Fine Silver</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--silver);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                    <div style="background:rgba(234,88,12,0.06);border:1px solid rgba(234,88,12,0.25);padding:10px;border-radius:var(--radius-sm)">
                        <div style="font-size:10.5px;color:var(--copper);font-weight:700;text-transform:uppercase"><i class="fas fa-layer-group"></i> 999 Pure Copper</div>
                        <div style="font-size:1.05rem;font-weight:800;color:var(--copper);margin-top:2px;font-family:var(--font-mono)">0.0000 g</div>
                        <div style="font-size:10.5px;color:var(--text-dim)">Invested: ₹0</div>
                    </div>
                </div>`;
            }

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) {
                u.walletBalance = 0;
                u.rewardPoints = 0;
                u.referralBalance = 0;
                u.goldInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.silverInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.copperInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                u.totalInvested = 0;
            }
            if (typeof userInvestmentsData !== "undefined") {
                let ui = userInvestmentsData.find(x => x._id === id);
                if (ui) {
                    ui.walletBalance = 0;
                    ui.rewardPoints = 0;
                    ui.referralBalance = 0;
                    ui.goldInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.silverInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.copperInvestments = { grams: 0, totalInvested: 0, currentValue: 0, profitLoss: 0 };
                    ui.totalInvested = 0;
                }
            }

            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to wipe user data", "danger");
        }
    } catch (err) {
        toast("Network error wiping user data", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-bomb"></i> Wipe All User Data (Full Reset)`;
        }
    }
}

async function saveUser() {
    const id = document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    const payload = {
        name: document.getElementById("user-name")?.value.trim(),
        phone: document.getElementById("user-phone")?.value.trim(),
        role: document.getElementById("user-role")?.value || "user",
        kycStatus: document.getElementById("user-kyc-status")?.value || "not_submitted",
        isActive: document.getElementById("user-active")?.checked !== false,
    };

    if (!payload.name) {
        toast("Name is required", "warning");
        return;
    }

    const btn = document.getElementById("user-save-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        const data = await api(`/admin/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });

        if (data.success) {
            toast("User updated successfully ✓", "success");
            closeUserModal();
            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to update user", "danger");
        }
    } catch (e) {
        toast("Network error updating user", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `Save Changes`;
        }
    }
}

async function deleteUser(id) {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
    try {
        const res = await api(`/admin/users/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("User deleted", "success");
            loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(res.message || "Failed to delete user", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
