/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Legal Policies & Agreements Controller
   ══════════════════════════════════════════════════════════════ */

let allPoliciesMap = {};
let activePolicySlug = "investor-agreement";

// ── Load All Policies ─────────────────────────────────────────
async function loadLegalPolicies() {
    const container = document.getElementById("legalpolicies-content-wrap");
    if (!container) return;

    container.innerHTML = `
        <div class="loading-box" style="padding:40px">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
            <div style="margin-top:10px;font-weight:600">Loading legal policies & agreements...</div>
        </div>
    `;

    try {
        const res = await api("/policies");
        if (res.success && Array.isArray(res.data)) {
            allPoliciesMap = {};
            res.data.forEach(p => {
                allPoliciesMap[p.slug] = p;
            });
            renderActivePolicyView();
        } else {
            container.innerHTML = `<div class="alert alert-danger">Failed to load legal policies. ${res.message || ''}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Network error loading legal policies: ${err.message}</div>`;
    }
}

// ── Tab Switching ─────────────────────────────────────────────
function switchPolicyTab(slug) {
    activePolicySlug = slug;
    document.querySelectorAll(".policy-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-slug") === slug);
    });
    renderActivePolicyView();
}

// ── Render Active Policy ──────────────────────────────────────
function renderActivePolicyView() {
    const container = document.getElementById("legalpolicies-content-wrap");
    if (!container) return;

    const policy = allPoliciesMap[activePolicySlug] || {
        slug: activePolicySlug,
        title: getPolicyDefaultTitle(activePolicySlug),
        version: "v1.0",
        content: "",
        pdfUrl: "",
        faqs: []
    };

    if (activePolicySlug === "help-support") {
        renderHelpSupportEditor(container, policy);
    } else {
        renderStandardPolicyEditor(container, policy);
    }
}

function getPolicyDefaultTitle(slug) {
    switch (slug) {
        case "investor-agreement": return "Framework Investor Agreement & LLP Partnership Terms";
        case "privacy-policy": return "Privacy & Data Protection Policy";
        case "terms-conditions": return "Terms of Service & Platform Governance";
        case "refund-cancellation": return "Refund, Cancellation & Liquidity Policy";
        case "help-support": return "Investor Help & Customer Support Center";
        default: return "Legal Policy Document";
    }
}

// ── Standard Policy Editor (Agreement, Privacy, Terms, Refund) ──
function renderStandardPolicyEditor(container, policy) {
    const hasPdf = policy.pdfUrl && policy.pdfUrl.trim().length > 0;
    const lastUpdatedFormatted = policy.lastUpdated ? new Date(policy.lastUpdated).toLocaleString("en-IN") : "Recently updated";

    container.innerHTML = `
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:24px;box-shadow:var(--shadow-sm)">
            <!-- Top Header & Actions -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:16px">
                <div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <h3 style="font-size:18px;font-weight:700;color:var(--text-main);margin:0">${policy.title || 'Legal Document'}</h3>
                        <span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;font-size:11px;font-weight:700">${policy.version || 'v1.0'}</span>
                    </div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                        <i class="far fa-clock"></i> Last updated: ${lastUpdatedFormatted} · Synced live to Vikaone mobile app
                    </div>
                </div>
                <button type="button" class="btn btn-primary" onclick="saveCurrentPolicy('${policy.slug}')" id="btn-save-policy" style="display:inline-flex;align-items:center;gap:8px;padding:8px 20px">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            </div>

            <!-- PDF Upload & Management Banner -->
            <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-sm);padding:16px;margin-bottom:20px">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:40px;height:40px;border-radius:10px;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;color:#10b981;font-size:18px">
                            <i class="fas fa-file-pdf"></i>
                        </div>
                        <div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="font-weight:700;font-size:13px;color:var(--text-main)">Official Document PDF</span>
                                ${hasPdf 
                                    ? `<span class="badge badge-success" style="background:rgba(16,185,129,0.2);color:#10b981;font-size:10.5px">PDF Active in App</span>` 
                                    : `<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--text-muted);font-size:10.5px">No PDF Attached</span>`}
                            </div>
                            <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
                                ${hasPdf ? 'Investors can view or download this official PDF directly inside the app.' : 'Upload an official certified PDF for investors to view and download.'}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px">
                        ${hasPdf ? `
                            <a href="${policy.pdfUrl}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:11.5px;padding:6px 12px;text-decoration:none">
                                <i class="fas fa-external-link-alt"></i> Preview PDF
                            </a>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePolicyPdf('${policy.slug}')" style="font-size:11.5px;padding:6px 10px">
                                <i class="fas fa-trash-alt"></i> Remove PDF
                            </button>
                        ` : ''}
                        <label class="btn btn-sm btn-primary" style="margin:0;cursor:pointer;font-size:11.5px;padding:6px 14px">
                            <i class="fas fa-cloud-upload-alt"></i> ${hasPdf ? 'Replace PDF' : 'Upload PDF'}
                            <input type="file" accept=".pdf,application/pdf" style="display:none" onchange="handlePolicyPdfUpload('${policy.slug}', event)" />
                        </label>
                    </div>
                </div>
            </div>

            <!-- Metadata Inputs -->
            <div class="form-grid-2" style="margin-bottom:18px">
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Document Title</label>
                    <input class="form-control" id="policy-title" value="${policy.title || ''}" placeholder="e.g. Framework Investor Agreement" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Version Tag</label>
                    <input class="form-control" id="policy-version" value="${policy.version || 'v1.0'}" placeholder="e.g. v2.4 (2026 Edition)" />
                </div>
            </div>

            <!-- Full Text Content Editor -->
            <div class="form-group">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <label class="form-label" style="font-weight:600;margin:0">
                        In-App Document Content / Structured Legal Text
                    </label>
                    <span style="font-size:11px;color:var(--text-muted)">
                        Displayed inside the mobile app reading view
                    </span>
                </div>
                <textarea class="form-control" id="policy-content" rows="18" style="font-family:var(--font-mono);font-size:12.5px;line-height:1.6;resize:vertical" placeholder="Enter complete policy articles, clauses, and sections...">${policy.content || ''}</textarea>
            </div>
        </div>
    `;
}

// ── Help & Support Center Editor ──────────────────────────────
function renderHelpSupportEditor(container, policy) {
    const faqs = policy.faqs || [];

    container.innerHTML = `
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:24px;box-shadow:var(--shadow-sm)">
            <!-- Top Header & Actions -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:16px">
                <div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <h3 style="font-size:18px;font-weight:700;color:var(--text-main);margin:0">Help & Customer Support Configuration</h3>
                        <span class="badge badge-success" style="font-size:11px">Live in App</span>
                    </div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                        Configures the phone, email, WhatsApp, operating hours, and FAQs shown in the Profile Help & Support section.
                    </div>
                </div>
                <button type="button" class="btn btn-primary" onclick="saveHelpSupportSettings()" id="btn-save-support" style="display:inline-flex;align-items:center;gap:8px;padding:8px 20px">
                    <i class="fas fa-save"></i> Save Support Settings
                </button>
            </div>

            <!-- Contact Channels Grid -->
            <div style="font-weight:700;font-size:13px;color:var(--text-main);margin-bottom:12px;display:flex;align-items:center;gap:6px">
                <i class="fas fa-headset" style="color:var(--primary)"></i> Investor Contact Channels
            </div>
            <div class="form-grid-3" style="margin-bottom:16px">
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Support Email</label>
                    <input class="form-control" id="support-email" value="${policy.supportEmail || 'support@vikaone.com'}" placeholder="support@vikaone.com" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Phone Hotline</label>
                    <input class="form-control" id="support-phone" value="${policy.supportPhone || '+91 80000 12345'}" placeholder="+91 80000 12345" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">WhatsApp Support Number</label>
                    <input class="form-control" id="support-whatsapp" value="${policy.supportWhatsapp || '+91 80000 12345'}" placeholder="+91 80000 12345" />
                </div>
            </div>

            <div class="form-grid-2" style="margin-bottom:24px">
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Operating / Working Hours</label>
                    <input class="form-control" id="support-hours" value="${policy.supportHours || 'Monday - Saturday: 9:30 AM - 7:00 PM IST'}" placeholder="e.g. Mon - Sat: 9:30 AM - 7:00 PM IST" />
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600">Registered Office Address</label>
                    <input class="form-control" id="support-address" value="${policy.officeAddress || 'Vikaone Realty Private Limited, Nariman Point, Mumbai, Maharashtra 400021'}" placeholder="Office address..." />
                </div>
            </div>

            <!-- FAQs Manager -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-top:1px solid var(--border-color);padding-top:20px">
                <div>
                    <div style="font-weight:700;font-size:13px;color:var(--text-main);display:flex;align-items:center;gap:6px">
                        <i class="fas fa-question-circle" style="color:#f59e0b"></i> Frequently Asked Questions (FAQs)
                    </div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
                        Displayed in the accordion on the Help & Support page in the mobile app
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="addFaqItem()" style="font-size:11.5px;padding:5px 12px">
                    <i class="fas fa-plus"></i> Add New FAQ
                </button>
            </div>

            <div id="faqs-list" style="display:flex;flex-direction:column;gap:12px">
                ${faqs.map((faq, idx) => `
                    <div class="faq-item-card" data-idx="${idx}" style="background:var(--surface2);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:14px">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
                            <div style="flex:1">
                                <label style="font-size:11.5px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">Question #${idx + 1}</label>
                                <input class="form-control faq-question" value="${escapeHtml(faq.question)}" placeholder="e.g. When are quarterly yields distributed?" style="font-size:13px;font-weight:600" />
                            </div>
                            <button type="button" class="btn-icon" onclick="removeFaqItem(${idx})" title="Delete FAQ" style="color:var(--danger);margin-top:18px">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div>
                            <label style="font-size:11.5px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:3px">Answer</label>
                            <textarea class="form-control faq-answer" rows="2" style="font-size:12.5px" placeholder="Enter clear explanation for investors...">${escapeHtml(faq.answer)}</textarea>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Save Standard Policy ──────────────────────────────────────
async function saveCurrentPolicy(slug) {
    const titleInput = document.getElementById("policy-title");
    const versionInput = document.getElementById("policy-version");
    const contentInput = document.getElementById("policy-content");

    const title = titleInput?.value.trim() || "";
    const version = versionInput?.value.trim() || "v1.0";
    const content = contentInput?.value || "";

    const btn = document.getElementById("btn-save-policy");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        toast("Saving policy changes...", "info");
        const res = await api(`/policies/${slug}`, {
            method: "PUT",
            body: JSON.stringify({ title, version, content })
        });

        if (res.success && res.data) {
            allPoliciesMap[slug] = res.data;
            toast(`${title || 'Policy'} updated successfully! Live in app.`, "success");
        } else {
            toast(res.message || "Failed to update policy", "danger");
        }
    } catch (err) {
        toast(err.message || "Error saving policy", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

// ── PDF Upload & Removal ──────────────────────────────────────
async function handlePolicyPdfUpload(slug, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("document", file);

    try {
        toast("Uploading document PDF...", "info");
        const res = await api(`/policies/${slug}/upload-pdf`, {
            method: "POST",
            body: formData
        });

        if (res.success && res.data) {
            allPoliciesMap[slug] = res.data;
            renderActivePolicyView();
            toast("Policy PDF attached successfully! Live in mobile app.", "success");
        } else {
            toast(res.message || "Failed to upload PDF", "danger");
        }
    } catch (err) {
        toast(err.message || "Error uploading PDF", "danger");
    }
}

async function removePolicyPdf(slug) {
    if (!confirm("Are you sure you want to remove the attached PDF? The mobile app will display the text content instead.")) return;

    try {
        toast("Removing PDF...", "info");
        const res = await api(`/policies/${slug}`, {
            method: "PUT",
            body: JSON.stringify({ pdfUrl: "" })
        });

        if (res.success && res.data) {
            allPoliciesMap[slug] = res.data;
            renderActivePolicyView();
            toast("PDF removed. Mobile app will display text version.", "info");
        } else {
            toast(res.message || "Failed to remove PDF", "danger");
        }
    } catch (err) {
        toast(err.message || "Error removing PDF", "danger");
    }
}

// ── FAQ Operations ────────────────────────────────────────────
function addFaqItem() {
    const currentFaqs = allPoliciesMap["help-support"]?.faqs || [];
    currentFaqs.push({
        question: "",
        answer: ""
    });
    if (!allPoliciesMap["help-support"]) {
        allPoliciesMap["help-support"] = { slug: "help-support", faqs: currentFaqs };
    } else {
        allPoliciesMap["help-support"].faqs = currentFaqs;
    }
    renderActivePolicyView();
}

function removeFaqItem(idx) {
    const currentFaqs = allPoliciesMap["help-support"]?.faqs || [];
    currentFaqs.splice(idx, 1);
    renderActivePolicyView();
}

async function saveHelpSupportSettings() {
    const email = document.getElementById("support-email")?.value.trim();
    const phone = document.getElementById("support-phone")?.value.trim();
    const whatsapp = document.getElementById("support-whatsapp")?.value.trim();
    const hours = document.getElementById("support-hours")?.value.trim();
    const address = document.getElementById("support-address")?.value.trim();

    // Gather live FAQ inputs
    const faqCards = document.querySelectorAll(".faq-item-card");
    const faqs = [];
    faqCards.forEach(card => {
        const q = card.querySelector(".faq-question")?.value.trim();
        const a = card.querySelector(".faq-answer")?.value.trim();
        if (q || a) {
            faqs.push({ question: q || "Question", answer: a || "" });
        }
    });

    const btn = document.getElementById("btn-save-support");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        toast("Saving Help & Support settings...", "info");
        const res = await api("/policies/help-support", {
            method: "PUT",
            body: JSON.stringify({
                supportEmail: email,
                supportPhone: phone,
                supportWhatsapp: whatsapp,
                supportHours: hours,
                officeAddress: address,
                faqs
            })
        });

        if (res.success && res.data) {
            allPoliciesMap["help-support"] = res.data;
            toast("Help & Support settings saved! Live in mobile app.", "success");
        } else {
            toast(res.message || "Failed to save support settings", "danger");
        }
    } catch (err) {
        toast(err.message || "Error saving support settings", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}
