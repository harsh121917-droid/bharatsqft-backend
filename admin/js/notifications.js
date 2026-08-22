/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Push Notifications Controller
   ══════════════════════════════════════════════════════════════ */

let notifHistory = [];
let notifPage = 1;
let uploadedNotifImageUrl = "";

function selectNotificationTarget(target) {
    document.querySelectorAll('.notif-target-pill').forEach(p => p.classList.remove('active'));
    document.getElementById(`notif-target-${target}`)?.classList.add('active');

    const userSelectBox = document.getElementById("notif-user-select-box");
    if (userSelectBox) {
        userSelectBox.style.display = target === "single" ? "block" : "none";
        if (target === "single") populateNotifUserDropdown();
    }
}

async function populateNotifUserDropdown() {
    const select = document.getElementById("notif-user-dropdown");
    if (!select || select.children.length > 1) return;

    try {
        const res = await api("/admin/users?limit=100");
        if (res.success && res.data) {
            select.innerHTML = '<option value="">Select a customer...</option>';
            res.data.forEach(u => {
                const opt = document.createElement("option");
                opt.value = u._id;
                opt.textContent = `${u.name || 'User'} (${u.phone || u.email || ''})`;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error populating users:", e);
    }
}

function updateNotificationPreview() {
    const title = document.getElementById("notif-title")?.value.trim() || "Notification Title";
    const message = document.getElementById("notif-body")?.value.trim() || "Notification message content will appear here.";

    document.getElementById("notif-preview-title").textContent = title;
    document.getElementById("notif-preview-body").textContent = message;

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
        toast("Uploading notification image...", "info");
        const res = await api("/upload/image", { method: "POST", body: formData });
        if (res.success && res.url) {
            uploadedNotifImageUrl = res.url;
            updateNotificationPreview();
            toast("Image uploaded", "success");
        }
    } catch (err) {
        toast("Failed to upload image", "danger");
    }
}

async function sendPushNotification() {
    const title = document.getElementById("notif-title")?.value.trim();
    const body = document.getElementById("notif-body")?.value.trim();
    const targetPill = document.querySelector('.notif-target-pill.active');
    const target = targetPill?.dataset.target || "all";
    const userId = document.getElementById("notif-user-dropdown")?.value;

    if (!title || !body) {
        toast("Please enter notification title and body", "warning");
        return;
    }

    if (target === "single" && !userId) {
        toast("Please select a target user", "warning");
        return;
    }

    const payload = { title, body, target, imageUrl: uploadedNotifImageUrl };
    if (target === "single") payload.userId = userId;

    try {
        toast("Sending push notification...", "info");
        const res = await api("/notifications/send", { method: "POST", body: JSON.stringify(payload) });
        if (res.success) {
            toast("Push notification sent successfully!", "success");
            document.getElementById("notif-title").value = "";
            document.getElementById("notif-body").value = "";
            uploadedNotifImageUrl = "";
            updateNotificationPreview();
            loadNotificationHistory(1);
        } else {
            toast(res.message || "Failed to send notification", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function loadNotificationHistory(page = 1) {
    notifPage = page;
    const body = document.getElementById("notifications-history-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading notification logs...</div></div>`;

    try {
        const res = await api(`/notifications/history?page=${page}&limit=20`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load logs</div></div>`;
            return;
        }

        notifHistory = res.data || [];
        renderNotificationHistoryTable(notifHistory);
        document.getElementById("notif-pagination-info").textContent = `Page ${res.page} of ${res.pages || 1} (${res.total || 0} notifications)`;
        document.getElementById("btn-prev-notif").disabled = res.page <= 1;
        document.getElementById("btn-next-notif").disabled = res.page >= res.pages;
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
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
        body.innerHTML = `<div class="loading-box"><i class="fas fa-bell-slash" style="font-size:32px;color:var(--text-dim)"></i><div>No notifications sent yet</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Title & Message</th>
                    <th>Audience</th>
                    <th>Recipients Count</th>
                    <th>Status</th>
                    <th>Sent Time</th>
                </tr>
            </thead>
            <tbody>`;

    logs.forEach(l => {
        html += `
        <tr>
            <td>
                <div style="font-weight:700;color:#fff">${l.title || 'Untitled'}</div>
                <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px">${l.body || ''}</div>
            </td>
            <td><span class="badge badge-info">${l.target || 'All Users'}</span></td>
            <td style="font-family:var(--font-mono);font-weight:600">${(l.recipientCount || 0).toLocaleString()} users</td>
            <td><span class="badge ${l.status === 'failed' ? 'badge-danger' : 'badge-success'}">${l.status || 'Delivered'}</span></td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(l.createdAt)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function loadNotificationPage() {
    selectNotificationTarget('all');
    updateNotificationPreview();
    loadNotificationHistory(1);
}
