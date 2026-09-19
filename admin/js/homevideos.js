/* ══════════════════════════════════════════════════════════════
   Vika DRX — Home Page YouTube Videos Controller
   ══════════════════════════════════════════════════════════════ */

let allHomeVideos = [];
let editingHomeVideoId = null;

// ── Load Home Videos ───────────────────────────────────────────
async function loadHomeVideos() {
    const body = document.getElementById("homevideos-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading Home YouTube videos...</div></div>`;

    try {
        const res = await api("/home-videos/admin");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load home videos"}</div></div>`;
            return;
        }

        allHomeVideos = res.data || [];
        allHomeVideos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        renderHomeVideos(allHomeVideos);
        updateHomeVideoStats(allHomeVideos);
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading home videos</div></div>`;
    }
}

// ── Update Summary Stats ───────────────────────────────────────
function updateHomeVideoStats(videos) {
    const totalEl = document.getElementById("hv-stat-total");
    const activeEl = document.getElementById("hv-stat-active");
    const inactiveEl = document.getElementById("hv-stat-inactive");

    if (totalEl) totalEl.textContent = videos.length;
    if (activeEl) activeEl.textContent = videos.filter(v => v.isActive).length;
    if (inactiveEl) inactiveEl.textContent = videos.filter(v => !v.isActive).length;
}

// ── Render Videos Grid / Table ─────────────────────────────────
function renderHomeVideos(videos) {
    const body = document.getElementById("homevideos-body");
    if (!body) return;

    if (!videos || videos.length === 0) {
        body.innerHTML = `
            <div class="empty-box" style="padding:48px 20px;text-align:center">
                <i class="fab fa-youtube" style="font-size:48px;color:#ef4444;margin-bottom:12px;display:block"></i>
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px">No Home Videos Added Yet</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px">Add YouTube walkthroughs and project showcases to appear on the mobile app home slider.</div>
                <button class="btn btn-primary" onclick="openAddHomeVideoModal()">
                    <i class="fas fa-plus"></i> Add First YouTube Video
                </button>
            </div>
        `;
        return;
    }

    let html = `
        <div style="overflow-x:auto">
            <table class="table" style="width:100%;border-collapse:collapse">
                <thead>
                    <tr>
                        <th style="width:60px;text-align:center">Order</th>
                        <th style="width:140px">Thumbnail</th>
                        <th>Video Details</th>
                        <th style="width:140px">YouTube ID</th>
                        <th style="width:110px;text-align:center">Status</th>
                        <th style="width:110px;text-align:center">Reorder</th>
                        <th style="width:120px;text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    videos.forEach((v, idx) => {
        const thumb = v.thumbnailUrl || `https://img.youtube.com/vi/${v.youtubeVideoId}/hqdefault.jpg`;
        const activeBadge = v.isActive
            ? `<span class="badge badge-success" style="cursor:pointer" onclick="toggleHomeVideoActive('${v._id}', true)" title="Click to Deactivate"><i class="fas fa-check-circle"></i> Active</span>`
            : `<span class="badge badge-danger" style="cursor:pointer" onclick="toggleHomeVideoActive('${v._id}', false)" title="Click to Activate"><i class="fas fa-pause-circle"></i> Inactive</span>`;

        const isFirst = idx === 0;
        const isLast = idx === videos.length - 1;

        html += `
            <tr style="border-bottom:1px solid var(--border-color)">
                <td style="text-align:center;font-weight:800;color:var(--text-primary);font-size:14px">
                    #${v.order ?? idx}
                </td>
                <td>
                    <div style="position:relative;width:120px;height:68px;border-radius:8px;overflow:hidden;background:#000;box-shadow:0 2px 6px rgba(0,0,0,0.15)">
                        <img src="${thumb}" alt="Thumbnail" style="width:100%;height:100%;object-fit:cover" onerror="this.src='https://img.youtube.com/vi/${v.youtubeVideoId}/hqdefault.jpg'">
                        <a href="https://www.youtube.com/watch?v=${v.youtubeVideoId}" target="_blank" rel="noopener" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);color:#fff;text-decoration:none">
                            <i class="fab fa-youtube" style="color:#ef4444;font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))"></i>
                        </a>
                    </div>
                </td>
                <td>
                    <div style="font-weight:700;font-size:14px;color:var(--text-primary);margin-bottom:3px">${escapeHtml(v.title)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);max-width:400px;line-height:1.4">${escapeHtml(v.subtitle || 'No description added')}</div>
                    <div style="margin-top:4px;font-size:11px;color:var(--text-muted)">
                        <i class="far fa-clock"></i> Added ${formatDate(v.createdAt)}
                    </div>
                </td>
                <td>
                    <span style="font-family:monospace;background:var(--bg-card);padding:4px 8px;border-radius:6px;border:1px solid var(--border-color);font-size:12px;font-weight:600;display:inline-block">
                        ${escapeHtml(v.youtubeVideoId)}
                    </span>
                    <div style="margin-top:4px">
                        <a href="https://www.youtube.com/watch?v=${v.youtubeVideoId}" target="_blank" rel="noopener" style="font-size:11.5px;color:#38bdf8;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                            <i class="fas fa-external-link-alt" style="font-size:10px"></i> Watch
                        </a>
                    </div>
                </td>
                <td style="text-align:center">
                    ${activeBadge}
                </td>
                <td style="text-align:center">
                    <div style="display:inline-flex;gap:4px">
                        <button class="btn btn-sm btn-secondary" onclick="moveHomeVideo('${v._id}', -1)" ${isFirst ? 'disabled style="opacity:0.35;cursor:not-allowed"' : ''} title="Move Up in Slider">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="moveHomeVideo('${v._id}', 1)" ${isLast ? 'disabled style="opacity:0.35;cursor:not-allowed"' : ''} title="Move Down in Slider">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                    </div>
                </td>
                <td style="text-align:right">
                    <div style="display:inline-flex;gap:6px">
                        <button class="btn btn-sm btn-outline-primary" onclick="openEditHomeVideoModal('${v._id}')" title="Edit Video">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteHomeVideo('${v._id}', '${escapeHtml(v.title).replace(/'/g, "\\'")}')" title="Delete Video">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    body.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── Search / Filter ───────────────────────────────────────────
function filterHomeVideos(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) {
        renderHomeVideos(allHomeVideos);
        return;
    }
    const filtered = allHomeVideos.filter(v =>
        (v.title && v.title.toLowerCase().includes(q)) ||
        (v.subtitle && v.subtitle.toLowerCase().includes(q)) ||
        (v.youtubeVideoId && v.youtubeVideoId.toLowerCase().includes(q))
    );
    renderHomeVideos(filtered);
}

// ── Add / Edit Modals ─────────────────────────────────────────
function openAddHomeVideoModal() {
    editingHomeVideoId = null;
    const titleEl = document.getElementById("homevideo-modal-title");
    if (titleEl) titleEl.textContent = "Add Home YouTube Video";

    document.getElementById("hv-form-title").value = "";
    document.getElementById("hv-form-subtitle").value = "";
    document.getElementById("hv-form-url").value = "";
    document.getElementById("hv-form-thumb").value = "";
    document.getElementById("hv-form-order").value = allHomeVideos.length;
    document.getElementById("hv-form-active").checked = true;

    const modal = document.getElementById("homevideo-modal");
    if (modal) modal.style.display = "flex";
}

function openEditHomeVideoModal(id) {
    const video = allHomeVideos.find(v => v._id === id);
    if (!video) return;

    editingHomeVideoId = id;
    const titleEl = document.getElementById("homevideo-modal-title");
    if (titleEl) titleEl.textContent = "Edit Home YouTube Video";

    document.getElementById("hv-form-title").value = video.title || "";
    document.getElementById("hv-form-subtitle").value = video.subtitle || "";
    document.getElementById("hv-form-url").value = video.youtubeUrl || video.youtubeVideoId || "";
    document.getElementById("hv-form-thumb").value = video.thumbnailUrl || "";
    document.getElementById("hv-form-order").value = video.order ?? 0;
    document.getElementById("hv-form-active").checked = video.isActive !== false;

    const modal = document.getElementById("homevideo-modal");
    if (modal) modal.style.display = "flex";
}

function closeHomeVideoModal() {
    const modal = document.getElementById("homevideo-modal");
    if (modal) modal.style.display = "none";
}

// ── Save Video (Add / Edit) ───────────────────────────────────
async function saveHomeVideo(e) {
    if (e) e.preventDefault();

    const title = document.getElementById("hv-form-title")?.value.trim();
    const subtitle = document.getElementById("hv-form-subtitle")?.value.trim();
    const youtubeUrl = document.getElementById("hv-form-url")?.value.trim();
    const thumbnailUrl = document.getElementById("hv-form-thumb")?.value.trim();
    const order = parseInt(document.getElementById("hv-form-order")?.value) || 0;
    const isActive = document.getElementById("hv-form-active")?.checked ?? true;

    if (!title) {
        toast("Please enter a video title", "warning");
        return;
    }
    if (!youtubeUrl) {
        toast("Please enter YouTube URL or Video ID", "warning");
        return;
    }

    const payload = {
        title,
        subtitle,
        youtubeUrl,
        thumbnailUrl,
        order,
        isActive,
    };

    const submitBtn = document.getElementById("btn-save-homevideo");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        let res;
        if (editingHomeVideoId) {
            res = await api(`/home-videos/admin/${editingHomeVideoId}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
        } else {
            res = await api("/home-videos/admin", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        }

        if (res.success) {
            toast(res.message || "Video saved successfully!", "success");
            closeHomeVideoModal();
            loadHomeVideos();
        } else {
            toast(res.message || "Failed to save video", "danger");
        }
    } catch (err) {
        toast("Error saving YouTube video", "danger");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-save"></i> Save Video`;
        }
    }
}

// ── Delete Video ──────────────────────────────────────────────
async function deleteHomeVideo(id, title) {
    if (!confirm(`Are you sure you want to delete the home video "${title}"? This cannot be undone.`)) {
        return;
    }

    try {
        const res = await api(`/home-videos/admin/${id}`, {
            method: "DELETE",
        });

        if (res.success) {
            toast("YouTube video deleted successfully", "success");
            loadHomeVideos();
        } else {
            toast(res.message || "Failed to delete video", "danger");
        }
    } catch (err) {
        toast("Error deleting video", "danger");
    }
}

// ── Toggle Active State ───────────────────────────────────────
async function toggleHomeVideoActive(id, currentActive) {
    try {
        const res = await api(`/home-videos/admin/${id}`, {
            method: "PUT",
            body: JSON.stringify({ isActive: !currentActive }),
        });

        if (res.success) {
            toast(currentActive ? "Video paused from home slider" : "Video activated on home slider", "success");
            loadHomeVideos();
        } else {
            toast(res.message || "Failed to update video status", "danger");
        }
    } catch (err) {
        toast("Error updating status", "danger");
    }
}

// ── Reorder Video (Move Up / Move Down) ────────────────────────
async function moveHomeVideo(id, direction) {
    const idx = allHomeVideos.findIndex(v => v._id === id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= allHomeVideos.length) return;

    // Swap positions
    const temp = allHomeVideos[idx];
    allHomeVideos[idx] = allHomeVideos[targetIdx];
    allHomeVideos[targetIdx] = temp;

    // Re-assign sequential order
    const orders = allHomeVideos.map((v, i) => ({ id: v._id, order: i }));

    try {
        const res = await api("/home-videos/admin/reorder", {
            method: "PUT",
            body: JSON.stringify({ orders }),
        });

        if (res.success) {
            toast("Video order updated", "success");
            loadHomeVideos();
        } else {
            toast(res.message || "Failed to reorder", "danger");
        }
    } catch (err) {
        toast("Error updating order", "danger");
    }
}
