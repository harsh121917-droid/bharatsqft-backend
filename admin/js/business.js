/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Business Opportunities Controller
   ══════════════════════════════════════════════════════════════ */

let allBusiness = [];
let editingBusinessId = null;
let currentBizImages = []; // [{ url, caption, isCover }]
let currentBizDocuments = []; // [{ url, title, type, uploadedAt }]

// Standard category list
const BIZ_CATEGORIES = [
    "Warehouses & Logistics",
    "Petrol Pumps",
    "Dairy Farms",
    "Hotels & Hospitality",
    "CBG (Compressed Biogas) Plants",
    "Other Business Opportunities"
];

// Helper to format currency in Indian numbering (₹ Lakhs / ₹ Cr)
function formatBizCurrency(amount) {
    if (!amount || isNaN(amount)) return "₹0";
    const num = Number(amount);
    if (num >= 10000000) {
        return `₹${(num / 10000000).toFixed(2)} Cr`;
    } else if (num >= 100000) {
        return `₹${(num / 100000).toFixed(2)} Lakh`;
    }
    return `₹${num.toLocaleString("en-IN")}`;
}

// ── 1. Load Business Opportunities ────────────────────────────
async function loadBusiness(page = 1) {
    const body = document.getElementById("business-body");
    if (!body) return;

    body.innerHTML = `
        <div class="loading-box" style="padding:40px;text-align:center">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary,#00D09C)"></i></div>
            <div style="margin-top:12px;color:var(--text-secondary,#8A95B0)">Loading Business Opportunities...</div>
        </div>
    `;

    try {
        const catFilter = document.getElementById("biz-filter-category")?.value || "";
        const statusFilter = document.getElementById("biz-filter-status")?.value || "";
        const searchInput = document.getElementById("biz-search-input")?.value?.trim() || "";

        let url = `/admin/business?page=${page}&limit=50`;
        if (catFilter && catFilter !== "All") url += `&category=${encodeURIComponent(catFilter)}`;
        if (statusFilter && statusFilter !== "All") url += `&status=${encodeURIComponent(statusFilter)}`;
        if (searchInput) url += `&search=${encodeURIComponent(searchInput)}`;

        const res = await api(url);
        if (res.success) {
            allBusiness = res.data || [];
            if (res.metrics) renderBusinessMetrics(res.metrics);
            renderBusinessTable(allBusiness);
        } else {
            body.innerHTML = `<div class="empty-state" style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-exclamation-circle fa-2x"></i><p>${res.message || "Failed to load listings"}</p></div>`;
        }
    } catch (err) {
        console.error("loadBusiness error:", err);
        body.innerHTML = `<div class="empty-state" style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-exclamation-triangle fa-2x"></i><p>Error connecting to server</p></div>`;
    }
}

// ── 2. Render Metrics Row ─────────────────────────────────────
function renderBusinessMetrics(metrics) {
    const totalEl = document.getElementById("biz-stat-total");
    const activeEl = document.getElementById("biz-stat-active");
    const valueEl = document.getElementById("biz-stat-value");
    const inquiriesEl = document.getElementById("biz-stat-inquiries");

    if (totalEl) totalEl.textContent = metrics.totalAll || 0;
    if (activeEl) activeEl.textContent = metrics.activeCount || 0;
    if (valueEl) valueEl.textContent = formatBizCurrency(metrics.totalProjectValue || 0);
    if (inquiriesEl) inquiriesEl.textContent = metrics.totalEnquiries || 0;
}

// ── 3. Render Table ───────────────────────────────────────────
function renderBusinessTable(items) {
    const body = document.getElementById("business-body");
    if (!body) return;

    if (!items || items.length === 0) {
        body.innerHTML = `
            <div class="empty-state" style="padding:50px;text-align:center">
                <i class="fas fa-briefcase fa-3x" style="color:var(--text-muted,#4B5563);margin-bottom:14px"></i>
                <h3 style="margin-bottom:6px;color:var(--text-primary,#EDF0FF)">No Business Opportunities Found</h3>
                <p style="color:var(--text-secondary,#8A95B0);font-size:13px">Click <strong>+ Add Business</strong> above to create your first listing.</p>
            </div>
        `;
        return;
    }

    const rows = items.map((item, index) => {
        const cover = item.coverImage || (item.images && item.images[0]?.url) || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=300&q=80";
        const catBadgeClass = getCategoryBadgeClass(item.category);
        const isActive = item.isActive !== false && item.status !== "inactive";

        return `
            <tr>
                <td style="width:40px;text-align:center;color:var(--text-muted,#6B7280)">${index + 1}</td>
                <td style="width:70px">
                    <img src="${cover}" alt="Cover" style="width:60px;height:45px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" onerror="this.src='https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=300&q=80'" />
                </td>
                <td style="max-width:280px">
                    <div style="font-weight:700;color:var(--text-primary,#EDF0FF);font-size:14px;line-height:1.3">${escapeHtml(item.title)}</div>
                    <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
                        <span class="badge ${catBadgeClass}" style="font-size:11px;padding:2px 8px">${escapeHtml(item.category)}</span>
                        ${item.spvName ? `<span style="font-size:10px;color:var(--text-muted,#6B7280);background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:4px">${escapeHtml(item.spvName)}</span>` : ""}
                    </div>
                </td>
                <td>
                    <div style="font-size:13px;color:var(--text-primary,#EDF0FF);font-weight:500"><i class="fas fa-map-marker-alt" style="color:#ef4444;font-size:11px;margin-right:4px"></i>${escapeHtml(item.location?.city || "—")}, ${escapeHtml(item.location?.state || "")}</div>
                    <div style="font-size:11px;color:var(--text-muted,#6B7280);margin-top:2px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.location?.address || "")}</div>
                </td>
                <td>
                    <div style="font-size:13px;color:#00D09C;font-weight:700">${formatBizCurrency(item.totalProjectCost)}</div>
                    <div style="font-size:11px;color:var(--text-muted,#8A95B0)">Min: <strong>${formatBizCurrency(item.minInvestmentAmount)}</strong></div>
                </td>
                <td>
                    <div style="font-size:13px;color:#fbbf24;font-weight:700">${escapeHtml(item.expectedReturns || "—")}</div>
                    <div style="font-size:11px;color:var(--text-muted,#8A95B0)">Tenure: ${escapeHtml(item.investmentTenure || "—")} (${escapeHtml(item.payoutFrequency || "Monthly")})</div>
                </td>
                <td style="text-align:center">
                    <label class="switch" style="vertical-align:middle" title="Toggle Active / Inactive">
                        <input type="checkbox" ${isActive ? "checked" : ""} onchange="toggleBusinessStatus('${item._id}')" />
                        <span class="slider round"></span>
                    </label>
                    <div style="font-size:10px;margin-top:3px;color:${isActive ? '#00D09C' : '#ef4444'}">${isActive ? 'Active' : 'Inactive'}</div>
                </td>
                <td style="text-align:right;white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="openBusinessModal('${item._id}')" title="Edit Opportunity" style="margin-right:5px">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBusiness('${item._id}')" title="Delete Opportunity">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    body.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th style="width:40px;text-align:center">#</th>
                    <th style="width:70px">Media</th>
                    <th>Business Opportunity & Category</th>
                    <th>Location</th>
                    <th>Project Value & Min Ticket</th>
                    <th>Expected Returns & Tenure</th>
                    <th style="text-align:center">Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function getCategoryBadgeClass(category) {
    switch (category) {
        case "Warehouses & Logistics": return "badge-cyan";
        case "Petrol Pumps": return "badge-amber";
        case "Dairy Farms": return "badge-green";
        case "Hotels & Hospitality": return "badge-purple";
        case "CBG (Compressed Biogas) Plants": return "badge-teal";
        default: return "badge-blue";
    }
}

// ── 4. Open Add / Edit Modal ───────────────────────────────────
async function openBusinessModal(id = null) {
    editingBusinessId = id;
    currentBizImages = [];
    currentBizDocuments = [];

    const modalTitle = document.getElementById("biz-modal-title");
    const saveBtn = document.getElementById("btn-save-biz");

    // Reset all form inputs
    document.getElementById("biz-form-title").value = "";
    document.getElementById("biz-form-category").value = "Warehouses & Logistics";
    document.getElementById("biz-form-address").value = "";
    document.getElementById("biz-form-city").value = "";
    document.getElementById("biz-form-state").value = "";
    document.getElementById("biz-form-pincode").value = "";
    document.getElementById("biz-form-total-cost").value = "";
    document.getElementById("biz-form-min-investment").value = "";
    document.getElementById("biz-form-tenure").value = "5 Years";
    document.getElementById("biz-form-returns").value = "19.5% Target IRR";
    document.getElementById("biz-form-payout").value = "Monthly";
    document.getElementById("biz-form-spv-name").value = "";
    document.getElementById("biz-form-description").value = "";
    document.getElementById("biz-form-highlights").value = "";
    document.getElementById("biz-form-status").value = "active";
    document.getElementById("biz-form-is-active").checked = true;

    if (id) {
        if (modalTitle) modalTitle.textContent = "Edit Business Opportunity";
        if (saveBtn) saveBtn.innerHTML = `<i class="fas fa-save"></i> Update Opportunity`;

        try {
            const res = await api(`/admin/business/${id}`);
            if (res.success && res.data) {
                const b = res.data;
                document.getElementById("biz-form-title").value = b.title || "";
                document.getElementById("biz-form-category").value = b.category || "Other Business Opportunities";
                document.getElementById("biz-form-address").value = b.location?.address || "";
                document.getElementById("biz-form-city").value = b.location?.city || "";
                document.getElementById("biz-form-state").value = b.location?.state || "";
                document.getElementById("biz-form-pincode").value = b.location?.pincode || "";
                document.getElementById("biz-form-total-cost").value = b.totalProjectCost || "";
                document.getElementById("biz-form-min-investment").value = b.minInvestmentAmount || "";
                document.getElementById("biz-form-tenure").value = b.investmentTenure || "";
                document.getElementById("biz-form-returns").value = b.expectedReturns || "";
                document.getElementById("biz-form-payout").value = b.payoutFrequency || "Monthly";
                document.getElementById("biz-form-spv-name").value = b.spvName || "";
                document.getElementById("biz-form-description").value = b.description || "";
                document.getElementById("biz-form-highlights").value = Array.isArray(b.highlights) ? b.highlights.join("\n") : "";
                document.getElementById("biz-form-status").value = b.status || "active";
                document.getElementById("biz-form-is-active").checked = b.isActive !== false;

                currentBizImages = (b.images || []).map(img => ({
                    url: img.url,
                    caption: img.caption || "",
                    isCover: Boolean(img.isCover)
                }));
                currentBizDocuments = (b.documents || []).map(d => ({
                    url: d.url,
                    title: d.title || "Project Document",
                    type: d.type || "dpr",
                    uploadedAt: d.uploadedAt
                }));
            }
        } catch (err) {
            console.error("Error loading business by id:", err);
            toast("Failed to load business details", "error");
        }
    } else {
        if (modalTitle) modalTitle.textContent = "Add Business Opportunity";
        if (saveBtn) saveBtn.innerHTML = `<i class="fas fa-plus-circle"></i> Create Opportunity`;
    }

    renderBizImages();
    renderBizDocs();

    const modal = document.getElementById("biz-modal");
    if (modal) modal.style.display = "flex";
}

function closeBusinessModal() {
    const modal = document.getElementById("biz-modal");
    if (modal) modal.style.display = "none";
    editingBusinessId = null;
    currentBizImages = [];
    currentBizDocuments = [];
}

// ── 5. Save (Create / Update) ──────────────────────────────────
async function saveBusiness() {
    const title = document.getElementById("biz-form-title")?.value?.trim();
    const category = document.getElementById("biz-form-category")?.value;
    const city = document.getElementById("biz-form-city")?.value?.trim();
    const state = document.getElementById("biz-form-state")?.value?.trim();
    const address = document.getElementById("biz-form-address")?.value?.trim();
    const pincode = document.getElementById("biz-form-pincode")?.value?.trim();
    const totalCost = parseFloat(document.getElementById("biz-form-total-cost")?.value);
    const minInvestment = parseFloat(document.getElementById("biz-form-min-investment")?.value);
    const tenure = document.getElementById("biz-form-tenure")?.value?.trim();
    const returns = document.getElementById("biz-form-returns")?.value?.trim();
    const payout = document.getElementById("biz-form-payout")?.value;
    const spvName = document.getElementById("biz-form-spv-name")?.value?.trim();
    const description = document.getElementById("biz-form-description")?.value?.trim();
    const highlightsRaw = document.getElementById("biz-form-highlights")?.value || "";
    const status = document.getElementById("biz-form-status")?.value || "active";
    const isActive = document.getElementById("biz-form-is-active")?.checked;

    if (!title) { toast("Business Title is required", "warning"); return; }
    if (!category) { toast("Category is required", "warning"); return; }
    if (!city || !state) { toast("City and State are required", "warning"); return; }
    if (isNaN(totalCost) || totalCost <= 0) { toast("Total Project Cost is required", "warning"); return; }
    if (isNaN(minInvestment) || minInvestment <= 0) { toast("Minimum Investment Amount is required", "warning"); return; }
    if (!tenure) { toast("Investment Tenure is required", "warning"); return; }
    if (!returns) { toast("Expected Returns/Income is required", "warning"); return; }
    if (!description) { toast("Project Description is required", "warning"); return; }

    const highlights = highlightsRaw.split("\n").map(h => h.trim()).filter(Boolean);

    // Ensure at least one cover image is set if images exist
    if (currentBizImages.length > 0 && !currentBizImages.some(img => img.isCover)) {
        currentBizImages[0].isCover = true;
    }

    const payload = {
        title,
        category,
        location: { address, city, state, pincode },
        totalProjectCost: totalCost,
        minInvestmentAmount: minInvestment,
        investmentTenure: tenure,
        expectedReturns: returns,
        payoutFrequency: payout,
        spvName,
        description,
        highlights,
        images: currentBizImages,
        documents: currentBizDocuments,
        status,
        isActive
    };

    const saveBtn = document.getElementById("btn-save-biz");
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        let res;
        if (editingBusinessId) {
            res = await api(`/admin/business/${editingBusinessId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            res = await api("/admin/business", {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }

        if (res.success) {
            toast(res.message || "Business opportunity saved successfully!", "success");
            closeBusinessModal();
            loadBusiness();
        } else {
            toast(res.message || "Failed to save business opportunity", "error");
        }
    } catch (err) {
        console.error("saveBusiness error:", err);
        toast("Network error saving opportunity", "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = editingBusinessId ? `<i class="fas fa-save"></i> Update Opportunity` : `<i class="fas fa-plus-circle"></i> Create Opportunity`;
        }
    }
}

// ── 6. Toggle Status ───────────────────────────────────────────
async function toggleBusinessStatus(id) {
    try {
        const res = await api(`/admin/business/${id}/toggle-status`, {
            method: "PATCH"
        });
        if (res.success) {
            toast(res.message || "Status updated", "success");
            loadBusiness();
        } else {
            toast(res.message || "Failed to update status", "error");
        }
    } catch (err) {
        console.error("toggleBusinessStatus error:", err);
        toast("Network error updating status", "error");
    }
}

// ── 7. Delete Opportunity ──────────────────────────────────────
async function deleteBusiness(id) {
    if (!confirm("Are you sure you want to remove this business listing? This action cannot be undone.")) return;

    try {
        const res = await api(`/admin/business/${id}`, {
            method: "DELETE"
        });
        if (res.success) {
            toast(res.message || "Business opportunity removed", "success");
            loadBusiness();
        } else {
            toast(res.message || "Failed to remove listing", "error");
        }
    } catch (err) {
        console.error("deleteBusiness error:", err);
        toast("Network error deleting listing", "error");
    }
}

// ── 8. Image Management ────────────────────────────────────────
function renderBizImages() {
    const list = document.getElementById("biz-images-list");
    if (!list) return;

    if (currentBizImages.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted,#6B7280);font-size:12px;padding:8px">No images uploaded yet. Upload or add image URLs below.</div>`;
        return;
    }

    list.innerHTML = currentBizImages.map((img, i) => `
        <div style="display:inline-block;position:relative;margin:4px;border-radius:8px;overflow:hidden;border:2px solid ${img.isCover ? '#00D09C' : 'rgba(255,255,255,0.1)'}">
            <img src="${img.url}" style="width:90px;height:70px;object-fit:cover;display:block" onerror="this.src='https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=200&q=80'" />
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);display:flex;justify-content:space-between;padding:2px 4px">
                <button type="button" onclick="setBizCoverImage(${i})" style="background:none;border:none;color:${img.isCover ? '#00D09C' : '#fff'};font-size:10px;cursor:pointer" title="${img.isCover ? 'Cover Image' : 'Set as Cover'}">
                    <i class="fas fa-star"></i>
                </button>
                <button type="button" onclick="removeBizImage(${i})" style="background:none;border:none;color:#ef4444;font-size:10px;cursor:pointer" title="Remove">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            ${img.isCover ? `<span style="position:absolute;top:2px;left:2px;background:#00D09C;color:#000;font-size:8px;font-weight:800;padding:1px 4px;border-radius:3px">COVER</span>` : ""}
        </div>
    `).join("");
}

function setBizCoverImage(index) {
    currentBizImages.forEach((img, i) => { img.isCover = (i === index); });
    renderBizImages();
}

function removeBizImage(index) {
    currentBizImages.splice(index, 1);
    if (currentBizImages.length > 0 && !currentBizImages.some(img => img.isCover)) {
        currentBizImages[0].isCover = true;
    }
    renderBizImages();
}

function addBizImageUrl() {
    const input = document.getElementById("biz-image-url-input");
    const url = input?.value?.trim();
    if (!url) return;
    currentBizImages.push({
        url,
        caption: "",
        isCover: currentBizImages.length === 0
    });
    input.value = "";
    renderBizImages();
}

async function handleBizImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    const btn = document.getElementById("btn-biz-upload-img");
    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading...`;

    try {
        const res = await api("/upload/image", {
            method: "POST",
            body: formData
        });

        if (res.success && res.url) {
            currentBizImages.push({
                url: res.url,
                caption: file.name,
                isCover: currentBizImages.length === 0
            });
            renderBizImages();
            toast("Image uploaded successfully!", "success");
        } else {
            toast(res.message || "Failed to upload image", "error");
        }
    } catch (err) {
        console.error("Image upload error:", err);
        toast("Network error uploading image", "error");
    } finally {
        if (btn) btn.innerHTML = `<i class="fas fa-upload"></i> Upload Image`;
        event.target.value = "";
    }
}

// ── 9. Document Management ─────────────────────────────────────
function renderBizDocs() {
    const list = document.getElementById("biz-docs-list");
    if (!list) return;

    if (currentBizDocuments.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted,#6B7280);font-size:12px;padding:8px">No documents attached yet.</div>`;
        return;
    }

    list.innerHTML = currentBizDocuments.map((doc, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid rgba(255,255,255,0.08)">
            <div style="display:flex;align-items:center;gap:8px">
                <i class="fas fa-file-pdf" style="color:#ef4444;font-size:16px"></i>
                <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text-primary,#EDF0FF)">${escapeHtml(doc.title || "Project Document")}</div>
                    <a href="${doc.url}" target="_blank" style="font-size:11px;color:#00D09C;text-decoration:none">View Document &rarr;</a>
                </div>
            </div>
            <button type="button" onclick="removeBizDoc(${i})" class="btn btn-sm" style="color:#ef4444;background:none;border:none">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join("");
}

function removeBizDoc(index) {
    currentBizDocuments.splice(index, 1);
    renderBizDocs();
}

function addBizDocUrl() {
    const titleInput = document.getElementById("biz-doc-title-input");
    const urlInput = document.getElementById("biz-doc-url-input");
    const title = titleInput?.value?.trim() || "Project Report";
    const url = urlInput?.value?.trim();
    if (!url) return;

    currentBizDocuments.push({
        url,
        title,
        type: "dpr",
        uploadedAt: new Date()
    });

    titleInput.value = "";
    urlInput.value = "";
    renderBizDocs();
}

async function handleBizDocUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const titleInput = document.getElementById("biz-doc-title-input");
    const docTitle = titleInput?.value?.trim() || file.name;

    const formData = new FormData();
    formData.append("document", file);

    const btn = document.getElementById("btn-biz-upload-doc");
    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading...`;

    try {
        const res = await api("/upload/document", {
            method: "POST",
            body: formData
        });

        if (res.success && res.url) {
            currentBizDocuments.push({
                url: res.url,
                title: docTitle,
                type: "dpr",
                uploadedAt: new Date()
            });
            renderBizDocs();
            if (titleInput) titleInput.value = "";
            toast("Document uploaded successfully!", "success");
        } else {
            toast(res.message || "Failed to upload document", "error");
        }
    } catch (err) {
        console.error("Doc upload error:", err);
        toast("Network error uploading document", "error");
    } finally {
        if (btn) btn.innerHTML = `<i class="fas fa-upload"></i> Upload PDF`;
        event.target.value = "";
    }
}

// ── 10. Filter Handlers ────────────────────────────────────────
function filterBusinessCategory() { loadBusiness(1); }
function filterBusinessStatus() { loadBusiness(1); }
function filterBusinessSearch() {
    clearTimeout(window._bizSearchTimer);
    window._bizSearchTimer = setTimeout(() => { loadBusiness(1); }, 300);
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
