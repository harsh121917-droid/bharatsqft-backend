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
    const segment = document.getElementById("user-segment-filter")?.value || "";
    const active = document.getElementById("user-active-filter")?.value || "";

    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.append("search", search);
    if (role) params.append("role", role);
    if (segment) params.append("segment", segment);
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
                    <th>Platform & Segment</th>
                    <th>KYC</th>
                    <th>Location</th>
                    <th>Wallet Balance</th>
                    <th>Gold (24K)</th>
                    <th>Silver (999)</th>
                    <th>Bricks</th>
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
        const propBricks = u.propertyInvestments?.totalBricks || (u.propertyInvestments?.items?.reduce((s, i) => s + (i.bricks || 0), 0)) || 0;
        const walletBal = u.walletBalance !== undefined ? u.walletBalance : (u.wallet?.balance || 0);

        // Ecosystem Segment & Login Indicators
        const seg = (u.ecosystemSegment || 'goldvikaone').toLowerCase();
        let segmentBadge = '';
        if (seg === 'both') {
            segmentBadge = `
            <div>
                <span class="badge" style="background:linear-gradient(135deg, rgba(168,85,247,0.25), rgba(245,158,11,0.25));color:#f3e8ff;border:1px solid #c084fc;font-weight:700;font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    <i class="fas fa-gem" style="color:#fbbf24"></i> Both (Gold + Bricks)
                </span>
                <div style="font-size:10px;color:#a78bfa;margin-top:3px;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-check-double"></i> <span>Both Apps Active</span>
                </div>
            </div>`;
        } else if (seg === 'vikaone') {
            segmentBadge = `
            <div>
                <span class="badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.4);font-weight:700;font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    <i class="fas fa-building"></i> Vikaone (Real Estate)
                </span>
                <div style="font-size:10px;color:#94a3b8;margin-top:3px;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-city"></i> <span>${u.lastLoginPlatform || 'Vikaone App / Web'}</span>
                </div>
            </div>`;
        } else {
            segmentBadge = `
            <div>
                <span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);font-weight:700;font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    <i class="fas fa-coins"></i> GoldVikaone (DigiGold)
                </span>
                <div style="font-size:10px;color:#94a3b8;margin-top:3px;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-mobile-alt"></i> <span>${u.lastLoginPlatform || 'GoldVikaone App'}</span>
                </div>
            </div>`;
        }

        // Location formatting
        const loc = u.location;
        let locationCell = "";
        if (loc && loc.latitude !== undefined && loc.longitude !== undefined && loc.latitude !== null && loc.longitude !== null) {
            const placeName = loc.city ? `${loc.city}${loc.state ? ', ' + loc.state : ''}` : `${Number(loc.latitude).toFixed(3)}, ${Number(loc.longitude).toFixed(3)}`;
            const mapUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
            locationCell = `
            <div>
                <div style="font-weight:600;color:#fff;font-size:12px;display:flex;align-items:center;gap:4px">
                    <i class="fas fa-map-marker-alt" style="color:#ef4444;font-size:11px"></i>
                    <span>${placeName}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
                    <span style="font-size:10.5px;color:var(--text-dim);font-family:var(--font-mono)">${Number(loc.latitude).toFixed(2)}, ${Number(loc.longitude).toFixed(2)}</span>
                    <a href="${mapUrl}" target="_blank" class="badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;font-size:9.5px;text-decoration:none;padding:1px 5px;border-radius:4px" title="Open in Google Maps">
                        <i class="fas fa-external-link-alt"></i> Map
                    </a>
                    <button class="btn-icon" style="padding:1px 5px;font-size:10px;color:#f87171;cursor:pointer;background:rgba(239,68,68,0.12);border-radius:3px;border:1px solid rgba(239,68,68,0.25)" title="Delete / Reset Location" onclick="clearUserLocation('${u._id}', event)">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
        } else {
            locationCell = `<span class="badge" style="background:rgba(239,68,68,0.12);color:#f87171;font-size:10px;padding:3px 7px;border:1px solid rgba(239,68,68,0.25)"><i class="fas fa-map-marker-slash"></i> Not Captured</span>`;
        }

        html += `
        <tr style="cursor:pointer" onclick="viewUserDetails('${u._id}')">
            <td>
                <div style="font-weight:700;color:#fff;font-size:13.5px">${u.name || '—'}</div>
                <div style="font-size:11.5px;color:var(--text-dim)">${u.email || ''} ${u.phone ? `• ${u.phone}` : ''}</div>
                <div style="display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap">
                    ${u.referralCode ? `<span class="badge font-mono" style="background:rgba(212,160,23,0.12);color:var(--gold);font-size:10px" title="User Referral Code"><i class="fas fa-ticket-alt"></i> ${u.referralCode}</span>` : ''}
                    ${u.referredByInfo ? `<span class="badge" style="background:rgba(168,85,247,0.12);color:#c084fc;font-size:10px" title="Invited by this user"><i class="fas fa-user-check"></i> Ref by: ${u.referredByInfo.name || u.referredByInfo.phone || 'User'}</span>` : ''}
                    <span class="badge" style="background:rgba(16,185,129,0.12);color:#34d399;font-size:10px" title="Referral Earnings & Points"><i class="fas fa-gift"></i> +${formatINR(u.referralRewardsEarned || 0)} (${u.referralsCount || 0} refs · ${u.totalRewardPointsEarned || u.rewardPoints || 0} pts)</span>
                </div>
            </td>
            <td>${segmentBadge}</td>
            <td>${kycBadge}</td>
            <td>${locationCell}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold)">${formatINR(walletBal)}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--gold)">${formatGrams(goldGrams)}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--silver)">${formatGrams(silverGrams)}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:#c084fc;font-weight:700">${propBricks} Bricks</td>
            <td>${statusBadge}</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDate(u.createdAt)}</td>
            <td style="text-align:right" onclick="event.stopPropagation()">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewUserDetails('${u._id}')" style="font-size:11px;padding:4px 9px;font-weight:700;background:linear-gradient(135deg, #f59e0b, #d97706);border:none;color:#fff" title="Open Complete User Details & Portfolio">
                        <i class="fas fa-chart-pie"></i> Details
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openUserModal('${u._id}')" title="Quick Edit" style="font-size:11px;padding:4px 8px">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" title="Delete User" onclick="event.stopPropagation(); deleteUser('${u._id}')">
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

async function clearUserLocation(userId, event) {
    if (event) event.stopPropagation();
    if (!confirm("Are you sure you want to delete this user's captured location? The user will be required to re-verify their GPS location next time they open the mobile app.")) {
        return;
    }

    try {
        const res = await api(`/admin/users/${userId}/location`, { method: "DELETE" });
        if (res.success) {
            toast("User location deleted successfully", "success");
            if (activeUserId === userId) {
                if (document.getElementById("page-userdetails")?.classList.contains("active")) {
                    viewUserDetails(userId);
                } else {
                    // Fetch fresh user details to update modal
                    try {
                        const freshRes = await api(`/admin/users/${userId}`);
                        if (freshRes.success && freshRes.data) {
                            const idx = allUsers.findIndex(x => x._id === userId);
                            if (idx !== -1) allUsers[idx] = freshRes.data;
                            openUserModal(userId);
                        }
                    } catch (_) {}
                }
            }
            loadUsers(usersPage);
        } else {
            toast(res.message || "Failed to delete location", "danger");
        }
    } catch (e) {
        toast("Network error deleting location", "danger");
    }
}

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

    // 📍 1b. Customer Live Location Details
    const locContainer = document.getElementById("user-location-info-card");
    if (locContainer) {
        const loc = u.location;
        if (loc && loc.latitude !== undefined && loc.longitude !== undefined && loc.latitude !== null && loc.longitude !== null) {
            const mapUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
            locContainer.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(59,130,246,0.08), rgba(15,23,42,0.6));border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);display:flex;align-items:center;justify-content:center;color:#60a5fa;font-size:18px;flex-shrink:0">
                        <i class="fas fa-location-arrow"></i>
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                            <span>${loc.city || 'Verified GPS Location'}${loc.state ? ', ' + loc.state : ''}${loc.country ? ' (' + loc.country + ')' : ''}</span>
                            <span class="badge badge-success" style="font-size:10px"><i class="fas fa-check-circle"></i> Captured</span>
                        </div>
                        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
                            GPS Coordinates: <strong style="font-family:var(--font-mono);color:#fff">${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}</strong>
                            ${loc.pincode ? ` · PIN: <strong style="color:#fff">${loc.pincode}</strong>` : ''}
                            ${loc.ip ? ` · IP: <span style="font-family:var(--font-mono);color:var(--text-dim)">${loc.ip}</span>` : ''}
                        </div>
                        ${loc.address ? `<div style="font-size:11.5px;color:var(--text-dim);margin-top:2px;max-width:520px">${loc.address}</div>` : ''}
                        ${loc.capturedAt ? `<div style="font-size:10.5px;color:var(--text-dim);margin-top:3px"><i class="far fa-clock"></i> Captured: ${formatDateTime(loc.capturedAt)}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <a href="${mapUrl}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:12px;display:inline-flex;align-items:center;gap:6px">
                        <i class="fas fa-map-marked-alt" style="color:#60a5fa"></i> Open Google Maps
                    </a>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="clearUserLocation('${u._id}')" style="font-size:12px;display:inline-flex;align-items:center;gap:6px">
                        <i class="fas fa-trash-alt"></i> Delete Location
                    </button>
                </div>
            </div>`;
        } else {
            locContainer.innerHTML = `
            <div style="background:rgba(239,68,68,0.06);border:1px dashed rgba(239,68,68,0.3);border-radius:var(--radius-md);padding:12px 16px;display:flex;align-items:center;gap:12px">
                <div style="width:36px;height:36px;border-radius:8px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;color:var(--danger);font-size:16px;flex-shrink:0">
                    <i class="fas fa-map-marker-slash"></i>
                </div>
                <div>
                    <div style="font-size:12.5px;font-weight:700;color:#f87171">Location Not Captured Yet</div>
                    <div style="font-size:11.5px;color:var(--text-dim)">The customer has not yet granted GPS location permission in the app. The app will repeatedly prompt them until captured.</div>
                </div>
            </div>`;
        }
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
            if (typeof refreshIfUserDetailsActive === "function") refreshIfUserDetailsActive();
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
            if (typeof refreshIfUserDetailsActive === "function") refreshIfUserDetailsActive();
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
            if (typeof refreshIfUserDetailsActive === "function") refreshIfUserDetailsActive();
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
            if (typeof refreshIfUserDetailsActive === "function") refreshIfUserDetailsActive();
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
            if (typeof refreshIfUserDetailsActive === "function") refreshIfUserDetailsActive();
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
            if (document.getElementById("page-userdetails")?.classList.contains("active")) {
                showPage("users");
            }
            loadUsers(usersPage);
            if (typeof loadUserInvestments === "function") loadUserInvestments();
        } else {
            toast(res.message || "Failed to delete user", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

/* ══════════════════════════════════════════════════════════════
   USER DETAILS EXECUTIVE SUITE — CONTROLLER & TAB RENDERERS
   Gold, Silver, Copper & Property Bricks Portfolios
   ══════════════════════════════════════════════════════════════ */

let currentUserDetailsData = null;

function toggleUdActionsMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById("ud-actions-menu");
    if (menu) menu.classList.toggle("show");
}

document.addEventListener("click", () => {
    const menu = document.getElementById("ud-actions-menu");
    if (menu && menu.classList.contains("show")) {
        menu.classList.remove("show");
    }
});

function copyUdText(elementId, toastMsg = "Copied to clipboard") {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.textContent || el.innerText || "").trim();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            toast(toastMsg, "success");
        }).catch(() => {
            toast(toastMsg, "info");
        });
    } else {
        toast(toastMsg, "info");
    }
}

function quickScrollToSection(sectionId) {
    switchUdTab('overview');
    setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.45)";
            setTimeout(() => { el.style.boxShadow = ""; }, 1800);
        }
    }, 120);
}

function switchUdTab(tabName) {
    document.querySelectorAll(".ud-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".ud-tab-pane").forEach(p => p.classList.remove("active"));

    const btn = document.getElementById(`ud-tab-btn-${tabName}`);
    if (btn) btn.classList.add("active");

    const pane = document.getElementById(`ud-pane-${tabName}`);
    if (pane) pane.classList.add("active");
}

function syncUserModalFields(u) {
    if (!u) return;
    const uid = document.getElementById("user-id");
    if (uid) uid.value = u._id || "";
    const uname = document.getElementById("user-name");
    if (uname) uname.value = u.name || "";
    const uemail = document.getElementById("user-email");
    if (uemail) uemail.value = u.email || "";
    const uphone = document.getElementById("user-phone");
    if (uphone) uphone.value = u.phone || "";
    const urole = document.getElementById("user-role");
    if (urole) urole.value = u.role || "user";
    const uactive = document.getElementById("user-active");
    if (uactive) uactive.checked = u.isActive !== false;
    const ukyc = document.getElementById("user-kyc-status");
    if (ukyc) ukyc.value = u.kycStatus || (u.kycVerified ? "approved" : "not_submitted");
}

function refreshIfUserDetailsActive() {
    if (activeUserId && document.getElementById("page-userdetails")?.classList.contains("active")) {
        viewUserDetails(activeUserId);
    }
}

function udSetText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val !== undefined && val !== null) ? val : "—";
}

function udSetHtml(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (val !== undefined && val !== null) ? val : "";
}

function buildFallbackOverview(u) {
    const goldGrams = u.goldInvestments?.grams || u.goldBalance?.totalGrams || 0;
    const goldInvested = u.goldInvestments?.totalInvested || u.goldBalance?.investedAmt || 0;
    const silverGrams = u.silverInvestments?.grams || u.silverBalance?.totalGrams || 0;
    const silverInvested = u.silverInvestments?.totalInvested || u.silverBalance?.investedAmt || 0;
    const copperGrams = u.copperInvestments?.grams || u.copperBalance?.totalGrams || 0;
    const copperInvested = u.copperInvestments?.totalInvested || u.copperBalance?.investedAmt || 0;

    let propBricks = 0;
    let propInvested = 0;
    const propItems = [];
    if (u.propertyInvestments?.items) {
        u.propertyInvestments.items.forEach(p => {
            propBricks += (p.bricks || 0);
            propInvested += (p.totalAmount || 0);
            propItems.push({
                id: p.propertyId,
                title: p.propertyName || "Real Estate Property",
                bricks: p.bricks || 0,
                totalAmount: p.totalAmount || 0,
                ownershipPercent: p.ownershipPercent || 0,
                expectedYield: 8.5,
                status: "paid"
            });
        });
    }

    const walletBal = u.walletBalance !== undefined ? u.walletBalance : (u.wallet?.balance || 0);
    const totalInv = +(goldInvested + silverInvested + copperInvested + propInvested).toFixed(2);
    const goldWorth = +(goldGrams * 8000).toFixed(2);
    const silverWorth = +(silverGrams * 92).toFixed(2);
    const copperWorth = +(copperGrams * 0.85).toFixed(2);
    const totalVal = +(goldWorth + silverWorth + copperWorth + propInvested).toFixed(2);
    const totalReturns = +(totalVal - totalInv).toFixed(2);

    return {
        goldBalance: goldGrams,
        goldWorth: goldWorth || goldInvested,
        goldInvested: goldInvested,
        goldAvgPrice: goldGrams > 0 ? +(goldInvested / goldGrams).toFixed(2) : 0,
        goldProfitLoss: +(goldWorth - goldInvested).toFixed(2),
        silverBalance: silverGrams,
        silverWorth: silverWorth || silverInvested,
        silverInvested: silverInvested,
        silverAvgPrice: silverGrams > 0 ? +(silverInvested / silverGrams).toFixed(2) : 0,
        silverProfitLoss: +(silverWorth - silverInvested).toFixed(2),
        copperBalance: copperGrams,
        copperWorth: copperWorth || copperInvested,
        copperInvested: copperInvested,
        copperAvgPrice: copperGrams > 0 ? +(copperInvested / copperGrams).toFixed(2) : 0,
        copperProfitLoss: +(copperWorth - copperInvested).toFixed(2),
        propertyBricks: propBricks,
        propertyInvested: propInvested,
        propertyItems: propItems,
        walletBalance: walletBal,
        totalInvested: totalInv,
        totalCurrentVal: totalVal,
        totalReturns: totalReturns,
        returnsPct: totalInv > 0 ? +((totalReturns / totalInv) * 100).toFixed(2) : 0
    };
}

async function loadUserDetailsSecondaryData(userId, userObj = {}) {
    if (!userId) return;

    // 1. Fetch Transactions (Unified endpoint + Wallet Ledger fallback)
    const fetchTransactions = async () => {
        const unified = [];
        try {
            const res = await api(`/admin/users/${userId}/transactions`);
            if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
                res.data.forEach(t => unified.push(t));
            }
        } catch (_) {}

        // Supplementary check: wallet-ledger ensures cash wallet activity is always present
        try {
            const wlRes = await api(`/admin/users/${userId}/wallet-ledger`);
            if (wlRes?.success && Array.isArray(wlRes.data) && wlRes.data.length > 0) {
                wlRes.data.forEach(w => {
                    const exists = unified.some(u => String(u.id || u._id) === String(w._id));
                    if (!exists) {
                        unified.push({
                            id: w._id,
                            type: w.type || (w.entryType === "credit" ? "wallet_credit" : "wallet_debit"),
                            metal: "Wallet",
                            grams: 0,
                            amount: w.amount || 0,
                            date: w.createdAt,
                            status: "success",
                            invoiceNo: w.txnId || (w.reason || "Wallet Adjustment")
                        });
                    }
                });
            }
        } catch (_) {}

        if (unified.length > 0) {
            unified.sort((a, b) => new Date(b.date) - new Date(a.date));
            if (currentUserDetailsData && String(currentUserDetailsData._id) === String(userId)) {
                currentUserDetailsData.recentTransactions = unified;
                renderUdRecentTxns(unified);
                renderUdTransactionsTab(currentUserDetailsData);
                renderUdGoldTab(currentUserDetailsData);
                renderUdSilverTab(currentUserDetailsData);
                renderUdCopperTab(currentUserDetailsData);
            }
        }
    };

    // 2. Fetch SIPs
    const fetchSips = async () => {
        try {
            let sips = [];
            // Try query by direct user id first
            try {
                const userRes = await api(`/admin/sips?user=${encodeURIComponent(userId)}`);
                if (userRes?.success && Array.isArray(userRes.data) && userRes.data.length > 0) {
                    sips = userRes.data;
                }
            } catch (_) {}

            // If empty, fallback to search query
            if (sips.length === 0) {
                const searchVal = userObj.phone || userObj.name || userObj.email || userId;
                const res = await api(`/admin/sips?search=${encodeURIComponent(searchVal)}`);
                if (res?.success && Array.isArray(res.data)) {
                    sips = res.data.filter(s =>
                        String(s.user?._id || s.user) === String(userId) ||
                        (userObj.phone && s.user?.phone === userObj.phone) ||
                        (userObj.email && s.user?.email === userObj.email)
                    );
                }
            }

            if (currentUserDetailsData && String(currentUserDetailsData._id) === String(userId)) {
                currentUserDetailsData.sips = sips;
                renderUdActiveSips(sips);
                renderUdInvestmentsTab(currentUserDetailsData);
            }
        } catch (e) {
            console.warn("Could not fetch user SIPs:", e.message);
        }
    };

    // 3. Fetch Schemes
    const fetchSchemes = async () => {
        try {
            let schemes = [];
            // Try query by direct user id first
            try {
                const userRes = await api(`/admin/schemes/enrollments?user=${encodeURIComponent(userId)}`);
                if (userRes?.success && Array.isArray(userRes.data) && userRes.data.length > 0) {
                    schemes = userRes.data;
                }
            } catch (_) {}

            // If empty, fallback to search query
            if (schemes.length === 0) {
                const searchVal = userObj.phone || userObj.name || userObj.email || userId;
                const res = await api(`/admin/schemes/enrollments?search=${encodeURIComponent(searchVal)}`);
                if (res?.success && Array.isArray(res.data)) {
                    schemes = res.data.filter(sc =>
                        String(sc.user?._id || sc.user) === String(userId) ||
                        (userObj.phone && sc.user?.phone === userObj.phone) ||
                        (userObj.email && sc.user?.email === userObj.email)
                    );
                }
            }

            if (currentUserDetailsData && String(currentUserDetailsData._id) === String(userId)) {
                currentUserDetailsData.schemes = schemes;
                renderUdActiveSchemes(schemes);
                renderUdInvestmentsTab(currentUserDetailsData);
            }
        } catch (e) {
            console.warn("Could not fetch user schemes:", e.message);
        }
    };

    await Promise.allSettled([fetchTransactions(), fetchSips(), fetchSchemes()]);
}

async function loadUserTransactionsList(userId) {
    return loadUserDetailsSecondaryData(userId, currentUserDetailsData || {});
}

function renderUserDetailsContent(u) {
    if (!u) return;
    const bcName = document.getElementById("ud-bc-name");
    if (bcName) bcName.textContent = u.name || "Customer Profile";

    // Avatar
    const avatarMount = document.getElementById("ud-avatar-mount");
    if (avatarMount) {
        if (u.avatar || u.profilePicture) {
            avatarMount.innerHTML = `<img src="${u.avatar || u.profilePicture}" class="ud-avatar-img" alt="${u.name || 'User'}" onerror="this.outerHTML='<div class=\\'ud-avatar-fallback\\'>${(u.name || 'U').charAt(0).toUpperCase()}</div>'" />`;
        } else {
            avatarMount.innerHTML = `<div class="ud-avatar-fallback">${(u.name || 'U').charAt(0).toUpperCase()}</div>`;
        }
    }

    // Profile Details
    udSetText("ud-header-name", u.name || "—");

    const statusEl = document.getElementById("ud-header-status");
    if (statusEl) {
        statusEl.className = u.isActive !== false ? "ud-badge-active" : "ud-badge-inactive";
        statusEl.innerHTML = `<i class="fas fa-circle" style="font-size:6px"></i> ${u.isActive !== false ? "Active" : "Inactive"}`;
    }

    udSetText("ud-header-id", `USR${(u._id || '').slice(-6).toUpperCase()}`);
    udSetText("ud-header-phone", u.phone || "No phone provided");
    udSetText("ud-header-email", u.email || "No email");
    udSetText("ud-header-joined", formatDate(u.createdAt));
    udSetText("ud-header-lastlogin", u.lastLogin ? formatDateTime(u.lastLogin) : "Never logged in");

    // Ecosystem & Login Source Badges in Hero Header
    const seg = (u.ecosystemSegment || 'goldvikaone').toLowerCase();
    const segBadge = document.getElementById("ud-header-segment");
    if (segBadge) {
        if (seg === 'both') {
            segBadge.style.background = "linear-gradient(135deg, rgba(168,85,247,0.3), rgba(245,158,11,0.3))";
            segBadge.style.color = "#f3e8ff";
            segBadge.style.border = "1px solid #c084fc";
            segBadge.innerHTML = `<i class="fas fa-gem" style="color:#fbbf24"></i> Both: DigiGold + Real Estate`;
        } else if (seg === 'vikaone') {
            segBadge.style.background = "rgba(59,130,246,0.18)";
            segBadge.style.color = "#60a5fa";
            segBadge.style.border = "1px solid rgba(59,130,246,0.4)";
            segBadge.innerHTML = `<i class="fas fa-building"></i> Real Estate / Vikaone`;
        } else {
            segBadge.style.background = "rgba(245,158,11,0.18)";
            segBadge.style.color = "#fbbf24";
            segBadge.style.border = "1px solid rgba(245,158,11,0.4)";
            segBadge.innerHTML = `<i class="fas fa-coins"></i> DigiGold / GoldVikaone`;
        }
    }

    const loginPill = document.getElementById("ud-header-login-source");
    if (loginPill) {
        const logins = Array.isArray(u.loginPlatforms) && u.loginPlatforms.length > 0
            ? u.loginPlatforms.map(p => p === 'goldvikaone' ? 'GoldVikaone' : (p === 'vikaone' ? 'Vikaone' : p)).join(" & ")
            : (u.lastLoginPlatform || (seg === 'vikaone' ? 'Vikaone App' : 'GoldVikaone App'));
        loginPill.innerHTML = `<i class="fas fa-mobile-alt"></i> ${logins}`;
    }

    // KYC Status in Hero
    const rawKyc = (u.kycStatus || u.kyc?.status || (u.kycVerified ? "approved" : "not_submitted")).toLowerCase().trim();
    const kycPill = document.getElementById("ud-kyc-pill");
    const kycStatusText = document.getElementById("ud-kyc-status-text");
    const panIcon = document.getElementById("ud-kyc-pan-icon");
    const aadhaarIcon = document.getElementById("ud-kyc-aadhaar-icon");
    const kycDate = document.getElementById("ud-kyc-verified-date");

    if (rawKyc === "approved" || rawKyc === "verified" || u.kycVerified === true) {
        if (kycPill) kycPill.className = "ud-kyc-status-pill verified";
        if (kycStatusText) kycStatusText.textContent = "Verified";
        if (panIcon) panIcon.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981"></i>`;
        if (aadhaarIcon) aadhaarIcon.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981"></i>`;
        if (kycDate) kycDate.textContent = formatDate(u.kyc?.updatedAt || u.updatedAt);
    } else if (rawKyc === "pending") {
        if (kycPill) kycPill.className = "ud-kyc-status-pill pending";
        if (kycStatusText) kycStatusText.textContent = "Pending Review";
        if (panIcon) panIcon.innerHTML = `<i class="fas fa-clock" style="color:#f59e0b"></i>`;
        if (aadhaarIcon) aadhaarIcon.innerHTML = `<i class="fas fa-clock" style="color:#f59e0b"></i>`;
        if (kycDate) kycDate.textContent = "Under Verification";
    } else if (rawKyc === "rejected") {
        if (kycPill) kycPill.className = "ud-kyc-status-pill rejected";
        if (kycStatusText) kycStatusText.textContent = "Rejected";
        if (panIcon) panIcon.innerHTML = `<i class="fas fa-times-circle" style="color:#ef4444"></i>`;
        if (aadhaarIcon) aadhaarIcon.innerHTML = `<i class="fas fa-times-circle" style="color:#ef4444"></i>`;
        if (kycDate) kycDate.textContent = "Rejected by Admin";
    } else {
        if (kycPill) kycPill.className = "ud-kyc-status-pill not_submitted";
        if (kycStatusText) kycStatusText.textContent = "Not Submitted";
        if (panIcon) panIcon.innerHTML = `<i class="fas fa-minus-circle" style="color:#64748b"></i>`;
        if (aadhaarIcon) aadhaarIcon.innerHTML = `<i class="fas fa-minus-circle" style="color:#64748b"></i>`;
        if (kycDate) kycDate.textContent = "Not Completed";
    }

    // Overview Tiles in Hero
    const ov = u.overview || buildFallbackOverview(u);
    const goldGrams = ov.goldBalance !== undefined ? ov.goldBalance : (u.goldInvestments?.grams || 0);
    const silverGrams = ov.silverBalance !== undefined ? ov.silverBalance : (u.silverInvestments?.grams || 0);
    const copperGrams = ov.copperBalance !== undefined ? ov.copperBalance : (u.copperInvestments?.grams || 0);
    const propBricks = ov.propertyBricks !== undefined ? ov.propertyBricks : (u.propertyInvestments?.totalBricks || (u.propertyInvestments?.items?.reduce((s, i) => s + (i.bricks || 0), 0)) || 0);
    const walletBal = u.walletBalance !== undefined ? u.walletBalance : (ov.walletBalance !== undefined ? ov.walletBalance : (u.wallet?.balance || 0));
    const totalInvested = ov.totalInvested !== undefined ? ov.totalInvested : (u.totalInvested || 0);
    const totalReturns = ov.totalReturns !== undefined ? ov.totalReturns : 0;

    udSetText("ud-ov-gold", formatGrams(goldGrams));
    udSetText("ud-ov-silver", formatGrams(silverGrams));
    udSetText("ud-ov-copper", formatGrams(copperGrams));
    udSetText("ud-ov-bricks", `${propBricks} Bricks`);
    udSetText("ud-ov-wallet", formatINR(walletBal));
    udSetText("ud-ov-invested", formatINR(totalInvested));
    udSetText("ud-ov-returns", `${totalReturns >= 0 ? '+' : ''}${formatINR(totalReturns)}`);
    udSetText("ud-ov-referral", u.referralCode || "—");

    // Tab Overview: KPI Cards
    udSetText("ud-kpi-gold-grams", formatGrams(goldGrams));
    udSetText("ud-kpi-gold-worth", formatINR(ov.goldWorth || (goldGrams * 8000)));
    udSetText("ud-kpi-gold-avg", `${formatINR(ov.goldAvgPrice || 0)} /g`);
    const goldPlEl = document.getElementById("ud-kpi-gold-pl");
    if (goldPlEl) {
        const pl = ov.goldProfitLoss || 0;
        goldPlEl.textContent = `${pl >= 0 ? '+' : ''}${formatINR(pl)}`;
        goldPlEl.style.color = pl >= 0 ? "#34d399" : "#f87171";
    }

    udSetText("ud-kpi-silver-grams", formatGrams(silverGrams));
    udSetText("ud-kpi-silver-worth", formatINR(ov.silverWorth || (silverGrams * 92)));
    udSetText("ud-kpi-silver-avg", `${formatINR(ov.silverAvgPrice || 0)} /g`);
    const silverPlEl = document.getElementById("ud-kpi-silver-pl");
    if (silverPlEl) {
        const pl = ov.silverProfitLoss || 0;
        silverPlEl.textContent = `${pl >= 0 ? '+' : ''}${formatINR(pl)}`;
        silverPlEl.style.color = pl >= 0 ? "#34d399" : "#f87171";
    }

    udSetText("ud-kpi-copper-grams", formatGrams(copperGrams));
    udSetText("ud-kpi-copper-worth", formatINR(ov.copperWorth || (copperGrams * 0.85)));
    udSetText("ud-kpi-copper-avg", `${formatINR(ov.copperAvgPrice || 0)} /g`);
    const copperPlEl = document.getElementById("ud-kpi-copper-pl");
    if (copperPlEl) {
        const pl = ov.copperProfitLoss || 0;
        copperPlEl.textContent = `${pl >= 0 ? '+' : ''}${formatINR(pl)}`;
        copperPlEl.style.color = pl >= 0 ? "#34d399" : "#f87171";
    }

    udSetText("ud-kpi-property-bricks", `${propBricks} Bricks`);
    udSetText("ud-kpi-property-worth", `${formatINR(ov.propertyInvested || 0)} Invested`);
    udSetText("ud-kpi-property-count", `${ov.propertyItems?.length || 0} Properties`);

    udSetText("ud-kpi-total-invested", formatINR(totalInvested));
    udSetText("ud-kpi-invested-breakdown", `Gold: ${formatINR(ov.goldInvested || 0)} · Silver: ${formatINR(ov.silverInvested || 0)} · Copper: ${formatINR(ov.copperInvested || 0)}`);

    udSetText("ud-kpi-total-returns", `${totalReturns >= 0 ? '+' : ''}${formatINR(totalReturns)}`);
    const retPctEl = document.getElementById("ud-kpi-returns-pct");
    if (retPctEl) {
        const pct = ov.returnsPct || 0;
        retPctEl.innerHTML = `<i class="fas fa-${pct >= 0 ? 'caret-up' : 'caret-down'}"></i> ${pct >= 0 ? '+' : ''}${pct}%`;
        retPctEl.style.color = pct >= 0 ? "#34d399" : "#f87171";
    }

    udSetText("ud-kpi-wallet-bal", formatINR(walletBal));
    udSetText("ud-fast-wallet-bal", formatINR(walletBal));
    udSetText("ud-kpi-total-val", formatINR(ov.totalCurrentVal || (totalInvested + totalReturns)));

    // Render Recent Txns
    renderUdRecentTxns(u.recentTransactions || []);

    // Render Active SIPs
    renderUdActiveSips(u.sips || []);

    // Render Schemes
    renderUdActiveSchemes(u.schemes || []);

    // Render Property Bricks Mini
    renderUdPropertyBricksMini(ov.propertyItems || []);

    // Render KYC Info
    renderUdKycInfo(u);

    // Render Bank Details
    renderUdBankDetails(u.bank || u.kyc?.bankDetails);

    // Render Device & Login
    renderUdDeviceInfo(u);

    // Render Live Location Card (PRESERVED)
    renderUdLocationCard(u);

    // Load Live Mini Wallet Ledger
    if (typeof loadUserWalletLedger === "function") {
        loadUserWalletLedger(u._id, "ud-mini-ledger-mount");
    }

    // Render All Sub-Tabs
    renderUdGoldTab(u);
    renderUdSilverTab(u);
    renderUdCopperTab(u);
    renderUdPropertyTab(u);
    renderUdInvestmentsTab(u);
    renderUdTransactionsTab(u);
    renderUdWalletTab(u);
    renderUdKycTab(u);
}

async function viewUserDetails(id) {
    activeUserId = id;
    showPage("userdetails");

    const bcName = document.getElementById("ud-bc-name");
    if (bcName) bcName.textContent = "Loading Customer...";

    switchUdTab("overview");

    // 1. Instant Cache-First Render: Look in allUsers (Users table) or userInvestmentsData (Investments table)
    let cached = (Array.isArray(allUsers) ? allUsers : []).find(x => String(x._id) === String(id));
    if (!cached && typeof userInvestmentsData !== "undefined" && Array.isArray(userInvestmentsData)) {
        cached = userInvestmentsData.find(x => String(x._id) === String(id));
    }

    if (cached) {
        currentUserDetailsData = cached;
        syncUserModalFields(cached);
        renderUserDetailsContent(cached);
        loadUserDetailsSecondaryData(id, cached);
    }

    try {
        const res = await api(`/admin/users/${id}`);
        if (!res || !res.success || !res.data) {
            if (!cached) {
                toast(res?.message || "Failed to load user details", "danger");
                if (bcName) bcName.textContent = "Customer Not Found";
            }
            return;
        }

        const u = res.data;
        // Merge cached table fields with fresh API response
        const merged = { ...(cached || {}), ...u };

        // If merged lacks investment breakdown or overview, fetch enriched pipeline via search fallback
        if ((!merged.goldInvestments && !merged.overview) || (!merged.propertyInvestments && !merged.overview)) {
            try {
                const searchVal = merged.phone || merged.email || merged.name || id;
                const enrichRes = await api(`/admin/users?search=${encodeURIComponent(searchVal)}`);
                if (enrichRes?.success && Array.isArray(enrichRes.data)) {
                    const found = enrichRes.data.find(x => String(x._id) === String(id));
                    if (found) {
                        Object.assign(merged, found);
                    }
                }
            } catch (errEnrich) {
                console.warn("Could not enrich user details via search fallback:", errEnrich);
            }
        }

        // Ensure overview is calculated if server response didn't supply it
        if (!merged.overview) {
            merged.overview = buildFallbackOverview(merged);
        } else {
            const ov = merged.overview;
            if (ov.goldBalance === undefined) ov.goldBalance = merged.goldInvestments?.grams || 0;
            if (ov.silverBalance === undefined) ov.silverBalance = merged.silverInvestments?.grams || 0;
            if (ov.copperBalance === undefined) ov.copperBalance = merged.copperInvestments?.grams || 0;
            if (ov.propertyBricks === undefined) ov.propertyBricks = merged.propertyInvestments?.totalBricks || (merged.propertyInvestments?.items?.reduce((s, i) => s + (i.bricks || 0), 0)) || 0;
            if (ov.walletBalance === undefined) ov.walletBalance = merged.walletBalance || 0;
        }

        currentUserDetailsData = merged;
        syncUserModalFields(merged);
        renderUserDetailsContent(merged);

        // Fetch full transactions, active SIPs, and enrolled schemes in parallel
        loadUserDetailsSecondaryData(id, merged);

    } catch (err) {
        console.error("Error viewing user details:", err);
        if (!cached) {
            toast("Network error loading user details", "danger");
            if (bcName) bcName.textContent = "Error Loading Customer";
        }
    }
}

function renderUdRecentTxns(txns) {
    const mount = document.getElementById("ud-recent-txns-mount");
    if (!mount) return;
    if (!txns || txns.length === 0) {
        mount.innerHTML = `<div style="font-size:0.8rem;color:#64748b;padding:1rem 0;text-align:center"><i class="fas fa-receipt" style="opacity:0.4"></i> No recent transactions recorded.</div>`;
        return;
    }

    let html = `
    <table class="ud-mini-table">
        <thead>
            <tr>
                <th>Type</th>
                <th>Asset</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>`;

    txns.slice(0, 6).forEach(t => {
        let typeBadge = `<span class="ud-status-pill active">${(t.type || 'buy').toUpperCase()}</span>`;
        let assetBadge = `<span style="font-weight:700">${t.metal}</span>`;
        if (t.metal === 'Gold') assetBadge = `<span style="color:#f59e0b;font-weight:700"><i class="fas fa-coins"></i> Gold</span>`;
        else if (t.metal === 'Silver') assetBadge = `<span style="color:#cbd5e1;font-weight:700"><i class="fas fa-cubes"></i> Silver</span>`;
        else if (t.metal === 'Copper') assetBadge = `<span style="color:#ea580c;font-weight:700"><i class="fas fa-layer-group"></i> Copper</span>`;
        else if (t.metal === 'Property') assetBadge = `<span style="color:#c084fc;font-weight:700"><i class="fas fa-building"></i> Brick</span>`;

        html += `
        <tr>
            <td>${typeBadge}</td>
            <td>${assetBadge}</td>
            <td style="font-family:var(--font-mono)">${t.metal === 'Property' ? `${t.grams} Bricks` : formatGrams(t.grams)}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:#fff">${formatINR(t.amount)}</td>
            <td style="color:#94a3b8">${formatDate(t.date)}</td>
            <td><span class="ud-status-pill success">${t.status || 'Success'}</span></td>
        </tr>`;
    });

    html += `</tbody></table>`;
    mount.innerHTML = html;
}

function renderUdActiveSips(sips) {
    const mount = document.getElementById("ud-active-sips-mount");
    if (!mount) return;
    if (!sips || sips.length === 0) {
        mount.innerHTML = `<div style="font-size:0.8rem;color:#64748b;padding:1.5rem 0;text-align:center"><i class="fas fa-piggy-bank" style="font-size:24px;margin-bottom:6px;opacity:0.3"></i><br>No active SIP plans.</div>`;
        return;
    }

    let html = "";
    sips.slice(0, 4).forEach(s => {
        const metalColor = s.metal === 'silver' ? '#cbd5e1' : (s.metal === 'copper' ? '#ea580c' : '#f59e0b');
        const grams = s.accumulatedGrams !== undefined ? s.accumulatedGrams : (s.totalGrams || 0);
        const nextDate = s.nextInstallmentDate || s.nextDueDate || s.createdAt;
        html += `
        <div class="ud-sub-item-card">
            <div class="ud-sub-item-header">
                <span class="ud-sub-item-title"><i class="fas fa-coins" style="color:${metalColor}"></i> ${s.goalTitle || 'Wealth Building Plan'}</span>
                <span class="ud-status-pill success">${(s.status || 'Active').toUpperCase()}</span>
            </div>
            <div class="ud-sub-grid-2">
                <div>
                    <span class="ud-sub-label">Installment:</span>
                    <span class="ud-sub-val">${formatINR(s.installmentAmount || s.amount || 0)} / ${s.frequency || 'Month'}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Accumulated:</span>
                    <span class="ud-sub-val" style="color:${metalColor}">${formatGrams(grams)}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Cycles:</span>
                    <span class="ud-sub-val">${s.cyclesCompleted || s.paidCycles || 0} / ${s.totalCycles || s.durationMonths || 12}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Next Due:</span>
                    <span class="ud-sub-val">${formatDate(nextDate)}</span>
                </div>
            </div>
        </div>`;
    });
    mount.innerHTML = html;
}

function renderUdActiveSchemes(schemes) {
    const mount = document.getElementById("ud-active-schemes-mount");
    if (!mount) return;
    if (!schemes || schemes.length === 0) {
        mount.innerHTML = `<div style="font-size:0.8rem;color:#64748b;padding:1.5rem 0;text-align:center"><i class="fas fa-gem" style="font-size:24px;margin-bottom:6px;opacity:0.3"></i><br>No enrolled savings schemes.</div>`;
        return;
    }

    let html = "";
    schemes.slice(0, 4).forEach(sc => {
        const metalColor = sc.metal === 'silver' ? '#cbd5e1' : '#f59e0b';
        const grams = sc.totalGoldGrams !== undefined ? sc.totalGoldGrams : (sc.accumulatedGrams || 0);
        html += `
        <div class="ud-sub-item-card">
            <div class="ud-sub-item-header">
                <span class="ud-sub-item-title"><i class="fas fa-gem" style="color:${metalColor}"></i> ${sc.schemeName || 'Savings Scheme'}</span>
                <span class="ud-status-pill success">${(sc.status || 'Active').toUpperCase()}</span>
            </div>
            <div class="ud-sub-grid-2">
                <div>
                    <span class="ud-sub-label">Monthly:</span>
                    <span class="ud-sub-val">${formatINR(sc.monthlyAmount || sc.installmentAmount || 0)}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Paid:</span>
                    <span class="ud-sub-val">${sc.installmentsPaid || 0} / ${sc.durationMonths || 11}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Accumulated:</span>
                    <span class="ud-sub-val" style="color:${metalColor}">${formatGrams(grams)}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Invested:</span>
                    <span class="ud-sub-val">${formatINR(sc.totalInvested || 0)}</span>
                </div>
            </div>
        </div>`;
    });
    mount.innerHTML = html;
}

function renderUdPropertyBricksMini(items) {
    const mount = document.getElementById("ud-property-bricks-mount");
    if (!mount) return;
    if (!items || items.length === 0) {
        mount.innerHTML = `<div style="font-size:0.8rem;color:#64748b;padding:1rem 0;text-align:center"><i class="fas fa-building" style="opacity:0.4"></i> No active real estate bricks.</div>`;
        return;
    }

    let html = "";
    items.slice(0, 2).forEach(p => {
        html += `
        <div class="ud-sub-item-card">
            <div class="ud-sub-item-header">
                <span class="ud-sub-item-title"><i class="fas fa-building" style="color:#c084fc"></i> ${p.title}</span>
                <span class="ud-status-pill active">${p.bricks} Bricks</span>
            </div>
            <div class="ud-sub-grid-2">
                <div>
                    <span class="ud-sub-label">Location:</span>
                    <span class="ud-sub-val">${p.city ? `${p.city}, ${p.state || ''}` : 'Prime Hub'}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Invested:</span>
                    <span class="ud-sub-val" style="color:#f59e0b">${formatINR(p.totalAmount)}</span>
                </div>
                <div>
                    <span class="ud-sub-label">Ownership:</span>
                    <span class="ud-sub-val">${p.ownershipPercent || 0}%</span>
                </div>
                <div>
                    <span class="ud-sub-label">Exp. Yield:</span>
                    <span class="ud-sub-val" style="color:#34d399">${p.expectedYield || 8.5}% p.a.</span>
                </div>
            </div>
        </div>`;
    });
    mount.innerHTML = html;
}

function renderUdKycInfo(u) {
    const k = u.kyc || {};
    udSetText("ud-kyc-pan-val", k.panNumber || "Not Provided");
    udSetText("ud-kyc-aadhaar-val", k.aadhaarNumber ? `XXXX XXXX ${k.aadhaarNumber.slice(-4)}` : "Verified via App");
    udSetText("ud-kyc-name-val", k.fullName || u.name || "—");
    udSetText("ud-kyc-dob-val", k.dob ? formatDate(k.dob) : "—");
    
    let addr = "—";
    if (k.address) {
        addr = [k.address.line1, k.address.city, k.address.state, k.address.pincode].filter(Boolean).join(", ");
    } else if (u.location?.address) {
        addr = u.location.address;
    }
    udSetText("ud-kyc-address-val", addr || "No address on file");
}

function renderUdBankDetails(b) {
    if (!b) {
        udSetText("ud-bank-name-val", "No Bank Linked");
        const pill = document.getElementById("ud-bank-status-pill");
        if (pill) {
            pill.className = "ud-status-pill pending";
            pill.textContent = "Not Linked";
        }
        udSetText("ud-bank-acc-val", "—");
        udSetText("ud-bank-ifsc-val", "—");
        udSetText("ud-bank-holder-val", "—");
        return;
    }
    udSetText("ud-bank-name-val", b.bankName || "Linked Bank");
    const pill = document.getElementById("ud-bank-status-pill");
    if (pill) {
        pill.className = b.isVerified ? "ud-status-pill success" : "ud-status-pill pending";
        pill.innerHTML = b.isVerified ? `<i class="fas fa-check-circle"></i> Verified` : `<i class="fas fa-clock"></i> Pending`;
    }
    udSetText("ud-bank-acc-val", b.accountNumber ? `${b.accountNumber.slice(0, 4)}••••${b.accountNumber.slice(-4)}` : "—");
    udSetText("ud-bank-ifsc-val", b.ifsc || "—");
    udSetText("ud-bank-holder-val", b.accountHolder || "—");
}

function renderUdDeviceInfo(u) {
    udSetText("ud-dev-lastlogin", u.lastLogin ? formatDateTime(u.lastLogin) : "Never");
    udSetText("ud-dev-ip", u.location?.ip || "103.211.XX.XX (Dynamic)");
    
    const seg = (u.ecosystemSegment || 'goldvikaone').toLowerCase();
    const segText = seg === 'both'
        ? '🌟 Both (DigiGold Bullion + Real Estate Bricks)'
        : (seg === 'vikaone' ? '🏢 Vikaone (Vika DRX Real Estate)' : '🪙 GoldVikaone (DigiGold Bullion)');
    udSetText("ud-dev-segment", segText);

    const logins = Array.isArray(u.loginPlatforms) && u.loginPlatforms.length > 0
        ? u.loginPlatforms.map(p => p === 'goldvikaone' ? '📱 GoldVikaone App' : (p === 'vikaone' ? '🏢 Vikaone App' : p)).join(' & ')
        : (u.lastLoginPlatform || 'GoldVikaone Mobile App');
    udSetText("ud-dev-platform", logins);
}

function renderUdLocationCard(u) {
    const mount = document.getElementById("ud-location-mount");
    if (!mount) return;

    const loc = u.location;
    if (loc && loc.latitude !== undefined && loc.longitude !== undefined && loc.latitude !== null && loc.longitude !== null) {
        const placeName = loc.city ? `${loc.city}${loc.state ? ', ' + loc.state : ''}${loc.country ? ' (' + loc.country + ')' : ''}` : `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}`;
        const mapUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;

        mount.innerHTML = `
        <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.25);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
                <div style="font-size:13px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px">
                    <i class="fas fa-map-pin" style="color:#ef4444"></i> <span>${placeName}</span>
                    <span class="badge badge-success" style="font-size:9.5px"><i class="fas fa-check-circle"></i> GPS Verified</span>
                </div>
                <div style="font-size:11.5px;color:#94a3b8;margin-top:3px">
                    Coordinates: <strong style="font-family:var(--font-mono);color:#fff">${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}</strong>
                    ${loc.pincode ? ` · PIN: <strong style="color:#fff">${loc.pincode}</strong>` : ''}
                    ${loc.ip ? ` · IP: <span style="font-family:var(--font-mono);color:#94a3b8">${loc.ip}</span>` : ''}
                </div>
                ${loc.address ? `<div style="font-size:11px;color:#cbd5e1;margin-top:2px">${loc.address}</div>` : ''}
                ${loc.capturedAt ? `<div style="font-size:10.5px;color:#64748b;margin-top:3px"><i class="far fa-clock"></i> Captured: ${formatDateTime(loc.capturedAt)}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
                <a href="${mapUrl}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px">
                    <i class="fas fa-external-link-alt" style="color:#60a5fa"></i> Open Maps
                </a>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="clearUserLocation('${u._id}', event)" style="font-size:11.5px">
                    <i class="fas fa-trash-alt"></i> Delete Location
                </button>
            </div>
        </div>`;
    } else {
        mount.innerHTML = `
        <div style="background:rgba(239,68,68,0.06);border:1px dashed rgba(239,68,68,0.25);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;color:var(--danger);font-size:16px;flex-shrink:0">
                <i class="fas fa-map-marker-slash"></i>
            </div>
            <div>
                <div style="font-size:12.5px;font-weight:700;color:#f87171">Location Not Captured Yet</div>
                <div style="font-size:11px;color:#94a3b8">The customer has not yet granted GPS location permission in the app. The app will prompt on their next login.</div>
            </div>
        </div>`;
    }
}

async function adjustUserWalletFromDetails(action = "add") {
    const id = activeUserId;
    if (!id) {
        toast("No user active", "warning");
        return;
    }

    const amtInput = document.getElementById("ud-wallet-amount-input");
    const amount = parseFloat(amtInput?.value);
    const note = document.getElementById("ud-wallet-note-input")?.value?.trim() || "";

    if (isNaN(amount) || amount <= 0) {
        toast("Please enter a valid amount greater than ₹0", "warning");
        if (amtInput) amtInput.focus();
        return;
    }

    const isAdd = action === "add";
    const btn = document.getElementById(isAdd ? "btn-ud-add-money" : "btn-ud-deduct-money");
    const otherBtn = document.getElementById(isAdd ? "btn-ud-deduct-money" : "btn-ud-add-money");

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
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

            const newBalStr = formatINR(data.balance);
            const w1 = document.getElementById("ud-kpi-wallet-bal");
            if (w1) w1.textContent = newBalStr;
            const w2 = document.getElementById("ud-ov-wallet");
            if (w2) w2.textContent = newBalStr;
            const w3 = document.getElementById("ud-fast-wallet-bal");
            if (w3) w3.textContent = newBalStr;
            const w4 = document.getElementById("user-wallet-balance");
            if (w4) w4.textContent = newBalStr;

            if (amtInput) amtInput.value = "";
            const noteInput = document.getElementById("ud-wallet-note-input");
            if (noteInput) noteInput.value = "";

            if (typeof loadUserWalletLedger === "function") {
                loadUserWalletLedger(id, "ud-mini-ledger-mount");
                loadUserWalletLedger(id, "user-modal-ledger-mount");
            }
            if (typeof loadUsers === "function") loadUsers(usersPage);
        } else {
            toast(data.message || "Failed to adjust wallet balance", "danger");
        }
    } catch (err) {
        toast("Network error adjusting wallet", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = isAdd ? `<i class="fas fa-plus-circle"></i> Add Money (+)` : `<i class="fas fa-minus-circle"></i> Deduct Money (-)`;
        }
        if (otherBtn) otherBtn.disabled = false;
    }
}

// ── Portfolio Sub-Tabs Renderers ──────────────────────────────
function renderUdGoldTab(u) {
    const mount = document.getElementById("ud-gold-tab-content");
    if (!mount) return;
    const ov = u.overview || {};
    mount.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem">
        <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#f59e0b;font-weight:700">24K Gold Vault Balance</div>
            <div style="font-size:1.4rem;font-weight:800;color:#f59e0b;font-family:var(--font-mono)">${formatGrams(ov.goldBalance || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Average Acquisition Rate</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.goldAvgPrice || 0)} /g</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Total Money Spent</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.goldInvested || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Current Market Valuation</div>
            <div style="font-size:1.4rem;font-weight:800;color:#f59e0b;font-family:var(--font-mono)">${formatINR(ov.goldWorth || 0)}</div>
        </div>
        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#34d399;font-weight:700">Gold Profit / Loss</div>
            <div style="font-size:1.4rem;font-weight:800;color:${(ov.goldProfitLoss || 0) >= 0 ? '#34d399' : '#f87171'};font-family:var(--font-mono)">
                ${(ov.goldProfitLoss || 0) >= 0 ? '+' : ''}${formatINR(ov.goldProfitLoss || 0)}
            </div>
        </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px"><i class="fas fa-history" style="color:#f59e0b"></i> Gold Buy & Sell Trade Log</div>
    <div id="ud-gold-txns-mount">${renderMetalTxnTable(u.recentTransactions?.filter(t => t.metal === 'Gold'))}</div>`;
}

function renderUdSilverTab(u) {
    const mount = document.getElementById("ud-silver-tab-content");
    if (!mount) return;
    const ov = u.overview || {};
    mount.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem">
        <div style="background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#cbd5e1;font-weight:700">999 Silver Vault Balance</div>
            <div style="font-size:1.4rem;font-weight:800;color:#cbd5e1;font-family:var(--font-mono)">${formatGrams(ov.silverBalance || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Average Acquisition Rate</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.silverAvgPrice || 0)} /g</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Total Money Spent</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.silverInvested || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Current Market Valuation</div>
            <div style="font-size:1.4rem;font-weight:800;color:#cbd5e1;font-family:var(--font-mono)">${formatINR(ov.silverWorth || 0)}</div>
        </div>
        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#34d399;font-weight:700">Silver Profit / Loss</div>
            <div style="font-size:1.4rem;font-weight:800;color:${(ov.silverProfitLoss || 0) >= 0 ? '#34d399' : '#f87171'};font-family:var(--font-mono)">
                ${(ov.silverProfitLoss || 0) >= 0 ? '+' : ''}${formatINR(ov.silverProfitLoss || 0)}
            </div>
        </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px"><i class="fas fa-history" style="color:#cbd5e1"></i> Silver Buy & Sell Trade Log</div>
    <div id="ud-silver-txns-mount">${renderMetalTxnTable(u.recentTransactions?.filter(t => t.metal === 'Silver'))}</div>`;
}

function renderUdCopperTab(u) {
    const mount = document.getElementById("ud-copper-tab-content");
    if (!mount) return;
    const ov = u.overview || {};
    mount.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem">
        <div style="background:rgba(234,88,12,0.06);border:1px solid rgba(234,88,12,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#ea580c;font-weight:700">999 Copper Vault Balance</div>
            <div style="font-size:1.4rem;font-weight:800;color:#ea580c;font-family:var(--font-mono)">${formatGrams(ov.copperBalance || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Average Acquisition Rate</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.copperAvgPrice || 0)} /g</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Total Money Spent</div>
            <div style="font-size:1.4rem;font-weight:800;color:#fff;font-family:var(--font-mono)">${formatINR(ov.copperInvested || 0)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Current Market Valuation</div>
            <div style="font-size:1.4rem;font-weight:800;color:#ea580c;font-family:var(--font-mono)">${formatINR(ov.copperWorth || 0)}</div>
        </div>
        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#34d399;font-weight:700">Copper Profit / Loss</div>
            <div style="font-size:1.4rem;font-weight:800;color:${(ov.copperProfitLoss || 0) >= 0 ? '#34d399' : '#f87171'};font-family:var(--font-mono)">
                ${(ov.copperProfitLoss || 0) >= 0 ? '+' : ''}${formatINR(ov.copperProfitLoss || 0)}
            </div>
        </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px"><i class="fas fa-history" style="color:#ea580c"></i> Copper Buy & Sell Trade Log</div>
    <div id="ud-copper-txns-mount">${renderMetalTxnTable(u.recentTransactions?.filter(t => t.metal === 'Copper'))}</div>`;
}

function renderMetalTxnTable(txns) {
    if (!txns || txns.length === 0) {
        return `<div style="padding:15px;color:#64748b;font-size:12px;text-align:center">No trades found in this asset category.</div>`;
    }
    let h = `
    <table class="ud-mini-table">
        <thead>
            <tr>
                <th>Invoice</th>
                <th>Type</th>
                <th>Grams</th>
                <th>Total Value</th>
                <th>Date</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>`;
    txns.forEach(t => {
        h += `
        <tr>
            <td style="font-family:var(--font-mono);font-size:11px;color:#60a5fa">${t.invoiceNo || '—'}</td>
            <td><span class="ud-status-pill active">${(t.type || 'buy').toUpperCase()}</span></td>
            <td style="font-family:var(--font-mono);font-weight:700">${formatGrams(t.grams)}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:#fff">${formatINR(t.amount)}</td>
            <td style="color:#94a3b8">${formatDateTime(t.date)}</td>
            <td><span class="ud-status-pill success">${t.status || 'Success'}</span></td>
        </tr>`;
    });
    h += `</tbody></table>`;
    return h;
}

function renderUdPropertyTab(u) {
    const mount = document.getElementById("ud-property-tab-content");
    if (!mount) return;
    const items = u.overview?.propertyItems || [];
    if (items.length === 0) {
        mount.innerHTML = `
        <div style="padding:3rem 1.5rem;text-align:center;color:#64748b;font-size:13px">
            <div style="width:56px;height:56px;border-radius:12px;background:rgba(192,132,252,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 10px auto">
                <i class="fas fa-building" style="font-size:24px;color:#c084fc"></i>
            </div>
            <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px">No Fractional Bricks Owned</div>
            <div style="font-size:12px;color:#94a3b8">This customer has not yet invested in any Vika DRX real estate properties.</div>
        </div>`;
        return;
    }

    const totalBricks = items.reduce((s, i) => s + (i.bricks || 0), 0);
    const totalInvested = items.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const estAnnualDividend = items.reduce((s, i) => s + ((i.totalAmount || 0) * ((i.expectedYield || 8.5) / 100)), 0);

    let html = `
    <!-- Top Summary Metrics -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem">
        <div style="background:rgba(192,132,252,0.06);border:1px solid rgba(192,132,252,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#c084fc;font-weight:700">Total Fractional Bricks</div>
            <div style="font-size:1.4rem;font-weight:800;color:#c084fc;font-family:var(--font-mono)">${totalBricks} Bricks</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Total Real Estate Invested</div>
            <div style="font-size:1.4rem;font-weight:800;color:#f59e0b;font-family:var(--font-mono)">${formatINR(totalInvested)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">Projects Funded</div>
            <div style="font-size:1.4rem;font-weight:800;color:#60a5fa;font-family:var(--font-mono)">${items.length} Properties</div>
        </div>
        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px">
            <div style="font-size:11px;color:#34d399;font-weight:700">Est. Annual Rental Dividend</div>
            <div style="font-size:1.4rem;font-weight:800;color:#34d399;font-family:var(--font-mono)">~${formatINR(estAnnualDividend)}/yr</div>
        </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i class="fas fa-cubes" style="color:#c084fc"></i> Fractional Ownership Allotments
    </div>
    <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;text-align:left">
                    <th style="padding:10px 12px">Property Project</th>
                    <th style="padding:10px 12px">Location</th>
                    <th style="padding:10px 12px">Bricks Owned</th>
                    <th style="padding:10px 12px">Price/Brick</th>
                    <th style="padding:10px 12px">Total Invested</th>
                    <th style="padding:10px 12px">Ownership Equity</th>
                    <th style="padding:10px 12px">Rental Yield</th>
                    <th style="padding:10px 12px">Status</th>
                    <th style="padding:10px 12px">Date</th>
                </tr>
            </thead>
            <tbody>`;

    items.forEach(p => {
        html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:10px 12px;font-weight:700;color:#fff">
                <i class="fas fa-building" style="color:#c084fc;margin-right:6px"></i> ${p.title}
            </td>
            <td style="padding:10px 12px;color:#cbd5e1">
                <i class="fas fa-map-marker-alt" style="color:#ef4444;font-size:10px"></i> ${p.city ? `${p.city}${p.state ? ', ' + p.state : ''}` : 'Prime Location'}
            </td>
            <td style="padding:10px 12px">
                <span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;font-weight:700;border:1px solid rgba(168,85,247,0.3)">
                    ${p.bricks} Bricks
                </span>
            </td>
            <td style="padding:10px 12px;font-family:var(--font-mono)">${formatINR(p.pricePerBrick)}</td>
            <td style="padding:10px 12px;font-family:var(--font-mono);font-weight:700;color:#f59e0b">${formatINR(p.totalAmount)}</td>
            <td style="padding:10px 12px">
                <div style="min-width:90px">
                    <span style="font-family:var(--font-mono);font-weight:700;color:#60a5fa">${p.ownershipPercent || 0}%</span>
                    <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:99px;margin-top:3px;overflow:hidden">
                        <div style="width:${Math.min(Math.max((p.ownershipPercent || 0) * 2, 8), 100)}%;height:100%;background:#60a5fa"></div>
                    </div>
                </div>
            </td>
            <td style="padding:10px 12px;font-weight:700;color:#34d399">
                <i class="fas fa-arrow-trend-up"></i> ${p.expectedYield || 8.5}% p.a.
            </td>
            <td style="padding:10px 12px">
                <span class="ud-status-pill success"><i class="fas fa-check-circle"></i> ${p.status || 'Paid'}</span>
            </td>
            <td style="padding:10px 12px;color:#94a3b8">${formatDate(p.date)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

function renderUdInvestmentsTab(u) {
    const mount = document.getElementById("ud-investments-tab-content");
    if (!mount) return;

    let html = `
    <div style="margin-bottom:1.5rem">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px"><i class="fas fa-calendar-check" style="color:#38bdf8"></i> Active Systematic Investment Plans (SIP)</div>
        <div id="ud-tab-sips-container">`;

    if (!u.sips || u.sips.length === 0) {
        html += `<div style="padding:1rem;color:#64748b;font-size:12px;text-align:center">No SIP investments enrolled.</div>`;
    } else {
        html += `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;text-align:left">
                    <th style="padding:6px 8px">Goal Plan</th>
                    <th style="padding:6px 8px">Metal</th>
                    <th style="padding:6px 8px">Installment</th>
                    <th style="padding:6px 8px">Cycles</th>
                    <th style="padding:6px 8px">Accumulated</th>
                    <th style="padding:6px 8px">Total Invested</th>
                    <th style="padding:6px 8px">Next Due</th>
                    <th style="padding:6px 8px">Status</th>
                </tr>
            </thead>
            <tbody>`;
        u.sips.forEach(s => {
            html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                <td style="padding:6px 8px;font-weight:700;color:#fff">${s.goalTitle || 'Wealth Accumulator'}</td>
                <td style="padding:6px 8px;text-transform:capitalize">${s.metal || 'gold'}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono)">${formatINR(s.installmentAmount)} / ${s.frequency}</td>
                <td style="padding:6px 8px">${s.cyclesCompleted || 0} / ${s.totalCycles || 12}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono);font-weight:700;color:#f59e0b">${formatGrams(s.accumulatedGrams || 0)}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono);color:#fff">${formatINR(s.totalInvested || 0)}</td>
                <td style="padding:6px 8px;color:#94a3b8">${formatDate(s.nextInstallmentDate)}</td>
                <td style="padding:6px 8px"><span class="ud-status-pill success">${s.status || 'Active'}</span></td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    html += `
    </div>
    <div>
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px"><i class="fas fa-gem" style="color:#a855f7"></i> Gold & Silver Savings Schemes</div>
        <div id="ud-tab-schemes-container">`;

    if (!u.schemes || u.schemes.length === 0) {
        html += `<div style="padding:1rem;color:#64748b;font-size:12px;text-align:center">No scheme enrollments found.</div>`;
    } else {
        html += `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;text-align:left">
                    <th style="padding:6px 8px">Scheme Name</th>
                    <th style="padding:6px 8px">Metal</th>
                    <th style="padding:6px 8px">Monthly Amt</th>
                    <th style="padding:6px 8px">Paid</th>
                    <th style="padding:6px 8px">Accumulated</th>
                    <th style="padding:6px 8px">Total Invested</th>
                    <th style="padding:6px 8px">Status</th>
                </tr>
            </thead>
            <tbody>`;
        u.schemes.forEach(sc => {
            html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                <td style="padding:6px 8px;font-weight:700;color:#fff">${sc.schemeName}</td>
                <td style="padding:6px 8px;text-transform:capitalize">${sc.metal}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono)">${formatINR(sc.monthlyAmount)}</td>
                <td style="padding:6px 8px">${sc.installmentsPaid || 0} / ${sc.durationMonths || 11}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono);font-weight:700;color:#f59e0b">${formatGrams(sc.totalGoldGrams || 0)}</td>
                <td style="padding:6px 8px;font-family:var(--font-mono);color:#fff">${formatINR(sc.totalInvested || 0)}</td>
                <td style="padding:6px 8px"><span class="ud-status-pill success">${sc.status}</span></td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    html += `</div></div>`;
    mount.innerHTML = html;
}

function renderUdTransactionsTab(u) {
    const mount = document.getElementById("ud-transactions-tab-content");
    if (!mount) return;
    const txns = u.recentTransactions || [];
    if (txns.length === 0) {
        mount.innerHTML = `<div style="padding:2rem;text-align:center;color:#64748b">No transaction history found for this user.</div>`;
        return;
    }

    const pendingCount = txns.filter(t => t.status === "pending" || t.status === "processing").length;

    let html = "";
    if (pendingCount > 0) {
        html += `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
                <i class="fas fa-exclamation-triangle" style="color:#f59e0b;font-size:16px"></i>
                <div>
                    <strong style="color:#f59e0b;font-size:12px">${pendingCount} Pending Transaction${pendingCount > 1 ? 's' : ''} Detected!</strong>
                    <div style="font-size:11px;color:#cbd5e1">If customer completed payment on UPI/Gateway, verify via Razorpay or click Approve & Credit to allocate balance immediately.</div>
                </div>
            </div>
            <button class="btn btn-sm" onclick="syncUserPayments('${u._id}')" style="background:#f59e0b;color:#000;font-weight:700;border:none;padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer">
                <i class="fas fa-sync-alt"></i> Auto-Verify from Gateway
            </button>
        </div>`;
    }

    html += `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;text-align:left">
                <th style="padding:8px">Invoice / ID</th>
                <th style="padding:8px">Type</th>
                <th style="padding:8px">Asset / Metal</th>
                <th style="padding:8px">Quantity</th>
                <th style="padding:8px">Amount</th>
                <th style="padding:8px">Date & Time</th>
                <th style="padding:8px">Status</th>
                <th style="padding:8px;text-align:right">Resolution Actions</th>
            </tr>
        </thead>
        <tbody>`;

    txns.forEach(t => {
        const isPending = t.status === "pending" || t.status === "processing";
        const isSuccess = t.status === "success" || t.status === "paid";

        let statusPill = "";
        if (isPending) {
            statusPill = `<span class="ud-status-pill pending" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:3px 8px"><i class="fas fa-clock"></i> PENDING</span>`;
        } else if (isSuccess) {
            statusPill = `<span class="ud-status-pill success" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:3px 8px"><i class="fas fa-check-circle"></i> COMPLETED</span>`;
        } else {
            statusPill = `<span class="ud-status-pill danger" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:3px 8px"><i class="fas fa-times-circle"></i> FAILED</span>`;
        }

        let actionCell = "";
        if (isPending) {
            actionCell = `
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="verifyTransactionWithGateway('${t.metal}', '${t.id}')" title="Check payment status directly on Razorpay Gateway" style="padding:4px 8px;font-size:11px;background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);border-radius:5px;font-weight:600;cursor:pointer">
                    <i class="fas fa-sync-alt"></i> Verify Gateway
                </button>
                <button class="btn btn-sm" onclick="approveTransactionManually('${t.metal}', '${t.id}', '${t.invoiceNo || ''}', '${t.amount}')" title="Customer completed payment — Mark as PAID and credit balance now" style="padding:4px 9px;font-size:11px;background:linear-gradient(135deg, #10b981, #059669);color:#ffffff;border:none;border-radius:5px;font-weight:700;box-shadow:0 2px 6px rgba(16,185,129,0.3);cursor:pointer">
                    <i class="fas fa-check"></i> Approve & Credit
                </button>
                <button class="btn btn-sm" onclick="rejectTransactionManually('${t.metal}', '${t.id}')" title="Mark as cancelled/failed" style="padding:4px 7px;font-size:11px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:5px;cursor:pointer">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        } else if (isSuccess) {
            actionCell = `<span style="color:#10b981;font-size:11.5px;font-weight:600"><i class="fas fa-shield-check"></i> Credited to Vault</span>`;
        } else {
            actionCell = `<span style="color:#94a3b8;font-size:11px">No actions</span>`;
        }

        html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:8px;font-family:var(--font-mono);color:#60a5fa">
                <strong>${t.invoiceNo || (t.id ? t.id.slice(-6).toUpperCase() : '—')}</strong>
                ${t.razorpayOrderId ? `<div style="font-size:10px;color:#64748b">${t.razorpayOrderId}</div>` : ''}
            </td>
            <td style="padding:8px"><span class="ud-status-pill active">${(t.type || 'buy').toUpperCase()}</span></td>
            <td style="padding:8px;font-weight:700">${t.metal}</td>
            <td style="padding:8px;font-family:var(--font-mono)">${t.metal === 'Property' ? `${t.grams} Bricks` : formatGrams(t.grams)}</td>
            <td style="padding:8px;font-family:var(--font-mono);font-weight:700;color:#fff">${formatINR(t.amount)}</td>
            <td style="padding:8px;color:#94a3b8">${formatDateTime(t.date)}</td>
            <td style="padding:8px">${statusPill}</td>
            <td style="padding:8px;text-align:right">${actionCell}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mount.innerHTML = html;
}

// ── TRANSACTION RESOLUTION ACTION HANDLERS ────────────────────
async function syncUserPayments(userId) {
    const btn = document.getElementById("btn-sync-user-payments");
    const icon = document.getElementById("icon-sync-user-payments");
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add("fa-spin");

    try {
        toast("Checking payment gateway for pending orders...", "info");
        const res = await api(`/admin/users/${userId}/sync-payments`, { method: "POST" });
        if (res.success) {
            toast(res.message, res.verifiedCount > 0 ? "success" : "info");
            if (typeof viewUserDetails === "function") {
                await viewUserDetails(userId);
            }
        } else {
            toast(res.message || "Sync failed", "error");
        }
    } catch (err) {
        toast("Error syncing payments: " + err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove("fa-spin");
    }
}

async function verifyTransactionWithGateway(metal, id) {
    try {
        toast("Verifying order status with Razorpay...", "info");
        const res = await api(`/admin/transactions/${metal}/${id}/verify`, { method: "POST" });
        if (res.success) {
            toast(res.message || "Payment verified and credited ✓", "success");
            if (typeof activeUserId !== "undefined" && activeUserId) {
                await viewUserDetails(activeUserId);
            }
        } else {
            const shouldApprove = confirm(
                `${res.message}\n\nWould you like to manually APPROVE & CREDIT this transaction now?`
            );
            if (shouldApprove) {
                await approveTransactionManually(metal, id);
            }
        }
    } catch (err) {
        const shouldApprove = confirm(
            `Gateway check: ${err.message}\n\nWould you like to manually APPROVE & CREDIT this transaction instead?`
        );
        if (shouldApprove) {
            await approveTransactionManually(metal, id);
        }
    }
}

async function approveTransactionManually(metal, id, invoiceNo, amount) {
    const invStr = invoiceNo ? ` (${invoiceNo})` : "";
    const amtStr = amount ? ` of ${formatINR(amount)}` : "";
    const ok = confirm(`Are you sure you want to approve this ${metal} transaction${invStr}${amtStr}?\n\nThis will immediately mark it as SUCCESS and credit the ${metal} balance to the customer's account.`);
    if (!ok) return;

    try {
        toast("Approving transaction and crediting user...", "info");
        const res = await api(`/admin/transactions/${metal}/${id}/approve`, { method: "POST" });
        if (res.success) {
            toast(res.message || "Transaction approved & balance credited ✓", "success");
            if (typeof activeUserId !== "undefined" && activeUserId) {
                await viewUserDetails(activeUserId);
            }
        } else {
            toast(res.message || "Approval failed", "error");
        }
    } catch (err) {
        toast("Error approving transaction: " + err.message, "error");
    }
}

async function rejectTransactionManually(metal, id) {
    const ok = confirm(`Are you sure you want to mark this pending ${metal} transaction as FAILED / CANCELLED?`);
    if (!ok) return;

    try {
        const res = await api(`/admin/transactions/${metal}/${id}/reject`, { method: "POST" });
        if (res.success) {
            toast("Transaction marked as failed", "info");
            if (typeof activeUserId !== "undefined" && activeUserId) {
                await viewUserDetails(activeUserId);
            }
        } else {
            toast(res.message || "Action failed", "error");
        }
    } catch (err) {
        toast("Error: " + err.message, "error");
    }
}

function renderUdWalletTab(u) {
    const mount = document.getElementById("ud-wallet-tab-content");
    if (!mount) return;
    mount.innerHTML = `<div id="ud-full-wallet-ledger-mount" style="padding:10px">Loading audit ledger...</div>`;
    if (typeof loadUserWalletLedger === "function") {
        loadUserWalletLedger(u._id, "ud-full-wallet-ledger-mount");
    }
}

function renderUdKycTab(u) {
    const mount = document.getElementById("ud-kyc-tab-content");
    if (!mount) return;
    const k = u.kyc || {};

    mount.innerHTML = `
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:1.5rem">
        <div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:1rem"><i class="fas fa-file-invoice" style="color:#10b981"></i> KYC Document Previews</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
                    <div style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:6px">PAN Card Document</div>
                    ${k.panImage?.url && k.panImage.url.startsWith('http') ? `
                        <img src="${k.panImage.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1)" />
                    ` : `
                        <div style="height:140px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);border-radius:6px;color:#64748b;font-size:11px">
                            <i class="fas fa-id-card" style="font-size:24px;margin-right:6px"></i> PAN Card on file (${k.panNumber || 'Submitted'})
                        </div>
                    `}
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px">
                    <div style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:6px">Aadhaar Card Document</div>
                    ${k.aadhaarFront?.url && k.aadhaarFront.url.startsWith('http') ? `
                        <img src="${k.aadhaarFront.url}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.1)" />
                    ` : `
                        <div style="height:140px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);border-radius:6px;color:#64748b;font-size:11px">
                            <i class="fas fa-address-card" style="font-size:24px;margin-right:6px"></i> Aadhaar Photo on file
                        </div>
                    `}
                </div>
            </div>
        </div>

        <div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:1rem"><i class="fas fa-user-edit" style="color:#60a5fa"></i> Account Settings & Verification</div>
            <div class="form-group">
                <label class="form-label" style="font-size:11.5px">Customer Name</label>
                <input class="form-control" id="ud-edit-name" value="${u.name || ''}" />
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">Phone</label>
                    <input class="form-control" id="ud-edit-phone" value="${u.phone || ''}" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-size:11.5px">Role</label>
                    <select class="form-control" id="ud-edit-role">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size:11.5px">KYC Status</label>
                <select class="form-control" id="ud-edit-kyc">
                    <option value="not_submitted" ${u.kycStatus === 'not_submitted' ? 'selected' : ''}>Not Submitted</option>
                    <option value="pending" ${u.kycStatus === 'pending' ? 'selected' : ''}>Pending Review</option>
                    <option value="approved" ${(u.kycStatus === 'approved' || u.kycVerified) ? 'selected' : ''}>Approved (Verified)</option>
                    <option value="rejected" ${u.kycStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
                    <option value="revoked" ${u.kycStatus === 'revoked' ? 'selected' : ''}>Revoked</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" id="ud-edit-active" ${u.isActive !== false ? 'checked' : ''} />
                    <span style="font-size:12px;font-weight:600;color:#fff">Account Active</span>
                </label>
            </div>
            <button class="btn btn-primary" onclick="saveUserDetailsProfile()" style="margin-top:0.5rem;width:100%">
                <i class="fas fa-save"></i> Save Profile & Verification
            </button>
        </div>
    </div>`;
}

async function saveUserDetailsProfile() {
    if (!activeUserId) return;
    const payload = {
        name: document.getElementById("ud-edit-name")?.value.trim(),
        phone: document.getElementById("ud-edit-phone")?.value.trim(),
        role: document.getElementById("ud-edit-role")?.value || "user",
        kycStatus: document.getElementById("ud-edit-kyc")?.value || "not_submitted",
        isActive: document.getElementById("ud-edit-active")?.checked !== false
    };

    if (!payload.name) {
        toast("Name is required", "warning");
        return;
    }

    try {
        const res = await api(`/admin/users/${activeUserId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });

        if (res.success) {
            toast("Profile updated successfully ✓", "success");
            viewUserDetails(activeUserId);
            loadUsers(usersPage);
        } else {
            toast(res.message || "Failed to update profile", "danger");
        }
    } catch (e) {
        toast("Network error updating profile", "danger");
    }
}

