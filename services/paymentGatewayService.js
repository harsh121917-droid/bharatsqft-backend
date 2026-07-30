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
async function resolveGateway({ gateway, mode }) {
    let query;
    if (gateway) {
        query = { name: gateway, mode: mode || "live", isActive: true };
    } else {
        query = { isDefault: true, isActive: true };
    }

    const config = await PaymentGateway.findOne(query);
    if (!config) {
        const label = gateway ? `${gateway} (${mode || "live"})` : "a default gateway";
        const err = new Error(
            `No active payment gateway configured for ${label}. ` +
            `Set it up in Admin → Payment Gateways first.`
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
    verifyRazorpaySignature,
    getRazorpayKeySecret,
    createCashfreeOrder,
    verifyCashfreeOrder,
    getCashfreePayoutToken,
};