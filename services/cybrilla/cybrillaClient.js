/**
 * Cybrilla / Fintech Primitives API Client
 * Robust, authenticated HTTP client for all FP & Cybrilla REST endpoints.
 */

const https = require('https');
const config = require('./cybrillaConfig');
const authService = require('./cybrillaAuthService');

class CybrillaClient {
  /**
   * Execute authenticated request against Fintech Primitives Gateway
   */
  async request({ method = 'GET', path, data = null, isPartner = false, retries = 2 }) {
    const token = isPartner ? await authService.getPartnerToken() : await authService.getTenantToken();
    const baseUrlStr = isPartner ? config.pvBaseUrl : config.baseUrl;
    const url = new URL(path, baseUrlStr);

    let bodyPayload = null;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/html',
      'User-Agent': 'Payvika-Backend/1.0',
      'Connection': 'close'
    };

    if (!isPartner) {
      headers['x-tenant-id'] = config.tenantId;
    }

    if (data) {
      bodyPayload = typeof data === 'string' ? data : JSON.stringify(data);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyPayload);
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        method: method.toUpperCase(),
        headers
      };

      const req = https.request(options, (res) => {
        let rawBody = '';
        res.on('data', chunk => rawBody += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawBody);
          } catch (e) {
            parsed = rawBody;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: parsed
            });
          } else {
            const err = new Error(
              `Cybrilla API Error: ${options.method} ${options.path} returned HTTP ${res.statusCode}`
            );
            err.statusCode = res.statusCode;
            err.response = parsed;
            reject(err);
          }
        });
      });

      req.on('error', async (networkErr) => {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const retryRes = await this.request({ method, path, data, isPartner, retries: retries - 1 });
            resolve(retryRes);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(networkErr);
        }
      });

      if (bodyPayload) {
        req.write(bodyPayload);
      }
      req.end();
    });
  }

  get(path, options = {}) {
    return this.request({ ...options, method: 'GET', path });
  }

  post(path, data, options = {}) {
    return this.request({ ...options, method: 'POST', path, data });
  }

  put(path, data, options = {}) {
    return this.request({ ...options, method: 'PUT', path, data });
  }

  delete(path, options = {}) {
    return this.request({ ...options, method: 'DELETE', path });
  }
}

module.exports = new CybrillaClient();
