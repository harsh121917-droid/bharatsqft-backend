const axios = require("axios");

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️  ARIHANT GLOBAL — FILL IN YOUR REAL API DETAILS BELOW
 * ══════════════════════════════════════════════════════════════════════════
 * Arihant Global's public site doesn't publish the exact API spec — they
 * give you the real endpoint URL, parameter names, and your API key/username
 * after you sign up, usually via:
 *   - the welcome email sent after signup, OR
 *   - "API Docs" / "API" section inside https://control.arihantglobal.in
 *     after logging into your account
 *
 * The shape below (GET request, user/pass/sender/mobile/message params) is
 * the MOST COMMON pattern used by Indian bulk-SMS reseller panels — but you
 * MUST confirm the exact parameter names against your own account's API doc
 * before this will actually send anything. Log into your panel, find the
 * "API" tab, and copy the exact sample URL they show you — then update the
 * `ARIHANT_API_URL` and the `params` object below to match exactly.
 *
 * Also register your OTP message as a DLT-approved template first — Indian
 * telecom operators will silently drop transactional SMS that doesn't match
 * an approved template registered against your Sender ID.
 * ══════════════════════════════════════════════════════════════════════════
 */
const ARIHANT_API_URL = process.env.ARIHANT_API_URL || "https://smpp.arihantglobal.in/api/mt/SendSMS"; // ← confirm this against your panel
const ARIHANT_USER = process.env.ARIHANT_SMS_USER;         // your Arihant account username
const ARIHANT_PASSWORD = process.env.ARIHANT_SMS_PASSWORD; // your Arihant account password/API key
const ARIHANT_SENDER_ID = process.env.ARIHANT_SENDER_ID;   // your approved 6-char Sender ID, e.g. "BSQFTX"
const ARIHANT_DLT_TEMPLATE_ID = process.env.ARIHANT_DLT_TEMPLATE_ID; // your approved DLT template ID for the OTP message

/**
 * Sends an SMS via Arihant Global's HTTP API.
 * Returns true on apparent success, throws on hard failure.
 */
async function sendViaArihant(phone, message) {
    if (!ARIHANT_USER || !ARIHANT_PASSWORD || !ARIHANT_SENDER_ID) {
        throw new Error(
            "Arihant SMS credentials not configured — set ARIHANT_SMS_USER, " +
            "ARIHANT_SMS_PASSWORD, ARIHANT_SENDER_ID (and ARIHANT_DLT_TEMPLATE_ID) in .env"
        );
    }

    // Indian numbers need the country code prefix for most gateways — strip
    // any leading zero/plus and prepend 91 if it looks like a bare 10-digit number.
    const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
    const fullNumber = normalizedPhone.length === 10 ? `91${normalizedPhone}` : normalizedPhone;

    // ── ⚠️ REPLACE these param names with your panel's actual API doc ──────
    const params = {
        user: ARIHANT_USER,
        password: ARIHANT_PASSWORD,
        sender: ARIHANT_SENDER_ID,
        mobile: fullNumber,
        message,
        route: "T",              // "T" = Transactional (typical convention — confirm with panel)
        ...(ARIHANT_DLT_TEMPLATE_ID ? { dltTemplateId: ARIHANT_DLT_TEMPLATE_ID } : {}),
    };

    const response = await axios.get(ARIHANT_API_URL, { params, timeout: 10000 });

    // Most of these panels return a plain-text "OK"/error string rather than
    // JSON — log it so you can see the exact response shape while testing,
    // then tighten this success check once you know their real response format.
    console.log("[Arihant SMS] response:", response.data);
    return true;
}

/**
 * Generic entry point — swap providers here later without touching callers.
 */
async function sendSms(phone, message) {
    return sendViaArihant(phone, message);
}

module.exports = { sendSms };