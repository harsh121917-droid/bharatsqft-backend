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
        const kycBadge = u.kycVerified
            ? `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Verified</span>`
            : `<span class="badge badge-pending"><i class="fas fa-clock"></i> Pending</span>`;

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
        const totalPL = (u.goldInvestments?.profitLoss || 0) + (u.silverInvestments?.profitLoss || 0);
        const totalPLC = totalPL >= 0 ? "var(--success)" : "var(--danger)";

        breakHtml += `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="font-size:13px;margin-bottom:4px">💰 Total Bullion Investment: <strong style="color:#fff">${formatINR(totalInv)}</strong></div>
            <div style="font-size:13px;margin-bottom:4px">📈 Current Valuation: <strong style="color:var(--gold)">${formatINR(totalVal)}</strong></div>
            <div style="font-size:14px;font-weight:700;color:${totalPLC}">💼 Net Portfolio P/L: ${totalPL >= 0 ? '+' : ''}${formatINR(totalPL)}</div>
        </div>`;

        breakdownEl.innerHTML = breakHtml;
    }

    modal.style.display = "flex";
}

function closeUserModal() {
    const modal = document.getElementById("user-modal");
    if (modal) modal.style.display = "none";
    activeUserId = null;
}

async function addMoneyToUserWallet() {
    const id = document.getElementById("user-id")?.value || activeUserId;
    const amount = parseFloat(document.getElementById("user-wallet-add-amt")?.value);
    const showTransaction = document.getElementById("user-wallet-show-tx")?.checked !== false;

    if (isNaN(amount) || amount <= 0) {
        toast("Please enter a valid amount greater than 0", "warning");
        return;
    }

    const btn = document.getElementById("user-wallet-add-btn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Adding...`;
    }

    try {
        const data = await api(`/admin/users/${id}/add-money`, {
            method: "POST",
            body: JSON.stringify({ amount, showTransaction })
        });

        if (data.success) {
            toast("Money added successfully ✓", "success");
            const balEl = document.getElementById("user-wallet-balance");
            if (balEl) balEl.textContent = formatINR(data.balance);
            
            const addAmtInput = document.getElementById("user-wallet-add-amt");
            if (addAmtInput) addAmtInput.value = "";

            // Update in-memory user lists
            let u = allUsers.find(x => x._id === id);
            if (u) u.walletBalance = data.balance;
            if (typeof userInvestmentsData !== "undefined") {
                let ui = userInvestmentsData.find(x => x._id === id);
                if (ui) ui.walletBalance = data.balance;
            }

            if (typeof loadUsers === "function") loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(data.message || "Failed to add money", "danger");
        }
    } catch (err) {
        toast("Network error adding money", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-plus-circle"></i> Add Money`;
        }
    }
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

async function saveUser() {
    const id = document.getElementById("user-id")?.value || activeUserId;
    if (!id) return;

    const payload = {
        name: document.getElementById("user-name")?.value.trim(),
        phone: document.getElementById("user-phone")?.value.trim(),
        role: document.getElementById("user-role")?.value || "user",
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
