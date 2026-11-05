/**
 * Cybrilla / Fintech Primitives Authentication Service
 * Manages OAuth2 client_credentials tokens with auto-caching and proactive refresh.
 */

const https = require('https');
const querystring = require('querystring');
const config = require('./cybrillaConfig');

class CybrillaAuthService {
  constructor() {
    this._tenantToken = null;
    this._tenantTokenExpiresAt = 0;
    this._tenantTokenPromise = null;

    this._partnerToken = null;
    this._partnerTokenExpiresAt = 0;
    this._partnerTokenPromise = null;
  }

  /**
   * Fetch or return cached bearer token for Payvika tenant
   */
  async getTenantToken() {
    const now = Date.now();
    // Cache valid if at least 60 seconds remain before expiry
    if (this._tenantToken && this._tenantTokenExpiresAt > now + 60000) {
      return this._tenantToken;
    }

    if (this._tenantTokenPromise) {
      return this._tenantTokenPromise;
    }

    this._tenantTokenPromise = (async () => {
      try {
        const postData = querystring.stringify({
          grant_type: 'client_credentials',
          client_id: config.clientId,
          client_secret: config.clientSecret
        });

        const tokenUrl = new URL(`/v2/auth/${config.tenantId}/token`, config.baseUrl);
        const res = await this._httpPost(tokenUrl, postData, 'application/x-www-form-urlencoded');

        if (!res.access_token) {
          throw new Error(`Failed to obtain tenant token: ${JSON.stringify(res)}`);
        }

        this._tenantToken = res.access_token;
        const expiresInSec = res.expires_in || 1800;
        this._tenantTokenExpiresAt = Date.now() + (expiresInSec * 1000);
        return this._tenantToken;
      } finally {
        this._tenantTokenPromise = null;
      }
    })();

    return this._tenantTokenPromise;
  }

  /**
   * Fetch or return cached partner token for Cybrilla RTA Pre-Verification
   */
  async getPartnerToken() {
    const now = Date.now();
    if (this._partnerToken && this._partnerTokenExpiresAt > now + 60000) {
      return this._partnerToken;
    }

    if (this._partnerTokenPromise) {
      return this._partnerTokenPromise;
    }

    this._partnerTokenPromise = (async () => {
      try {
        const postData = querystring.stringify({
          grant_type: 'client_credentials',
          client_id: config.pvClientId,
          client_secret: config.pvClientSecret
        });

        const tokenUrl = new URL('/v2/auth/cybrillarta/token', config.baseUrl);
        const res = await this._httpPost(tokenUrl, postData, 'application/x-www-form-urlencoded');

        if (!res.access_token) {
          throw new Error(`Failed to obtain partner token: ${JSON.stringify(res)}`);
        }

        this._partnerToken = res.access_token;
        const expiresInSec = res.expires_in || 1800;
        this._partnerTokenExpiresAt = Date.now() + (expiresInSec * 1000);
        return this._partnerToken;
      } finally {
        this._partnerTokenPromise = null;
      }
    })();

    return this._partnerTokenPromise;
  }

  /**
   * Helper HTTPS POST for token generation
   */
  _httpPost(url, payload, contentType) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Payvika-Backend/1.0',
          'Accept': 'application/json',
          'Connection': 'close'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Non-JSON response from auth endpoint: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = new CybrillaAuthService();
