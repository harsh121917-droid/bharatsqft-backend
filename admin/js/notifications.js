/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Push Notifications Controller
   ══════════════════════════════════════════════════════════════ */

let notifHistory = [];
let notifPage = 1;
let uploadedNotifImageUrl = "";
let cachedNotifUsers = [];

function selectNotificationTarget(target) {
    document.querySelectorAll('.notif-target-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`notif-target-${target}`)?.classList.add('active');

    const userSelectBox = document.getElementById("notif-user-select-box");
    const sendBtn = document.getElementById("btn-send-notif");
    
    if (userSelectBox) {
        userSelectBox.style.display = target === "single" ? "block" : "none";
        if (target === "single") populateNotifUserDropdown();
    }

    if (sendBtn) {
        if (target === "single") {
            sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Send Direct Push to Customer`;
        } else if (target === "kyc") {
            sendBtn.innerHTML = `<i class="fas fa-shield-alt"></i> Send to KYC-Verified Users`;
        } else {
            sendBtn.innerHTML = `<i class="fas fa-bullhorn"></i> Send Push Broadcast (All Users)`;
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
        const deviceCount = (u.fcmTokens && u.fcmTokens.length > 0) ? `📱 ${u.fcmTokens.length} active device(s)` : '⚠️ No FCM Token';
        html += `<option value="${u._id}" data-tokens="${(u.fcmTokens || []).length}">
            ${u.name || 'Customer'} (${u.phone || u.email || 'No Phone'}) — ${deviceCount}
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
    if (tokenCount > 0) {
        infoEl.innerHTML = `<span style="color:var(--success)"><i class="fas fa-check-circle"></i> User is registered on ${tokenCount} device(s). Notification will pop up on their screen immediately.</span>`;
    } else {
        infoEl.innerHTML = `<span style="color:var(--warning)"><i class="fas fa-info-circle"></i> User hasn't registered device tokens yet. Notification will be stored in their In-App Inbox.</span>`;
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
        title,
        body,
        imageUrl: uploadedNotifImageUrl || "",
        deepLink: targetKey === "kyc_verified" ? "kyc" : "home",
        targetType: targetKey === "single" ? "user" : (targetKey === "kyc_verified" ? "kyc_verified" : "all"),
        targetUserId: targetKey === "single" ? userId : null
    };

    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatched to FCM...`;
        }
        toast("Dispatching push notification...", "info");

        const res = await api("/notifications/send", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (res.success) {
            toast(res.message || "Push notification dispatched successfully!", "success");
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
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading broadcast history logs...</div></div>`;

    try {
        const res = await api(`/notifications/history?page=${page}&limit=20`);
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

function renderNotificationHistoryTable(logs) {
    const body = document.getElementById("notifications-history-body");
    if (!body) return;

    if (!logs || logs.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3.5rem 2rem">
            <i class="fas fa-bell-slash" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;font-weight:600;color:#fff">No push notifications broadcasted yet</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Compose a notification above to send marketing announcements or rate drop alerts.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Title & Message</th>
                    <th>Audience Target</th>
                    <th>Delivery Stats</th>
                    <th>Status</th>
                    <th>Broadcasted At</th>
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

        let audienceBadge = `<span class="badge badge-info"><i class="fas fa-bullhorn"></i> All Customers</span>`;
        if (l.targetType === "user") {
            const userName = l.targetUser ? (l.targetUser.name || l.targetUser.phone || "User") : "Targeted Customer";
            audienceBadge = `<span class="badge badge-purple"><i class="fas fa-user"></i> ${userName}</span>`;
        }

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    ${l.imageUrl ? `<img src="${l.imageUrl}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,0.1)" />` : ''}
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13.5px">${l.title || 'Untitled Notification'}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;max-width:340px;line-height:1.35">${l.body || '—'}</div>
                    </div>
                </div>
            </td>
            <td>${audienceBadge}</td>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:#fff">${l.sentCount || 0} Targeted</div>
                <div style="font-size:11px;color:var(--success)">${l.successCount || 0} Delivered</div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div style="font-size:12px;color:#fff">${formatDateTime(l.createdAt)}</div>
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
    selectNotificationTarget('all');
    updateNotificationPreview();
    loadNotificationHistory(1);
}
