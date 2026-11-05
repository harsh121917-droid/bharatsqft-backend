/**
 * Cybrilla / Fintech Primitives (FP) Integration Configuration
 * Dedicated and isolated configuration for Cybrilla UPI AutoPay & Point of Acceptance (POA).
 */

module.exports = {
  isSandbox: process.env.CYBRILLA_ENV !== 'production',

  // Core Gateway / Tenant Auth
  baseUrl: process.env.CYBRILLA_BASE_URL || 'https://s.finprim.com',
  tenantId: process.env.CYBRILLA_TENANT_ID || 'payvika',
  clientId: process.env.CYBRILLA_CLIENT_ID || 'payvika_test_7a289ba698a840efbbd86fe45411ebbe',
  clientSecret: process.env.CYBRILLA_CLIENT_SECRET || 'wrmuG55p735WYuYcLAYvaIUiAGUtwMRcQP6diYXkpv3p7WfA4ULEIKXJxkRWaAXSE5AIvg4dEnLzDCp4gLJVVV',

  // Pre-Verification API (Cybrilla POA RTA partner)
  pvBaseUrl: process.env.CYBRILLA_PV_BASE_URL || 'https://api.sandbox.cybrilla.com',
  pvClientId: process.env.CYBRILLA_PV_CLIENT_ID || 'mfdptnr_payvika_test_b3ca0b41e9fe476a8284b8d80c8746c9',
  pvClientSecret: process.env.CYBRILLA_PV_CLIENT_SECRET || 'lZrX7NxzM5OHbkUw9GVOR8yoJsXJ6WcnLr13KjPL6kdw1RQbNaxz1B3UeC1dA2IihdGCFOLjSkR5D2bPvpQIvp',

  // Payment Provider Configuration
  providerName: process.env.CYBRILLA_PAYMENT_PROVIDER || 'CYBRILLAPOA',
  defaultMandateLimit: 100000, // INR 1 Lakh default UPI AutoPay ceiling

  // Official Test Schemes provided by Cybrilla
  testISINs: [
    'INF109K01423', // ICICI Prudential Liquid Fund
    'INF109KC1TY0',
    'INF109KC1TV6',
    'INF109KC1TU8',
    'INF109K01605',
    'INF109KC11U2',
    'INF109KC19T7'
  ]
};
