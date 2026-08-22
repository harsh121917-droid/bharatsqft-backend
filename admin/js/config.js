/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Admin Panel Configuration & Utilities
   ══════════════════════════════════════════════════════════════ */

// Auto-resolve API base URL (production onrender backend vs express static serving)
function getApiBaseUrl() {
    // If served directly from Express server on port 5000 or same origin
    if (window.location.port === "5000" || (window.location.hostname.includes("onrender.com") && window.location.pathname.startsWith("/admin"))) {
        return "/api";
    }
    // When opened via VS Code Live Server (127.0.0.1:5500 / 5501) or file://
    return "https://bharatsqft-backend.onrender.com/api";
}

const API_BASE = getApiBaseUrl();

// ── Currency, Weight & Date Formatters ─────────────────────────
function formatINR(val) {
    const num = Number(val) || 0;
    return "₹" + num.toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatGrams(val, precision = 4) {
    const num = Number(val) || 0;
    return num.toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision
    }) + " g";
}

function formatPrice(n) {
    if (!n && n !== 0) return "₹0";
    if (n >= 10000000) return "₹" + (n / 10000000).toFixed(2) + " Cr";
    if (n >= 100000) return "₹" + (n / 100000).toFixed(2) + " L";
    if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + " K";
    return "₹" + Number(n).toLocaleString("en-IN");
}

function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function timeAgo(date) {
    if (!date) return "—";
    const dt = new Date(date);
    if (isNaN(dt.getTime())) return "—";
    const seconds = Math.floor((new Date() - dt) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dt);
}

function userNameEsc(user) {
    if (!user) return "Unknown User";
    if (typeof user === "string") return user;
    return user.name || user.phone || user.email || "Unknown User";
}

// ── Unified Toast Notification System ──────────────────────────
function toast(msg, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const t = document.createElement("div");
    t.className = `toast toast-${type}`;

    let icon = "fa-check-circle";
    if (type === "danger" || type === "error") icon = "fa-exclamation-circle";
    if (type === "warning") icon = "fa-exclamation-triangle";
    if (type === "info") icon = "fa-info-circle";

    t.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(t);

    setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateX(50px)";
        t.style.transition = "all 0.3s ease";
        setTimeout(() => t.remove(), 300);
    }, 3800);
}
