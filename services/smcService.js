const axios = require('axios');

const SMC_BASE_URL = process.env.SMC_BASE_URL || 'https://api.smcindiaonline.com';

async function smcLogin() {
    const credentials = {
        clientId: process.env.SMC_CLIENT_ID,
        password: process.env.SMC_PASSWORD,
        apiKey: process.env.SMC_API_KEY,
        apiSecret: process.env.SMC_API_SECRET,
        platform: process.env.SMC_PLATFORM || 'WEB',
        deviceId: process.env.SMC_DEVICE_ID || 'test-device-001',
        apiVersion: process.env.SMC_API_VERSION || '1.0',
        clientVersion: process.env.SMC_CLIENT_VERSION || '1.0.0',
    };

    // Log which creds are missing
    const missing = Object.entries(credentials)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missing.length) {
        throw new Error(`Missing SMC env vars: ${missing.join(', ')}`);
    }

    const url = `${SMC_BASE_URL}/auth/v2/login`;
    const headers = {
        'client-id': credentials.clientId,
        'password': credentials.password,
        'x-api-key': credentials.apiKey,
        'x-api-secret': credentials.apiSecret,
        'platform': credentials.platform,
        'device-id': credentials.deviceId,
        'api-version': credentials.apiVersion,
        'client-version': credentials.clientVersion,
        'Content-Type': 'application/json',
    };

    console.log('\n========== SMC LOGIN REQUEST ==========');
    console.log('URL    :', url);
    console.log('DEBUG  : client-id =', credentials.clientId);
    console.log('DEBUG  : x-api-key =', credentials.apiKey);
    console.log('Headers:', JSON.stringify({
        ...headers,
        password: '***HIDDEN***',
        'x-api-key': '***HIDDEN***',
        'x-api-secret': '***HIDDEN***',
    }, null, 2));
    console.log('=======================================\n');

    const response = await axios.post(url, {}, { headers, timeout: 15000 });

    console.log('\n========== SMC LOGIN RESPONSE ==========');
    console.log('Status :', response.status);
    console.log('Data   :', JSON.stringify(response.data, null, 2));
    console.log('========================================\n');

    const registeredToken = response.data?.data?.registered_token
        || response.data?.registered_token
        || response.data?.token
        || null;

    return {
        success: true,
        status: response.status,
        rawResponse: response.data,
        registered_token: registeredToken,
    };
}

module.exports = { smcLogin };