/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Properties & Enquiries Controller
   ══════════════════════════════════════════════════════════════ */

let allProperties = [];
let editingPropertyId = null;
let currentAmenities = [];
let uploadedImages = []; // { url, isCover }

// ── Load Properties ───────────────────────────────────────────
async function loadProperties() {
    const body = document.getElementById("properties-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading property listings...</div></div>`;

    try {
        const res = await api("/admin/properties");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load properties"}</div></div>`;
            return;
        }

        allProperties = res.data || [];
        renderProperties(allProperties);
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading properties</div></div>`;
    }
}

function filterProperties(query) {
    const q = (query || "").toLowerCase();
    const filtered = allProperties.filter(p =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.location?.city || "").toLowerCase().includes(q) ||
        (p.location?.state || "").toLowerCase().includes(q)
    );
    renderProperties(filtered);
}

function renderProperties(props) {
    const body = document.getElementById("properties-body");
    if (!body) return;

    if (!props || props.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-building" style="font-size:32px;color:var(--text-dim)"></i><div>No properties found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Location</th>
                    <th>Total Value</th>
                    <th>Bricks</th>
                    <th>Funded</th>
                    <th>Rental Yield</th>
                    <th>Status</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    props.forEach(p => {
        const coverImg = (p.images || []).find(i => i.isCover)?.url || (p.images?.[0]?.url || "");
        const statusBadge = p.isPublished
            ? `<span class="badge badge-success">Published</span>`
            : `<span class="badge badge-danger">Draft</span>`;

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:12px">
                    ${coverImg ? `<img src="${coverImg}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid var(--border)" />` : `<div style="width:48px;height:48px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--text-dim)"><i class="fas fa-image"></i></div>`}
                    <div>
                        <div style="font-weight:600;color:#fff">${p.title || 'Untitled Property'}</div>
                        <div style="font-size:11.5px;color:var(--text-dim)">ID: ${String(p._id).slice(-6)}</div>
                    </div>
                </div>
            </td>
            <td style="font-size:13px">${p.location?.city || '—'}, ${p.location?.state || '—'}</td>
            <td style="font-weight:700;color:var(--gold)">${formatPrice(p.totalInvestmentRequired)}</td>
            <td style="font-family:var(--font-mono);font-size:13px">${p.totalBricks || 0}</td>
            <td>
                <div style="font-weight:600">${p.fundedPercentage || 0}%</div>
                <div style="width:70px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:3px">
                    <div style="width:${Math.min(p.fundedPercentage || 0, 100)}%;height:100%;background:var(--success)"></div>
                </div>
            </td>
            <td style="font-weight:600;color:var(--success)">${p.expectedRentalYield || 0}%</td>
            <td>${statusBadge}</td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-icon" title="Toggle Publish" onclick="togglePublish('${p._id}')">
                        <i class="fas ${p.isPublished ? 'fa-eye-slash' : 'fa-eye'}" style="color:${p.isPublished ? 'var(--warning)' : 'var(--success)'}"></i>
                    </button>
                    <button class="btn-icon" title="Edit Property" onclick="editProperty('${p._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" title="Delete Property" onclick="deleteProperty('${p._id}')">
                        <i class="fas fa-trash" style="color:var(--danger)"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

// ── Property Modals & CRUD ────────────────────────────────────
function openPropertyModal() {
    editingPropertyId = null;
    currentAmenities = [];
    uploadedImages = [];
    const modal = document.getElementById("prop-modal");
    if (!modal) return;

    document.getElementById("prop-modal-title").textContent = "Add New Property Listing";
    document.getElementById("prop-form")?.reset();
    renderAmenityTags();
    renderImagesGrid();
    modal.style.display = "flex";
}

function closePropertyModal() {
    const modal = document.getElementById("prop-modal");
    if (modal) modal.style.display = "none";
    editingPropertyId = null;
}

function addAmenity() {
    const input = document.getElementById("prop-amenity-input");
    const val = input?.value.trim();
    if (val && !currentAmenities.includes(val)) {
        currentAmenities.push(val);
        input.value = "";
        renderAmenityTags();
    }
}

function removeAmenity(index) {
    currentAmenities.splice(index, 1);
    renderAmenityTags();
}

function renderAmenityTags() {
    const container = document.getElementById("prop-amenities-tags");
    if (!container) return;
    container.innerHTML = currentAmenities.map((a, i) => `
        <span class="badge badge-info" style="cursor:pointer" onclick="removeAmenity(${i})">
            ${a} <i class="fas fa-times" style="margin-left:4px"></i>
        </span>
    `).join("");
}

function renderImagesGrid() {
    const grid = document.getElementById("prop-images-grid");
    if (!grid) return;
    grid.innerHTML = uploadedImages.map((img, i) => `
        <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid ${img.isCover ? 'var(--gold)' : 'var(--border)'}">
            <img src="${img.url}" style="width:100%;height:100%;object-fit:cover" />
            <button onclick="setCover(${i})" style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:4px;padding:2px 4px;font-size:9px;cursor:pointer">
                ${img.isCover ? '★ Cover' : 'Set Cover'}
            </button>
            <button onclick="deleteImg(${i})" style="position:absolute;top:2px;right:2px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">×</button>
        </div>
    `).join("");
}

function setCover(index) {
    uploadedImages.forEach((img, i) => img.isCover = (i === index));
    renderImagesGrid();
}

function deleteImg(index) {
    uploadedImages.splice(index, 1);
    renderImagesGrid();
}

async function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        const formData = new FormData();
        formData.append("image", file);
        try {
            toast("Uploading image...", "info");
            const res = await api("/upload/image", { method: "POST", body: formData });
            if (res.success && res.url) {
                uploadedImages.push({ url: res.url, isCover: uploadedImages.length === 0 });
                renderImagesGrid();
                toast("Image uploaded", "success");
            }
        } catch (err) {
            toast("Failed to upload image", "danger");
        }
    }
}

async function saveProperty() {
    const title = document.getElementById("prop-title")?.value.trim();
    const description = document.getElementById("prop-desc")?.value.trim();
    const city = document.getElementById("prop-city")?.value.trim();
    const state = document.getElementById("prop-state")?.value.trim();
    const totalInvestment = Number(document.getElementById("prop-total-investment")?.value);
    const totalBricks = Number(document.getElementById("prop-total-bricks")?.value);
    const rentalYield = Number(document.getElementById("prop-rental-yield")?.value);

    if (!title || !totalInvestment || !totalBricks) {
        toast("Please fill in all required property details", "warning");
        return;
    }

    const payload = {
        title,
        description,
        location: { city, state },
        totalInvestmentRequired: totalInvestment,
        totalBricks,
        brickPrice: totalInvestment / totalBricks,
        expectedRentalYield: rentalYield,
        amenities: currentAmenities,
        images: uploadedImages
    };

    try {
        let res;
        if (editingPropertyId) {
            res = await api(`/admin/properties/${editingPropertyId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            res = await api("/admin/properties", {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }

        if (res.success) {
            toast(`Property ${editingPropertyId ? 'updated' : 'created'} successfully`, "success");
            closePropertyModal();
            loadProperties();
        } else {
            toast(res.message || "Failed to save property", "danger");
        }
    } catch (e) {
        toast("Network error saving property", "danger");
    }
}

async function editProperty(id) {
    editingPropertyId = id;
    try {
        const res = await api(`/admin/properties/${id}`);
        if (res.success && res.data) {
            const p = res.data;
            document.getElementById("prop-modal-title").textContent = "Edit Property Listing";
            document.getElementById("prop-title").value = p.title || "";
            document.getElementById("prop-desc").value = p.description || "";
            document.getElementById("prop-city").value = p.location?.city || "";
            document.getElementById("prop-state").value = p.location?.state || "";
            document.getElementById("prop-total-investment").value = p.totalInvestmentRequired || "";
            document.getElementById("prop-total-bricks").value = p.totalBricks || "";
            document.getElementById("prop-rental-yield").value = p.expectedRentalYield || "";
            currentAmenities = p.amenities || [];
            uploadedImages = p.images || [];
            renderAmenityTags();
            renderImagesGrid();
            document.getElementById("prop-modal").style.display = "flex";
        }
    } catch (e) {
        toast("Error fetching property details", "danger");
    }
}

async function togglePublish(id) {
    try {
        const res = await api(`/admin/properties/${id}/toggle`, { method: "PATCH" });
        if (res.success) {
            toast("Property status toggled", "success");
            loadProperties();
        } else {
            toast(res.message || "Failed to toggle status", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function deleteProperty(id) {
    if (!confirm("Are you sure you want to delete this property?")) return;
    try {
        const res = await api(`/admin/properties/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Property deleted", "success");
            loadProperties();
        } else {
            toast(res.message || "Failed to delete property", "danger");
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

// ── Enquiries ─────────────────────────────────────────────────
let allEnquiries = [];

async function loadEnquiries() {
    const body = document.getElementById("enquiries-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading customer enquiries...</div></div>`;

    try {
        const res = await api("/admin/enquiries");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load enquiries"}</div></div>`;
            return;
        }

        allEnquiries = res.data || [];
        renderEnquiryTable(allEnquiries);
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function filterEnquiries(query) {
    const q = (query || "").toLowerCase();
    const filtered = allEnquiries.filter(e =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.phone || "").toLowerCase().includes(q) ||
        (e.message || "").toLowerCase().includes(q)
    );
    renderEnquiryTable(filtered);
}

function renderEnquiryTable(enquiries) {
    const body = document.getElementById("enquiries-body");
    if (!body) return;

    if (!enquiries || enquiries.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-inbox" style="font-size:32px;color:var(--text-dim)"></i><div>No enquiries found</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Subject / Property</th>
                    <th>Message</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    enquiries.forEach(e => {
        let badgeClass = "badge-new";
        if (e.status === "resolved") badgeClass = "badge-success";
        if (e.status === "in_progress") badgeClass = "badge-pending";

        html += `
        <tr>
            <td>
                <div style="font-weight:600;color:#fff">${e.name || '—'}</div>
                <div style="font-size:12px;color:var(--text-dim)">${e.email || ''} • ${e.phone || ''}</div>
            </td>
            <td style="font-weight:500">${e.property?.title || e.subject || 'General Enquiry'}</td>
            <td style="max-width:280px;font-size:12.5px;color:var(--text-muted)">${e.message || '—'}</td>
            <td style="font-size:12px;color:var(--text-dim)">${formatDateTime(e.createdAt)}</td>
            <td><span class="badge ${badgeClass}">${e.status}</span></td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-sm btn-secondary" onclick="updateEnquiryStatus('${e._id}', '${e.status === 'resolved' ? 'new' : 'resolved'}')">
                        <i class="fas ${e.status === 'resolved' ? 'fa-undo' : 'fa-check'}"></i> ${e.status === 'resolved' ? 'Reopen' : 'Resolve'}
                    </button>
                    <button class="btn-icon" onclick="deleteEnquiry('${e._id}')">
                        <i class="fas fa-trash" style="color:var(--danger)"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

async function updateEnquiryStatus(id, status) {
    try {
        const res = await api(`/admin/enquiries/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
        if (res.success) {
            toast(`Enquiry marked as ${status}`, "success");
            loadEnquiries();
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}

async function deleteEnquiry(id) {
    if (!confirm("Are you sure?")) return;
    try {
        const res = await api(`/admin/enquiries/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Enquiry deleted", "success");
            loadEnquiries();
        }
    } catch (e) {
        toast("Network error", "danger");
    }
}
