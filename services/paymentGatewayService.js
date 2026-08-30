const axios = require("axios");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const PaymentGateway = require("../models/PaymentGateway");

/**
 * Resolves which gateway config to use for a request.
 * - If req body passes { gateway, mode }, use exactly that.
 * - If omitted, fall back to whichever config is marked isDefault.
 * - Throws a clear error if nothing is configured — never silently
 *   falls back to a hardcoded/env key anymore.
 */
async function resolveGateway({ gateway, mode } = {}) {
    let config = null;

    // 1. If explicit gateway and mode requested
    if (gateway && mode) {
        config = await PaymentGateway.findOne({ name: gateway, mode, isActive: true });
    }

    // 2. If gateway specified without mode, check for default config of that gateway
    if (!config && gateway) {
        config = await PaymentGateway.findOne({ name: gateway, isDefault: true, isActive: true });
    }

    // 3. If still not found for gateway, check ANY active config for that gateway (demo or live)
    if (!config && gateway) {
        config = await PaymentGateway.findOne({ name: gateway, isActive: true }).sort({ isDefault: -1, updatedAt: -1 });
    }

    // 4. If no specific gateway requested, find the active default gateway
    if (!config && !gateway) {
        config = await PaymentGateway.findOne({ isDefault: true, isActive: true });
    }

    // 5. Fallback: Any active gateway in the system
    if (!config && !gateway) {
        config = await PaymentGateway.findOne({ isActive: true }).sort({ isDefault: -1, updatedAt: -1 });
    }

    // 6. Fallback to process.env if available
    if (!config && (gateway === "razorpay" || !gateway) && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
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
        const label = gateway ? `${gateway}${mode ? ` (${mode})` : ""}` : "a payment gateway";
        const err = new Error(
            `No active payment gateway configured for ${label}. Set it up in Admin → Payment Gateways first.`
        );
        err.status = 503;
        throw err;
    }

    return config;
}

// ══════════════════════════════════════════════════════════════════════════════
// Razorpay
// ══════════════════════════════════════════════════════════════════════════════
async function createRazorpayOrder({ amount, notes, mode }) {
    const config = await resolveGateway({ gateway: "razorpay", mode });
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
    const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        notes,
    });
    return { order, keyId: config.keyId, mode: config.mode };
}

function verifyRazorpaySignature({ orderId, paymentId, signature, keySecret }) {
    const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    return expected === signature;
}

async function createRazorpaySubscription({ amount, frequency, totalCycles, notes, mode }) {
    const config = await resolveGateway({ gateway: "razorpay", mode });
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

    const plan = await razorpay.plans.create({
        period,
        interval,
        item: {
            name: (notes && notes.goalTitle) ? notes.goalTitle : "Payvika Bullion SIP",
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            description: `${(notes && notes.metal) ? notes.metal.toUpperCase() : "GOLD"} SIP AutoPay`,
        },
        notes,
    });

    const subscription = await razorpay.subscriptions.create({
        plan_id: plan.id,
        total_count: totalCycles || 12,
        quantity: 1,
        customer_notify: 0,
        notes,
    });

    return { subscription, plan, keyId: config.keyId, mode: config.mode };
}

function verifyRazorpaySubscriptionSignature({ paymentId, subscriptionId, signature, keySecret }) {
    const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");
    return expected === signature;
}

async function getRazorpayKeySecret(mode) {
    const config = await resolveGateway({ gateway: "razorpay", mode });
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
    createRazorpayOrder,
    createRazorpaySubscription,
    verifyRazorpaySignature,
    verifyRazorpaySubscriptionSignature,
    getRazorpayKeySecret,
    createCashfreeOrder,
    verifyCashfreeOrder,
    getCashfreePayoutToken,
};