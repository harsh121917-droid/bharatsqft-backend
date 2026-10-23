/* ══════════════════════════════════════════════════════════════
   Vika DRX & VikaOne — Push Notifications & In-App Alerts Controller
   ══════════════════════════════════════════════════════════════ */

let notifHistory = [];
let notifPage = 1;
let uploadedNotifImageUrl = "";
let cachedNotifUsers = [];
let currentNotifApp = "digigold";
let selectedNotifApp = "digigold";

function changeNotifAppFilter(app) {
    currentNotifApp = app || "digigold";
    loadNotificationHistory(1);
}

const NOTIF_TEMPLATES_DRX = {
    estate: {
        title: "🏰 Pre-Launch Opportunity Live: Smartworld Sky Arc - 2",
        body: "Exclusive high-yield pre-launch estate is now open for booking! Reserve your spot with just 10% token payment.",
        deepLink: "estate"
    },
    bricks: {
        title: "🧱 New Fractional Commercial Asset Available!",
        body: "Grade-A commercial brick opportunity with 20-22% projected return p.a. and monthly rental distributions.",
        deepLink: "bricks"
    },
    savings: {
        title: "🏖️ Keep Your Property Savings Active!",
        body: "Small daily and monthly steps lead to prime property ownership. Check your active savings progress now.",
        deepLink: "savings"
    },
    dividend: {
        title: "💰 Monthly Rental Dividend Credited!",
        body: "Your monthly rental dividend payout has been successfully credited to your Vika DRX wallet. Tap to view.",
        deepLink: "wallet"
    },
    kyc: {
        title: "🛡️ Complete Your KYC Verification",
        body: "Verify your PAN & Aadhaar in under 2 minutes to start investing in fractional real estate and estates.",
        deepLink: "kyc"
    }
};

const NOTIF_TEMPLATES_GOLD = {
    schemes: {
        title: "💰 Gold Savings Scheme Installment Due",
        body: "Your 11+1 gold scheme monthly installment is due. Pay on time to claim your 1-month bonus bullion!",
        deepLink: "schemes"
    },
    sip: {
        title: "🪙 Daily Gold SIP Reminder",
        body: "Build pure 24K 99.9% hallmarked gold daily from just ₹10. Accumulate wealth systematically.",
        deepLink: "sip"
    },
    buy_gold: {
        title: "✨ Special Gold Cashback Live",
        body: "Get instant bonus bullion credits on all 24K 99.9% gold purchases above ₹1,000 this week!",
        deepLink: "buy_gold"
    },
    rewards: {
        title: "🎁 Referral Bonus Unlocked!",
        body: "You've earned free gold reward points! Tap here to view and redeem your gold bullion balance.",
        deepLink: "rewards"
    },
    kyc: {
        title: "🛡️ Verify Your DigiGold Account",
        body: "Complete instant 2-minute KYC to enable physical gold delivery and high-volume bullion sales.",
        deepLink: "kyc"
    }
};

function selectNotificationApp(app) {
    selectedNotifApp = app || "vikadrx";

    document.querySelectorAll('.notif-app-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`notif-app-${selectedNotifApp}`)?.classList.add('active');

    const appLabel = document.getElementById("notif-selected-app-label");
    const tplTitle = document.getElementById("notif-templates-title");
    const tplContainer = document.getElementById("notif-templates-container");
    const deepLinkSelect = document.getElementById("notif-deeplink");

    const prevDevice = document.getElementById("notif-preview-device-title");
    const prevIcon = document.getElementById("notif-preview-app-icon");
    const prevName = document.getElementById("notif-preview-app-name");

    if (selectedNotifApp === "digigold") {
        if (appLabel) appLabel.innerHTML = `🪙 VikaOne (DigiGold & SIP)`;
        if (tplTitle) tplTitle.innerHTML = `VikaOne DigiGold Templates (1-Click Fill)`;
        if (prevDevice) prevDevice.textContent = `VikaOne Mobile Lockscreen Preview`;
        if (prevName) prevName.textContent = `VikaOne`;
        if (prevIcon) {
            prevIcon.style.background = "#f59e0b";
            prevIcon.innerHTML = `<i class="fas fa-coins"></i>`;
        }

        if (tplContainer) {
            tplContainer.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('schemes')" style="background:rgba(234,179,8,0.18);border-color:rgba(234,179,8,0.4);color:#fde047">
                    💰 Scheme Due
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('sip')" style="background:rgba(234,179,8,0.18);border-color:rgba(234,179,8,0.4);color:#fde047">
                    🪙 SIP Reminder
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('buy_gold')" style="background:rgba(234,179,8,0.18);border-color:rgba(234,179,8,0.4);color:#fde047">
                    ✨ Cashback Offer
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('rewards')" style="background:rgba(16,185,129,0.18);border-color:rgba(16,185,129,0.4);color:#a7f3d0">
                    🎁 Reward Points
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('kyc')" style="background:rgba(245,158,11,0.18);border-color:rgba(245,158,11,0.4);color:#fde68a">
                    🛡️ KYC Reminder
                </button>`;
        }

        if (deepLinkSelect) {
            deepLinkSelect.innerHTML = `
                <option value="home">🏠 VikaOne Dashboard</option>
                <option value="buy_gold" selected>🪙 Buy DigiGold & 24K Bullion</option>
                <option value="schemes">📜 11+1 Gold Savings Schemes</option>
                <option value="sip">📈 Daily / Monthly Gold SIP</option>
                <option value="wallet">💼 Gold Wallet & Passbook</option>
                <option value="rewards">🎁 Gold Rewards & Referral Bonus</option>
                <option value="kyc">🛡️ KYC Verification Center</option>
                <option value="silver">🥈 Buy Pure Silver</option>
                <option value="mutual_funds">📊 Mutual Funds & Portfolio</option>`;
        }
    } else if (selectedNotifApp === "both") {
        if (appLabel) appLabel.innerHTML = `🌐 Dual Broadcast: Both Apps`;
        if (tplTitle) tplTitle.innerHTML = `Universal Ecosystem Templates`;
        if (prevDevice) prevDevice.textContent = `Dual Device Preview`;
        if (prevName) prevName.textContent = `VikaOne & DRX`;
        if (prevIcon) {
            prevIcon.style.background = "#8b5cf6";
            prevIcon.innerHTML = `<i class="fas fa-globe"></i>`;
        }

        if (tplContainer) {
            tplContainer.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('kyc')" style="background:rgba(139,92,246,0.18);border-color:rgba(139,92,246,0.4);color:#c4b5fd">
                    🛡️ KYC Verification
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('wallet')" style="background:rgba(139,92,246,0.18);border-color:rgba(139,92,246,0.4);color:#c4b5fd">
                    💼 Wallet Credit
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('savings')" style="background:rgba(139,92,246,0.18);border-color:rgba(139,92,246,0.4);color:#c4b5fd">
                    🏖️ Savings Reminder
                </button>`;
        }

        if (deepLinkSelect) {
            deepLinkSelect.innerHTML = `
                <option value="home" selected>🏠 Dashboard / Home Screen</option>
                <option value="wallet">💼 In-App Wallet</option>
                <option value="kyc">🛡️ KYC Verification Center</option>
                <option value="savings">🏖️ Savings Programs</option>`;
        }
    } else {
        // Vika DRX
        if (appLabel) appLabel.innerHTML = `🏢 Vika DRX (Real Estate)`;
        if (tplTitle) tplTitle.innerHTML = `Vika DRX Quick Templates (1-Click Fill)`;
        if (prevDevice) prevDevice.textContent = `Vika DRX Mobile Lockscreen Preview`;
        if (prevName) prevName.textContent = `Vika DRX`;
        if (prevIcon) {
            prevIcon.style.background = "#2563EB";
            prevIcon.innerHTML = `<i class="fas fa-building"></i>`;
        }

        if (tplContainer) {
            tplContainer.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('estate')" style="background:rgba(37,99,235,0.18);border-color:rgba(37,99,235,0.4);color:#bfdbfe">
                    🏰 Pre-Launch Opportunity
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('bricks')" style="background:rgba(37,99,235,0.18);border-color:rgba(37,99,235,0.4);color:#bfdbfe">
                    🧱 New Brick Asset
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('savings')" style="background:rgba(37,99,235,0.18);border-color:rgba(37,99,235,0.4);color:#bfdbfe">
                    🏖️ Savings Deposit Reminder
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('dividend')" style="background:rgba(16,185,129,0.18);border-color:rgba(16,185,129,0.4);color:#a7f3d0">
                    💰 Monthly Dividend Credited
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="applyNotifTemplate('kyc')" style="background:rgba(245,158,11,0.18);border-color:rgba(245,158,11,0.4);color:#fde68a">
                    🛡️ KYC Verification Reminder
                </button>`;
        }

        if (deepLinkSelect) {
            deepLinkSelect.innerHTML = `
                <option value="home">🏠 Dashboard / Home Screen</option>
                <option value="estate" selected>🏰 Pre-Launch Estates (Smartworld Sky Arc, etc.)</option>
                <option value="bricks">🧱 Fractional Real Estate (Bricks)</option>
                <option value="savings">🏖️ Location-Based Property Savings</option>
                <option value="wallet">💼 Vika DRX Wallet & Bank Accounts</option>
                <option value="kyc">🛡️ KYC Verification Center</option>
                <option value="properties">🔍 Explore Properties Directory</option>`;
        }
    }

    // Refresh customer dropdown with relevant tokens
    if (cachedNotifUsers.length > 0) {
        renderNotifUserDropdown(cachedNotifUsers);
    }
    updateNotificationPreview();
}

function applyNotifTemplate(key) {
    const pool = selectedNotifApp === "digigold" ? NOTIF_TEMPLATES_GOLD : NOTIF_TEMPLATES_DRX;
    const tpl = pool[key] || NOTIF_TEMPLATES_DRX[key] || NOTIF_TEMPLATES_GOLD[key];
    if (!tpl) return;

    const titleInput = document.getElementById("notif-title");
    const bodyInput = document.getElementById("notif-body");
    const linkInput = document.getElementById("notif-deeplink");

    if (titleInput) titleInput.value = tpl.title;
    if (bodyInput) bodyInput.value = tpl.body;
    if (linkInput) linkInput.value = tpl.deepLink;

    updateNotificationPreview();
    toast(`Applied template: ${tpl.title.substring(0, 32)}...`, "info");
}

function selectNotificationTarget(target) {
    document.querySelectorAll('.notif-target-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`notif-target-${target}`)?.classList.add('active');

    const userSelectBox = document.getElementById("notif-user-select-box");
    const sendBtn = document.getElementById("btn-send-notif");
    const indicator = document.getElementById("notif-target-indicator");
    
    if (userSelectBox) {
        userSelectBox.style.display = target === "single" ? "block" : "none";
        if (target === "single") populateNotifUserDropdown();
    }

    if (indicator) {
        if (target === "single") {
            indicator.textContent = "Direct: Single Customer";
            indicator.style.color = "#c084fc";
        } else if (target === "kyc") {
            indicator.textContent = "Targeted: KYC Verified Only";
            indicator.style.color = "#34d399";
        } else {
            indicator.textContent = "Broadcast: All Customers";
            indicator.style.color = "#60a5fa";
        }
    }

    if (sendBtn) {
        const appLabel = selectedNotifApp === "digigold" ? "VikaOne (DigiGold)" : selectedNotifApp === "both" ? "Both Apps" : "Vika DRX";
        if (target === "single") {
            sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Send Direct Push to Customer (${appLabel})`;
        } else if (target === "kyc") {
            sendBtn.innerHTML = `<i class="fas fa-shield-alt"></i> Send to KYC-Verified Users (${appLabel})`;
        } else {
            sendBtn.innerHTML = `<i class="fas fa-bullhorn"></i> Send Push Broadcast (${appLabel})`;
        }
    }
}

async function populateNotifUserDropdown() {
    const select = document.getElementById("notif-user-dropdown");
    if (!select) return;

    if (cachedNotifUsers.length === 0) {
        select.innerHTML = '<option value="">Loading customer list...</option>';
        try {
            const res = await api("/admin/users?limit=300");
            cachedNotifUsers = res.data || res.users || [];
        } catch (e) {
            console.error("Error populating users:", e);
        }
    }

    renderNotifUserDropdown(cachedNotifUsers);
}

function filterNotifUsers(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) {
        renderNotifUserDropdown(cachedNotifUsers);
        return;
    }

    const filtered = cachedNotifUsers.filter(u => 
        (u.name || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );

    renderNotifUserDropdown(filtered);
}

function renderNotifUserDropdown(usersList) {
    const select = document.getElementById("notif-user-dropdown");
    if (!select) return;

    if (!usersList || usersList.length === 0) {
        select.innerHTML = '<option value="">No matching customers found</option>';
        onNotifUserSelected();
        return;
    }

    let html = '<option value="">-- Choose a target customer (' + usersList.length + ' available) --</option>';
    usersList.forEach(u => {
        let tokenCount = 0;
        let tokenLabel = "";

        if (selectedNotifApp === "digigold") {
            tokenCount = (u.fcmTokens || []).length;
            tokenLabel = tokenCount > 0 ? `🪙 ${tokenCount} VikaOne device(s)` : '⚠️ In-App Inbox Only';
        } else if (selectedNotifApp === "both") {
            tokenCount = (u.fcmTokensDrx || []).length + (u.fcmTokens || []).length;
            tokenLabel = tokenCount > 0 ? `📱 ${tokenCount} device(s) (DRX + VikaOne)` : '⚠️ In-App Inbox Only';
        } else {
            tokenCount = (u.fcmTokensDrx || []).length;
            tokenLabel = tokenCount > 0 ? `🏢 ${tokenCount} Vika DRX device(s)` : '⚠️ In-App Inbox Only';
        }

        html += `<option value="${u._id}" data-tokens="${tokenCount}">
            ${u.name || 'Customer'} (${u.phone || u.email || 'No Phone'}) — ${tokenLabel}
        </option>`;
    });

    select.innerHTML = html;
    onNotifUserSelected();
}

function onNotifUserSelected() {
    const select = document.getElementById("notif-user-dropdown");
    const infoEl = document.getElementById("notif-user-fcm-info");
    if (!select || !infoEl) return;

    const selectedOpt = select.options[select.selectedIndex];
    if (!selectedOpt || !selectedOpt.value) {
        infoEl.textContent = "";
        return;
    }

    const tokenCount = parseInt(selectedOpt.dataset.tokens || "0", 10);
    const targetAppName = selectedNotifApp === "digigold" ? "VikaOne (DigiGold)" : selectedNotifApp === "both" ? "VikaOne & DRX" : "Vika DRX";

    if (tokenCount > 0) {
        infoEl.innerHTML = `<span style="color:var(--success)"><i class="fas fa-check-circle"></i> User has ${tokenCount} active ${targetAppName} device token(s). Notification will open ${targetAppName} directly.</span>`;
    } else {
        infoEl.innerHTML = `<span style="color:#60a5fa"><i class="fas fa-info-circle"></i> User has no registered ${targetAppName} device token. Notification will be stored in their In-App inbox.</span>`;
    }
}

function updateNotificationPreview() {
    const title = document.getElementById("notif-title")?.value.trim() || "Notification Title";
    const message = document.getElementById("notif-body")?.value.trim() || "Notification message content will appear here.";

    const titleEl = document.getElementById("notif-preview-title");
    const bodyEl = document.getElementById("notif-preview-body");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = message;

    const imgPreview = document.getElementById("notif-preview-img");
    if (imgPreview) {
        if (uploadedNotifImageUrl) {
            imgPreview.src = uploadedNotifImageUrl;
            imgPreview.style.display = "block";
        } else {
            imgPreview.style.display = "none";
        }
    }

    const deepLink = document.getElementById("notif-deeplink")?.value || "home";
    const deepLinkEl = document.getElementById("notif-preview-deeplink");
    if (deepLinkEl) {
        const labels = {
            home: "Action: 🏠 Home / Dashboard",
            estate: "Action: 🏰 Pre-Launch Estates",
            bricks: "Action: 🧱 Fractional Bricks",
            savings: "Action: 🏖️ Property Savings",
            wallet: "Action: 💼 Wallet & Accounts",
            kyc: "Action: 🛡️ KYC Verification",
            properties: "Action: 🔍 Explore Properties",
            buy_gold: "Action: 🪙 Buy 24K DigiGold",
            schemes: "Action: 📜 11+1 Gold Savings Schemes",
            sip: "Action: 📈 Gold SIP Accumulation",
            rewards: "Action: 🎁 Gold Rewards & Referrals",
            silver: "Action: 🥈 Buy Pure Silver",
            mutual_funds: "Action: 📊 Mutual Funds"
        };
        deepLinkEl.textContent = labels[deepLink] || `Action: ${deepLink}`;
    }
}

async function uploadNotificationImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
        toast("Uploading notification banner image...", "info");
        const res = await api("/upload/image", { method: "POST", body: formData });
        if (res.success && res.url) {
            uploadedNotifImageUrl = res.url;
            showImageStatus(res.url);
            updateNotificationPreview();
            toast("Image attached successfully", "success");
        } else {
            toast(res.message || "Failed to upload image", "danger");
        }
    } catch (err) {
        toast("Failed to upload image. Please verify connection.", "danger");
    }
}

function setNotifImageUrl(url) {
    uploadedNotifImageUrl = (url || "").trim();
    if (uploadedNotifImageUrl) {
        showImageStatus(uploadedNotifImageUrl);
    } else {
        hideImageStatus();
    }
    updateNotificationPreview();
}

function clearNotifImage() {
    uploadedNotifImageUrl = "";
    const fileInput = document.getElementById("notif-file-input");
    const urlInput = document.getElementById("notif-img-url");
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    hideImageStatus();
    updateNotificationPreview();
    toast("Image removed", "info");
}

function showImageStatus(url) {
    const statusBox = document.getElementById("notif-img-status");
    const textEl = document.getElementById("notif-img-status-text");
    if (statusBox) {
        statusBox.style.display = "flex";
        if (textEl) textEl.textContent = `Image Attached: ${url.substring(0, 45)}...`;
    }
}

function hideImageStatus() {
    const statusBox = document.getElementById("notif-img-status");
    if (statusBox) statusBox.style.display = "none";
}

async function sendPushNotification() {
    const title = document.getElementById("notif-title")?.value.trim();
    const body = document.getElementById("notif-body")?.value.trim();
    const targetPill = document.querySelector('.notif-target-pill.active');
    const targetKey = targetPill?.dataset.target || "all";
    const userId = document.getElementById("notif-user-dropdown")?.value;
    const deepLink = document.getElementById("notif-deeplink")?.value || "home";
    const sendBtn = document.getElementById("btn-send-notif");

    if (!title || !body) {
        toast("Please enter notification title and message body", "warning");
        return;
    }

    if (targetKey === "single" && !userId) {
        toast("Please select a target customer from the dropdown", "warning");
        return;
    }

    const payload = {
        app: selectedNotifApp || "vikadrx",
        title,
        body,
        imageUrl: uploadedNotifImageUrl || "",
        deepLink: deepLink,
        targetType: targetKey === "single" ? "user" : (targetKey === "kyc_verified" ? "kyc_verified" : "all"),
        targetUserId: targetKey === "single" ? userId : null
    };

    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatching to [${selectedNotifApp}]...`;
        }
        toast(`Dispatching push notification to [${selectedNotifApp}]...`, "info");

        const res = await api("/notifications/send", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (res.success) {
            toast(res.message || "Notification dispatched successfully!", "success");
            document.getElementById("notif-title").value = "";
            document.getElementById("notif-body").value = "";
            clearNotifImage();
            loadNotificationHistory(1);
        } else {
            toast(res.message || "Failed to send notification", "danger");
        }
    } catch (e) {
        toast("Network error sending notification", "danger");
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            selectNotificationTarget(targetKey);
        }
    }
}

async function loadNotificationHistory(page = 1) {
    notifPage = page;
    const body = document.getElementById("notifications-history-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading dispatch logs...</div></div>`;

    try {
        const appParam = currentNotifApp ? `&app=${currentNotifApp}` : "";
        const res = await api(`/notifications/history?page=${page}&limit=20${appParam}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load notification logs"}</div></div>`;
            return;
        }

        notifHistory = res.notifications || res.data || [];
        renderNotificationHistoryTable(notifHistory);

        const pageInfo = document.getElementById("notif-pagination-info");
        const prevBtn = document.getElementById("btn-prev-notif");
        const nextBtn = document.getElementById("btn-next-notif");

        const totalPages = res.pages || 1;
        const totalCount = res.total || notifHistory.length;

        if (pageInfo) pageInfo.textContent = `Page ${res.page || 1} of ${totalPages} (${totalCount} notifications)`;
        if (prevBtn) prevBtn.disabled = (res.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.page || 1) >= totalPages;
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading history</div></div>`;
    }
}

function prevNotifPage() {
    if (notifPage > 1) loadNotificationHistory(notifPage - 1);
}

function nextNotifPage() {
    loadNotificationHistory(notifPage + 1);
}

function filterNotifHistory(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) {
        renderNotificationHistoryTable(notifHistory);
        return;
    }

    const filtered = notifHistory.filter(l => {
        const titleMatch = (l.title || "").toLowerCase().includes(q);
        const bodyMatch = (l.body || "").toLowerCase().includes(q);
        const userMatch = l.targetUser ? (
            (l.targetUser.name || "").toLowerCase().includes(q) ||
            (l.targetUser.phone || "").toLowerCase().includes(q) ||
            (l.targetUser.email || "").toLowerCase().includes(q)
        ) : false;
        return titleMatch || bodyMatch || userMatch;
    });

    renderNotificationHistoryTable(filtered);
}

function renderNotificationHistoryTable(logs) {
    const body = document.getElementById("notifications-history-body");
    if (!body) return;

    if (!logs || logs.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3.5rem 2rem">
            <i class="fas fa-bell-slash" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;font-weight:600;color:#fff">No notifications dispatched yet</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Compose a notification above or use a Quick Template to send alerts to your users.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Title & Message</th>
                    <th>Audience & Deep Link</th>
                    <th>Delivery Stats</th>
                    <th>Status</th>
                    <th>Dispatched At</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    logs.forEach(l => {
        let statusBadge = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Sent</span>`;
        if (l.status === "simulated") {
            statusBadge = `<span class="badge badge-warning"><i class="fas fa-flask"></i> Simulated</span>`;
        } else if (l.status === "failed") {
            statusBadge = `<span class="badge badge-danger"><i class="fas fa-times-circle"></i> Failed</span>`;
        }

        let audienceBadge = `<span class="badge badge-info"><i class="fas fa-bullhorn"></i> All Users</span>`;
        if (l.targetType === "user") {
            const userName = l.targetUser ? (l.targetUser.name || l.targetUser.phone || "User") : "Targeted Customer";
            const userPhone = l.targetUser && l.targetUser.phone ? ` (${l.targetUser.phone})` : "";
            audienceBadge = `<span class="badge badge-purple" title="${userName}${userPhone}"><i class="fas fa-user"></i> ${userName}</span>`;
        } else if (l.targetType === "kyc_verified") {
            audienceBadge = `<span class="badge badge-success"><i class="fas fa-shield-alt"></i> KYC Verified</span>`;
        }

        const deepLinkPill = `<span class="badge" style="background:rgba(37,99,235,0.18);color:#93c5fd;border:1px solid rgba(37,99,235,0.35);font-size:10.5px">🎯 ${l.deepLink || 'home'}</span>`;

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    ${l.imageUrl ? `<img src="${l.imageUrl}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;border:1px solid rgba(37,99,235,0.3)" />` : ''}
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13.5px">${l.title || 'Untitled Notification'}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;max-width:340px;line-height:1.35">${l.body || '—'}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                        ${l.app === 'vikadrx'
                            ? `<span class="badge" style="background:rgba(37,99,235,0.18);color:#93c5fd;border:1px solid rgba(37,99,235,0.35);font-size:10px">🏢 Vika DRX</span>`
                            : (l.app === 'all'
                                ? `<span class="badge" style="background:rgba(139,92,246,0.18);color:#c4b5fd;border:1px solid rgba(139,92,246,0.35);font-size:10px">🌐 Both Apps</span>`
                                : `<span class="badge" style="background:rgba(234,179,8,0.18);color:#fde047;border:1px solid rgba(234,179,8,0.35);font-size:10px">🪙 VikaOne</span>`)}
                        ${audienceBadge}
                    </div>
                    ${deepLinkPill}
                </div>
            </td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:#fff">${l.sentCount || 0} Targeted</div>
                <div style="font-size:11px;color:var(--success)">${l.successCount || 0} Delivered</div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div style="font-size:12px;color:#fff">${typeof formatDateTime === 'function' ? formatDateTime(l.createdAt) : new Date(l.createdAt).toLocaleString()}</div>
                <div style="font-size:10.5px;color:var(--text-dim)">By ${l.sentBy || 'Admin'}</div>
            </td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-sm" title="Delete Log" onclick="deleteNotification('${l._id}')" style="color:var(--danger)">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function deleteNotification(id) {
    if (!confirm("Are you sure you want to delete this notification history log?")) return;

    try {
        const res = await api(`/notifications/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Notification log deleted", "success");
            loadNotificationHistory(notifPage);
        } else {
            toast(res.message || "Failed to delete notification log", "danger");
        }
    } catch (e) {
        toast("Network error deleting notification log", "danger");
    }
}

function loadNotificationPage() {
    selectNotificationApp('digigold');
    selectNotificationTarget('all');
    updateNotificationPreview();
    loadNotificationHistory(1);
}
