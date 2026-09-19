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
   * Encrypts the payload according to NSE NNF Authentication Protocol (v1.9.8)
   * plain_text = API Secret (PWD)|<RANDOM Number>
   * aes_encrypted_val = AES128(salt, iv, API Member License KEY, plain_text)
   * Encrypted Password = base64(iv::salt::aes_encrypted_val)
   * Authorization: Basic base64(Login User ID: Encrypted Password)
   */
  generateAuthHeaders(overrides = {}) {
    const loginUserId = overrides.loginUserId || this.loginUserId;
    const apiSecret = overrides.apiSecret || this.apiSecret;
    const licenseKey = overrides.licenseKey || this.licenseKey;
    const memberId = overrides.memberId || this.memberId;

    if (!loginUserId || !apiSecret || !licenseKey) {
      // Return mock/development headers if environment variables not yet populated
      const devMock = Buffer.from(`${loginUserId || 'DEV_USER'}:MOCK_PASS`).toString('base64');
      return {
        'Content-Type': 'application/json',
        'memberId': memberId || '1',
        'Authorization': `Basic ${devMock}`,
        'User-Agent': 'PostmanRuntime/7.39.0',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': '',
        'Connection': 'keep-alive',
        'Reference': 'https://www.nseinvest.com',
      };
    }

    // 1. Generate salt, iv, and random number
    const salt = overrides.salt || this.generateRandomHex(32);
    const iv = overrides.iv || this.generateRandomHex(32);
    const randomNumber = overrides.randomNumber || this.generateRandomNumber(11);

    // 2. Prepare plain text
    const plainText = `${apiSecret}|${randomNumber}`;

    // 3. Derive 16-byte key and 16-byte IV for AES-128
    // Parse key from licenseKey string or PBKDF2/buffer
    let keyBuffer;
    if (licenseKey.length === 32 && /^[0-9a-fA-F]+$/.test(licenseKey)) {
      keyBuffer = Buffer.from(licenseKey, 'hex');
    } else {
      keyBuffer = Buffer.from(licenseKey, 'utf8').slice(0, 16);
      if (keyBuffer.length < 16) {
        const padded = Buffer.alloc(16);
        keyBuffer.copy(padded);
        keyBuffer = padded;
      }
    }

    let ivBuffer;
    if (iv.length === 32 && /^[0-9a-fA-F]+$/.test(iv)) {
      ivBuffer = Buffer.from(iv, 'hex').slice(0, 16);
    } else {
      ivBuffer = Buffer.from(iv, 'utf8').slice(0, 16);
    }

    // 4. Encrypt using AES-128-CBC with PKCS7 padding
    const cipher = crypto.createCipheriv('aes-128-cbc', keyBuffer, ivBuffer);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // 5. Package as: base64(iv::salt::aes_encrypted_val)
    const packagedString = `${iv}::${salt}::${encrypted}`;
    const encryptedPassword = Buffer.from(packagedString, 'utf8').toString('base64');

    // 6. Header value: base64(Login User ID: Encrypted Password)
    const basicCredential = `${loginUserId}:${encryptedPassword}`;
    const authorizationHeader = `Basic ${Buffer.from(basicCredential, 'utf8').toString('base64')}`;

    return {
      'Content-Type': 'application/json',
      'memberId': String(memberId),
      'Authorization': authorizationHeader,
      'User-Agent': 'PostmanRuntime/7.39.0',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': '',
      'Connection': 'keep-alive',
      'Reference': 'https://www.nseinvest.com',
    };
  }
}

module.exports = new NseEncryption();
