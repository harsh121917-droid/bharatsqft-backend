/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Modern Jewellery, Bullion Coins & Orders Suite
   ══════════════════════════════════════════════════════════════ */

let allJewellery = [];
let allCategories = [];
let allCoins = [];
let allOrders = [];
let activeJewelleryTab = "products";
let selectedJewelleryCategory = "all";
let selectedJewelleryMetal = "all";
let jewellerySearchQuery = "";
let editingJewelleryId = null;
let editingCoinId = null;
let activeOrder = null;
let ordersPage = 1;

let liveGoldRate = 7500;
let liveSilverRate = 90;

// ── 1. Tab Switching (Products, Coins, Categories) ─────────────
function switchJewelleryTab(tab) {
    activeJewelleryTab = tab;
    
    // Update Tab Buttons
    document.querySelectorAll(".jewellery-tab-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`tab-jewellery-${tab}-btn`);
    if (activeBtn) activeBtn.classList.add("active");

    // Toggle Panels
    document.getElementById("jewellery-products-panel").style.display = tab === "products" ? "block" : "none";
    document.getElementById("jewellery-coins-panel").style.display = tab === "coins" ? "block" : "none";
    document.getElementById("jewellery-categories-panel").style.display = tab === "categories" ? "block" : "none";

    // Toggle Top Action Button
    const addJewelleryBtn = document.getElementById("btn-add-jewellery-top");
    const addCoinBtn = document.getElementById("btn-add-coin-top");
    const addCategoryBtn = document.getElementById("btn-add-category-top");

    if (addJewelleryBtn) addJewelleryBtn.style.display = tab === "products" ? "inline-flex" : "none";
    if (addCoinBtn) addCoinBtn.style.display = tab === "coins" ? "inline-flex" : "none";
    if (addCategoryBtn) addCategoryBtn.style.display = tab === "categories" ? "inline-flex" : "none";

    if (tab === "products") loadJewellery();
    else if (tab === "coins") loadCoins();
    else if (tab === "categories") loadCategories();
}

// ── 2. Jewellery Catalog ──────────────────────────────────────
async function loadJewellery() {
    const body = document.getElementById("jewellery-catalog-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading jewellery catalog & categories...</div></div>`;

    try {
        // Fetch Live Rates for Value Calculation
        try {
            const ratesRes = await api("/gold/rates");
            if (ratesRes.success && ratesRes.data) {
                liveGoldRate = ratesRes.data.gold?.buyRate || 7500;
                liveSilverRate = ratesRes.data.silver?.buyRate || 90;
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

    // Collect all distinct category names from categories & products
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
            (j.name || "").toLowerCase().includes(jewellerySearchQuery) ||
            (j.category || "").toLowerCase().includes(jewellerySearchQuery) ||
            (j.purity || "").toLowerCase().includes(jewellerySearchQuery)
        );
    }

    renderJewelleryGrid(filtered);
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
        const rate = isGold ? liveGoldRate : liveSilverRate;
        const metalBaseVal = (j.weightGrams || 0) * rate;
        const making = Number(j.makingCharges || 0);
        const gst = Number(j.gstPercentage || 3);
        const subtotal = metalBaseVal + making;
        const totalEstValue = Math.round(subtotal * (1 + gst / 100));

        const imgUrl = j.imageUrl || (j.images && j.images[0]) || "";

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

                <span class="product-stock-tag ${j.inStock !== false ? 'stock-in' : 'stock-out'}">
                    ${j.inStock !== false ? '● In Stock' : '✕ Out of Stock'}
                </span>
            </div>

            <div class="product-card-body">
                <div class="product-cat-pill">${j.category || 'Jewellery'}</div>
                <div class="product-name" title="${j.name}">${j.name || 'Untitled Jewellery'}</div>
                <div class="product-desc-snippet">${j.description || 'Hallmarked handcrafted jewellery piece.'}</div>

                <div class="product-weight-row">
                    <span class="product-weight-badge"><i class="fas fa-weight-hanging"></i> ${Number(j.weightGrams || 0).toFixed(2)} g</span>
                    <span class="product-making-text">+ ₹${making.toLocaleString("en-IN")} making</span>
                </div>

                <div class="product-pricing-box">
                    <div class="pricing-label">Estimated Retail Value (Inc. ${gst}% GST)</div>
                    <div class="pricing-total-val">₹ ${totalEstValue.toLocaleString("en-IN")}</div>
                </div>

                <div class="product-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openJewelleryModal('${j._id}')" title="Edit Product">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <label class="btn btn-secondary btn-sm" title="Upload Photo" style="cursor:pointer;margin:0">
                        <i class="fas fa-camera"></i> Photo
                        <input type="file" accept="image/*" style="display:none" onchange="uploadJewelleryPhoto('${j._id}', this.files[0])" />
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="toggleJewelleryStock('${j._id}', ${j.inStock === false})" title="Toggle Stock">
                        <i class="fas ${j.inStock !== false ? 'fa-toggle-on' : 'fa-toggle-off'}" style="color:${j.inStock !== false ? 'var(--success)' : 'var(--danger)'}"></i>
                    </button>
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

function openJewelleryModal(id = null) {
    editingJewelleryId = id;
    const modal = document.getElementById("jewellery-modal");
    if (!modal) return;

    populateCategoryDropdown(allCategories);

    if (id) {
        const j = allJewellery.find(item => item._id === id);
        if (j) {
            document.getElementById("jewellery-modal-title").textContent = "Edit Jewellery Product";
            document.getElementById("jewellery-name").value = j.name || "";
            document.getElementById("jewellery-category-select").value = j.category || "";
            document.getElementById("jewellery-metal").value = j.metalType || "gold";
            document.getElementById("jewellery-purity").value = j.purity || "22K Gold";
            document.getElementById("jewellery-weight").value = j.weightGrams || "";
            document.getElementById("jewellery-making").value = j.makingCharges || "";
            document.getElementById("jewellery-gst").value = j.gstPercentage || 3;
            document.getElementById("jewellery-image-url").value = j.imageUrl || "";
            document.getElementById("jewellery-desc").value = j.description || "";
            document.getElementById("jewellery-instock").checked = j.inStock !== false;
            document.getElementById("jewellery-ispopular").checked = !!j.isPopular;
        }
    } else {
        document.getElementById("jewellery-modal-title").textContent = "Add New Jewellery Product";
        document.getElementById("jewellery-form")?.reset();
        document.getElementById("jewellery-instock").checked = true;
        document.getElementById("jewellery-ispopular").checked = false;
        document.getElementById("jewellery-gst").value = 3;
    }

    modal.style.display = "flex";
}

function closeJewelleryModal() {
    const modal = document.getElementById("jewellery-modal");
    if (modal) modal.style.display = "none";
    editingJewelleryId = null;
}

async function saveJewellery() {
    const name = document.getElementById("jewellery-name")?.value.trim();
    const category = document.getElementById("jewellery-category-select")?.value;
    const metalType = document.getElementById("jewellery-metal")?.value;
    const purity = document.getElementById("jewellery-purity")?.value.trim();
    const weightGrams = Number(document.getElementById("jewellery-weight")?.value);
    const makingCharges = Number(document.getElementById("jewellery-making")?.value);
    const gstPercentage = Number(document.getElementById("jewellery-gst")?.value) || 3;
    const imageUrl = document.getElementById("jewellery-image-url")?.value.trim();
    const description = document.getElementById("jewellery-desc")?.value.trim();
    const inStock = document.getElementById("jewellery-instock")?.checked;
    const isPopular = document.getElementById("jewellery-ispopular")?.checked;

    if (!name || !category || !weightGrams) {
        toast("Please fill in Product Name, Category and Weight", "warning");
        return;
    }

    const payload = {
        name,
        category,
        metalType,
        purity,
        weightGrams,
        makingCharges,
        gstPercentage,
        imageUrl,
        description,
        inStock,
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
        } else {
            toast(res.message || "Failed to save product", "danger");
        }
    } catch (e) {
        toast("Network error saving product", "danger");
    }
}

async function toggleJewelleryStock(id, newStatus) {
    try {
        const res = await api(`/jewellery/products/${id}`, {
            method: "PUT",
            body: JSON.stringify({ inStock: newStatus })
        });
        if (res.success) {
            toast(`Product marked as ${newStatus ? 'In Stock' : 'Out of Stock'}`, "success");
            loadJewellery();
        }
    } catch (e) {
        toast("Failed to toggle stock status", "danger");
    }
}

async function uploadJewelleryPhoto(id, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);

    toast("Uploading product image...", "info");

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
            toast("Image uploaded successfully", "success");
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
        } else {
            toast(res.message || "Failed to delete product", "danger");
        }
    } catch (e) {
        toast("Network error deleting product", "danger");
    }
}

// ── 3. Bullion Coins ──────────────────────────────────────────
async function loadCoins() {
    const body = document.getElementById("coins-catalog-body");
    if (!body) return;
    body.innerHTML = `<div class="loading-box"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div><div>Loading bullion mint coins...</div></div>`;

    try {
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
        const totalCoinVal = Math.round(baseVal + makingAmt);

        html += `
        <div class="product-card">
            <div class="product-card-media" style="background: radial-gradient(circle, ${isGold ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.15)'} 0%, rgba(14,18,26,0.9) 100%)">
                ${c.image ? `<img src="${c.image}" alt="${c.name}" class="product-img" onerror="this.style.display='none'" />` : ''}
                <div class="product-img-fallback">
                    <i class="${isGold ? 'fas fa-coins icon-gold' : 'fas fa-coins icon-silver'}" style="font-size:42px"></i>
                </div>

                <div class="product-media-badges">
                    <span class="product-badge ${isGold ? 'badge-gold' : 'badge-silver'}">${(c.metal || 'Gold').toUpperCase()}</span>
                    <span class="product-badge badge-popular">${c.purity || (isGold ? '999.9 Fine Gold' : '999 Pure Silver')}</span>
                </div>

                <span class="product-stock-tag ${c.isActive !== false ? 'stock-in' : 'stock-out'}">
                    ${c.isActive !== false ? '● Active' : '✕ Disabled'}
                </span>
            </div>

            <div class="product-card-body">
                <div class="product-name" style="font-size:15px">${c.name || 'Bullion Mint Coin'}</div>
                <div class="product-desc-snippet">Tamper-proof assayed physical bullion coin.</div>

                <div class="product-weight-row">
                    <span class="product-weight-badge"><i class="fas fa-circle-dot"></i> ${Number(c.grams || c.weightGrams || 0).toFixed(2)} g</span>
                    <span class="product-making-text">${makingPct}% minting charge</span>
                </div>

                <div class="product-pricing-box">
                    <div class="pricing-label">Current Coin Market Valuation</div>
                    <div class="pricing-total-val">₹ ${totalCoinVal.toLocaleString("en-IN")}</div>
                </div>

                <div class="product-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openCoinModal('${c._id}')" style="flex:1">
                        <i class="fas fa-edit"></i> Edit
                    </button>
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

    if (id) {
        const c = allCoins.find(item => item._id === id);
        if (c) {
            document.getElementById("coin-modal-title").textContent = "Edit Bullion Coin";
            document.getElementById("coin-name").value = c.name || "";
            document.getElementById("coin-metal").value = c.metal || "gold";
            document.getElementById("coin-grams").value = c.grams || c.weightGrams || "";
            document.getElementById("coin-making-pct").value = c.makingChargePct !== undefined ? c.makingChargePct : 5;
            document.getElementById("coin-image-url").value = c.image || "";
            document.getElementById("coin-isactive").checked = c.isActive !== false;
        }
    } else {
        document.getElementById("coin-modal-title").textContent = "Add New Bullion Coin";
        document.getElementById("coin-form")?.reset();
        document.getElementById("coin-making-pct").value = 5;
        document.getElementById("coin-isactive").checked = true;
    }

    modal.style.display = "flex";
}

function closeCoinModal() {
    const modal = document.getElementById("coin-modal");
    if (modal) modal.style.display = "none";
    editingCoinId = null;
}

async function saveCoin() {
    const name = document.getElementById("coin-name")?.value.trim();
    const metal = document.getElementById("coin-metal")?.value;
    const grams = Number(document.getElementById("coin-grams")?.value);
    const makingChargePct = Number(document.getElementById("coin-making-pct")?.value);
    const image = document.getElementById("coin-image-url")?.value.trim();
    const isActive = document.getElementById("coin-isactive")?.checked;

    if (!name || !grams) {
        toast("Please provide Coin Name and Weight in grams", "warning");
        return;
    }

    const payload = { name, metal, grams, makingChargePct, image, isActive };

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
        } else {
            toast(res.message || "Failed to delete coin", "danger");
        }
    } catch (e) {
        toast("Network error deleting coin", "danger");
    }
}

// ── 4. Categories Management ──────────────────────────────────
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

// ── 5. Customer Delivery Orders ───────────────────────────────
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
        if (info) info.textContent = `Page ${res.page || page} of ${res.pages || 1} (${res.total || allOrders.length} orders)`;
        
        const prevBtn = document.getElementById("btn-prev-orders");
        const nextBtn = document.getElementById("btn-next-orders");
        if (prevBtn) prevBtn.disabled = (res.page || 1) <= 1;
        if (nextBtn) nextBtn.disabled = (res.page || 1) >= (res.pages || 1);
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
                    <th>Product & Metal</th>
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

        const statusMap = {
            placed: { label: "Placed", cls: "badge-pill-pending" },
            pending: { label: "Pending", cls: "badge-pill-pending" },
            processing: { label: "Processing", cls: "badge-amber" },
            shipped: { label: "Shipped", cls: "badge-blue" },
            out_for_delivery: { label: "Out for Delivery", cls: "badge-blue" },
            delivered: { label: "Delivered", cls: "badge-pill-success" },
            cancelled: { label: "Cancelled", cls: "badge-danger" }
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
                <div style="font-size:11px;color:${isGold ? 'var(--gold)' : 'var(--silver)'}"><i class="fas fa-gem"></i> ${(o.metalType || 'Gold').toUpperCase()}</div>
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

    setElText("order-detail-id", `ORD-${String(o._id).slice(-6).toUpperCase()}`);
    setElText("order-detail-customer", `${o.user?.name || 'Customer'} (${o.user?.phone || 'No phone'})`);
    setElText("order-detail-address", o.shippingAddress || "Customer registered delivery address");
    setElText("order-detail-product-info", `${o.jewelleryName} • ${o.weightGrams}g ${o.metalType?.toUpperCase()} • Paid: ₹${Number(o.totalPaid || 0).toLocaleString("en-IN")}`);

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
            toast("Order fulfillment details updated successfully", "success");
            closeOrderDetailsModal();
            loadJewelleryOrders(ordersPage);
        } else {
            toast(res.message || "Failed to update order", "danger");
        }
    } catch (e) {
        toast("Network error updating order", "danger");
    }
}
