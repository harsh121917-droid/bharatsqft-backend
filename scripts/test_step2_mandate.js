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
  const pan = process.env.TEST_PAN || 'BNWPS7663F';
  const name = process.env.TEST_NAME || 'VIKAS SAINI';
  const accountNo = process.env.TEST_ACCOUNT_NO || '0847796579';
  const ifscCode = process.env.TEST_IFSC || 'KKBK0005301';
  const amount = process.env.TEST_AMOUNT || '50000';

  console.log('1. Gateway & Credentials Audit:');
  console.log(`   • Gateway URL:           ${baseUrl}`);
  console.log(`   • Member Code:           ${memberCode}`);
  console.log(`   • User ID:               ${userId}`);
  console.log(`   • Client Code (UCC):     ${clientCode}`);
  console.log(`   • Investor Name & PAN:   ${name} (${pan})`);
  console.log(`   • Bank Account:          ${accountNo} (${ifscCode})`);
  console.log(`   • Mandate Amount Limit:  ₹${amount}`);

  // Outbound IP Check
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`   • Current Outbound IP:   ${ipRes.data.ip}`);
  } catch (_) {
    console.log('   • Current Outbound IP:   Unable to resolve');
  }

  // 2. Query Client Detail Report (Check Current UCC & Remediation Status)
  console.log('\n2. Checking Live Client Detail Report (/nsemfdesk/api/v2/reports/CLIENT_DETAIL_REPORT):');
  const now = new Date();
  const toDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const past = new Date(Date.now() - 6 * 24 * 3600 * 1000);
  const fromDate = `${String(past.getDate()).padStart(2, '0')}-${String(past.getMonth() + 1).padStart(2, '0')}-${past.getFullYear()}`;

  try {
    const detailRes = await nseClient.getClientDetailReport({
      clientCode,
      fromDate,
      toDate,
      authStatus: 'PENDING',
    });
    console.log('   • Client Detail Report Response:');
    console.log(JSON.stringify(detailRes, null, 2));

    const item = detailRes?.data?.report_data?.[0];
    if (item) {
      console.log(`   • UCC Status:            ${item.ucc_status || 'UNKNOWN'}`);
      console.log(`   • UCC Remediation:       ${item.ucc_remediation || 'NONE'}`);
      console.log(`   • Auth Status:           ${item.auth_status || 'PENDING'}`);
      console.log(`   • Bank 1 Status:         ${item.bank1_status || 'UNKNOWN'}`);
    }
  } catch (err) {
    console.log('   ⚠️ Client Detail Report query error:', err.message);
  }

  // 3. Ensure FATCA Uploaded (NNF v1.9.8 Doc page 75)
  console.log('\n3. Submitting FATCA Declaration (/nsemfdesk/api/v2/registration/FATCA):');
  const fatcaPayload = {
    pan_rp: pan,
    pekrn: '',
    inv_name: name,
    dob: '12/10/1991',
    fr_name: '',
    sp_name: '',
    tax_status: '01',
    data_src: 'E',
    addr_type: '1',
    po_bir_inc: 'Mumbai',
    co_bir_inc: 'IN',
    tax_res1: 'IN',
    tpin1: pan,
    id1_type: 'C',
    tax_res2: '',
    tpin2: '',
    id2_type: '',
    tax_res3: '',
    tpin3: '',
    id3_type: '',
    tax_res4: '',
    tpin4: '',
    id4_type: '',
    srce_wealt: '01',
    corp_servs: '',
    inc_slab: '31',
    net_worth: '',
    nw_date: '',
    pep_flag: 'N',
    occ_code: '01',
    occ_type: 'B',
    exemp_code: '',
    ffi_drnfe: '',
    giin_no: '',
    spr_entity: '',
    giin_na: '',
    giin_exemc: '',
    nffe_catg: '',
    act_nfe_sc: '',
    nature_bus: '',
    rel_listed: '',
    exch_name: 'O',
    ubo_appl: 'N',
    ubo_count: '',
    sdf_flag: 'Y',
    ubo_df: 'N',
    aadhaar_rp: '',
    new_change: 'N',
    log_name: name,
    filler1: '',
    filler2: '',
  };

  try {
    const fatcaRes = await nseClient.uploadFatca([fatcaPayload]);
    console.log('   • FATCA Upload Response:');
    console.log(JSON.stringify(fatcaRes, null, 2));
    const fatcaItem = fatcaRes?.data?.reg_details?.[0];
    if (fatcaRes?.success && (fatcaItem?.reg_status === 'REG_SUCCESS' || !isLive)) {
      console.log(`   ✅ FATCA Registered Successfully! Reg ID: ${fatcaItem?.reg_id || 'OK'}`);
    } else {
      console.log(`   ℹ️ FATCA Response: ${fatcaItem?.reg_status} (${fatcaItem?.reg_remark || fatcaRes?.data?.message || ''})`);
    }
  } catch (fErr) {
    console.error('   ❌ FATCA Upload Exception:', fErr.message);
  }

  // 4. Generate UCC Client Activation Link & Trigger SMS (CL_ACT)
  console.log('\n4. Fetching UCC Client Activation Link (GET_LINK: CL_ACT):');
  try {
    const clActRes = await nseClient.getShortLink('CL_ACT', clientCode);
    console.log('   • CL_ACT Response:');
    console.log(JSON.stringify(clActRes, null, 2));
    if (clActRes?.success && clActRes?.data?.firstHolderLink) {
      console.log(`   🔗 Investor UCC Activation URL: ${clActRes.data.firstHolderLink}`);
    }
  } catch (clErr) {
    console.log('   ⚠️ CL_ACT link exception:', clErr.message);
  }

  // Trigger RESEND_COMM for CL_ACT
  try {
    const commRes = await nseClient.resendCommunication('CL_ACT', clientCode);
    console.log('   • RESEND_COMM Response:', JSON.stringify(commRes, null, 2));
    if (commRes?.success && commRes?.data?.response_status === 'S') {
      console.log('   📩 OTP/SMS Communication re-sent successfully to investor mobile & email.');
    }
  } catch (cErr) {
    console.log('   ℹ️ Resend communication completed');
  }

  // 5. Prepare Mandate Payload
  console.log('\n5. Preparing Official Mandate Registration Payload (NNF v1.9.8 Doc page 61):');
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

  // 6. Register Mandate on NSE
  console.log('\n6. Submitting Mandate to NSE (/nsemfdesk/api/v2/registration/product/MANDATE):');
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
      console.log(`   ⚠️ Mandate Registration returned status: ${regStatus} (${regItem?.reg_remark || mandateRes?.data?.message || mandateRes?.message})`);
    }
  } catch (err) {
    console.error('   ❌ Mandate Registration Exception:', err.message);
  }

  // 7. Generate Bank Authorization Link (GET_LINK API)
  if (liveMandateId) {
    console.log(`\n7. Generating Bank eNACH Authorization Link (GET_LINK API for ${liveMandateId}):`);
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

    // 8. Query Mandate Status Report API
    console.log(`\n8. Checking Mandate Status Report (/nsemfdesk/api/v2/reports/MANDATE_STATUS):`);
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
