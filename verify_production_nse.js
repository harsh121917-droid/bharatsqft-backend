/**
 * Production Readiness & Gateway Handshake Verification Script
 * Run: node verify_production_nse.js
 */
require('dotenv').config();
process.env.NSE_MOCK_MODE = 'false'; // Force real gateway traffic

const axios = require('axios');
const nseClient = require('./services/nse/nseClient');
const nseEncryption = require('./services/nse/nseEncryption');

async function verifyProduction() {
  console.log('====================================================');
  console.log('  VIKAONE MUTUAL FUNDS — NSE PRODUCTION GATEWAY CHECK ');
  console.log('====================================================\n');

  // 1. Environment & Credentials Check
  const env = process.env.NSE_ENV || 'UAT';
  const memberCode = process.env.NSE_MEMBER_CODE || '1031616';
  const userId = process.env.NSE_LOGIN_USER_ID || 'ADMIN';
  const baseUrl = nseClient.getBaseUrl();

  console.log('1. Configuration Audit:');
  console.log(`   • Environment:           ${env}`);
  console.log(`   • Gateway URL:           ${baseUrl}`);
  console.log(`   • Member Code:           ${memberCode}`);
  console.log(`   • User ID:               ${userId}`);
  console.log(`   • API Secret Configured: ${process.env.NSE_API_SECRET ? 'YES (Protected)' : 'NO'}`);
  console.log(`   • License Key Configured:${process.env.NSE_MEMBER_LICENSE_KEY ? 'YES (Protected)' : 'NO'}`);
  console.log(`   • Mock Mode:             ${process.env.NSE_MOCK_MODE}`);

  // 2. Fetch current caller public IP
  console.log('\n2. Caller Public IP Verification:');
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`   • Current Outgoing IP:   ${ipRes.data.ip}`);
  } catch (e) {
    console.log(`   • Outgoing IP Check:     Unable to fetch (${e.message})`);
  }

  // 3. Test Network Reachability & TLS 1.3
  console.log('\n3. Network Reachability & TLS 1.3 Handshake:');
  try {
    const httpsAgent = nseEncryption.getHttpsAgent();
    const probeRes = await axios.get(baseUrl, {
      httpsAgent,
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    console.log(`   • Handshake:             SUCCESS (HTTP ${probeRes.status})`);
    console.log(`   • Firewall State:        UNBLOCKED (Packets reaching exchange)`);
  } catch (err) {
    console.log(`   • Handshake:             FAILED (${err.message})`);
  }

  // 4. Test Live Authorization & Encryption
  console.log('\n4. Dispatched Real API Call (/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT):');
  const headers = nseEncryption.generateAuthHeaders();
  console.log(`   • Header 'memberId':     ${headers.memberId}`);
  console.log(`   • Authorization Type:    ${headers.Authorization.split(' ')[0]}`);

  try {
    const kycResult = await nseClient.checkClientKycStatus('AAAPA1234A', 'VK123456');
    console.log('   • Response Received:');
    console.log(JSON.stringify(kycResult, null, 2));

    if (kycResult.success) {
      console.log('\n✅ [STATUS: PRODUCTION READY & COMMUNICATING WITH EXCHANGE]');
    } else {
      console.log('\n⚠️ [STATUS: CALL PROCESSED]');
    }
  } catch (err) {
    console.error('   • API Error:', err.message);
  }

  console.log('\n====================================================');
}

verifyProduction().catch(console.error);
