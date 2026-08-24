/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Admin Main Application Bootloader
   ══════════════════════════════════════════════════════════════ */

// ── Sidebar Toggle for Mobile ──────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && overlay) {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
    }
}

function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar && overlay) {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
    }
}

// ── Auth Handling ──────────────────────────────────────────────
async function doLogin(e) {
    if (e) e.preventDefault();

    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    const btn = document.getElementById("btn-login-submit");

    if (!email || !password) {
        toast("Please enter your email and password", "warning");
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Authenticating...`;
        }

        const res = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        if (res.success && res.token) {
            if (res.user?.role !== "admin") {
                toast("Access denied: Admin privileges required.", "danger");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>Sign In</span> <i class="fas fa-arrow-right"></i>`;
                }
                return;
            }

            localStorage.setItem("token", res.token);
            localStorage.setItem("user", JSON.stringify(res.user));
            toast(`Welcome back, ${res.user.name || 'Admin'}!`, "success");
            showApp(res.user);
        } else {
            toast(res.message || "Invalid credentials", "danger");
        }
    } catch (err) {
        toast("Login failed. Please check credentials or server connection.", "danger");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>Sign In</span> <i class="fas fa-arrow-right"></i>`;
        }
    }
}

function confirmLogout() {
    const modal = document.getElementById("logout-modal");
    if (modal) modal.style.display = "flex";
}

function closeLogoutModal() {
    const modal = document.getElementById("logout-modal");
    if (modal) modal.style.display = "none";
}

function doLogout() {
    closeLogoutModal();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    const loginPage = document.getElementById("login-page");
    const mainWrap = document.getElementById("main-wrap");
    const sidebar = document.getElementById("sidebar");
    if (loginPage) loginPage.style.display = "flex";
    if (mainWrap) mainWrap.style.display = "none";
    if (sidebar) sidebar.style.display = "none";
    toast("Logged out successfully", "info");
}

function showApp(user) {
    const loginPage = document.getElementById("login-page");
    const mainWrap = document.getElementById("main-wrap");
    const sidebar = document.getElementById("sidebar");

    if (loginPage) loginPage.style.display = "none";
    if (mainWrap) mainWrap.style.display = "flex";
    if (sidebar) sidebar.style.display = "flex";

    if (user) {
        const nameEl = document.getElementById("admin-name");
        const avatarEl = document.getElementById("admin-avatar");
        const drawerNameEl = document.getElementById("drawer-admin-name");
        const drawerAvatarEl = document.getElementById("drawer-admin-avatar");
        const name = user.name || "Administrator";
        const initial = name[0].toUpperCase();

        if (nameEl) nameEl.textContent = name;
        if (avatarEl) avatarEl.textContent = initial;
        if (drawerNameEl) drawerNameEl.textContent = name;
        if (drawerAvatarEl) drawerAvatarEl.textContent = initial;
    }

    showPage("dashboard");
}

function tryAutoLogin() {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
        try {
            const user = JSON.parse(userStr);
            showApp(user);
        } catch (e) {
            doLogout();
        }
    }
}

// ── Single-Page Navigation ────────────────────────────────────
const pageTitles = {
    // 1. Core & Common
    dashboard: "Dashboard 👋",
    users: "Users",
    kyc: "KYC Management",

    // 2. Digi Gold
    userinvestments: "Digi Gold User Investments",
    schemes: "Gold & Silver Savings Schemes",
    withdrawals: "Bank Withdrawal Requests",
    sellapprovals: "Sell Payout Approvals",
    rewards: "Rewards Program",
    jewellery: "Jewellery & Bullion Catalog",
    inventory: "Jewellery & Bullion Inventory Suite",
    jewelleryorders: "Jewellery & Bullion Orders",
    coupons: "Coupons & Promotional Offers",
    notifications: "Push Notifications Hub",
    gateways: "Payment Gateways Config",
    appversion: "App Version Management",

    // 3. Real Estate
    properties: "Property Listings",
    investments: "Real Estate Brick Investments",
    enquiries: "Customer Enquiries"
};

function showPage(pageId) {
    // 1. Hide all pages
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

    // 2. Deactivate all nav items
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

    // 3. Activate selected page
    const pageEl = document.getElementById(`page-${pageId}`);
    if (pageEl) pageEl.classList.add("active");

    // 4. Activate nav item
    const navEl = document.getElementById(`nav-${pageId}`);
    if (navEl) navEl.classList.add("active");

    // 5. Update topbar title
    const titleEl = document.getElementById("topbar-title");
    if (titleEl) titleEl.textContent = pageTitles[pageId] || "Admin Panel";

    // 6. Close mobile sidebar
    closeSidebar();

    // 7. Load page specific data
    switch (pageId) {
        case "dashboard":
            loadDashboard();
            break;
        case "users":
            loadUsers(1);
            break;
        case "kyc":
            loadKyc("pending");
            break;
        case "userinvestments":
            loadUserInvestments();
            break;
        case "schemes":
            loadSchemes();
            break;
        case "withdrawals":
            loadWithdrawals("pending");
            break;
        case "sellapprovals":
            loadSellApprovals("all", "processing");
            break;
        case "rewards":
            loadRewardsPage();
            break;
        case "jewellery":
            loadJewellery();
            loadCoins();
            break;
        case "inventory":
            loadInventory();
            break;
        case "jewelleryorders":
            loadJewelleryOrders(1);
            break;
        case "coupons":
            loadCoupons();
            break;
        case "notifications":
            loadNotificationPage();
            break;
        case "gateways":
            loadGateways();
            break;
        case "appversion":
            loadAppConfig();
            break;
        case "properties":
            loadProperties();
            break;
        case "investments":
            loadInvestments();
            break;
        case "enquiries":
            loadEnquiries();
            break;
    }
}

// ── Application Initialization ────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    tryAutoLogin();
});
