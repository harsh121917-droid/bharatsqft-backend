/* ══════════════════════════════════════════════════════════════
   Payvika / Bharat SQFT — Authenticated API Client
   ══════════════════════════════════════════════════════════════ */

async function api(path, options = {}) {
    const token = localStorage.getItem("token");
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        if (res.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            const loginPage = document.getElementById("login-page");
            const mainWrap = document.getElementById("main-wrap");
            const sidebar = document.getElementById("sidebar");
            if (loginPage) loginPage.style.display = "flex";
            if (mainWrap) mainWrap.style.display = "none";
            if (sidebar) sidebar.style.display = "none";
            throw new Error("Session expired. Please log in again.");
        }

        const data = await res.json();
        return data;
    } catch (err) {
        console.error(`API Error on ${path}:`, err);
        throw err;
    }
}
