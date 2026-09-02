const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const PaymentGateway = require("../models/PaymentGateway");

/**
 * Sanitizes Razorpay metadata (notes & description) to ensure no
 * sensitive metal/bullion terms, gold references, or internal goal titles
 * are sent to Razorpay.
 */
function sanitizeRazorpayNotes(rawNotes = {}, purpose = "investment") {
    const cleanNotes = {};

    // 1. Keep safe internal routing identifiers
    if (rawNotes.userId) cleanNotes.userId = rawNotes.userId.toString();
    if (rawNotes.savingId) cleanNotes.savingId = rawNotes.savingId.toString();
    if (rawNotes.orderRef || rawNotes.orderId) cleanNotes.orderRef = (rawNotes.orderRef || rawNotes.orderId).toString();
    if (rawNotes.couponCode || rawNotes.promo) cleanNotes.promo = (rawNotes.couponCode || rawNotes.promo).toString();
    if (rawNotes.frequency) cleanNotes.frequency = rawNotes.frequency.toString().toLowerCase();
    if (rawNotes.durationMonths) cleanNotes.durationMonths = parseInt(rawNotes.durationMonths, 10) || 12;

    // 2. Always pass generic type: "investment" (no digital_wallet or other terms)
    cleanNotes.type = "investment";

    return cleanNotes;
}

/**
 * Resolves which gateway config to use for a request.
 * - Supports dual Razorpay routing:
 *   - purpose: "spot" -> Uses 'razorpay_idfc' (0% charge for buy gold/silver/copper, wallet, orders)
 *   - purpose: "sip_scheme" -> Uses 'razorpay_standard' (for SIP AutoPay & Savings Schemes)
 * - If explicit gateway and mode requested, uses that.
 * - Falls back to default gateway or general 'razorpay'.
 */
async function resolveGateway({ gateway, purpose, mode } = {}) {
    let config = null;

    // 1. If explicit gateway name passed (e.g. "razorpay_idfc", "razorpay_hdfc", "razorpay_standard", "razorpay", "cashfree")
    if (gateway && mode) {
        config = await PaymentGateway.findOne({ name: gateway.toLowerCase(), mode, isActive: true });
    }
    if (!config && gateway) {
        config = await PaymentGateway.findOne({ name: gateway.toLowerCase(), isDefault: true, isActive: true });
    }
    if (!config && gateway) {
        config = await PaymentGateway.findOne({ name: gateway.toLowerCase(), isActive: true }).sort({ isDefault: -1, updatedAt: -1 });
    }

    // 2. If purpose is "spot" (Buy Gold/Silver/Copper, Wallet, Coins, Jewellery, Properties)
    if (!config && purpose === "spot") {
        // Priority 1: IDFC Razorpay marked default & active
        config = await PaymentGateway.findOne({ name: { $in: ["razorpay_idfc", "razorpay_hdfc"] }, isDefault: true, isActive: true });
        // Priority 2: any active IDFC Razorpay
        if (!config) config = await PaymentGateway.findOne({ name: { $in: ["razorpay_idfc", "razorpay_hdfc"] }, isActive: true });
        // Priority 3: any active gateway marked isDefault with purpose: "spot"
        if (!config) config = await PaymentGateway.findOne({ purpose: "spot", isDefault: true, isActive: true });
        // Priority 4: general razorpay marked isDefault
        if (!config) config = await PaymentGateway.findOne({ name: "razorpay", isDefault: true, isActive: true });
        // Priority 5: any active razorpay
        if (!config) config = await PaymentGateway.findOne({ name: "razorpay", isActive: true });
    }

    // 3. If purpose is "sip_scheme" (SIP Subscriptions, SIP Orders, 11+1 Schemes)
    if (!config && purpose === "sip_scheme") {
        // Priority 1: razorpay_standard marked default & active
        config = await PaymentGateway.findOne({ name: "razorpay_standard", isDefault: true, isActive: true });
        // Priority 2: any active razorpay_standard
        if (!config) config = await PaymentGateway.findOne({ name: "razorpay_standard", isActive: true });
        // Priority 3: any active gateway marked isDefault with purpose: "sip_scheme"
        if (!config) config = await PaymentGateway.findOne({ purpose: "sip_scheme", isDefault: true, isActive: true });
        // Priority 4: general razorpay marked isDefault
        if (!config) config = await PaymentGateway.findOne({ name: "razorpay", isDefault: true, isActive: true });
        // Priority 5: any active razorpay
        if (!config) config = await PaymentGateway.findOne({ name: "razorpay", isActive: true });
    }

    // 4. Default active gateway in the system
    if (!config) {
        config = await PaymentGateway.findOne({ isDefault: true, isActive: true });
    }

    // 5. Fallback: Any active gateway in the system
    if (!config) {
        config = await PaymentGateway.findOne({ isActive: true }).sort({ isDefault: -1, updatedAt: -1 });
    }

    // 6. Fallback to process.env if available
    if (!config && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        return {
            name: "razorpay",
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_KEY_SECRET,
            mode: process.env.RAZORPAY_KEY_ID.startsWith("rzp_test") ? "demo" : "live",
            isActive: true,
            isDefault: true,
        };
    }

    if (!config) {
        const label = gateway ? `${gateway}${mode ? ` (${mode})` : ""}` : purpose ? `purpose '${purpose}'` : "a payment gateway";
        const err = new Error(
            `No active payment gateway configured for ${label}. Set it up in Admin → Payment Gateways first.`
        );
        err.status = 503;
        throw err;
    }

    return config;
}

// ══════════════════════════════════════════════════════════════════════════════
// Razorpay Orders & Subscriptions
// ══════════════════════════════════════════════════════════════════════════════
async function createRazorpayOrder({ amount, notes = {}, mode, purpose = "spot", gateway }) {
    const config = await resolveGateway({ gateway: gateway || (purpose === "sip_scheme" ? "razorpay_standard" : "razorpay_idfc"), purpose, mode });
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
    
    // Sanitize notes so Razorpay never receives metal or sensitive details
    const cleanNotes = sanitizeRazorpayNotes(notes, purpose);

    const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        notes: cleanNotes,
    });
    return { order, keyId: config.keyId, mode: config.mode, gatewayName: config.name };
}

function verifyRazorpaySignature({ orderId, paymentId, signature, keySecret }) {
    if (keySecret) {
        const expected = crypto
            .createHmac("sha256", keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");
        if (expected === signature) return true;
    }
    return false;
}

async function verifyRazorpaySignatureWithFallback({ orderId, paymentId, signature, keySecret, purpose }) {
    if (keySecret && verifyRazorpaySignature({ orderId, paymentId, signature, keySecret })) {
        return true;
    }
    const configs = await PaymentGateway.find({
        name: { $in: ["razorpay", "razorpay_idfc", "razorpay_hdfc", "razorpay_standard"] },
        isActive: true,
        keySecret: { $exists: true, $ne: "" }
    });
    for (const cfg of configs) {
        if (verifyRazorpaySignature({ orderId, paymentId, signature, keySecret: cfg.keySecret })) {
            return true;
        }
    }
    if (process.env.RAZORPAY_KEY_SECRET) {
        if (verifyRazorpaySignature({ orderId, paymentId, signature, keySecret: process.env.RAZORPAY_KEY_SECRET })) {
            return true;
        }
    }
    return false;
}

async function createRazorpaySubscription({ amount, frequency, totalCycles, notes = {}, mode, gateway }) {
    // Subscriptions use razorpay_standard by default
    const config = await resolveGateway({ gateway: gateway || "razorpay_standard", purpose: "sip_scheme", mode });
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });

    let period = "monthly";
    let interval = 1;
    switch (frequency) {
        case "daily": period = "daily"; interval = 1; break;
        case "weekly": period = "weekly"; interval = 1; break;
        case "monthly": period = "monthly"; interval = 1; break;
        case "quarterly": period = "monthly"; interval = 3; break;
        case "yearly": period = "yearly"; interval = 1; break;
        default: period = "monthly"; interval = 1;
    }

    // Sanitize notes & description to keep them generic (no gold/silver/goal titles)
    const cleanNotes = sanitizeRazorpayNotes(notes, "sip_scheme");

    const plan = await razorpay.plans.create({
        period,
        interval,
        item: {
            name: "Investment",
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            description: "Investment",
        },
        notes: cleanNotes,
    });

    const subscription = await razorpay.subscriptions.create({
        plan_id: plan.id,
        total_count: totalCycles || 12,
        quantity: 1,
        customer_notify: 0,
        notes: cleanNotes,
    });

    return { subscription, plan, keyId: config.keyId, mode: config.mode, gatewayName: config.name };
}

function verifyRazorpaySubscriptionSignature({ paymentId, subscriptionId, signature, keySecret }) {
    if (keySecret) {
        const expected = crypto
            .createHmac("sha256", keySecret)
            .update(`${paymentId}|${subscriptionId}`)
            .digest("hex");
        if (expected === signature) return true;
    }
    return false;
}

async function verifyRazorpaySubscriptionSignatureWithFallback({ paymentId, subscriptionId, signature, keySecret }) {
    if (keySecret && verifyRazorpaySubscriptionSignature({ paymentId, subscriptionId, signature, keySecret })) {
        return true;
    }
    const configs = await PaymentGateway.find({
        name: { $in: ["razorpay", "razorpay_idfc", "razorpay_hdfc", "razorpay_standard"] },
        isActive: true,
        keySecret: { $exists: true, $ne: "" }
    });
    for (const cfg of configs) {
        if (verifyRazorpaySubscriptionSignature({ paymentId, subscriptionId, signature, keySecret: cfg.keySecret })) {
            return true;
        }
    }
    if (process.env.RAZORPAY_KEY_SECRET) {
        if (verifyRazorpaySubscriptionSignature({ paymentId, subscriptionId, signature, keySecret: process.env.RAZORPAY_KEY_SECRET })) {
            return true;
        }
    }
    return false;
}

async function getRazorpayKeySecret(mode, { gateway, purpose } = {}) {
    const config = await resolveGateway({ gateway, purpose, mode });
    return config.keySecret;
}

// ══════════════════════════════════════════════════════════════════════════════
// Cashfree (payment collection) — real REST API, sandbox vs production base URL
// per mode. Docs: https://docs.cashfree.com/docs/orders
// ══════════════════════════════════════════════════════════════════════════════
function cashfreeBaseUrl(mode) {
    return mode === "live" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

async function createCashfreeOrder({ amount, userId, mode, customerPhone, customerEmail }) {
    const config = await resolveGateway({ gateway: "cashfree", mode });
    const orderId = `wallet_${userId}_${Date.now()}`;

    const res = await axios.post(
        `${cashfreeBaseUrl(config.mode)}/orders`,
        {
            order_id: orderId,
            order_amount: amount,
            order_currency: "INR",
            customer_details: {
                customer_id: userId.toString(),
                customer_phone: customerPhone || "9999999999",
                customer_email: customerEmail || "user@example.com",
            },
        },
        {
            headers: {
                "x-client-id": config.clientId,
                "x-client-secret": config.clientSecret,
                "x-api-version": "2023-08-01",
                "Content-Type": "application/json",
            },
        }
    );

    return { orderId, paymentSessionId: res.data.payment_session_id, mode: config.mode };
}

async function verifyCashfreeOrder({ orderId, mode }) {
    const config = await resolveGateway({ gateway: "cashfree", mode });
    const res = await axios.get(`${cashfreeBaseUrl(config.mode)}/orders/${orderId}`, {
        headers: {
            "x-client-id": config.clientId,
            "x-client-secret": config.clientSecret,
            "x-api-version": "2023-08-01",
        },
    });
    return res.data; // includes order_status: "PAID" | "ACTIVE" | "EXPIRED" etc.
}

// ══════════════════════════════════════════════════════════════════════════════
// Cashfree Payout — separate credential set, used for sending money OUT
// (e.g. withdrawal-to-bank automation). Docs: https://docs.cashfree.com/docs/payouts
// ══════════════════════════════════════════════════════════════════════════════
function cashfreePayoutBaseUrl(mode) {
    return mode === "live" ? "https://payout-api.cashfree.com/payout" : "https://payout-gamma.cashfree.com/payout";
}

async function getCashfreePayoutToken(mode) {
    const config = await resolveGateway({ gateway: "cashfree_payout", mode });
    const res = await axios.post(
        `${cashfreePayoutBaseUrl(config.mode)}/v1/authorize`,
        {},
        { headers: { "X-Client-Id": config.clientId, "X-Client-Secret": config.clientSecret } }
    );
    return { token: res.data.data.token, mode: config.mode };
}

module.exports = {
    resolveGateway,
    sanitizeRazorpayNotes,
    createRazorpayOrder,
    createRazorpaySubscription,
    verifyRazorpaySignature,
    verifyRazorpaySignatureWithFallback,
    verifyRazorpaySubscriptionSignature,
    verifyRazorpaySubscriptionSignatureWithFallback,
    getRazorpayKeySecret,
    createCashfreeOrder,
    verifyCashfreeOrder,
    getCashfreePayoutToken,
};