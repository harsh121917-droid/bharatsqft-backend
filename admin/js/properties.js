/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Properties & Enquiries Controller
   ══════════════════════════════════════════════════════════════ */

let allProperties = [];
let editingPropertyId = null;
let currentAmenities = [];
let uploadedImages = []; // { url, isCover }
let currentValuationReport = { url: "", title: "" };
let currentPropertyDocuments = []; // { url, title, type, uploadedAt }
let currentSpvEscrowPdf = "";
let currentSpvTrusteePdf = "";

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
                    <th>Purchase Mode</th>
                    <th>Total Value</th>
                    <th>Bricks</th>
                    <th>Funded</th>
                    <th style="min-width:130px">Yield & Returns</th>
                    <th>Status / Visibility</th>
                    <th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>`;

    props.forEach(p => {
        const coverImg = (p.images || []).find(i => i.isCover)?.url || (p.images?.[0]?.url || (typeof p.images?.[0] === 'string' ? p.images[0] : ""));
        const isPublished = p.status === "published" || p.status === "active" || p.isPublished === true;
        const totalVal = p.totalInvestmentRequired || p.price?.amount || (p.brickPrice && p.totalBricks ? p.brickPrice * p.totalBricks : 0);
        const fundedPct = p.fundedPercentage ?? (p.totalBricks > 0 ? Math.round(((p.soldBricks || 0) / p.totalBricks) * 100) : 0);

        const statusBadge = isPublished
            ? `<span class="badge badge-success" style="display:inline-flex;align-items:center;gap:4px"><i class="fas fa-check-circle"></i> Published</span>`
            : `<span class="badge badge-danger" style="display:inline-flex;align-items:center;gap:4px"><i class="fas fa-eye-slash"></i> Draft</span>`;

        const mode = (p.purchaseMode || "both").toLowerCase();
        let modeBadge = `<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);font-weight:700;font-size:10.5px;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-layer-group"></i> Bricks + Direct</span>`;
        if (mode === "direct") {
            modeBadge = `<span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);font-weight:700;font-size:10.5px;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-building"></i> Direct Buy Only</span>`;
        } else if (mode === "bricks") {
            modeBadge = `<span class="badge" style="background:rgba(192,132,252,0.15);color:#c084fc;border:1px solid rgba(192,132,252,0.4);font-weight:700;font-size:10.5px;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-cubes"></i> Bricks Only</span>`;
        }

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
            <td>${modeBadge}</td>
            <td style="font-weight:700;color:var(--gold)">${formatPrice(totalVal)}</td>
            <td style="font-family:var(--font-mono);font-size:13px">${p.totalBricks || 0}</td>
            <td>
                <div style="font-weight:600">${fundedPct}%</div>
                <div style="width:70px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:3px">
                    <div style="width:${Math.min(fundedPct, 100)}%;height:100%;background:var(--success)"></div>
                </div>
            </td>
            <td>
                <div style="font-weight:700;color:var(--success);font-size:12.5px">${p.expectedRentalYield ?? 0}% Yield</div>
                <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
                    <span>${p.expectedAppreciation ?? 8.5}% Growth</span>
                    ${p.targetXirr ? ` · <strong style="color:var(--gold)">${p.targetXirr}% XIRR</strong>` : ''}
                </div>
            </td>
            <td>
                <div style="display:inline-flex;align-items:center;gap:8px">
                    <label class="switch" title="${isPublished ? 'Published in App (Click to unpublish)' : 'Draft / Hidden from App (Click to publish)'}">
                        <input type="checkbox" ${isPublished ? 'checked' : ''} onchange="togglePublish('${p._id}', this)">
                        <span class="slider"></span>
                    </label>
                    ${statusBadge}
                </div>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-icon" title="${isPublished ? 'Unpublish' : 'Publish'}" onclick="togglePublish('${p._id}')">
                        <i class="fas ${isPublished ? 'fa-eye-slash' : 'fa-eye'}" style="color:${isPublished ? 'var(--warning)' : 'var(--success)'}"></i>
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
function handlePropPurchaseModeChange() {
    const mode = document.getElementById("prop-purchase-mode")?.value || "both";
    const hint = document.getElementById("prop-purchase-mode-hint");
    if (!hint) return;
    if (mode === "direct") {
        hint.innerHTML = `<i class="fas fa-info-circle" style="color:#38bdf8"></i> <strong>Direct Buy Only:</strong> A single investor purchases 100% full ownership of this property in one single transaction.`;
    } else if (mode === "bricks") {
        hint.innerHTML = `<i class="fas fa-info-circle" style="color:#c084fc"></i> <strong>Bricks Buy Only:</strong> Investors can only purchase fractional bricks (e.g., 5, 10, 50 bricks).`;
    } else {
        hint.innerHTML = `<i class="fas fa-info-circle" style="color:var(--gold)"></i> <strong>Both Allowed:</strong> Investors can either buy individual fractional bricks OR buy the full property outright in one click.`;
    }
}

function openPropertyModal() {
    editingPropertyId = null;
    currentAmenities = [];
    uploadedImages = [];
    currentValuationReport = { url: "", title: "Valuation & Audit Report" };
    currentPropertyDocuments = [];
    currentSpvEscrowPdf = "";
    currentSpvTrusteePdf = "";

    const modal = document.getElementById("prop-modal");
    if (!modal) return;

    document.getElementById("prop-modal-title").textContent = "Add New Property Listing";
    document.getElementById("prop-form")?.reset();

    // Default specifications & financials
    if (document.getElementById("prop-type")) document.getElementById("prop-type").value = "commercial";
    if (document.getElementById("prop-bhk")) document.getElementById("prop-bhk").value = "";
    if (document.getElementById("prop-area")) document.getElementById("prop-area").value = "";
    if (document.getElementById("prop-address")) document.getElementById("prop-address").value = "";
    if (document.getElementById("prop-pincode")) document.getElementById("prop-pincode").value = "";
    if (document.getElementById("prop-sold-bricks")) document.getElementById("prop-sold-bricks").value = "0";
    if (document.getElementById("prop-appreciation")) document.getElementById("prop-appreciation").value = "8.5";
    if (document.getElementById("prop-target-xirr")) document.getElementById("prop-target-xirr").value = "";
    if (document.getElementById("prop-growth-projections")) document.getElementById("prop-growth-projections").value = "";

    const ytInput = document.getElementById("prop-youtube-url");
    if (ytInput) ytInput.value = "";
    const modeSelect = document.getElementById("prop-purchase-mode");
    if (modeSelect) modeSelect.value = "both";
    handlePropPurchaseModeChange();
    renderAmenityTags();
    renderImagesGrid();

    // Reset Valuation Report inputs & UI
    const valTitle = document.getElementById("prop-valuation-title");
    if (valTitle) valTitle.value = "Valuation & Audit Report";
    renderValuationReportPreview();

    // Reset Documents list & UI
    const docTitle = document.getElementById("new-doc-title");
    if (docTitle) docTitle.value = "";
    const docFile = document.getElementById("new-doc-file");
    if (docFile) docFile.value = "";
    renderPropertyDocumentsList();

    // Reset SPV & Escrow Protection details to defaults
    if (document.getElementById("prop-spv-name")) document.getElementById("prop-spv-name").value = "VIKAONE REALTY SERIES 001 LLP";
    if (document.getElementById("prop-spv-bank")) document.getElementById("prop-spv-bank").value = "ICICI Bank";
    if (document.getElementById("prop-spv-account-no")) document.getElementById("prop-spv-account-no").value = "705105000036";
    if (document.getElementById("prop-spv-ifsc")) document.getElementById("prop-spv-ifsc").value = "ICIC0007051";
    if (document.getElementById("prop-spv-branch")) document.getElementById("prop-spv-branch").value = "ICICI Bank Ltd, Shop No 12,13,14, Ground Floor, B Block Market, South City II, Sohna Road, Gurgaon, Haryana - 122018";
    if (document.getElementById("prop-spv-trustee-name")) document.getElementById("prop-spv-trustee-name").value = "Universal Trusteeship Services Limited";
    if (document.getElementById("prop-spv-trustee-address")) document.getElementById("prop-spv-trustee-address").value = "Premises No. 74, 7th Floor, Sakhar Bhavan, Nariman Point, Mumbai 400 021";
    if (document.getElementById("prop-spv-liquidity")) document.getElementById("prop-spv-liquidity").value = "";
    renderSpvEscrowPdfPreview();
    renderSpvTrusteePdfPreview();

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

// ── Valuation Report Handlers ───────────────────────────────────
function renderValuationReportPreview() {
    const previewBox = document.getElementById("prop-valuation-preview");
    const badge = document.getElementById("valuation-status-badge");
    const link = document.getElementById("prop-valuation-link");
    const filenameEl = document.getElementById("prop-valuation-filename");
    const titleInput = document.getElementById("prop-valuation-title");

    if (!previewBox) return;

    if (currentValuationReport && currentValuationReport.url) {
        previewBox.style.display = "flex";
        if (badge) {
            badge.className = "badge badge-success";
            badge.textContent = "PDF Uploaded";
            badge.style.background = "rgba(16,185,129,0.2)";
            badge.style.color = "#10b981";
        }
        if (link) {
            link.href = currentValuationReport.url;
        }
        if (filenameEl) {
            const parts = currentValuationReport.url.split("/");
            filenameEl.textContent = parts[parts.length - 1] || "valuation-report.pdf";
        }
        if (titleInput && currentValuationReport.title) {
            titleInput.value = currentValuationReport.title;
        }
    } else {
        previewBox.style.display = "none";
        if (badge) {
            badge.className = "badge";
            badge.textContent = "Not Uploaded";
            badge.style.background = "rgba(148,163,184,0.15)";
            badge.style.color = "var(--text-muted)";
        }
        const fileInput = document.getElementById("prop-valuation-file");
        if (fileInput) fileInput.value = "";
    }
}

async function handleValuationReportUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("document", file);
    try {
        toast("Uploading valuation report PDF...", "info");
        const res = await api("/upload/document", { method: "POST", body: formData });
        if (res.success && res.url) {
            const titleInput = document.getElementById("prop-valuation-title");
            const title = titleInput?.value.trim() || "Valuation & Audit Report";
            currentValuationReport = {
                url: res.url,
                title: title
            };
            renderValuationReportPreview();
            toast("Valuation report uploaded successfully", "success");
        } else {
            toast(res.message || "Failed to upload valuation report", "danger");
        }
    } catch (err) {
        toast(err.message || "Error uploading valuation report", "danger");
    }
}

function removeValuationReport() {
    currentValuationReport = { url: "", title: "" };
    const titleInput = document.getElementById("prop-valuation-title");
    if (titleInput) titleInput.value = "Valuation & Audit Report";
    renderValuationReportPreview();
    toast("Valuation report removed", "info");
}

// ── Property Documents Handlers ─────────────────────────────────
function renderPropertyDocumentsList() {
    const list = document.getElementById("prop-documents-list");
    const countBadge = document.getElementById("prop-docs-count-badge");
    if (!list) return;

    if (countBadge) {
        countBadge.textContent = `${currentPropertyDocuments.length} Document${currentPropertyDocuments.length === 1 ? '' : 's'}`;
    }

    if (!currentPropertyDocuments || currentPropertyDocuments.length === 0) {
        list.innerHTML = `<div style="font-size:12px;color:var(--text-muted);font-style:italic;padding:8px;text-align:center">No legal documents attached yet. Use the form above to upload PDFs.</div>`;
        return;
    }

    list.innerHTML = currentPropertyDocuments.map((doc, idx) => `
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <i class="fas fa-file-pdf" style="color:#ef4444;font-size:20px;flex-shrink:0"></i>
                <div style="min-width:0">
                    <div style="font-weight:600;font-size:12.5px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${doc.title || 'Untitled Document'}</div>
                    <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:8px">
                        <span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;font-size:10px;padding:1px 6px">${doc.type || 'Legal Document'}</span>
                        <a href="${doc.url}" target="_blank" style="color:#38bdf8;text-decoration:underline">Preview PDF</a>
                    </div>
                </div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePropertyDocument(${idx})" style="padding:3px 8px;font-size:11px;flex-shrink:0">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join("");
}

async function handlePropertyDocumentUpload() {
    const titleInput = document.getElementById("new-doc-title");
    const typeSelect = document.getElementById("new-doc-type");
    const fileInput = document.getElementById("new-doc-file");

    const title = titleInput?.value.trim();
    const type = typeSelect?.value || "Other";
    const file = fileInput?.files?.[0];

    if (!title) {
        toast("Please enter a document title (e.g. Title Deed & Search)", "warning");
        return;
    }
    if (!file) {
        toast("Please select a PDF file to upload", "warning");
        return;
    }

    const formData = new FormData();
    formData.append("document", file);

    const btn = document.getElementById("btn-upload-doc");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading...`;
    }

    try {
        toast("Uploading document PDF...", "info");
        const res = await api("/upload/document", { method: "POST", body: formData });
        if (res.success && res.url) {
            currentPropertyDocuments.push({
                title,
                type,
                url: res.url,
                uploadedAt: new Date().toISOString()
            });
            if (titleInput) titleInput.value = "";
            if (fileInput) fileInput.value = "";
            renderPropertyDocumentsList();
            toast("Document attached successfully", "success");
        } else {
            toast(res.message || "Failed to upload document", "danger");
        }
    } catch (err) {
        toast(err.message || "Error uploading document", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

function removePropertyDocument(index) {
    currentPropertyDocuments.splice(index, 1);
    renderPropertyDocumentsList();
    toast("Document removed", "info");
}

// ── SPV & Escrow Document Handlers ──────────────────────────────
function renderSpvEscrowPdfPreview() {
    const previewBox = document.getElementById("prop-spv-escrow-preview");
    const badge = document.getElementById("spv-escrow-badge");
    const link = document.getElementById("prop-spv-escrow-link");
    const fileInput = document.getElementById("prop-spv-escrow-file");

    if (!previewBox) return;

    if (currentSpvEscrowPdf) {
        previewBox.style.display = "flex";
        if (badge) {
            badge.className = "badge badge-success";
            badge.textContent = "PDF Uploaded";
            badge.style.background = "rgba(16,185,129,0.2)";
            badge.style.color = "#10b981";
        }
        if (link) {
            link.href = currentSpvEscrowPdf;
            const parts = currentSpvEscrowPdf.split("/");
            link.textContent = parts[parts.length - 1] || "icici-escrow-certificate.pdf";
        }
    } else {
        previewBox.style.display = "none";
        if (badge) {
            badge.className = "badge";
            badge.textContent = "No PDF Uploaded";
            badge.style.background = "rgba(148,163,184,0.15)";
            badge.style.color = "var(--text-muted)";
        }
        if (fileInput) fileInput.value = "";
    }
}

async function handleSpvEscrowPdfUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("document", file);
    try {
        toast("Uploading ICICI Escrow certificate PDF...", "info");
        const res = await api("/upload/document", { method: "POST", body: formData });
        if (res.success && res.url) {
            currentSpvEscrowPdf = res.url;
            renderSpvEscrowPdfPreview();
            toast("ICICI Escrow certificate uploaded successfully", "success");
        } else {
            toast(res.message || "Failed to upload certificate", "danger");
        }
    } catch (err) {
        toast(err.message || "Error uploading escrow certificate", "danger");
    }
}

function removeSpvEscrowPdf() {
    currentSpvEscrowPdf = "";
    renderSpvEscrowPdfPreview();
    toast("ICICI Escrow certificate removed", "info");
}

function renderSpvTrusteePdfPreview() {
    const previewBox = document.getElementById("prop-spv-trustee-preview");
    const badge = document.getElementById("spv-trustee-badge");
    const link = document.getElementById("prop-spv-trustee-link");
    const fileInput = document.getElementById("prop-spv-trustee-file");

    if (!previewBox) return;

    if (currentSpvTrusteePdf) {
        previewBox.style.display = "flex";
        if (badge) {
            badge.className = "badge badge-success";
            badge.textContent = "PDF Uploaded";
            badge.style.background = "rgba(16,185,129,0.2)";
            badge.style.color = "#10b981";
        }
        if (link) {
            link.href = currentSpvTrusteePdf;
            const parts = currentSpvTrusteePdf.split("/");
            link.textContent = parts[parts.length - 1] || "trustee-certificate.pdf";
        }
    } else {
        previewBox.style.display = "none";
        if (badge) {
            badge.className = "badge";
            badge.textContent = "No PDF Uploaded";
            badge.style.background = "rgba(148,163,184,0.15)";
            badge.style.color = "var(--text-muted)";
        }
        if (fileInput) fileInput.value = "";
    }
}

async function handleSpvTrusteePdfUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("document", file);
    try {
        toast("Uploading Trustee certificate PDF...", "info");
        const res = await api("/upload/document", { method: "POST", body: formData });
        if (res.success && res.url) {
            currentSpvTrusteePdf = res.url;
            renderSpvTrusteePdfPreview();
            toast("Trustee appointment certificate uploaded successfully", "success");
        } else {
            toast(res.message || "Failed to upload trustee certificate", "danger");
        }
    } catch (err) {
        toast(err.message || "Error uploading trustee certificate", "danger");
    }
}

function removeSpvTrusteePdf() {
    currentSpvTrusteePdf = "";
    renderSpvTrusteePdfPreview();
    toast("Trustee certificate removed", "info");
}

async function saveProperty() {
    const title = document.getElementById("prop-title")?.value.trim();
    const description = document.getElementById("prop-desc")?.value.trim();
    const city = document.getElementById("prop-city")?.value.trim();
    const state = document.getElementById("prop-state")?.value.trim();
    const totalInvestment = Number(document.getElementById("prop-total-investment")?.value);
    const totalBricks = Number(document.getElementById("prop-total-bricks")?.value);
    const rentalYield = Number(document.getElementById("prop-rental-yield")?.value);
    const purchaseMode = document.getElementById("prop-purchase-mode")?.value || "both";
    const youtubeUrl = document.getElementById("prop-youtube-url")?.value.trim() || "";

    const propertyType = document.getElementById("prop-type")?.value || "commercial";
    const bhk = document.getElementById("prop-bhk")?.value.trim() || "";
    const area = Number(document.getElementById("prop-area")?.value) || 0;
    const address = document.getElementById("prop-address")?.value.trim() || "";
    const pincode = document.getElementById("prop-pincode")?.value.trim() || "";
    const soldBricks = Number(document.getElementById("prop-sold-bricks")?.value) || 0;
    const expectedAppreciation = Number(document.getElementById("prop-appreciation")?.value) || 8.5;
    const targetXirr = Number(document.getElementById("prop-target-xirr")?.value) || 0;
    const growthProjections = document.getElementById("prop-growth-projections")?.value.trim() || "";

    // SPV & Escrow fields
    const spvName = document.getElementById("prop-spv-name")?.value.trim() || "VIKAONE REALTY SERIES 001 LLP";
    const spvEscrowBank = document.getElementById("prop-spv-bank")?.value.trim() || "ICICI Bank";
    const spvEscrowAccountNo = document.getElementById("prop-spv-account-no")?.value.trim() || "705105000036";
    const spvEscrowIfsc = document.getElementById("prop-spv-ifsc")?.value.trim() || "ICIC0007051";
    const spvEscrowBranch = document.getElementById("prop-spv-branch")?.value.trim() || "";
    const spvTrusteeName = document.getElementById("prop-spv-trustee-name")?.value.trim() || "Universal Trusteeship Services Limited";
    const spvTrusteeAddress = document.getElementById("prop-spv-trustee-address")?.value.trim() || "";
    const spvLiquidityPolicy = document.getElementById("prop-spv-liquidity")?.value.trim() || "";

    if (!title || !totalInvestment || !totalBricks) {
        toast("Please fill in all required property details (Title, Total Investment, Total Bricks)", "warning");
        return;
    }

    const brickPrice = totalBricks > 0 ? Math.round(totalInvestment / totalBricks) : 0;

    const payload = {
        title,
        description: description || title,
        propertyType,
        bhk,
        area,
        location: { address, city, state, pincode },
        totalInvestmentRequired: totalInvestment,
        totalBricks,
        soldBricks,
        brickPrice,
        price: {
            amount: totalInvestment,
            currency: "INR",
            label: "onwards"
        },
        expectedRentalYield: isNaN(rentalYield) ? 3 : rentalYield,
        expectedAppreciation: isNaN(expectedAppreciation) ? 8.5 : expectedAppreciation,
        targetXirr: isNaN(targetXirr) ? 0 : targetXirr,
        growthProjections,
        purchaseMode,
        youtubeUrl,
        investmentEnabled: true,
        featured: true,
        status: "published", // Automatically published so it is visible in app immediately!
        amenities: currentAmenities,
        images: uploadedImages.map(img => ({ url: img.url, isCover: !!img.isCover })),
        valuationReportUrl: currentValuationReport.url || "",
        valuationReportTitle: document.getElementById("prop-valuation-title")?.value.trim() || currentValuationReport.title || "Valuation & Audit Report",
        documents: currentPropertyDocuments,
        spvName,
        spvEscrowBank,
        spvEscrowAccountNo,
        spvEscrowIfsc,
        spvEscrowBranch,
        spvEscrowCertificateUrl: currentSpvEscrowPdf || "",
        spvTrusteeName,
        spvTrusteeAddress,
        spvTrusteeCertificateUrl: currentSpvTrusteePdf || "",
        spvLiquidityPolicy
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
            toast(`Property ${editingPropertyId ? 'updated' : 'created and published'} successfully! Visible in app.`, "success");
            closePropertyModal();
            loadProperties();
        } else {
            toast(res.message || "Failed to save property", "danger");
        }
    } catch (e) {
        toast(e.message || "Network error saving property", "danger");
    }
}

function populatePropertyModal(p) {
    const modal = document.getElementById("prop-modal");
    if (!modal) {
        console.error("prop-modal element not found in DOM!");
        toast("Property modal element not found in DOM", "danger");
        return;
    }

    // 1. Immediately display the modal overlay so user gets instant visual response
    modal.style.display = "flex";

    if (!p) return;
    editingPropertyId = p._id ? String(p._id) : editingPropertyId;

    try {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = (val !== undefined && val !== null) ? val : "";
        };

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setText("prop-modal-title", "Edit Property Listing");
        setVal("prop-title", p.title || "");
        setVal("prop-desc", p.description || "");

        // Specifications
        setVal("prop-type", p.propertyType || "commercial");
        setVal("prop-bhk", p.bhk || "");
        setVal("prop-area", p.area || "");
        setVal("prop-address", p.location?.address || "");
        setVal("prop-city", p.location?.city || "");
        setVal("prop-state", p.location?.state || "");
        setVal("prop-pincode", p.location?.pincode || "");

        const totalVal = p.totalInvestmentRequired || p.price?.amount || (p.brickPrice && p.totalBricks ? p.brickPrice * p.totalBricks : "");
        setVal("prop-total-investment", totalVal);
        setVal("prop-total-bricks", p.totalBricks || "");
        setVal("prop-sold-bricks", p.soldBricks ?? 0);
        setVal("prop-rental-yield", p.expectedRentalYield ?? "");
        setVal("prop-appreciation", p.expectedAppreciation ?? 8.5);
        setVal("prop-target-xirr", p.targetXirr ?? "");
        setVal("prop-growth-projections", p.growthProjections || "");

        setVal("prop-youtube-url", p.youtubeUrl || (p.videos?.[0]?.url || ""));
        setVal("prop-purchase-mode", p.purchaseMode || "both");
        try { handlePropPurchaseModeChange(); } catch (e) { console.warn(e); }

        currentAmenities = Array.isArray(p.amenities) ? [...p.amenities] : [];

        // Safely map uploaded images
        uploadedImages = [];
        if (Array.isArray(p.images)) {
            uploadedImages = p.images.filter(Boolean).map(img => {
                if (typeof img === 'string') return { url: img, isCover: false };
                return { url: img.url || "", isCover: !!img.isCover };
            }).filter(img => !!img.url);
        }
        if (uploadedImages.length > 0 && !uploadedImages.some(i => i.isCover)) {
            uploadedImages[0].isCover = true;
        }
        try { renderAmenityTags(); } catch (e) { console.warn(e); }
        try { renderImagesGrid(); } catch (e) { console.warn(e); }

        // Load Valuation Report
        currentValuationReport = {
            url: p.valuationReportUrl || "",
            title: p.valuationReportTitle || "Valuation & Audit Report"
        };
        try { renderValuationReportPreview(); } catch (e) { console.warn(e); }

        // Load Property Documents
        currentPropertyDocuments = [];
        if (Array.isArray(p.documents)) {
            currentPropertyDocuments = p.documents.filter(Boolean).map(d => ({
                title: d.title || "",
                type: d.type || "Other",
                url: d.url || "",
                uploadedAt: d.uploadedAt
            }));
        }
        try { renderPropertyDocumentsList(); } catch (e) { console.warn(e); }

        // Load SPV & Escrow Protection details
        setVal("prop-spv-name", p.spvName || "VIKAONE REALTY SERIES 001 LLP");
        setVal("prop-spv-bank", p.spvEscrowBank || "ICICI Bank");
        setVal("prop-spv-account-no", p.spvEscrowAccountNo || "705105000036");
        setVal("prop-spv-ifsc", p.spvEscrowIfsc || "ICIC0007051");
        setVal("prop-spv-branch", p.spvEscrowBranch || "ICICI Bank Ltd, Shop No 12,13,14, Ground Floor, B Block Market, South City II, Sohna Road, Gurgaon, Haryana - 122018");
        currentSpvEscrowPdf = p.spvEscrowCertificateUrl || "";
        try { renderSpvEscrowPdfPreview(); } catch (e) { console.warn(e); }

        setVal("prop-spv-trustee-name", p.spvTrusteeName || "Universal Trusteeship Services Limited");
        setVal("prop-spv-trustee-address", p.spvTrusteeAddress || "Premises No. 74, 7th Floor, Sakhar Bhavan, Nariman Point, Mumbai 400 021");
        currentSpvTrusteePdf = p.spvTrusteeCertificateUrl || "";
        try { renderSpvTrusteePdfPreview(); } catch (e) { console.warn(e); }

        setVal("prop-spv-liquidity", p.spvLiquidityPolicy || "");
    } catch (err) {
        console.error("Error populating property fields:", err);
    }
}

async function editProperty(id) {
    if (!id) return;
    editingPropertyId = String(id);
    const modal = document.getElementById("prop-modal");

    // 1. Immediately open modal with instant visual response
    if (modal) {
        modal.style.display = "flex";
    }

    // 2. Instant population from client cache
    const cached = allProperties.find(p => String(p._id) === String(id));
    if (cached) {
        populatePropertyModal(cached);
    }

    // 3. Background fresh details fetch
    try {
        const res = await api(`/admin/properties/${id}`);
        if (res && res.success && res.data) {
            populatePropertyModal(res.data);
        }
    } catch (e) {
        console.warn("Could not fetch remote property details, kept local state:", e);
        if (!cached) {
            toast("Error loading property details from server", "danger");
            if (modal) modal.style.display = "none";
        }
    }
}

window.editProperty = editProperty;
window.populatePropertyModal = populatePropertyModal;
window.openPropertyModal = openPropertyModal;
window.closePropertyModal = closePropertyModal;

async function togglePublish(id, inputEl) {
    try {
        toast("Updating property status...", "info");
        const res = await api(`/admin/properties/${id}/toggle`, { method: "PATCH" });
        if (res.success) {
            const isNowPub = res.status === "published" || res.status === "active" || res.isPublished === true;
            toast(`Property ${isNowPub ? 'published (live in app)' : 'moved to draft (hidden from app)'}`, "success");
            loadProperties();
        } else {
            toast(res.message || "Failed to toggle status", "danger");
            if (inputEl) inputEl.checked = !inputEl.checked;
        }
    } catch (e) {
        toast(e.message || "Network error toggling status", "danger");
        if (inputEl) inputEl.checked = !inputEl.checked;
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

// ── Enquiries & Full Ownership Lead Tracking ──────────────────
let allEnquiries = [];
let currentEnquiryTab = "all";

function setEnquiryTab(tab) {
    currentEnquiryTab = tab;
    const btnAll = document.getElementById("btn-enquiry-all");
    const btnLeads = document.getElementById("btn-enquiry-leads");
    const btnGen = document.getElementById("btn-enquiry-general");

    if (btnAll) btnAll.className = `btn btn-sm ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`;
    if (btnLeads) btnLeads.className = `btn btn-sm ${tab === 'leads' ? 'btn-primary' : 'btn-secondary'}`;
    if (btnGen) btnGen.className = `btn btn-sm ${tab === 'general' ? 'btn-primary' : 'btn-secondary'}`;

    filterEnquiries(document.querySelector("#page-enquiries .search-bar")?.value || "");
}

async function loadEnquiries() {
    const body = document.getElementById("enquiries-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading customer enquiries & leads...</div></div>`;

    try {
        const res = await api("/admin/enquiries");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load enquiries"}</div></div>`;
            return;
        }

        allEnquiries = res.data || [];
        const leadsCount = allEnquiries.filter(e => e.type === "full_ownership_lead" || e.preferredDate).length;
        const badge = document.getElementById("leads-count-badge");
        if (badge) badge.textContent = leadsCount;

        filterEnquiries(document.querySelector("#page-enquiries .search-bar")?.value || "");
    } catch (err) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading enquiries</div></div>`;
    }
}

function filterEnquiries(query) {
    const q = (query || "").toLowerCase();
    let filtered = allEnquiries.filter(e => {
        if (currentEnquiryTab === "leads") {
            return e.type === "full_ownership_lead" || !!e.preferredDate;
        } else if (currentEnquiryTab === "general") {
            return e.type !== "full_ownership_lead" && !e.preferredDate;
        }
        return true;
    });

    if (q) {
        filtered = filtered.filter(e =>
            (e.name || "").toLowerCase().includes(q) ||
            (e.email || "").toLowerCase().includes(q) ||
            (e.phone || "").toLowerCase().includes(q) ||
            (e.propertyTitle || "").toLowerCase().includes(q) ||
            (e.property?.title || "").toLowerCase().includes(q) ||
            (e.preferredDate || "").toLowerCase().includes(q) ||
            (e.message || "").toLowerCase().includes(q)
        );
    }
    renderEnquiryTable(filtered);
}

function renderEnquiryTable(enquiries) {
    const body = document.getElementById("enquiries-body");
    if (!body) return;

    if (!enquiries || enquiries.length === 0) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-inbox" style="font-size:32px;color:var(--text-dim)"></i><div>No enquiries or leads found in this view</div></div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Customer Details</th>
                    <th>Type & Property</th>
                    <th>Scheduled Callback</th>
                    <th>Notes / Message</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    enquiries.forEach(e => {
        const isFullOwnership = e.type === "full_ownership_lead" || !!e.preferredDate;
        let badgeColor = "#6b7280";
        if (e.status === "scheduled") badgeColor = "#8b5cf6";
        if (e.status === "contacted") badgeColor = "#3b82f6";
        if (e.status === "deal_in_progress") badgeColor = "#f59e0b";
        if (e.status === "resolved") badgeColor = "#10b981";
        if (e.status === "new") badgeColor = "#ec4899";

        html += `
        <tr style="${isFullOwnership ? 'background:rgba(99,102,241,0.04);' : ''}">
            <td>
                <div style="font-weight:700;color:#fff">${e.name || 'Anonymous User'}</div>
                <div style="font-size:12px;color:var(--text-dim)">
                    <a href="tel:${e.phone || ''}" style="color:var(--gold);text-decoration:none">📞 ${e.phone || '—'}</a>
                    ${e.email ? ` • <span style="color:var(--text-dim)">${e.email}</span>` : ''}
                </div>
            </td>
            <td>
                ${isFullOwnership ? `
                    <span class="badge" style="background:rgba(99,102,241,0.25);color:#818cf8;border:1px solid rgba(99,102,241,0.4);font-size:11px;font-weight:700">
                        <i class="fas fa-crown"></i> Full Ownership Lead
                    </span>
                ` : `
                    <span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-dim);font-size:11px">General Enquiry</span>
                `}
                <div style="font-size:12.5px;font-weight:600;color:var(--text-main);margin-top:4px">
                    🏢 ${e.propertyTitle || e.property?.title || e.subject || 'General'}
                </div>
            </td>
            <td>
                ${(e.preferredDate || e.preferredTime) ? `
                    <div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:4px 8px;display:inline-block">
                        <div style="font-weight:700;color:#10b981;font-size:11.5px">
                            <i class="fas fa-calendar-alt"></i> ${e.preferredDate || 'Any Date'}
                        </div>
                        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
                            <i class="fas fa-clock"></i> ${e.preferredTime || 'Any Time'}
                        </div>
                    </div>
                ` : `<span style="color:var(--text-dim);font-size:12px">—</span>`}
            </td>
            <td style="max-width:240px;font-size:12px;color:var(--text-muted);word-break:break-word">
                ${e.message || '—'}
            </td>
            <td style="font-size:12px;color:var(--text-dim);white-space:nowrap">${formatDateTime(e.createdAt)}</td>
            <td>
                <select class="form-control" onchange="updateEnquiryStatus('${e._id}', this.value)" style="font-size:11px;padding:3px 6px;height:auto;font-weight:700;color:${badgeColor};border-color:${badgeColor}">
                    <option value="new" ${e.status === 'new' ? 'selected' : ''}>New</option>
                    <option value="scheduled" ${e.status === 'scheduled' ? 'selected' : ''}>📅 Scheduled</option>
                    <option value="contacted" ${e.status === 'contacted' ? 'selected' : ''}>📞 Contacted</option>
                    <option value="deal_in_progress" ${e.status === 'deal_in_progress' ? 'selected' : ''}>💼 In Progress</option>
                    <option value="resolved" ${e.status === 'resolved' ? 'selected' : ''}>✅ Resolved</option>
                    <option value="closed" ${e.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn-icon" title="Delete enquiry" onclick="deleteEnquiry('${e._id}')">
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
            toast(`Lead status updated to ${status}`, "success");
            loadEnquiries();
        }
    } catch (e) {
        toast("Network error updating status", "danger");
    }
}

async function deleteEnquiry(id) {
    if (!confirm("Are you sure you want to delete this enquiry/lead?")) return;
    try {
        const res = await api(`/admin/enquiries/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Enquiry deleted", "success");
            loadEnquiries();
        }
    } catch (e) {
        toast("Network error deleting enquiry", "danger");
    }
}
