const crypto = require('crypto');
const https = require('https');

/**
 * NSE Mutual Fund Service System (NSEINVEST NNF v1.9.8)
 * Security & Encryption Engine
 */

class NseEncryption {
  constructor() {
    this.memberId = process.env.NSE_MEMBER_ID || '1';
    this.memberCode = process.env.NSE_MEMBER_CODE || '';
    this.loginUserId = process.env.NSE_LOGIN_USER_ID || '';
    this.apiSecret = process.env.NSE_API_SECRET || '';
    this.licenseKey = process.env.NSE_MEMBER_LICENSE_KEY || '';
  }

  syncConfig(config = {}) {
    if (config.memberCode) this.memberCode = config.memberCode;
    if (config.loginUserId) this.loginUserId = config.loginUserId;
    if (config.apiSecret) this.apiSecret = config.apiSecret;
    if (config.licenseKey) this.licenseKey = config.licenseKey;
  }

  /**
   * Generates a custom HTTPS Agent enforcing strict TLS v1.3 with NSE required ciphers
   * Required as per NSE Connection Level Pre-requisite document:
   * - TLS_AES_256_GCM_SHA384
   * - TLS_CHACHA20_POLY1305_SHA256
   * - TLS_AES_128_GCM_SHA256
   */
  getHttpsAgent() {
    return new https.Agent({
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256'
      ].join(':'),
      keepAlive: true,
    });
  }

  /**
   * Generates a 32-character random alphanumeric string (hex encoded)
   */
  generateRandomHex(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Generates a random numeric string
   */
  generateRandomNumber(length = 11) {
    let result = '';
    while (result.length < length) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }

  /**
   * Encrypts the payload according to official NSEINVEST Postman Pre-request script:
   * - PBKDF2 with salt, passPhrase (API Member License KEY), 1000 iterations, 16 bytes key (SHA-1)
   * - AES-128-CBC encryption of (API Secret | randomNumber) with IV
   * - aesPassword = (ivHex + "::" + saltHex + "::" + ciphertextBase64)
   * - encrypted_password = base64(aesPassword)
   * - Authorization: Basic base64(login_user_id:encrypted_password)
   */
  generateAuthHeaders(overrides = {}) {
    const loginUserId = overrides.loginUserId || this.loginUserId;
    const apiSecret = overrides.apiSecret || this.apiSecret;
    const licenseKey = overrides.licenseKey || this.licenseKey;
    const memberCode = overrides.memberCode || this.memberCode || '1031616';

    if (!loginUserId || !apiSecret || !licenseKey) {
      const devMock = Buffer.from(`${loginUserId || 'ADMIN'}:MOCK_PASS`).toString('base64');
      return {
        'Content-Type': 'application/json',
        'memberId': String(memberCode),
        'Authorization': `Basic ${devMock}`,
        'User-Agent': 'PostmanRuntime/7.43.0',
        'Accept-Language': 'en-US',
        'Referer': 'www.google.com',
        'Accept': '',
        'Connection': 'keep-alive',
      };
    }

    const randomNumber = Math.floor(Math.random() * 10000000000 + 1);
    const plainText = `${apiSecret}|${randomNumber}`;

    const ivHex = crypto.randomBytes(16).toString('hex');
    const saltHex = crypto.randomBytes(16).toString('hex');

    const saltBuf = Buffer.from(saltHex, 'hex');
    const ivBuf = Buffer.from(ivHex, 'hex');

    // Official Postman CryptoJS PBKDF2 derivation:
    const key = crypto.pbkdf2Sync(licenseKey, saltBuf, 1000, 16, 'sha1');

    const cipher = crypto.createCipheriv('aes-128-cbc', key, ivBuf);
    cipher.setAutoPadding(true);
    let ciphertext = cipher.update(plainText, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const aesPassword = `${ivHex}::${saltHex}::${ciphertext}`;
    const encryptedPassword = Buffer.from(aesPassword, 'utf8').toString('base64');

    const basicCred = `${loginUserId}:${encryptedPassword}`;
    const authorizationHeader = `Basic ${Buffer.from(basicCred, 'utf8').toString('base64')}`;

    return {
      'Content-Type': 'application/json',
      'memberId': String(memberCode),
      'Authorization': authorizationHeader,
      'User-Agent': 'PostmanRuntime/7.43.0',
      'Accept-Language': 'en-US',
      'Referer': 'www.google.com',
      'Accept': '',
      'Connection': 'keep-alive',
    };
  }
}

module.exports = new NseEncryption();
