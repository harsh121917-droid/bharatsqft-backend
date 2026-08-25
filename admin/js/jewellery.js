/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Modern Jewellery, Bullion Coins, SKUs & Inventory Suite
   ══════════════════════════════════════════════════════════════ */

let allJewellery = [];
let allCategories = [];
let allCoins = [];
let allInventory = [];
let allOrders = [];
let activeJewelleryTab = "products";
let selectedJewelleryCategory = "all";
let selectedJewelleryMetal = "all";
let jewellerySearchQuery = "";
let inventorySearchQuery = "";
let editingJewelleryId = null;
let editingCoinId = null;
let activeRestockItem = null;
let activeOrder = null;
let ordersPage = 1;

let liveGoldRate = 7500;
let liveSilverRate = 90;

// ── 1. Tab Switching (Products, Coins, Inventory, Categories) ──
function switchJewelleryTab(tab) {
    activeJewelleryTab = tab;
    
    // Update Tab Buttons
    document.querySelectorAll(".jewellery-tab-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`tab-jewellery-${tab}-btn`);
    if (activeBtn) activeBtn.classList.add("active");

    // Toggle Panels
    const prodPanel = document.getElementById("jewellery-products-panel");
    const coinPanel = document.getElementById("jewellery-coins-panel");
    const invPanel = document.getElementById("jewellery-inventory-panel");
    const catPanel = document.getElementById("jewellery-categories-panel");

    if (prodPanel) prodPanel.style.display = tab === "products" ? "block" : "none";
    if (coinPanel) coinPanel.style.display = tab === "coins" ? "block" : "none";
    if (invPanel) invPanel.style.display = tab === "inventory" ? "block" : "none";
    if (catPanel) catPanel.style.display = tab === "categories" ? "block" : "none";

    // Toggle Top Action Buttons
    const addJewelleryBtn = document.getElementById("btn-add-jewellery-top");
    const addCoinBtn = document.getElementById("btn-add-coin-top");
    const addCategoryBtn = document.getElementById("btn-add-category-top");
    const backfillBtn = document.getElementById("btn-backfill-skus-top");

    if (addJewelleryBtn) addJewelleryBtn.style.display = tab === "products" ? "inline-flex" : "none";
    if (addCoinBtn) addCoinBtn.style.display = tab === "coins" ? "inline-flex" : "none";
    if (addCategoryBtn) addCategoryBtn.style.display = tab === "categories" ? "inline-flex" : "none";
    if (backfillBtn) backfillBtn.style.display = tab === "inventory" ? "inline-flex" : "none";

    if (tab === "products") loadJewellery();
    else if (tab === "coins") loadCoins();
    else if (tab === "inventory") loadInventory();
    else if (tab === "categories") loadCategories();
}

// ── Helper: Copy SKU to Clipboard ───────────────────────────────
function copySkuToClipboard(sku) {
    if (!sku) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sku).then(() => {
            toast(`SKU "${sku}" copied to clipboard!`, "success");
        }).catch(() => {
            prompt("Copy SKU:", sku);
        });
    } else {
        prompt("Copy SKU:", sku);
    }
}

// ── 2. Jewellery Catalog ──────────────────────────────────────
async function loadJewellery() {
    const body = document.getElementById("jewellery-catalog-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading jewellery catalog & categories...</div></div>`;

    try {
        // Fetch Live Rates for Value Calculation
        try {
            const ratesRes = await api("/gold/rate");
            if (ratesRes.success && ratesRes.data) {
                liveGoldRate = ratesRes.data.gold?.buyRate || 7500;
                liveSilverRate = ratesRes.data.silver?.buyRate || 240;
            }
        } catch (e) {}

        const [catRes, prodRes] = await Promise.all([
            api("/jewellery/categories"),
            api("/jewellery/products")
        ]);

        allCategories = catRes.success ? (catRes.data || []) : [];
        allJewellery = prodRes.success ? (prodRes.data || []) : [];

        populateCategoryDropdown(allCategories);
        renderCategoryFilterPills(allCategories);
        filterAndRenderJewellery();

        if (!prodRes.success && allJewellery.length === 0) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${prodRes.message || "Failed to load jewellery"}</div></div>`;
        }
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading catalogue</div></div>`;
    }
}

function renderCategoryFilterPills(categories) {
    const container = document.getElementById("jewellery-category-pills");
    if (!container) return;

    const catMap = new Map();
    (categories || []).forEach(c => {
        if (c.name) catMap.set(c.name.trim().toLowerCase(), c.name.trim());
    });
    (allJewellery || []).forEach(j => {
        if (j.category) catMap.set(j.category.trim().toLowerCase(), j.category.trim());
    });

    const categoryList = Array.from(catMap.values());

    let html = `<button class="filter-pill ${selectedJewelleryCategory === 'all' ? 'active' : ''}" onclick="filterJewelleryByCategory('all')">All Items (${allJewellery.length})</button>`;
    
    categoryList.forEach(catName => {
        const count = allJewellery.filter(j => (j.category || "").toLowerCase().trim() === catName.toLowerCase().trim()).length;
        const isActive = selectedJewelleryCategory.toLowerCase() === catName.toLowerCase();
        html += `<button class="filter-pill ${isActive ? 'active' : ''}" onclick="filterJewelleryByCategory('${catName}')">${catName} (${count})</button>`;
    });

    container.innerHTML = html;
}

function populateCategoryDropdown(categories) {
    const select = document.getElementById("jewellery-category-select");
    if (!select) return;

    let html = `<option value="">Select Category</option>`;
    categories.forEach(cat => {
        html += `<option value="${cat.name}">${cat.name}</option>`;
    });
    select.innerHTML = html;
}

function filterJewelleryByCategory(cat) {
    selectedJewelleryCategory = cat;
    renderCategoryFilterPills(allCategories);
    filterAndRenderJewellery();
}

function onJewellerySearch(query) {
    jewellerySearchQuery = (query || "").toLowerCase().trim();
    filterAndRenderJewellery();
}

function onJewelleryMetalFilter(metal) {
    selectedJewelleryMetal = metal;
    filterAndRenderJewellery();
}

function filterAndRenderJewellery() {
    let filtered = allJewellery;

    if (selectedJewelleryCategory !== "all") {
        filtered = filtered.filter(j => (j.category || "").toLowerCase().trim() === selectedJewelleryCategory.toLowerCase().trim());
    }

    if (selectedJewelleryMetal !== "all") {
        filtered = filtered.filter(j => (j.metalType || "gold").toLowerCase().trim() === selectedJewelleryMetal.toLowerCase().trim());
    }

    if (jewellerySearchQuery) {
        filtered = filtered.filter(j =>
            (j.sku || "").toLowerCase().includes(jewellerySearchQuery) ||
            (j.name || "").toLowerCase().includes(jewellerySearchQuery) ||
            (j.category || "").toLowerCase().includes(jewellerySearchQuery) ||
            (j.purity || "").toLowerCase().includes(jewellerySearchQuery)
        );
    }

    renderJewelleryGrid(filtered);
}

// ── Helper: Live Rate per Purity ────────────────────────────────
function getLiveRateForPurity(metal, purity) {
    const isGold = (metal || "gold").toLowerCase() === "gold";
    if (isGold) {
        const p = (purity || "").toLowerCase();
        if (p.includes("24k") || p.includes("999") || p.includes("99.9")) {
            return { rate: liveGoldRate, label: "24K Gold (99.9%)" };
        } else if (p.includes("18k") || p.includes("750")) {
            return { rate: Math.round(liveGoldRate * 18 / 24), label: "18K Gold (75.0%)" };
        } else if (p.includes("14k") || p.includes("585")) {
            return { rate: Math.round(liveGoldRate * 14 / 24), label: "14K Gold (58.5%)" };
        } else {
            // Default 22K (916)
            return { rate: Math.round(liveGoldRate * 22 / 24), label: "22K Gold (91.6%)" };
        }
    } else {
        const p = (purity || "").toLowerCase();
        if (p.includes("925")) {
            return { rate: Math.round(liveSilverRate * 0.925), label: "925 Sterling Silver" };
        } else {
            return { rate: liveSilverRate, label: "999 Fine Silver" };
        }
    }
}

function updateLiveJewelleryCalculation() {
    const metal = document.getElementById("jewellery-metal")?.value || "gold";
    const purity = document.getElementById("jewellery-purity")?.value || "22K Gold";
    const weight = parseFloat(document.getElementById("jewellery-weight")?.value) || 0;
    const basePriceOverride = parseFloat(document.getElementById("jewellery-price")?.value) || 0;
    const priceAdjustment = parseFloat(document.getElementById("jewellery-price-adjustment")?.value) || 0;
    const making = parseFloat(document.getElementById("jewellery-making")?.value) || 0;
    const gst = parseFloat(document.getElementById("jewellery-gst")?.value) || 3;

    // Update Live Benchmark Ticker in Modal
    setElText("modal-live-gold-24k", `₹${liveGoldRate.toLocaleString("en-IN")}/g`);
    setElText("modal-live-gold-22k", `₹${Math.round(liveGoldRate * 22 / 24).toLocaleString("en-IN")}/g`);
    setElText("modal-live-gold-18k", `₹${Math.round(liveGoldRate * 18 / 24).toLocaleString("en-IN")}/g`);
    setElText("modal-live-silver-999", `₹${liveSilverRate.toLocaleString("en-IN")}/g`);

    const { rate, label } = getLiveRateForPurity(metal, purity);
    const baseMetalVal = Math.round(weight * rate);
    const subtotal = baseMetalVal + making;
    const gstAmt = Math.round(subtotal * (gst / 100));
    const formulaMarketRate = baseMetalVal + making + gstAmt;

    const marketRate = basePriceOverride > 0 ? basePriceOverride : formulaMarketRate;
    const finalPrice = Math.max(0, Math.round(marketRate + priceAdjustment));

    // Update calculation preview box
    setElText("calc-purity-rate-tag", `${label} Rate: ₹${rate.toLocaleString("en-IN")}/g`);
    setElText("calc-base-metal-val", `₹${baseMetalVal.toLocaleString("en-IN")}`);
    setElText("calc-making-gst-val", `₹${(making + gstAmt).toLocaleString("en-IN")}`);
    setElText("calc-market-rate-val", `₹${marketRate.toLocaleString("en-IN")}`);
    setElText("calc-formula-market", `₹${marketRate.toLocaleString("en-IN")} (Market)`);

    const adjEl = document.getElementById("calc-formula-adj");
    if (adjEl) {
        if (priceAdjustment > 0) {
            adjEl.innerHTML = ` <span style="color:#10b981;font-weight:700">+ ₹${priceAdjustment.toLocaleString("en-IN")} (Admin Adj.)</span>`;
        } else if (priceAdjustment < 0) {
            adjEl.innerHTML = ` <span style="color:#ef4444;font-weight:700">- ₹${Math.abs(priceAdjustment).toLocaleString("en-IN")} (Admin Adj.)</span>`;
        } else {
            adjEl.innerHTML = ` <span style="color:var(--text-dim)">+ ₹0 (No Adj.)</span>`;
        }
    }

    setElText("calc-final-price-val", `₹${finalPrice.toLocaleString("en-IN")}`);
}

function updateLiveCoinCalculation() {
    const metal = document.getElementById("coin-metal")?.value || "gold";
    const grams = parseFloat(document.getElementById("coin-grams")?.value) || 0;
    const basePriceOverride = parseFloat(document.getElementById("coin-price")?.value) || 0;
    const priceAdjustment = parseFloat(document.getElementById("coin-price-adjustment")?.value) || 0;
    const makingPct = parseFloat(document.getElementById("coin-making-pct")?.value) || 5;

    const rate = metal === "gold" ? liveGoldRate : liveSilverRate;
    const baseVal = Math.round(grams * rate);
    const makingAmt = Math.round(baseVal * (makingPct / 100));
    const formulaMarketRate = baseVal + makingAmt;

    const marketRate = basePriceOverride > 0 ? basePriceOverride : formulaMarketRate;
    const finalPrice = Math.max(0, Math.round(marketRate + priceAdjustment));

    setElText("coin-calc-formula-market", `₹${marketRate.toLocaleString("en-IN")} (Market)`);
    const adjEl = document.getElementById("coin-calc-formula-adj");
    if (adjEl) {
        if (priceAdjustment > 0) {
            adjEl.innerHTML = ` <span style="color:#10b981;font-weight:700">+ ₹${priceAdjustment.toLocaleString("en-IN")} (Admin Adj.)</span>`;
        } else if (priceAdjustment < 0) {
            adjEl.innerHTML = ` <span style="color:#ef4444;font-weight:700">- ₹${Math.abs(priceAdjustment).toLocaleString("en-IN")} (Admin Adj.)</span>`;
        } else {
            adjEl.innerHTML = ` <span style="color:var(--text-dim)">+ ₹0 (No Adj.)</span>`;
        }
    }
    setElText("coin-calc-final-price-val", `₹${finalPrice.toLocaleString("en-IN")}`);
}

function renderJewelleryGrid(items) {
    const body = document.getElementById("jewellery-catalog-body");
    if (!body) return;

    if (!items || items.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-gem" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No jewellery items match your criteria</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Try changing category filters or click "+ Add Jewellery"</div>
        </div>`;
        return;
    }

    let html = `<div class="product-cards-grid">`;

    items.forEach(j => {
        const isGold = (j.metalType || "gold").toLowerCase() === "gold";
        const { rate, label } = getLiveRateForPurity(j.metalType, j.purity);
        const metalBaseVal = (j.weightGrams || 0) * rate;
        const making = Number(j.makingCharges || 0);
        const gst = Number(j.gstPercentage || 3);
        const subtotal = metalBaseVal + making;
        const formulaMarketRate = Math.round(subtotal * (1 + gst / 100));
        const hasFixedPrice = j.price && Number(j.price) > 0;
        const marketRate = hasFixedPrice ? Number(j.price) : formulaMarketRate;
        const adj = Number(j.priceAdjustment || 0);
        const finalSellingPrice = Math.max(0, marketRate + adj);

        const imgUrl = j.imageUrl || (j.images && j.images[0]) || "";
        const sku = j.sku || `VIKA-${(j.metalType || 'GOLD').toUpperCase()}-JEWEL-${String(j._id).slice(-4).toUpperCase()}`;
        const avail = j.availableQty !== undefined ? j.availableQty : (j.inStock ? 10 : 0);

        html += `
        <div class="product-card">
            <div class="product-card-media">
                ${imgUrl ? `<img src="${imgUrl}" alt="${j.name}" class="product-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />` : ''}
                <div class="product-img-fallback" style="${imgUrl ? 'display:none' : 'display:flex'}">
                    <i class="${isGold ? 'fas fa-gem icon-gold' : 'fas fa-gem icon-silver'}" style="font-size:36px"></i>
                </div>
                
                <div class="product-media-badges">
                    <span class="product-badge ${isGold ? 'badge-gold' : 'badge-silver'}">${(j.purity || (isGold ? '22K Gold' : '999 Silver'))}</span>
                    ${j.isPopular ? `<span class="product-badge badge-popular"><i class="fas fa-fire"></i> Popular</span>` : ''}
                </div>

                <span class="product-stock-tag ${avail > 0 ? 'stock-in' : 'stock-out'}">
                    ${avail > 0 ? `● ${avail} In Stock` : '✕ Out of Stock'}
                </span>
            </div>

            <div class="product-card-body">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div class="product-cat-pill">${j.category || 'Jewellery'}</div>
                    <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:10.5px;cursor:pointer" onclick="copySkuToClipboard('${sku}')" title="Click to copy SKU">
                        <i class="fas fa-barcode"></i> ${sku}
                    </span>
                </div>
                <div class="product-name" title="${j.name}">${j.name || 'Untitled Jewellery'}</div>
                <div class="product-desc-snippet">${j.description || 'Hallmarked handcrafted jewellery piece.'}</div>

                <div class="product-weight-row">
                    <span class="product-weight-badge"><i class="fas fa-weight-hanging"></i> ${Number(j.weightGrams || 0).toFixed(2)} g</span>
                    <span class="product-making-text">+ ₹${making.toLocaleString("en-IN")} making</span>
                </div>

                <div class="product-pricing-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:3px">
                        <span style="color:var(--text-dim)">Market Rate:</span>
                        <strong style="color:var(--gold);font-family:var(--font-mono)">₹${marketRate.toLocaleString("en-IN")}</strong>
                    </div>
                    ${adj !== 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px">
                        <span style="color:var(--text-dim)">Admin Adjustment:</span>
                        <span class="badge ${adj > 0 ? 'badge-pill-success' : 'badge-danger'}" style="font-size:10px;padding:2px 6px">
                            ${adj > 0 ? `+₹${adj.toLocaleString("en-IN")}` : `-₹${Math.abs(adj).toLocaleString("en-IN")}`}
                        </span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.08)">
                        <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase">Final Selling Price:</span>
                        <span class="pricing-total-val" style="color:#10b981;font-size:1.15rem">₹ ${finalSellingPrice.toLocaleString("en-IN")}</span>
                    </div>
                </div>

                <div class="product-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openJewelleryModal('${j._id}')" title="Edit Product">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openRestockModal('jewellery', '${j._id}', '${escapeQuotes(j.name)}', '${sku}', ${avail}, ${j.lowStockThreshold || 5}, '${avail > 0 ? 'in_stock' : 'out_of_stock'}')" title="Quick Restock">
                        <i class="fas fa-boxes"></i> Stock (${avail})
                    </button>
                    <label class="btn btn-secondary btn-sm" title="Upload Photo" style="cursor:pointer;margin:0">
                        <i class="fas fa-camera"></i>
                        <input type="file" accept="image/*" style="display:none" onchange="uploadJewelleryPhoto('${j._id}', this.files[0])" />
                    </label>
                    <button class="btn-icon-danger" onclick="deleteJewellery('${j._id}')" title="Delete Product">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;
    body.innerHTML = html;
}

function escapeQuotes(str) {
    if (!str) return "";
    return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ── Photo Gallery State for Modals ──
let modalJewelleryImages = [];
let modalMainImage = "";
let modalCoinImages = [];
let modalCoinMainImage = "";

function renderJewelleryModalImages() {
    const gallery = document.getElementById("jewellery-modal-gallery");
    if (!gallery) return;

    if (!modalJewelleryImages || modalJewelleryImages.length === 0) {
        gallery.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:1.5rem 1rem;color:var(--text-dim);font-size:12px">
            <i class="fas fa-images" style="font-size:24px;margin-bottom:6px;display:block"></i>
            No photos added yet. Click "Upload Photos" or enter an Image URL.
        </div>`;
        return;
    }

    let html = "";
    modalJewelleryImages.forEach((img, idx) => {
        const isMain = img === modalMainImage || (idx === 0 && !modalMainImage);
        if (isMain && !modalMainImage) modalMainImage = img;

        html += `
        <div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;border:2px solid ${isMain ? 'var(--gold)' : 'var(--border)'};background:var(--surface2);aspect-ratio:1;display:flex;align-items:center;justify-content:center;padding:4px">
            <img src="${img}" alt="Photo ${idx+1}" style="width:100%;height:100%;object-fit:contain" onerror="this.src='https://via.placeholder.com/100?text=Error'" />
            
            ${isMain ? `
            <div style="position:absolute;top:4px;left:4px;background:linear-gradient(135deg, #d4a017, #f59e0b);color:#000;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.5)">
                ★ Main Image
            </div>` : `
            <button type="button" onclick="setAsMainJewelleryImage(${idx})" style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.75);color:#fff;border:1px solid rgba(255,255,255,0.2);font-size:9px;padding:2px 5px;border-radius:4px;cursor:pointer">
                Make Main
            </button>`}

            <button type="button" onclick="removeJewelleryImage(${idx})" title="Remove photo" style="position:absolute;top:4px;right:4px;background:rgba(239,68,68,0.9);color:#fff;border:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    });
    gallery.innerHTML = html;
}

function setAsMainJewelleryImage(idx) {
    if (idx >= 0 && idx < modalJewelleryImages.length) {
        const selected = modalJewelleryImages[idx];
        modalMainImage = selected;
        modalJewelleryImages.splice(idx, 1);
        modalJewelleryImages.unshift(selected);
        renderJewelleryModalImages();
        toast("Primary Main Image set to selected photo", "success");
    }
}

function removeJewelleryImage(idx) {
    if (idx >= 0 && idx < modalJewelleryImages.length) {
        const removed = modalJewelleryImages.splice(idx, 1)[0];
        if (modalMainImage === removed) {
            modalMainImage = modalJewelleryImages.length > 0 ? modalJewelleryImages[0] : "";
        }
        renderJewelleryModalImages();
    }
}

function addJewelleryUrlImage() {
    const input = document.getElementById("jewellery-image-url-input");
    const val = (input?.value || "").trim();
    if (!val) return toast("Please enter a valid image URL", "warning");
    if (!modalJewelleryImages.includes(val)) {
        modalJewelleryImages.push(val);
        if (!modalMainImage) modalMainImage = val;
    }
    input.value = "";
    renderJewelleryModalImages();
    toast("Photo added to gallery", "success");
}

async function handleJewelleryModalUpload(files) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
    }

    toast(`Uploading ${files.length} photo(s)...`, "info");
    try {
        const token = localStorage.getItem("token");
        const base = typeof API_BASE !== "undefined" ? API_BASE : "https://bharatsqft-backend.onrender.com/api";
        const response = await fetch(`${base}/jewellery/upload-images`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const res = await response.json();
        if (res.success && res.urls) {
            res.urls.forEach(u => {
                if (!modalJewelleryImages.includes(u)) {
                    modalJewelleryImages.push(u);
                    if (!modalMainImage) modalMainImage = u;
                }
            });
            renderJewelleryModalImages();
            toast("Photos uploaded and added to gallery!", "success");
        } else {
            toast(res.message || "Failed to upload photos", "danger");
        }
    } catch (e) {
        toast("Error uploading photos", "danger");
    }
}

// ── Coin Modal Photo Helpers ──
function renderCoinModalImages() {
    const gallery = document.getElementById("coin-modal-gallery");
    if (!gallery) return;

    if (!modalCoinImages || modalCoinImages.length === 0) {
        gallery.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:1.5rem 1rem;color:var(--text-dim);font-size:12px">
            <i class="fas fa-coins" style="font-size:24px;margin-bottom:6px;display:block"></i>
            No coin photos added. Click "Upload Photos" or enter an Image URL.
        </div>`;
        return;
    }

    let html = "";
    modalCoinImages.forEach((img, idx) => {
        const isMain = img === modalCoinMainImage || (idx === 0 && !modalCoinMainImage);
        if (isMain && !modalCoinMainImage) modalCoinMainImage = img;

        html += `
        <div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;border:2px solid ${isMain ? 'var(--gold)' : 'var(--border)'};background:var(--surface2);aspect-ratio:1;display:flex;align-items:center;justify-content:center;padding:4px">
            <img src="${img}" alt="Coin Photo ${idx+1}" style="width:100%;height:100%;object-fit:contain" onerror="this.src='https://via.placeholder.com/100?text=Error'" />
            
            ${isMain ? `
            <div style="position:absolute;top:4px;left:4px;background:linear-gradient(135deg, #d4a017, #f59e0b);color:#000;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.5)">
                ★ Main Image
            </div>` : `
            <button type="button" onclick="setAsMainCoinImage(${idx})" style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.75);color:#fff;border:1px solid rgba(255,255,255,0.2);font-size:9px;padding:2px 5px;border-radius:4px;cursor:pointer">
                Make Main
            </button>`}

            <button type="button" onclick="removeCoinImage(${idx})" title="Remove photo" style="position:absolute;top:4px;right:4px;background:rgba(239,68,68,0.9);color:#fff;border:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    });
    gallery.innerHTML = html;
}

function setAsMainCoinImage(idx) {
    if (idx >= 0 && idx < modalCoinImages.length) {
        const selected = modalCoinImages[idx];
        modalCoinMainImage = selected;
        modalCoinImages.splice(idx, 1);
        modalCoinImages.unshift(selected);
        renderCoinModalImages();
        toast("Primary Main Image updated for coin", "success");
    }
}

function removeCoinImage(idx) {
    if (idx >= 0 && idx < modalCoinImages.length) {
        const removed = modalCoinImages.splice(idx, 1)[0];
        if (modalCoinMainImage === removed) {
            modalCoinMainImage = modalCoinImages.length > 0 ? modalCoinImages[0] : "";
        }
        renderCoinModalImages();
    }
}

function addCoinUrlImage() {
    const input = document.getElementById("coin-image-url-input");
    const val = (input?.value || "").trim();
    if (!val) return toast("Please enter a valid image URL", "warning");
    if (!modalCoinImages.includes(val)) {
        modalCoinImages.push(val);
        if (!modalCoinMainImage) modalCoinMainImage = val;
    }
    input.value = "";
    renderCoinModalImages();
    toast("Photo added to coin gallery", "success");
}

async function handleCoinModalUpload(files) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
    }

    toast(`Uploading ${files.length} coin photo(s)...`, "info");
    try {
        const token = localStorage.getItem("token");
        const base = typeof API_BASE !== "undefined" ? API_BASE : "https://bharatsqft-backend.onrender.com/api";
        const response = await fetch(`${base}/jewellery/upload-images`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const res = await response.json();
        if (res.success && res.urls) {
            res.urls.forEach(u => {
                if (!modalCoinImages.includes(u)) {
                    modalCoinImages.push(u);
                    if (!modalCoinMainImage) modalCoinMainImage = u;
                }
            });
            renderCoinModalImages();
            toast("Coin photos uploaded successfully!", "success");
        } else {
            toast(res.message || "Failed to upload photos", "danger");
        }
    } catch (e) {
        toast("Error uploading photos", "danger");
    }
}

async function uploadCoinPhoto(id, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);

    toast("Uploading coin image...", "info");

    try {
        const token = localStorage.getItem("token");
        const base = typeof API_BASE !== "undefined" ? API_BASE : "https://bharatsqft-backend.onrender.com/api";
        const response = await fetch(`${base}/admin/coins/${id}/upload-image`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const res = await response.json();

        if (res.success) {
            toast("Coin main image uploaded successfully", "success");
            loadCoins();
        } else {
            toast(res.message || "Failed to upload image", "danger");
        }
    } catch (e) {
        toast("Error uploading image", "danger");
    }
}

function openJewelleryModal(id = null) {
    editingJewelleryId = id;
    const modal = document.getElementById("jewellery-modal");
    if (!modal) return;

    populateCategoryDropdown(allCategories);
    modalJewelleryImages = [];
    modalMainImage = "";

    if (id) {
        const j = allJewellery.find(item => item._id === id);
        if (j) {
            document.getElementById("jewellery-modal-title").textContent = "Edit Jewellery Product";
            document.getElementById("jewellery-name").value = j.name || "";
            document.getElementById("jewellery-sku").value = j.sku || "";
            document.getElementById("jewellery-category-select").value = j.category || "";
            document.getElementById("jewellery-metal").value = j.metalType || "gold";
            document.getElementById("jewellery-purity").value = j.purity || "22K Gold";
            document.getElementById("jewellery-weight").value = j.weightGrams || "";
            document.getElementById("jewellery-price").value = j.price || 0;
            document.getElementById("jewellery-price-adjustment").value = j.priceAdjustment !== undefined ? j.priceAdjustment : 0;
            document.getElementById("jewellery-making").value = j.makingCharges || "";
            document.getElementById("jewellery-gst").value = j.gstPercentage || 3;
            document.getElementById("jewellery-available-qty").value = j.availableQty !== undefined ? j.availableQty : (j.inStock ? 10 : 0);
            document.getElementById("jewellery-low-threshold").value = j.lowStockThreshold || 5;
            document.getElementById("jewellery-desc").value = j.description || "";
            document.getElementById("jewellery-instock").checked = j.inStock !== false;
            document.getElementById("jewellery-ispopular").checked = !!j.isPopular;

            modalMainImage = j.imageUrl || "";
            if (Array.isArray(j.images) && j.images.length > 0) {
                modalJewelleryImages = [...j.images];
                if (modalMainImage && !modalJewelleryImages.includes(modalMainImage)) {
                    modalJewelleryImages.unshift(modalMainImage);
                }
            } else if (modalMainImage) {
                modalJewelleryImages = [modalMainImage];
            }
        }
    } else {
        document.getElementById("jewellery-modal-title").textContent = "Add New Jewellery Product";
        document.getElementById("jewellery-form")?.reset();
        document.getElementById("jewellery-sku").value = "";
        document.getElementById("jewellery-price").value = 0;
        document.getElementById("jewellery-price-adjustment").value = 0;
        document.getElementById("jewellery-available-qty").value = 10;
        document.getElementById("jewellery-low-threshold").value = 5;
        document.getElementById("jewellery-instock").checked = true;
        document.getElementById("jewellery-ispopular").checked = false;
        document.getElementById("jewellery-gst").value = 3;
        modalJewelleryImages = [];
        modalMainImage = "";
    }

    renderJewelleryModalImages();
    updateLiveJewelleryCalculation();
    modal.style.display = "flex";
}

function closeJewelleryModal() {
    const modal = document.getElementById("jewellery-modal");
    if (modal) modal.style.display = "none";
    editingJewelleryId = null;
}

async function saveJewellery() {
    const name = document.getElementById("jewellery-name")?.value.trim();
    const sku = document.getElementById("jewellery-sku")?.value.trim();
    const category = document.getElementById("jewellery-category-select")?.value;
    const metalType = document.getElementById("jewellery-metal")?.value;
    const purity = document.getElementById("jewellery-purity")?.value.trim();
    const weightGrams = Number(document.getElementById("jewellery-weight")?.value);
    const price = Number(document.getElementById("jewellery-price")?.value || 0);
    const priceAdjustment = Number(document.getElementById("jewellery-price-adjustment")?.value || 0);
    const makingCharges = Number(document.getElementById("jewellery-making")?.value);
    const gstPercentage = Number(document.getElementById("jewellery-gst")?.value) || 3;
    const availableQty = Number(document.getElementById("jewellery-available-qty")?.value || 0);
    const lowStockThreshold = Number(document.getElementById("jewellery-low-threshold")?.value || 5);
    const description = document.getElementById("jewellery-desc")?.value.trim();
    const inStock = document.getElementById("jewellery-instock")?.checked;
    const isPopular = document.getElementById("jewellery-ispopular")?.checked;

    if (!name || !category || !weightGrams) {
        toast("Please fill in Product Name, Category and Weight", "warning");
        return;
    }

    const primaryImg = modalMainImage || (modalJewelleryImages.length > 0 ? modalJewelleryImages[0] : "");

    const payload = {
        name,
        sku: sku ? sku.toUpperCase() : undefined,
        category,
        metalType,
        purity,
        weightGrams,
        price,
        priceAdjustment,
        makingCharges,
        gstPercentage,
        imageUrl: primaryImg,
        images: modalJewelleryImages,
        availableQty,
        lowStockThreshold,
        description,
        inStock: availableQty > 0 && inStock,
        isPopular
    };

    try {
        let res;
        if (editingJewelleryId) {
            res = await api(`/jewellery/products/${editingJewelleryId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/jewellery/products", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res.success) {
            toast(res.message || "Jewellery product saved successfully", "success");
            closeJewelleryModal();
            loadJewellery();
            if (activeJewelleryTab === "inventory") loadInventory();
        } else {
            toast(res.message || "Failed to save product", "danger");
        }
    } catch (e) {
        toast("Network error saving product", "danger");
    }
}

async function uploadJewelleryPhoto(id, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);

    toast("Uploading main product image...", "info");

    try {
        const token = localStorage.getItem("token");
        const base = typeof API_BASE !== "undefined" ? API_BASE : "https://bharatsqft-backend.onrender.com/api";
        const response = await fetch(`${base}/jewellery/products/${id}/upload-image`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const res = await response.json();

        if (res.success) {
            toast("Main image uploaded successfully", "success");
            loadJewellery();
        } else {
            toast(res.message || "Failed to upload image", "danger");
        }
    } catch (e) {
        toast("Error uploading image", "danger");
    }
}

async function deleteJewellery(id) {
    if (!confirm("Are you sure you want to permanently delete this product?")) return;
    try {
        const res = await api(`/jewellery/products/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Product deleted successfully", "success");
            loadJewellery();
            if (activeJewelleryTab === "inventory") loadInventory();
        } else {
            toast(res.message || "Failed to delete product", "danger");
        }
    } catch (e) {
        toast("Network error deleting product", "danger");
    }
}

// ── 3. Bullion Coins & Bars ───────────────────────────────────
async function loadCoins() {
    const body = document.getElementById("coins-catalog-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading bullion mint coins...</div></div>`;

    try {
        try {
            const ratesRes = await api("/gold/rate");
            if (ratesRes.success && ratesRes.data) {
                liveGoldRate = ratesRes.data.gold?.buyRate || 7500;
                liveSilverRate = ratesRes.data.silver?.buyRate || 240;
            }
        } catch (e) {}

        const res = await api("/admin/coins");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load coins"}</div></div>`;
            return;
        }

        allCoins = res.data || [];
        renderCoinsGrid(allCoins);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderCoinsGrid(coins) {
    const body = document.getElementById("coins-catalog-body");
    if (!body) return;

    if (!coins || coins.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-coins" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No bullion coins configured</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Click "+ Add Coin" to configure bullion mint weights</div>
        </div>`;
        return;
    }

    let html = `<div class="product-cards-grid">`;

    coins.forEach(c => {
        const isGold = (c.metal || "gold").toLowerCase() === "gold";
        const rate = isGold ? liveGoldRate : liveSilverRate;
        const baseVal = (c.grams || c.weightGrams || 0) * rate;
        const makingPct = c.makingChargePct !== undefined ? c.makingChargePct : 5;
        const makingAmt = c.makingCharge || (baseVal * makingPct / 100);
        const formulaMarketRate = Math.round(baseVal + makingAmt);
        const hasFixedPrice = c.price && Number(c.price) > 0;
        const marketRate = hasFixedPrice ? Number(c.price) : formulaMarketRate;
        const adj = Number(c.priceAdjustment || 0);
        const displayPrice = Math.max(0, marketRate + adj);
        const imgUrl = c.imageUrl || c.image || (c.images && c.images[0]) || "";
        const sku = c.sku || `VIKA-${(c.metal || 'GOLD').toUpperCase()}-COIN-${c.grams}G-${String(c._id).slice(-4).toUpperCase()}`;
        const avail = c.availableQty !== undefined ? c.availableQty : (c.isActive ? 50 : 0);

        html += `
        <div class="product-card">
            <div class="product-card-media" style="background: radial-gradient(circle, ${isGold ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.15)'} 0%, rgba(14,18,26,0.9) 100%)">
                ${imgUrl ? `<img src="${imgUrl}" alt="${c.name}" class="product-img" onerror="this.style.display='none'" />` : ''}
                <div class="product-img-fallback" style="${imgUrl ? 'display:none' : 'display:flex'}">
                    <i class="${isGold ? 'fas fa-coins icon-gold' : 'fas fa-coins icon-silver'}" style="font-size:42px"></i>
                </div>

                <div class="product-media-badges">
                    <span class="product-badge ${isGold ? 'badge-gold' : 'badge-silver'}">${(c.metal || 'Gold').toUpperCase()}</span>
                    <span class="product-badge badge-popular">${c.purity || (isGold ? '999.9 Fine Gold' : '999 Pure Silver')}</span>
                </div>

                <span class="product-stock-tag ${avail > 0 ? 'stock-in' : 'stock-out'}">
                    ${avail > 0 ? `● ${avail} In Stock` : '✕ Disabled'}
                </span>
            </div>

            <div class="product-card-body">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div class="product-cat-pill">${c.category || 'Coins & Bars'}</div>
                    <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:10.5px;cursor:pointer" onclick="copySkuToClipboard('${sku}')" title="Click to copy SKU">
                        <i class="fas fa-barcode"></i> ${sku}
                    </span>
                </div>
                <div class="product-name" style="font-size:15px">${c.name || 'Bullion Mint Coin'}</div>
                <div class="product-desc-snippet">Assayed physical bullion coin.</div>

                <div class="product-weight-row">
                    <span class="product-weight-badge"><i class="fas fa-circle-dot"></i> ${Number(c.grams || c.weightGrams || 0).toFixed(2)} g</span>
                    <span class="product-making-text">${makingPct}% minting charge</span>
                </div>

                <div class="product-pricing-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:3px">
                        <span style="color:var(--text-dim)">Market Rate:</span>
                        <strong style="color:var(--gold);font-family:var(--font-mono)">₹${marketRate.toLocaleString("en-IN")}</strong>
                    </div>
                    ${adj !== 0 ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px">
                        <span style="color:var(--text-dim)">Admin Adjustment:</span>
                        <span class="badge ${adj > 0 ? 'badge-pill-success' : 'badge-danger'}" style="font-size:10px;padding:2px 6px">
                            ${adj > 0 ? `+₹${adj.toLocaleString("en-IN")}` : `-₹${Math.abs(adj).toLocaleString("en-IN")}`}
                        </span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.08)">
                        <span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase">Final Selling Price:</span>
                        <span class="pricing-total-val" style="color:#10b981;font-size:1.15rem">₹ ${displayPrice.toLocaleString("en-IN")}</span>
                    </div>
                </div>

                <div class="product-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openCoinModal('${c._id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openRestockModal('coin', '${c._id}', '${escapeQuotes(c.name)}', '${sku}', ${avail}, ${c.lowStockThreshold || 10}, '${avail > 0 ? 'in_stock' : 'out_of_stock'}')" title="Quick Restock">
                        <i class="fas fa-boxes"></i> Stock (${avail})
                    </button>
                    <label class="btn btn-secondary btn-sm" title="Upload Photo" style="cursor:pointer;margin:0">
                        <i class="fas fa-camera"></i>
                        <input type="file" accept="image/*" style="display:none" onchange="uploadCoinPhoto('${c._id}', this.files[0])" />
                    </label>
                    <button class="btn-icon-danger" onclick="deleteCoin('${c._id}')" title="Delete Coin">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;
    body.innerHTML = html;
}

function openCoinModal(id = null) {
    editingCoinId = id;
    const modal = document.getElementById("coin-modal");
    if (!modal) return;

    modalCoinImages = [];
    modalCoinMainImage = "";

    if (id) {
        const c = allCoins.find(item => item._id === id);
        if (c) {
            document.getElementById("coin-modal-title").textContent = "Edit Bullion Coin / Bar";
            document.getElementById("coin-name").value = c.name || "";
            document.getElementById("coin-sku").value = c.sku || "";
            document.getElementById("coin-category").value = c.category || "Coins & Bars";
            document.getElementById("coin-metal").value = c.metal || "gold";
            document.getElementById("coin-purity").value = c.purity || (c.metal === "gold" ? "24K 999 Purity" : "999 Fine Silver");
            document.getElementById("coin-grams").value = c.grams || c.weightGrams || "";
            document.getElementById("coin-price").value = c.price || 0;
            document.getElementById("coin-price-adjustment").value = c.priceAdjustment !== undefined ? c.priceAdjustment : 0;
            document.getElementById("coin-making-pct").value = c.makingChargePct !== undefined ? c.makingChargePct : 5;
            document.getElementById("coin-available-qty").value = c.availableQty !== undefined ? c.availableQty : (c.isActive ? 50 : 0);
            document.getElementById("coin-low-threshold").value = c.lowStockThreshold || 10;
            document.getElementById("coin-isactive").checked = c.isActive !== false;

            modalCoinMainImage = c.imageUrl || c.image || "";
            if (Array.isArray(c.images) && c.images.length > 0) {
                modalCoinImages = [...c.images];
                if (modalCoinMainImage && !modalCoinImages.includes(modalCoinMainImage)) {
                    modalCoinImages.unshift(modalCoinMainImage);
                }
            } else if (modalCoinMainImage) {
                modalCoinImages = [modalCoinMainImage];
            }
        }
    } else {
        document.getElementById("coin-modal-title").textContent = "Add New Bullion Coin / Bar";
        document.getElementById("coin-form")?.reset();
        document.getElementById("coin-sku").value = "";
        document.getElementById("coin-category").value = "Coins & Bars";
        document.getElementById("coin-purity").value = "24K 999 Purity";
        document.getElementById("coin-price").value = 0;
        document.getElementById("coin-price-adjustment").value = 0;
        document.getElementById("coin-available-qty").value = 50;
        document.getElementById("coin-low-threshold").value = 10;
        document.getElementById("coin-making-pct").value = 5;
        document.getElementById("coin-isactive").checked = true;
        modalCoinImages = [];
        modalCoinMainImage = "";
    }

    renderCoinModalImages();
    updateLiveCoinCalculation();
    modal.style.display = "flex";
}

function closeCoinModal() {
    const modal = document.getElementById("coin-modal");
    if (modal) modal.style.display = "none";
    editingCoinId = null;
}

async function saveCoin() {
    const name = document.getElementById("coin-name")?.value.trim();
    const sku = document.getElementById("coin-sku")?.value.trim();
    const category = document.getElementById("coin-category")?.value;
    const metal = document.getElementById("coin-metal")?.value;
    const purity = document.getElementById("coin-purity")?.value.trim();
    const grams = Number(document.getElementById("coin-grams")?.value);
    const price = Number(document.getElementById("coin-price")?.value || 0);
    const priceAdjustment = Number(document.getElementById("coin-price-adjustment")?.value || 0);
    const makingChargePct = Number(document.getElementById("coin-making-pct")?.value);
    const availableQty = Number(document.getElementById("coin-available-qty")?.value || 0);
    const lowStockThreshold = Number(document.getElementById("coin-low-threshold")?.value || 10);
    const isActive = document.getElementById("coin-isactive")?.checked;

    if (!name || !grams) {
        toast("Please provide Coin Name and Weight in grams", "warning");
        return;
    }

    const primaryImg = modalCoinMainImage || (modalCoinImages.length > 0 ? modalCoinImages[0] : "");

    const payload = {
        name,
        sku: sku ? sku.toUpperCase() : undefined,
        category,
        metal,
        purity,
        grams,
        price,
        priceAdjustment,
        makingChargePct,
        image: primaryImg,
        imageUrl: primaryImg,
        images: modalCoinImages,
        availableQty,
        lowStockThreshold,
        isActive: availableQty > 0 && isActive
    };

    try {
        let res;
        if (editingCoinId) {
            res = await api(`/admin/coins/${editingCoinId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            res = await api("/admin/coins", { method: "POST", body: JSON.stringify(payload) });
        }

        if (res.success) {
            toast("Bullion coin saved successfully", "success");
            closeCoinModal();
            loadCoins();
            if (activeJewelleryTab === "inventory") loadInventory();
        } else {
            toast(res.message || "Failed to save coin", "danger");
        }
    } catch (e) {
        toast("Network error saving coin", "danger");
    }
}

async function deleteCoin(id) {
    if (!confirm("Are you sure you want to delete this bullion coin?")) return;
    try {
        const res = await api(`/admin/coins/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Coin deleted successfully", "success");
            loadCoins();
            if (activeJewelleryTab === "inventory") loadInventory();
        } else {
            toast(res.message || "Failed to delete coin", "danger");
        }
    } catch (e) {
        toast("Network error deleting coin", "danger");
    }
}

// ── 4. INVENTORY MANAGEMENT & SKU TRACKING SUITE ──────────────
async function loadInventory() {
    const tableBody = document.getElementById("inventory-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading SKU inventory database...</div></div>`;

    const params = new URLSearchParams();
    if (inventorySearchQuery) params.append("search", inventorySearchQuery);
    
    const typeFilter = document.getElementById("inventory-type-filter")?.value || "all";
    if (typeFilter !== "all") params.append("type", typeFilter);

    const metalFilter = document.getElementById("inventory-metal-filter")?.value || "all";
    if (metalFilter !== "all") params.append("metal", metalFilter);

    const statusFilter = document.getElementById("inventory-status-filter")?.value || "all";
    if (statusFilter !== "all") params.append("status", statusFilter);

    try {
        const res = await api(`/admin/inventory?${params.toString()}`);
        if (!res.success) {
            tableBody.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load inventory"}</div></div>`;
            return;
        }

        allInventory = res.data || [];

        // Update KPI counter metrics
        if (res.stats) {
            setElText("inv-stat-total", res.stats.totalProducts || 0);
            setElText("inv-stat-instock", res.stats.inStockCount || 0);
            setElText("inv-stat-lowstock", res.stats.lowStockCount || 0);
            setElText("inv-stat-outofstock", res.stats.outOfStockCount || 0);
            setElText("inv-stat-sold", res.stats.totalSoldUnits || 0);
        }

        renderInventoryTable(allInventory);

        // Sync with standalone inventory page if present
        syncStandaloneInventoryPage();
    } catch (e) {
        tableBody.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading inventory</div></div>`;
    }
}

function syncStandaloneInventoryPage() {
    const mount = document.getElementById("standalone-inventory-mount");
    const source = document.getElementById("jewellery-inventory-panel");
    if (mount && source) {
        mount.innerHTML = source.innerHTML;
    }
}

function onInventorySearch(val) {
    inventorySearchQuery = (val || "").trim();
    loadInventory();
}

function onInventoryFilterChange() {
    loadInventory();
}

function renderInventoryTable(items) {
    const tableBody = document.getElementById("inventory-table-body");
    if (!tableBody) return;

    if (!items || items.length === 0) {
        tableBody.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-boxes-stacked" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No inventory products found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Adjust filters or click "Sync SKUs" / "+ Add Jewellery"</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Product & Type</th>
                    <th>SKU Reference</th>
                    <th>Category</th>
                    <th>Metal & Purity</th>
                    <th>Unit Weight</th>
                    <th style="text-align:center">Available Qty</th>
                    <th style="text-align:center">Reserved</th>
                    <th style="text-align:center">Sold</th>
                    <th>Stock Status</th>
                    <th style="text-align:right">Stock Actions</th>
                </tr>
            </thead>
            <tbody>`;

    items.forEach(item => {
        const isGold = (item.metal || "gold").toLowerCase() === "gold";
        const isCoin = item.type === "coin";
        
        let statusBadge = `<span class="badge badge-pill-success"><i class="fas fa-check-circle"></i> In Stock</span>`;
        if (item.stockStatus === "out_of_stock") {
            statusBadge = `<span class="badge badge-danger"><i class="fas fa-ban"></i> Out of Stock</span>`;
        } else if (item.stockStatus === "low_stock") {
            statusBadge = `<span class="badge badge-amber"><i class="fas fa-exclamation-triangle"></i> Low Stock (${item.availableQty})</span>`;
        }

        const avail = Number(item.availableQty || 0);
        const reserved = Number(item.reservedQty || 0);
        const sold = Number(item.soldQty || 0);

        html += `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                        ${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : `<i class="${isGold ? 'fas fa-coins icon-gold' : 'fas fa-gem icon-silver'}" style="font-size:16px"></i>`}
                    </div>
                    <div>
                        <div style="font-weight:700;color:#fff;font-size:13px">${item.name}</div>
                        <div style="font-size:11px;color:var(--text-dim)">
                            <span class="badge ${isCoin ? 'badge-blue' : 'badge-purple'}" style="font-size:9.5px;padding:2px 6px">
                                ${isCoin ? 'Bullion Coin/Bar' : 'Jewellery'}
                            </span>
                        </div>
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:12px;letter-spacing:0.5px">
                        ${item.sku}
                    </span>
                    <button class="btn-icon-secondary" onclick="copySkuToClipboard('${item.sku}')" title="Copy SKU" style="width:26px;height:26px;padding:0">
                        <i class="fas fa-copy" style="font-size:11px"></i>
                    </button>
                </div>
            </td>
            <td>
                <span style="font-size:12px;color:var(--text-muted)">${item.category || 'Standard'}</span>
            </td>
            <td>
                <div style="font-weight:600;font-size:12px;color:${isGold ? 'var(--gold)' : 'var(--silver)'}">
                    <i class="fas fa-circle" style="font-size:8px;margin-right:4px"></i>${item.purity || (isGold ? '22K Gold' : '999 Silver')}
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-weight:600;font-size:12.5px;color:#fff">
                ${Number(item.weightGrams || 0).toFixed(2)} g
            </td>
            <td style="text-align:center">
                <div style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);padding:3px 8px;border-radius:6px;border:1px solid var(--border)">
                    <button class="btn-icon-secondary" onclick="quickAdjustStock('${item.type}', '${item.id}', -1)" title="Deduct 1 unit" style="width:22px;height:22px;padding:0;font-size:11px" ${avail <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-minus"></i>
                    </button>
                    <span style="font-family:var(--font-mono);font-weight:800;font-size:13.5px;color:${avail <= (item.lowStockThreshold || 5) ? (avail === 0 ? '#ef4444' : '#f59e0b') : '#10b981'};min-width:28px">
                        ${avail}
                    </span>
                    <button class="btn-icon-secondary" onclick="quickAdjustStock('${item.type}', '${item.id}', 1)" title="Add 1 unit" style="width:22px;height:22px;padding:0;font-size:11px">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </td>
            <td style="text-align:center">
                <span class="badge ${reserved > 0 ? 'badge-amber' : 'badge-secondary'}" style="font-family:var(--font-mono)">
                    ${reserved}
                </span>
            </td>
            <td style="text-align:center">
                <span class="badge ${sold > 0 ? 'badge-blue' : 'badge-secondary'}" style="font-family:var(--font-mono)">
                    ${sold}
                </span>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td style="text-align:right">
                <div style="display:inline-flex;gap:6px">
                    <button class="btn btn-primary btn-sm" onclick="openRestockModal('${item.type}', '${item.id}', '${escapeQuotes(item.name)}', '${item.sku}', ${avail}, ${item.lowStockThreshold || 5}, '${item.stockStatus}')" title="Quick Restock">
                        <i class="fas fa-truck-loading"></i> Restock
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="${item.type === 'coin' ? `openCoinModal('${item.id}')` : `openJewelleryModal('${item.id}')`}" title="Edit Full Specifications">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    tableBody.innerHTML = html;
}

// ── Quick Stock Step +/- ─────────────────────────────────────────
async function quickAdjustStock(type, id, delta) {
    try {
        const action = delta > 0 ? "add" : "deduct";
        const adjustment = Math.abs(delta);
        const res = await api(`/admin/inventory/${type}/${id}`, {
            method: "PUT",
            body: JSON.stringify({ action, adjustment })
        });

        if (res.success) {
            toast(res.message || "Stock quantity adjusted", "success");
            loadInventory();
            if (activeJewelleryTab === "products") loadJewellery();
            if (activeJewelleryTab === "coins") loadCoins();
        } else {
            toast(res.message || "Failed to adjust stock", "danger");
        }
    } catch (e) {
        toast("Network error adjusting stock", "danger");
    }
}

// ── Quick Restock Modal ─────────────────────────────────────────
function openRestockModal(type, id, name, sku, availableQty, lowStockThreshold, stockStatus) {
    activeRestockItem = { type, id, name, sku, availableQty, lowStockThreshold, stockStatus };
    const modal = document.getElementById("inventory-restock-modal");
    if (!modal) return;

    setElText("restock-product-name", name);
    setElText("restock-product-sku", `SKU: ${sku}`);
    setElText("restock-current-qty", `${availableQty} Units`);

    const statusPill = document.getElementById("restock-stock-status-pill");
    if (statusPill) {
        if (stockStatus === "out_of_stock") {
            statusPill.className = "badge badge-danger";
            statusPill.textContent = "Out of Stock";
        } else if (stockStatus === "low_stock") {
            statusPill.className = "badge badge-amber";
            statusPill.textContent = "Low Stock";
        } else {
            statusPill.className = "badge badge-pill-success";
            statusPill.textContent = "In Stock";
        }
    }

    const newQtyInput = document.getElementById("restock-new-qty");
    if (newQtyInput) newQtyInput.value = availableQty;

    const lowThreshInput = document.getElementById("restock-low-threshold");
    if (lowThreshInput) lowThreshInput.value = lowStockThreshold;

    const skuInput = document.getElementById("restock-edit-sku");
    if (skuInput) skuInput.value = sku;

    modal.style.display = "flex";
}

function closeRestockModal() {
    const modal = document.getElementById("inventory-restock-modal");
    if (modal) modal.style.display = "none";
    activeRestockItem = null;
}

function applyQuickStockAdd(amount) {
    const newQtyInput = document.getElementById("restock-new-qty");
    if (newQtyInput) {
        const current = Number(newQtyInput.value || (activeRestockItem ? activeRestockItem.availableQty : 0));
        newQtyInput.value = current + amount;
    }
}

async function saveRestock() {
    if (!activeRestockItem) return;

    const availableQty = Number(document.getElementById("restock-new-qty")?.value || 0);
    const lowStockThreshold = Number(document.getElementById("restock-low-threshold")?.value || 5);
    const sku = document.getElementById("restock-edit-sku")?.value.trim();

    try {
        const res = await api(`/admin/inventory/${activeRestockItem.type}/${activeRestockItem.id}`, {
            method: "PUT",
            body: JSON.stringify({ availableQty, lowStockThreshold, sku: sku ? sku.toUpperCase() : undefined })
        });

        if (res.success) {
            toast(res.message || "Inventory stock updated successfully", "success");
            closeRestockModal();
            loadInventory();
            if (activeJewelleryTab === "products") loadJewellery();
            if (activeJewelleryTab === "coins") loadCoins();
        } else {
            toast(res.message || "Failed to update inventory", "danger");
        }
    } catch (e) {
        toast("Network error updating inventory", "danger");
    }
}

// ── Auto-Backfill & Sync SKUs ───────────────────────────────────
async function runBackfillSkus() {
    toast("Generating unique SKUs and configuring stock tracking...", "info");
    try {
        const res = await api("/admin/inventory/backfill-skus", { method: "POST" });
        if (res.success) {
            toast(res.message || "SKUs synchronized successfully", "success");
            loadInventory();
            loadJewellery();
            loadCoins();
            loadJewelleryOrders(ordersPage);
        } else {
            toast(res.message || "Failed to backfill SKUs", "danger");
        }
    } catch (e) {
        toast("Network error syncing SKUs", "danger");
    }
}

// ── 5. Categories Management ──────────────────────────────────
async function loadCategories() {
    const body = document.getElementById("categories-catalog-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading product categories...</div></div>`;

    try {
        const res = await api("/jewellery/categories");
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Failed to load categories</div></div>`;
            return;
        }

        allCategories = res.data || [];
        renderCategoriesGrid(allCategories);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error</div></div>`;
    }
}

function renderCategoriesGrid(categories) {
    const body = document.getElementById("categories-catalog-body");
    if (!body) return;

    if (!categories || categories.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:3rem">
            <i class="fas fa-tags" style="font-size:32px;color:var(--text-dim);margin-bottom:8px"></i>
            <div>No categories found. Click "+ Add Category" to create one.</div>
        </div>`;
        return;
    }

    let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:14px">`;

    categories.forEach(cat => {
        const productCount = allJewellery.filter(j => (j.category || "").toLowerCase() === (cat.name || "").toLowerCase()).length;
        html += `
        <div class="category-card">
            <div class="category-card-header">
                <div class="category-icon-box"><i class="${cat.icon || 'fas fa-gem'}"></i></div>
                <button class="btn-icon-danger" onclick="deleteCategory('${cat._id}')" title="Delete Category"><i class="fas fa-trash"></i></button>
            </div>
            <div class="category-title">${cat.name}</div>
            <div class="category-desc">${cat.description || 'Jewellery product line'}</div>
            <div class="category-count-badge">${productCount} Products Linked</div>
        </div>`;
    });

    html += `</div>`;
    body.innerHTML = html;
}

function openCategoryModal() {
    const modal = document.getElementById("category-modal");
    if (!modal) return;
    document.getElementById("category-form")?.reset();
    modal.style.display = "flex";
}

function closeCategoryModal() {
    const modal = document.getElementById("category-modal");
    if (modal) modal.style.display = "none";
}

async function saveCategory() {
    const name = document.getElementById("category-name")?.value.trim();
    const icon = document.getElementById("category-icon")?.value.trim() || "fas fa-gem";
    const description = document.getElementById("category-desc")?.value.trim();

    if (!name) {
        toast("Please provide Category Name", "warning");
        return;
    }

    try {
        const res = await api("/jewellery/categories", {
            method: "POST",
            body: JSON.stringify({ name, icon, description })
        });

        if (res.success) {
            toast("Category created successfully", "success");
            closeCategoryModal();
            loadCategories();
            loadJewellery();
        } else {
            toast(res.message || "Failed to create category", "danger");
        }
    } catch (e) {
        toast("Network error creating category", "danger");
    }
}

async function deleteCategory(id) {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
        const res = await api(`/jewellery/categories/${id}`, { method: "DELETE" });
        if (res.success) {
            toast("Category deleted successfully", "success");
            loadCategories();
            loadJewellery();
        } else {
            toast(res.message || "Failed to delete category", "danger");
        }
    } catch (e) {
        toast("Network error deleting category", "danger");
    }
}

// ── 6. Customer Delivery Orders & Fulfillment ─────────────────
async function loadJewelleryOrders(page = 1) {
    ordersPage = page;
    const body = document.getElementById("jewellery-orders-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading delivery orders...</div></div>`;

    const status = document.getElementById("order-status-filter")?.value || "";
    const params = new URLSearchParams({ page, limit: 20 });
    if (status) params.append("deliveryStatus", status);

    try {
        const res = await api(`/admin/jewellery-orders?${params.toString()}`);
        if (!res.success) {
            body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>${res.message || "Failed to load orders"}</div></div>`;
            return;
        }

        allOrders = res.data || [];
        renderJewelleryOrdersTable(allOrders);

        // Update Statistics Badges if available
        if (res.stats) {
            setElText("order-stat-total", res.stats.total || 0);
            setElText("order-stat-pending", res.stats.pending || 0);
            setElText("order-stat-shipped", res.stats.shipped || 0);
            setElText("order-stat-delivered", res.stats.delivered || 0);
        }

        const info = document.getElementById("orders-pagination-info");
        if (info) info.textContent = `Page ${res.pagination?.page || page} of ${res.pagination?.pages || 1} (${res.pagination?.total || allOrders.length} orders)`;
        
        const prevBtn = document.getElementById("btn-prev-orders");
        const nextBtn = document.getElementById("btn-next-orders");
        if (prevBtn) prevBtn.disabled = (res.pagination?.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.pagination?.page || 1) >= (res.pagination?.pages || 1);
    } catch (e) {
        body.innerHTML = `<div class="loading-box"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><div>Network error loading delivery orders</div></div>`;
    }
}

function prevOrdersPage() {
    if (ordersPage > 1) loadJewelleryOrders(ordersPage - 1);
}

function nextOrdersPage() {
    loadJewelleryOrders(ordersPage + 1);
}

function renderJewelleryOrdersTable(orders) {
    const body = document.getElementById("jewellery-orders-body");
    if (!body) return;

    if (!orders || orders.length === 0) {
        body.innerHTML = `
        <div class="loading-box" style="padding:4rem 2rem">
            <i class="fas fa-box-open" style="font-size:36px;color:var(--text-dim);margin-bottom:10px"></i>
            <div style="font-size:14px;color:#fff;font-weight:600">No physical delivery orders found</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Customer coin and jewellery redemptions will appear here.</div>
        </div>`;
        return;
    }

    let html = `
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Order / Tracking</th>
                    <th>Customer</th>
                    <th>Product & SKU</th>
                    <th>Weight</th>
                    <th>Total Paid</th>
                    <th>Payment</th>
                    <th>Delivery Status</th>
                    <th>Date</th>
                    <th style="text-align:right">Action</th>
                </tr>
            </thead>
            <tbody>`;

    orders.forEach(o => {
        const orderId = `ORD-${String(o._id).slice(-6).toUpperCase()}`;
        const customerName = o.user?.name || "Customer";
        const customerPhone = o.user?.phone || "—";
        const isGold = (o.metalType || "gold").toLowerCase() === "gold";
        const sku = o.sku || (o.jewellery && o.jewellery.sku) || "VIKA-PROD";

        const statusMap = {
            placed: { label: "Placed", cls: "badge-pill-pending" },
            pending: { label: "Pending", cls: "badge-pill-pending" },
            processing: { label: "Processing", cls: "badge-amber" },
            out_of_warehouse: { label: "Out of Warehouse", cls: "badge-blue" },
            shipped: { label: "Shipped", cls: "badge-blue" },
            out_for_delivery: { label: "Out for Delivery", cls: "badge-blue" },
            delivered: { label: "Delivered", cls: "badge-pill-success" },
            cancelled: { label: "Cancelled", cls: "badge-danger" },
            returned: { label: "Returned", cls: "badge-purple" },
            refunded: { label: "Refunded", cls: "badge-purple" }
        };

        const currentStatus = statusMap[o.deliveryStatus] || { label: o.deliveryStatus || 'Pending', cls: 'badge-pill-pending' };
        const d = o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Today";

        html += `
        <tr>
            <td>
                <div style="font-family:var(--font-mono);font-weight:700;color:#fff">${orderId}</div>
                <div style="font-size:11px;color:var(--text-dim)">${o.trackingId ? `<i class="fas fa-truck"></i> ${o.trackingId}` : 'No tracking'}</div>
            </td>
            <td>
                <div style="font-weight:600;color:#fff">${customerName}</div>
                <div style="font-size:11px;color:var(--text-dim)">${customerPhone}</div>
            </td>
            <td>
                <div style="font-weight:600;color:#fff">${o.jewelleryName || 'Bullion Product'}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                    <span class="badge font-mono" style="background:rgba(168,85,247,0.15);color:#c084fc;font-size:10px;cursor:pointer" onclick="copySkuToClipboard('${sku}')" title="Click to copy SKU">
                        <i class="fas fa-barcode"></i> ${sku}
                    </span>
                    <span style="font-size:11px;color:${isGold ? 'var(--gold)' : 'var(--silver)'}"><i class="fas fa-gem"></i> ${(o.metalType || 'Gold').toUpperCase()}</span>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-weight:600">${Number(o.weightGrams || 0).toFixed(2)} g</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:#fff">${formatINR(o.totalPaid)}</td>
            <td>
                <span class="badge ${o.paymentMethod === 'wallet' ? 'badge-purple' : 'badge-blue'}">${(o.paymentMethod || 'Razorpay').toUpperCase()}</span>
            </td>
            <td>
                <span class="badge ${currentStatus.cls}">${currentStatus.label}</span>
            </td>
            <td style="font-size:11.5px;color:var(--text-dim)">${d}</td>
            <td style="text-align:right">
                <button class="btn btn-primary btn-sm" onclick="openOrderDetailsModal('${o._id}')">
                    <i class="fas fa-truck-loading"></i> Fulfill
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    body.innerHTML = html;
}

function openOrderDetailsModal(id) {
    const o = allOrders.find(item => item._id === id);
    if (!o) return;
    activeOrder = o;

    const modal = document.getElementById("order-detail-modal");
    if (!modal) return;

    const sku = o.sku || (o.jewellery && o.jewellery.sku) || "VIKA-PROD";

    setElText("order-detail-id", `ORD-${String(o._id).slice(-6).toUpperCase()}`);
    setElText("order-detail-customer", `${o.user?.name || 'Customer'} (${o.user?.phone || 'No phone'})`);
    setElText("order-detail-address", o.shippingAddress || "Customer registered delivery address");
    setElText("order-detail-product-info", `${o.jewelleryName} • ${o.weightGrams}g ${o.metalType?.toUpperCase()} • Paid: ₹${Number(o.totalPaid || 0).toLocaleString("en-IN")}`);

    const skuBadgeEl = document.getElementById("order-detail-sku-badge");
    if (skuBadgeEl) {
        skuBadgeEl.innerHTML = `
        <span class="badge font-mono" style="background:rgba(168,85,247,0.2);color:#c084fc;font-size:12px;padding:5px 10px;cursor:pointer" onclick="copySkuToClipboard('${sku}')" title="Click to copy SKU">
            <i class="fas fa-barcode"></i> SKU: ${sku} <i class="fas fa-copy" style="margin-left:4px;font-size:10px"></i>
        </span>`;
    }

    document.getElementById("order-detail-status").value = o.deliveryStatus || "placed";
    document.getElementById("order-detail-courier").value = o.courierName || "Vikaone Express Secure Logistics";
    document.getElementById("order-detail-tracking-id").value = o.trackingId || "";
    document.getElementById("order-detail-tracking-url").value = o.trackingUrl || "";
    document.getElementById("order-detail-eta").value = o.estimatedDeliveryDate || "";
    document.getElementById("order-detail-note").value = o.statusNote || "";

    // Render Timeline
    const timelineBox = document.getElementById("order-detail-timeline");
    if (timelineBox && o.statusHistory) {
        let tHtml = `<div class="order-timeline">`;
        o.statusHistory.forEach(h => {
            const hDate = h.date ? new Date(h.date).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
            tHtml += `
            <div class="timeline-step">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-title">${h.title || h.status}</div>
                    <div class="timeline-desc">${h.description || ''}</div>
                    <div class="timeline-time">${hDate}</div>
                </div>
            </div>`;
        });
        tHtml += `</div>`;
        timelineBox.innerHTML = tHtml;
    }

    modal.style.display = "flex";
}

function closeOrderDetailsModal() {
    const modal = document.getElementById("order-detail-modal");
    if (modal) modal.style.display = "none";
    activeOrder = null;
}

async function updateOrderStatus() {
    if (!activeOrder) return;

    const deliveryStatus = document.getElementById("order-detail-status")?.value;
    const courierName = document.getElementById("order-detail-courier")?.value.trim();
    const trackingId = document.getElementById("order-detail-tracking-id")?.value.trim();
    const trackingUrl = document.getElementById("order-detail-tracking-url")?.value.trim();
    const estimatedDeliveryDate = document.getElementById("order-detail-eta")?.value.trim();
    const statusNote = document.getElementById("order-detail-note")?.value.trim();

    const payload = {
        deliveryStatus,
        courierName,
        trackingId,
        trackingUrl,
        estimatedDeliveryDate,
        statusNote
    };

    try {
        const res = await api(`/admin/jewellery-orders/${activeOrder._id}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        if (res.success) {
            toast("Order fulfillment details updated & inventory synchronized", "success");
            closeOrderDetailsModal();
            loadJewelleryOrders(ordersPage);
            if (activeJewelleryTab === "inventory") loadInventory();
        } else {
            toast(res.message || "Failed to update order", "danger");
        }
    } catch (e) {
        toast("Network error updating order", "danger");
    }
}
