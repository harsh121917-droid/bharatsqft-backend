/**
 * Step 2: Bank Mandate (eNACH / AutoPay) Test Runner
 * (Compliant with NSE MFSS NNF Protocol v1.9.8)
 *
 * Usage:
 *   1. Local Sandbox / Test Mode:
 *      node scripts/test_step2_mandate.js
 *
 *   2. Live Production Mode (On whitelisted AWS Server):
 *      LIVE=true node scripts/test_step2_mandate.js
 */

require('dotenv').config();

const axios = require('axios');
const nseClient = require('../services/nse/nseClient');
const nseEncryption = require('../services/nse/nseEncryption');

const isLive = process.env.LIVE === 'true' || process.env.LIVE === '1';
if (isLive) {
  process.env.NSE_MOCK_MODE = 'false';
  process.env.NODE_ENV = 'production';
} else {
  process.env.NSE_MOCK_MODE = 'true';
  process.env.NODE_ENV = 'test';
}

async function runStep2MandateVerification() {
  console.log('================================================================');
  console.log('  NSE MFSS (NNF v1.9.8) — STEP 2: BANK MANDATE (eNACH AUTOPAY) ');
  console.log(`  Mode: ${isLive ? '🔴 LIVE EXCHANGE (AWS Whitelisted)' : '🟢 TEST / SANDBOX MODE'}`);
  console.log('================================================================\n');

  // 1. Audit Gateway & Credentials
  const baseUrl = nseClient.getBaseUrl();
  const memberCode = process.env.NSE_MEMBER_CODE || '1031616';
  const userId = process.env.NSE_LOGIN_USER_ID || 'ADMIN';
  const clientCode = process.env.TEST_CLIENT_CODE || 'VK766957';
  const accountNo = process.env.TEST_ACCOUNT_NO || '123654852125';
  const ifscCode = process.env.TEST_IFSC || 'BKID0001400';
  const amount = process.env.TEST_AMOUNT || '50000';

  console.log('1. Gateway & Credentials Audit:');
  console.log(`   • Gateway URL:           ${baseUrl}`);
  console.log(`   • Member Code:           ${memberCode}`);
  console.log(`   • User ID:               ${userId}`);
  console.log(`   • Client Code (UCC):     ${clientCode}`);
  console.log(`   • Bank Account:          ${accountNo} (${ifscCode})`);
  console.log(`   • Mandate Amount Limit:  ₹${amount}`);

  // Outbound IP Check
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`   • Current Outbound IP:   ${ipRes.data.ip}`);
  } catch (_) {
    console.log('   • Current Outbound IP:   Unable to resolve');
  }

  // 2. Prepare Mandate Payload
  console.log('\n2. Preparing Official Mandate Registration Payload (NNF v1.9.8 Doc page 61):');
  const now = new Date();
  const startDay = String(now.getDate()).padStart(2, '0');
  const startMonth = String(now.getMonth() + 1).padStart(2, '0');
  const startYear = now.getFullYear();
  const startDate = `${startDay}/${startMonth}/${startYear}`;
  const endDate = '31/12/2050';
  const memberMandateNo = `MND${Date.now().toString().slice(-10)}`;

  const mandatePayload = {
    client_code: clientCode,
    amount: String(amount),
    mandate_type: 'E', // 'E' for eNACH / Netbanking / Debit Card
    account_no: accountNo,
    ac_type: 'SB',
    ifsc_code: ifscCode,
    start_date: startDate,
    end_date: endDate,
    member_mandate_no: memberMandateNo,
  };

  console.log('   • Payload:');
  console.log(JSON.stringify(mandatePayload, null, 2));

  // 3. Register Mandate on NSE
  console.log('\n3. Submitting Mandate to NSE (/nsemfdesk/api/v2/registration/product/MANDATE):');
  let liveMandateId = null;
  try {
    const mandateRes = await nseClient.registerMandate([mandatePayload]);
    console.log('   • Response Received:');
    console.log(JSON.stringify(mandateRes, null, 2));

    const regItem = mandateRes?.data?.reg_data?.[0];
    liveMandateId = regItem?.mandate_id || regItem?.reg_id;
    const regStatus = regItem?.reg_status || regItem?.status;

    if (mandateRes?.success && liveMandateId && (regStatus === 'REG_SUCCESS' || regStatus === 'SUCCESS' || !isLive)) {
      console.log(`   ✅ Mandate Registered Successfully! Mandate ID: ${liveMandateId}`);
    } else {
      console.log(`   ⚠️ Mandate Registration returned status: ${regStatus} (${regItem?.reg_remark || mandateRes?.message})`);
    }
  } catch (err) {
    console.error('   ❌ Mandate Registration Exception:', err.message);
  }

  // 4. Generate Authorization Link (GET_LINK API)
  if (liveMandateId) {
    console.log(`\n4. Generating Bank eNACH Authorization Link (GET_LINK API for ${liveMandateId}):`);
    try {
      const linkRes = await nseClient.getShortLink('MANDATE_AUTH', liveMandateId);
      console.log('   • Link Response:');
      console.log(JSON.stringify(linkRes, null, 2));

      if (linkRes?.success && linkRes?.data?.firstHolderLink) {
        console.log(`   🔗 Investor Bank Auth URL: ${linkRes.data.firstHolderLink}`);
      } else {
        console.log('   ℹ️ Short URL link generation completed');
      }
    } catch (linkErr) {
      console.error('   ❌ Get Link Exception:', linkErr.message);
    }

    // 5. Query Mandate Status Report API
    console.log(`\n5. Checking Mandate Status Report (/nsemfdesk/api/v2/reports/MANDATE_STATUS):`);
    try {
      const statusRes = await nseClient.getMandateStatus({
        mandateId: liveMandateId,
        clientCode,
      });
      console.log('   • Status Report Response:');
      console.log(JSON.stringify(statusRes, null, 2));
    } catch (statusErr) {
      console.error('   ❌ Status Report Exception:', statusErr.message);
    }
  }

  console.log('\n================================================================');
  console.log('  STEP 2 VERIFICATION COMPLETED');
  console.log('================================================================');
}

runStep2MandateVerification().catch(console.error);
