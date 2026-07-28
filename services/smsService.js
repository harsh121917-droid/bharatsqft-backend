const axios = require("axios");

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ARIHANT GLOBAL — confirmed from their official API Specification Document
 * (not a guess — this matches their real welcome email + PDF exactly)
 * ══════════════════════════════════════════════════════════════════════════
 * Endpoint (GET, query params):
 *   https://control.arihantglobal.in/fe/api/v1/send
 *     ?username={api_username}&password={api_password}
 *     &dltPrincipalEntityId={Entityid}&from={sender_name}
 *     &text={message_text}&to={mobile number}&unicode=false
 *     &dltContentId={template id}
 *
 * IMPORTANT — the API username/password are NOT your login credentials
 * (payvikaindia / GUI password). Get the real API password from:
 *   Login to https://control.arihantglobal.in → My Profile →
 *   click "Email API Credential" — it emails your real API username +
 *   password to your registered service account email. You don't need to
 *   fill in the "SV Profile" fields (those are locked/greyed out and are
 *   for a different, unrelated sub-service) — just click that button.
 *
 * API username format: {account}.trans for Transactional SMS (confirmed
 * in the PDF's own example: "Test.trans"), e.g. "payvikaindia.trans".
 *
 * You also need, from your DLT registration:
 *   - dltPrincipalEntityId — your Principal Entity ID
 *   - dltContentId         — the approved template ID for your OTP message
 *     text. The template text on DLT must match `text` sent here EXACTLY
 *     (variable placeholders aside) or the operator will silently drop it.
 *
 * Set all of these in your .env — see the ARIHANT_* vars below.
 * ══════════════════════════════════════════════════════════════════════════
 */
const ARIHANT_BASE_URL = "https://control.arihantglobal.in/fe/api/v1/send";
const ARIHANT_API_USERNAME = process.env.ARIHANT_API_USERNAME;   // e.g. "payvikaindia.trans"
const ARIHANT_API_PASSWORD = process.env.ARIHANT_API_PASSWORD;   // generated from My Profile, NOT your GUI login password
const ARIHANT_SENDER_ID = process.env.ARIHANT_SENDER_ID;         // your approved 6-char Sender ID ("from")
const ARIHANT_DLT_PE_ID = process.env.ARIHANT_DLT_PRINCIPAL_ENTITY_ID; // your DLT Principal Entity ID
const ARIHANT_DLT_CONTENT_ID = process.env.ARIHANT_DLT_CONTENT_ID;     // approved template ID for the OTP message

/**
 * Sends an SMS via Arihant Global's real HTTP API.
 * Returns true on apparent success, throws on hard failure.
 */
async function sendViaArihant(phone, message) {
    if (!ARIHANT_API_USERNAME || !ARIHANT_API_PASSWORD || !ARIHANT_SENDER_ID || !ARIHANT_DLT_PE_ID || !ARIHANT_DLT_CONTENT_ID) {
        throw new Error(
            "Arihant SMS credentials not configured — set ARIHANT_API_USERNAME, " +
            "ARIHANT_API_PASSWORD, ARIHANT_SENDER_ID, ARIHANT_DLT_PRINCIPAL_ENTITY_ID " +
            "and ARIHANT_DLT_CONTENT_ID in .env (see comments in this file for where each comes from)"
        );
    }

    // Indian numbers need the country code prefix for most gateways — strip
    // any leading zero/plus and prepend 91 if it looks like a bare 10-digit number.
    const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
    const fullNumber = normalizedPhone.length === 10 ? `91${normalizedPhone}` : normalizedPhone;

    const params = {
        username: ARIHANT_API_USERNAME,
        password: ARIHANT_API_PASSWORD,
        dltPrincipalEntityId: ARIHANT_DLT_PE_ID,
        from: ARIHANT_SENDER_ID,
        text: message,
        to: fullNumber,
        unicode: "false",
        dltContentId: ARIHANT_DLT_CONTENT_ID,
    };

    let response;
    try {
        response = await axios.get(ARIHANT_BASE_URL, { params, timeout: 10000 });
    } catch (err) {
        // Arihant returned a non-2xx HTTP status (not the documented "200 with
        // error statusCode inside" shape) — axios throws before we can see the
        // body normally, so log it explicitly here to find out what's wrong.
        console.error("[Arihant SMS] HTTP error status:", err.response?.status);
        console.error("[Arihant SMS] HTTP error body:", err.response?.data);
        console.error("[Arihant SMS] request URL was:", err.config?.url);
        console.error("[Arihant SMS] request params were:", { ...params, password: "••••" });
        throw new Error(
            `Arihant SMS request rejected (HTTP ${err.response?.status}): ` +
            `${JSON.stringify(err.response?.data) || err.message}`
        );
    }
    const data = response.data;
    console.log("[Arihant SMS] response:", data);

    // Confirmed from Arihant's real API spec (API SPECIFICATION DOCUMENT, p.4-5):
    // HTTP 200 does NOT mean the SMS was actually accepted — Arihant returns
    // business-logic errors as statusCode inside a 200 OK body, so we must
    // check statusCode explicitly rather than trusting the HTTP status alone.
    const ARIHANT_ERROR_CODES = {
        2051: "Sender ID doesn't exist — check ARIHANT_SENDER_ID is registered on your panel",
        2070: "Authentication failed — check ARIHANT_API_USERNAME/ARIHANT_API_PASSWORD, or account may have expired",
        2054: "Invalid mobile number format — must be 10 digits, or 12 with 91 country code",
        6001: "Insufficient balance in your Arihant account",
        7001: "DLT Content ID not found — check ARIHANT_DLT_CONTENT_ID matches an approved template",
    };

    if (data && data.statusCode && data.statusCode !== 200) {
        const reason = ARIHANT_ERROR_CODES[data.statusCode] || data.description || "Unknown error";
        throw new Error(`Arihant SMS failed (${data.statusCode}): ${reason}`);
    }
    if (data && data.state && data.state !== "SUBMIT_ACCEPTED") {
        throw new Error(`Arihant SMS not accepted: ${data.description || data.state}`);
    }

    return true;
}

/**
 * Generic entry point — swap providers here later without touching callers.
 */
async function sendSms(phone, message) {
    return sendViaArihant(phone, message);
}

module.exports = { sendSms };