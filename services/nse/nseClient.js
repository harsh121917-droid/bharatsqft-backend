const axios = require('axios');
const nseEncryption = require('./nseEncryption');

/**
 * NSE Mutual Funds Service System (NSEINVEST NNF v1.9.8)
 * Client Gateway
 */

// ── Official NSE MFSS RTA AMC Codes (NNF v1.9.8 Doc page 170-171: B, K, H, G, CR, O, UK and sample AXF) ──
const RTA_AMC_CODE_MAP = {
  // Direct NSE MFSS RTA AMC codes:
  'H': 'H',       // HDFC Mutual Fund (CAMS - India's #1 fund house)
  'G': 'G',       // DSP Mutual Fund (CAMS)
  'B': 'B',       // Aditya Birla Sun Life Mutual Fund (CAMS)
  'AXF': 'AXF',   // Axis Mutual Fund (CAMS)
  'K': 'K',       // Kotak Mahindra Mutual Fund (KFintech)
  'CR': 'CR',     // Canara Robeco Mutual Fund (CAMS)
  'O': 'O',       // HSBC Mutual Fund (CAMS)
  'UK': 'UK',     // UTI Mutual Fund (KFintech)

  // Full name / Broker code aliases:
  'DSP': 'G',
  'DSP_MF': 'G',
  'DSPBR': 'G',
  'HDFC': 'H',
  'HDFC_MF': 'H',
  'BIRLA': 'B',
  'ADITYA_BIRLA': 'B',
  'ABSL': 'B',
  'AXIS': 'AXF',
  'AXIS_MF': 'AXF',
  'KOTAK': 'K',
  'KOTAK_MF': 'K',
  'CANARA': 'CR',
  'CANARA_ROBECO': 'CR',
  'HSBC': 'O',
  'UTI': 'UK',
  'UTI_MF': 'UK',
};

const AUTHORIZED_RTA_AMC_CODES = ['H', 'G', 'B', 'AXF', 'K', 'CR', 'O', 'UK'];

function resolveRtaAmcCode(input) {
  if (!input) return 'H';
  const clean = String(input).trim().toUpperCase();
  if (RTA_AMC_CODE_MAP[clean]) {
    return RTA_AMC_CODE_MAP[clean];
  }
  if (AUTHORIZED_RTA_AMC_CODES.includes(clean)) {
    return clean;
  }
  return 'H';
}

class NseClient {
  constructor() {
    this.env = process.env.NSE_ENV || 'UAT'; // 'UAT' or 'PROD'
    this.uatUrl = 'https://nseinvestuat.nseindia.com';
    this.prodUrl = 'https://www.nseinvest.com';
    this.memberCode = process.env.NSE_MEMBER_CODE || '';
    this.mockModeOverride = undefined;
  }

  syncConfig(config = {}) {
    if (config.env) this.env = config.env;
    if (config.memberCode) this.memberCode = config.memberCode;
    if (typeof config.mockMode === 'boolean') {
      this.mockModeOverride = config.mockMode;
    }
    nseEncryption.syncConfig(config);
  }

  getBaseUrl() {
    return this.env === 'PROD' ? this.prodUrl : this.uatUrl;
  }

  isMockMode() {
    // Strictly isolated to automated test environment (NODE_ENV === 'test')
    if (process.env.NODE_ENV === 'test') {
      if (typeof this.mockModeOverride === 'boolean') {
        return this.mockModeOverride;
      }
      return process.env.NSE_MOCK_MODE === 'true';
    }
    return false;
  }

  getMockResponse(endpoint, payload) {
    const timestamp = Date.now();
    console.log(`[NSE Sandbox Mode] Mocking response for ${endpoint}`);

    if (endpoint.includes('CLIENTCOMMON183')) {
      const regList = payload.reg_details || [];
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'Client registered successfully in Sandbox Mode',
          reg_details: regList.map((r) => ({
            client_code: r.client_code || `VKTEST${timestamp.toString().slice(-4)}`,
            status: 'SUCCESS',
            message: 'CLIENT REGISTRATION SUCCESSFUL (SANDBOX)',
          })),
        },
      };
    }

    if (endpoint.includes('NORMAL')) {
      const txList = payload.transaction_details || [];
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'Order accepted in Sandbox Mode',
          transaction_details: txList.map((t, idx) => ({
            order_ref_number: t.order_ref_number || `ORD_${timestamp}_${idx}`,
            trxn_order_id: `NSE_TEST_${timestamp}_${idx}`,
            status: 'SUCCESS',
            message: 'TRANSACTION ACCEPTED (SANDBOX)',
          })),
        },
      };
    }

    if (endpoint.includes('SWITCH')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'Switch order accepted in Sandbox Mode',
          transaction_details: [
            {
              trxn_order_id: `SW_TEST_${timestamp}`,
              status: 'SUCCESS',
            },
          ],
        },
      };
    }

    if (endpoint.includes('XSIP') || endpoint.includes('SIP')) {
      const regData = payload.reg_data || [];
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'SIP registered successfully in Sandbox Mode',
          reg_data: regData.map((s, idx) => ({
            reg_id: `XSIP_TEST_${timestamp}_${idx}`,
            status: 'SUCCESS',
            message: 'SIP REGISTRATION SUCCESSFUL (SANDBOX)',
          })),
        },
      };
    }

    if (endpoint.includes('STP')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'STP registered successfully in Sandbox Mode',
          reg_data: [{ reg_id: `STP_TEST_${timestamp}`, status: 'SUCCESS' }],
        },
      };
    }

    if (endpoint.includes('SWP')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'SWP registered successfully in Sandbox Mode',
          reg_data: [{ reg_id: `SWP_TEST_${timestamp}`, status: 'SUCCESS' }],
        },
      };
    }

    if (endpoint.includes('CLIENTBANKDTL')) {
      const bankDtl = payload.bank_dtl || [];
      return {
        success: true,
        status: 200,
        data: {
          bank_dtl: bankDtl.map((b) => ({
            client_code: b.client_code,
            action_type: b.action_type || 'ADD',
            account_type: b.account_type || 'SB',
            account_no: b.account_no,
            micr_no: b.micr_no || '',
            ifsc_code: b.ifsc_code,
            status: 'SUCCESS',
            error_remark: '',
          })),
        },
      };
    }

    if (endpoint.includes('FATCA')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'FATCA uploaded successfully in Sandbox Mode',
          reg_details: [
            {
              pan_rp: payload.reg_details?.[0]?.pan_rp || 'BNWPS7663F',
              reg_id: `FATCA_${timestamp}`,
              reg_status: 'REG_SUCCESS',
              reg_remark: '',
            },
          ],
        },
      };
    }

    if (endpoint.includes('RESEND_COMM')) {
      return {
        success: true,
        status: 200,
        data: {
          productType: payload.productType || 'CL_ACT',
          productRefId: payload.productRefId || 'VK766957',
          response_status: 'S',
          error_remark: '',
        },
      };
    }

    if (endpoint.includes('CLIENT_DETAIL_REPORT')) {
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              client_code: payload.client_code || 'VK766957',
              member_code: this.memberCode || '1031616',
              ucc_status: 'Active',
              ucc_remediation: '',
              auth_status: 'SUCCESS',
              auth_email_sent: 'Y',
              bank1_status: 'ACTIVE',
            },
          ],
        },
      };
    }

    if (endpoint.includes('client_authorization')) {
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              client_code: payload.client_code || 'VK766957',
              member_code: this.memberCode || '1031616',
              auth_status: 'SUCCESS',
              auth_email_sent: 'Y',
              first_holder_auth_status: 'SUCCESS',
            },
          ],
        },
      };
    }

    if (endpoint.includes('eLOG')) {
      return {
        success: true,
        status: 200,
        data: {
          elog_status: '100',
          elog_status_message: 'eLog Uploaded Successfully in Sandbox Mode',
        },
      };
    }

    if (endpoint.includes('MANDATE_STATUS')) {
      const mandateId = payload.mandate_id || `MND_TEST_${timestamp}`;
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              mandateId,
              clientCode: payload.client_code || 'VK123456',
              status: 'APPROVED',
              umrnNo: `UMRN${timestamp}`,
            },
          ],
        },
      };
    }

    if (endpoint.includes('MANDATE')) {
      const mockMndId = `MND_TEST_${timestamp}`;
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'Mandate registered successfully in Sandbox Mode',
          reg_data: [
            {
              mandate_id: mockMndId,
              reg_id: mockMndId,
              status: 'SUCCESS',
              reg_status: 'REG_SUCCESS',
              reg_remark: '',
            },
          ],
        },
      };
    }

    if (endpoint.includes('GET_LINK')) {
      const refId = payload.productRefId || `REF_${timestamp}`;
      const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          firstHolderLink: payload.productType === 'CL_ACT'
            ? null
            : `${backendUrl}/api/mutual-funds/checkout/${refId}?mode=sandbox`,
          productRefId: refId,
        },
      };
    }

    if (endpoint.includes('KYC_CHECK') || endpoint.includes('CLIENT_KYC_REPORT')) {
      const pan = String(payload.pan_no || '').trim().toUpperCase();
      const dummyPans = ['ABCDE1234F', 'AAAAA0000A', 'XXXXX0000X', 'ABCDE0000A', 'ZZZZZ9999Z', '0000000000', '1234567890'];
      const isDummy = dummyPans.includes(pan) || pan.startsWith('ABCDE') || pan.endsWith('1234F') || pan.length !== 10;

      if (isDummy) {
        return {
          success: false,
          status: 400,
          data: {
            response_status: 'F',
            response_status_remarks: 'No Record Found!!',
            pan: pan,
            kyc_status: 'F',
            kyc_status_remark: 'NOT AVAILABLE / INVALID PAN',
            kra_name: 'NONE',
          },
        };
      }

      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              client_code: payload.client_code || `VK${timestamp.toString().slice(-6)}`,
              client_pan: pan,
              holding_type: 'SI',
              holder_name: 'INVESTOR',
              holder_dob: '15/08/1995',
              kyc_status: 'Y',
              status_remark: 'KYC COMPLIANT',
            },
          ],
          pan: pan,
          kyc_status: 'S',
          kyc_status_remark: 'KYC REGISTERED',
          kra_name: 'cvlkra',
        },
      };
    }

    if (endpoint.includes('client_master_report')) {
      const pan = String(payload.PAN || payload.pan || '').trim().toUpperCase();
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              member_code: this.memberCode || '1031616',
              client_code: payload.client_code || `VK${timestamp.toString().slice(-6)}`,
              primary_holder_first_name: 'INVESTOR',
              primary_holder_pan: pan,
              tax_status: '01',
              gender: 'MALE',
              primary_holder_dob_incorporation: '15/08/1995',
              client_type: 'NON DEMAT',
              dp_status: 'ACTIVE',
            },
          ],
        },
      };
    }

    if (endpoint.includes('ORDER_STATUS')) {
      const orderRef = payload.order_ref_number || '';
      const orderStatus = payload.mockStatus || 'SUCCESS';
      const mockFolio = payload.mockFolio || `FOLIO_${timestamp.toString().slice(-6)}`;
      const orderItem = {
        order_ref_number: orderRef,
        order_status: orderStatus,
        status: orderStatus,
        allotted_units: orderStatus === 'ALLOTTED' ? '100.000' : '0.000',
        nav: '100.00',
        folio_no: mockFolio,
        folio_number: mockFolio,
        rejection_reason: orderStatus === 'REJECTED' ? 'Payment timed out or rejected by bank' : '',
      };
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          report_data_total: '1',
          report_data: [orderItem],
          orders: [orderItem],
        },
      };
    }

    if (endpoint.includes('order_lifecycle')) {
      const isPaid = payload.mockPaymentStatus ? payload.mockPaymentStatus === 'SUCCESS' : true;
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              product_id: payload.product_id || `ORD_${timestamp}`,
              product_type: payload.Product_type || 'PUR',
              mode_of_payment: 'UPI',
              payment_datetime: new Date().toISOString(),
              payment_status: isPaid ? 'SUCCESS' : 'PENDING',
              reconciliation_status: isPaid ? 'SUCCESS' : 'PENDING',
              order_status: 'VALID',
              order_remark: isPaid ? 'PROVISIONAL ORDER' : 'PAYMENT CONFIRMATION PENDING',
            },
          ],
        },
      };
    }

    if (endpoint.includes('MEMBER_FUND_ALLOCATION')) {
      const isAllocated = payload.mockSettled ? payload.mockSettled === 'Y' : true;
      return {
        success: true,
        status: 200,
        data: {
          response_status: isAllocated ? 'S' : 'F',
          report_data_total: isAllocated ? '1' : '0',
          report_data: isAllocated
            ? [
                {
                  order_number: payload.order_id || `ORD_${timestamp}`,
                  settled_flag: 'Y',
                  allotment_flag: 'Y',
                  totalamount: '100',
                  payment_mode: 'UPI',
                },
              ]
            : [],
          error_remark: isAllocated ? '' : 'No record(s) found',
        },
      };
    }

    if (endpoint.includes('ALLOTMENT_STATEMENT')) {
      const isAllotted = payload.mockStatus ? payload.mockStatus === 'ALLOTTED' || payload.mockStatus === 'SUCCESS' : true;
      const mockFolio = payload.mockFolio || `FOLIO_${timestamp.toString().slice(-6)}`;
      return {
        success: true,
        status: 200,
        data: {
          allotment_list: isAllotted
            ? [
                {
                  reportdate: new Date().toISOString().slice(0, 10),
                  orderno: payload.order_ids || `ORD_${timestamp}`,
                  foliono: mockFolio,
                  folio_no: mockFolio,
                  rtaschemecode: 'RTA_SCHEME',
                  rtatransactionno: payload.order_ids || `ORD_${timestamp}`,
                  clientcode: payload.client_code || 'VK046041',
                  allottednav: payload.mockNav || '1961.8010',
                  allottedqty: payload.mockUnits || '0.051',
                  allottedamt: '100.00',
                  validflag: 'Y',
                  remarks: 'ALLOTMENT DONE',
                  error_remark: '',
                },
              ]
            : [],
          error_remark: '',
        },
      };
    }

    if (endpoint.includes('EKYCREG')) {
      const mockToken = Buffer.from(`${payload.panNo || 'PAN'}_${timestamp}`).toString('hex').slice(0, 32).toUpperCase();
      const mockBase = this.env === 'PROD' ? 'https://www.nseinvest.com' : 'https://nseinvestuat.nseindia.com';
      return {
        success: true,
        status: 200,
        data: {
          link: `${mockBase}/nsemfdesk/ekycVerifyByUser/${mockToken}`,
          message: 'EKYC FRESH REGISTRATION REQUEST RECEVIED',
        },
      };
    }

    if (endpoint.includes('TRANSACTION_DETAIL_REPORT')) {
      const isApproved = payload.mockStatus ? payload.mockStatus === 'APPROVED' || payload.mockStatus === 'SUCCESS' || payload.mockStatus === 'ALLOTTED' : true;
      const isAllotted = payload.mockStatus === 'ALLOTTED' || isApproved;
      return {
        success: true,
        status: 200,
        data: {
          response_status: 'S',
          report_data_total: '1',
          report_data: [
            {
              member_code: this.memberCode || '1031616',
              client_code: payload.client_code || 'VK046041',
              product_type: 'NORMAL PURCHASE',
              product_id: payload.order_id || `462930073897`,
              amount_units: '100.00(A)',
              primary_holder_auth_status: isApproved ? 'SUCCESS' : 'PENDING',
              mode_of_payment: isApproved ? 'UPI' : '',
              payment_date_time: isApproved ? new Date().toISOString() : '',
              payment_status: isApproved ? 'APPROVED' : '',
              payment_reference_no: isApproved ? '104286039298' : '',
              reconciliation_status: isApproved ? 'SUCCESS' : '',
              amc_payout_utr_no: isApproved ? '2031471664' : '',
              order_status: isApproved ? 'VALID' : 'INVALID',
              order_remark: isAllotted ? 'ALLOTMENT DONE' : (isApproved ? 'AUTO VALIDATED BY RTA' : '2FA PENDING'),
              allotted_units: isAllotted ? (payload.mockUnits || '0.220') : '0.000',
              allotted_unit: isAllotted ? (payload.mockUnits || '0.220') : '0.000',
              allotted_nav: isAllotted ? (payload.mockNav || '454.8590') : '0.00',
              folio_no: payload.mockFolio || '',
            },
          ],
        },
      };
    }

    if (endpoint.includes('upi_status_check')) {
      const upiStatus = payload.mockStatus || 'SUCCESS';
      return {
        success: true,
        status: 200,
        data: {
          status: upiStatus,
          payment_mode: 'UPI',
          client_code: payload.client_code || 'VK123456',
          nse_upi_ref_no: payload.nse_upi_ref_no || `UPI_REF_${timestamp}`,
          upi_tran_ref_id: `UPI_TXN_${timestamp}`,
          cust_ref_no: `RRN${timestamp.toString().slice(-12)}`,
          remark: upiStatus === 'SUCCESS' ? 'Transaction success' : 'Payment pending or declined',
        },
      };
    }

    if (endpoint.includes('purchase_payment')) {
      const basketId = `BSK_${timestamp}`;
      return {
        success: true,
        status: 200,
        data: {
          status: 'success',
          payment_mode: payload.payment_mode || 'UPI',
          client_code: payload.client_code || 'VK123456',
          order_ids: payload.order_ids || '',
          bank_account_no: payload.bank_account_no || '',
          ifsc: payload.ifsc || '',
          vpa: payload.vpa || 'user@upi',
          order_amount: '1000',
          remark: 'UPI Collect request successfully dispatched to investor VPA',
          short_url: `https://nseinvestuat.nseindia.com/trxnpaymentonline/${timestamp}`,
          basket_id: basketId,
          payment_ref_no: basketId,
          nse_upi_ref_no: basketId,
        },
      };
    }

    return {
      success: true,
      status: 200,
      data: {
        status: '100',
        message: 'Request processed in Sandbox Mode',
      },
    };
  }

  /**
   * Internal dispatcher creating axios requests with strict TLS v1.3 agent and headers
   */
  async post(endpoint, payload) {
    // Instant mock mode to avoid waiting for network timeouts when testing
    if (this.isMockMode()) {
      return this.getMockResponse(endpoint, payload);
    }

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    try {
      const headers = nseEncryption.generateAuthHeaders();
      const httpsAgent = nseEncryption.getHttpsAgent();
      const response = await axios.post(url, payload, {
        headers,
        httpsAgent,
        timeout: 45000,
      });
      return { success: true, status: response.status, data: response.data };
    } catch (error) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data || { message: error.message };
      console.error(`[NSE Client Error] POST ${endpoint} -> ${status}:`, errorData);

      // Phase 1 Remediation: NEVER convert network failures, 403 Forbidden, or timeouts into fake mock success!
      return {
        success: false,
        status,
        error: errorData,
        message: error.response?.data?.message || error.message || 'NSE Exchange request failed',
      };
    }
  }

  // ── 1. UCC Registration (183-Column Client Master) ──
  async registerUcc(regDetails) {
    const list = Array.isArray(regDetails) ? regDetails : [regDetails];
    return this.post('/nsemfdesk/api/v2/registration/CLIENTCOMMON183', {
      reg_details: list,
    });
  }

  // ── 2. Order Entry (PUR/RED Normal Transactions) ──
  async createNormalOrder(transactionDetails) {
    const list = Array.isArray(transactionDetails) ? transactionDetails : [transactionDetails];
    const cleanedList = list.map((item) => {
      const sanitized = { ...item };
      // Sanitize member_unique_id: NSE spec accepts Optional VARCHAR 25 alphanumeric; special characters cause rejection
      if (sanitized.member_unique_id && /[^a-zA-Z0-9]/.test(sanitized.member_unique_id)) {
        sanitized.member_unique_id = '';
      }
      // Ensure order_ref_number is strictly alphanumeric max 19 chars
      if (sanitized.order_ref_number) {
        sanitized.order_ref_number = sanitized.order_ref_number.replace(/[^a-zA-Z0-9]/g, '').slice(0, 19);
      }
      // Mandatory NSE MFSS transaction flags (NNF v1.9.8 Spec page 8)
      if (!sanitized.kyc_flag) {
        sanitized.kyc_flag = 'Y';
      }
      if (!sanitized.kyc_declaration_flag) {
        sanitized.kyc_declaration_flag = sanitized.kyc_flag || 'Y';
      }
      if (!sanitized.euin_declaration) {
        sanitized.euin_declaration = 'N';
      }
      if (!sanitized.dpc_flag) {
        sanitized.dpc_flag = 'Y';
      }
      if (sanitized.min_redemption_flag === undefined || sanitized.min_redemption_flag === null || sanitized.min_redemption_flag === '') {
        sanitized.min_redemption_flag = (sanitized.trxn_type === 'R' && (sanitized.all_units === 'Y' || Number(sanitized.redemption_units || sanitized.allotment_units) < 50)) ? 'Y' : 'N';
      }
      if (sanitized.trxn_type === 'R') {
        if (!sanitized.redemption_units && sanitized.allotment_units) {
          sanitized.redemption_units = sanitized.allotment_units;
        }
      }
      return sanitized;
    });
    return this.post('/nsemfdesk/api/v2/transaction/NORMAL', {
      transaction_details: cleanedList,
    });
  }

  // ── 3. Switch Order Entry ──
  async createSwitchOrder(switchDetails) {
    const list = Array.isArray(switchDetails) ? switchDetails : [switchDetails];
    const cleanedList = list.map((item) => {
      const sanitized = { ...item };
      if (sanitized.member_unique_id && /[^a-zA-Z0-9]/.test(sanitized.member_unique_id)) {
        sanitized.member_unique_id = '';
      }
      if (sanitized.order_ref_number) {
        sanitized.order_ref_number = sanitized.order_ref_number.replace(/[^a-zA-Z0-9]/g, '').slice(0, 19);
      }
      return sanitized;
    });
    return this.post('/nsemfdesk/api/v2/transaction/SWITCH', {
      transaction_details: cleanedList,
    });
  }

  // ── 4. XSIP Registration ──
  async registerXsip(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    const enrichedList = list.map((item) => ({
      member_code: memberCode,
      memberCode: memberCode,
      ...item,
      ...(item.member_code ? {} : { member_code: memberCode }),
    }));
    return this.post('/nsemfdesk/api/v2/registration/product/XSIP', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: enrichedList,
    });
  }

  // ── 5. Standard SIP Registration ──
  async registerSip(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    const enrichedList = list.map((item) => ({
      member_code: memberCode,
      memberCode: memberCode,
      ...item,
      ...(item.member_code ? {} : { member_code: memberCode }),
    }));
    return this.post('/nsemfdesk/api/v2/registration/product/SIP', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: enrichedList,
    });
  }

  // ── 6. (X)SIP Topup Registration ──
  async registerSipTopup(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    return this.post('/nsemfdesk/api/v2/registration/product/SIP_TOPUP', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: list.map((item) => ({
        member_code: memberCode,
        memberCode: memberCode,
        ...item,
      })),
    });
  }

  // ── 6b. STP (Systematic Transfer Plan) Registration ──
  async registerStp(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    return this.post('/nsemfdesk/api/v2/registration/product/STP', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: list.map((item) => ({
        member_code: memberCode,
        memberCode: memberCode,
        ...item,
      })),
    });
  }

  // ── 6c. SWP (Systematic Withdrawal Plan) Registration ──
  async registerSwp(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    return this.post('/nsemfdesk/api/v2/registration/product/SWP', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: list.map((item) => ({
        member_code: memberCode,
        memberCode: memberCode,
        ...item,
      })),
    });
  }

  // ── 7. Mandate Registration (eNACH / Physical) ──
  async registerMandate(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    const memberCode = String(this.memberCode || process.env.NSE_MEMBER_CODE || '1031616');
    return this.post('/nsemfdesk/api/v2/registration/product/MANDATE', {
      member_code: memberCode,
      memberCode: memberCode,
      reg_data: list.map((item) => ({
        member_code: memberCode,
        memberCode: memberCode,
        ...item,
      })),
    });
  }

  // ── 7b. Mandate Status Report (Doc page 70) ──
  async getMandateStatus(filter = {}) {
    const payload = {};
    if (filter.mandateId || filter.mandate_id) payload.mandate_id = String(filter.mandateId || filter.mandate_id);
    if (filter.clientCode || filter.client_code) payload.client_code = filter.clientCode || filter.client_code;
    if (filter.fromDate || filter.from_date) payload.from_date = filter.fromDate || filter.from_date;
    if (filter.toDate || filter.to_date) payload.to_date = filter.toDate || filter.to_date;
    if (filter.memberMandateIds) payload.memberMandateIds = filter.memberMandateIds;
    return this.post('/nsemfdesk/api/v2/reports/MANDATE_STATUS', payload);
  }

  // ── 8. Purchase Order Payment Execution ──
  async initiatePurchasePayment(paymentData) {
    return this.post('/nsemfdesk/api/v2/payments/purchase_payment', paymentData);
  }

  // ── 9. UPI Payment Status Check ──
  async checkUpiStatus(nseUpiRefNo, clientCode) {
    return this.post('/nsemfdesk/api/v2/payments/upi_status_check', {
      nse_upi_ref_no: String(nseUpiRefNo),
      client_code: clientCode,
    });
  }

  // ── 10. Short URL Link Generation (e.g. for UPI/NetBanking or Mandate approval) ──
  async getShortLink(productType, productRefId) {
    return this.post('/nsemfdesk/api/v2/reports/GET_LINK', {
      productType, // 'PUR', 'RED', 'SIP_REG', 'XSIP_REG', 'MANDATE_AUTH', etc.
      productRefId: String(productRefId),
    });
  }

  // ── 11. Order Status Report (Doc Page 127) ──
  async getOrderStatusReport(filter = {}) {
    const payload = {
      trans_type: filter.trans_type || filter.transType || 'ALL',
      order_type: filter.order_type || filter.orderType || 'ALL',
      sub_order_type: filter.sub_order_type || filter.subOrderType || 'ALL',
      order_status: filter.order_status || filter.orderStatus || 'ALL',
      settlement_type: filter.settlement_type || filter.settlementType || 'ALL',
      ...filter,
    };
    return this.post('/nsemfdesk/api/v2/reports/ORDER_STATUS', payload);
  }

  // ── 11b. Order Lifecycle Report (Doc Page 129 - Authoritative Payment & Lifecycle Tracking) ──
  async getOrderLifecycle(filter = {}) {
    return this.post('/nsemfdesk/api/v2/reports/order_lifecycle', {
      Product_type: filter.productType || 'PUR',
      product_id: String(filter.productId || filter.orderId || ''),
      client_code: filter.clientCode || '',
      from_date: filter.fromDate || '',
      to_date: filter.toDate || '',
    });
  }

  // ── 11c. Member Fund Allocation Order-Wise Report (Doc Page 99 - Checks Received Funds) ──
  async getFundAllocationOrderWise(filter = {}) {
    return this.post('/nsemfdesk/api/v2/reports/MEMBER_FUND_ALLOCATION/ORDER_WISE', {
      order_id: String(filter.orderId || ''),
      client_code: filter.clientCode || '',
      from_date: filter.fromDate || '',
      to_date: filter.toDate || '',
    });
  }

  // ── 11d. Transaction Detail Report (Doc Page 131 - Matches NSE Web Portal Transaction Report) ──
  async getTransactionDetailReport(filter = {}) {
    return this.post('/nsemfdesk/api/v2/reports/TRANSACTION_DETAIL_REPORT', {
      order_id: String(filter.orderId || ''),
      product_id: String(filter.productId || filter.orderId || ''),
      trxn_no: String(filter.trxnNo || filter.orderId || ''),
      client_code: filter.clientCode || '',
      from_date: filter.fromDate || '',
      to_date: filter.toDate || '',
      Pan: filter.pan || '',
      date_type: filter.dateType || 'REQUEST_DATE',
      ...(filter.mockStatus ? { mockStatus: filter.mockStatus } : {}),
    });
  }

  // ── 11e. Allotment Statement Report (Doc Page 133 / NNF Spec - Authoritative for Folio Numbers & Allotted Units) ──
  async getAllotmentStatement(filter = {}) {
    const payload = {};
    if (filter.orderIds || filter.order_ids) {
      payload.order_ids = String(filter.orderIds || filter.order_ids);
    }
    if (filter.fromDate || filter.from_date) {
      payload.from_date = String(filter.fromDate || filter.from_date);
    }
    if (filter.toDate || filter.to_date) {
      payload.to_date = String(filter.toDate || filter.to_date);
    }
    if (filter.orderType || filter.order_type) {
      payload.order_type = String(filter.orderType || filter.order_type);
    }
    if (filter.clientCode || filter.client_code) {
      payload.client_code = String(filter.clientCode || filter.client_code);
    }
    if (filter.mockStatus) payload.mockStatus = filter.mockStatus;
    if (filter.mockFolio) payload.mockFolio = filter.mockFolio;
    if (filter.mockUnits) payload.mockUnits = filter.mockUnits;
    if (filter.mockNav) payload.mockNav = filter.mockNav;

    return this.post('/nsemfdesk/api/v2/reports/ALLOTMENT_STATEMENT', payload);
  }

  // ── 12. Scheme Master & NAV Download ──
  async downloadMaster(fileType = 'SCH') {
    // SCH = Consolidated Scheme master, SIP = SIP master, NAV = NAV Download
    return this.post('/nsemfdesk/api/v2/reports/MASTER_DOWNLOAD', {
      file_type: fileType,
    });
  }

  // ── 13. Official NSE MFSS Client KYC Status Report (Doc page 169) ──
  async checkKycStatus(panNo, clientCode = '') {
    return this.checkClientKycStatus(panNo, clientCode);
  }

  // ── 13b. Client KYC Status Report (NNF v1.9.8 Doc page 169) ──
  async checkClientKycStatus(panNo, clientCode = '') {
    const payload = { pan_no: String(panNo || '').trim().toUpperCase() };
    if (clientCode) {
      payload.client_code = clientCode;
    }
    return this.post('/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT', payload);
  }

  // ── 13c. Client Master Report (Check Existing Registered UCC on NSE - Doc page 178) ──
  async getClientMasterReport({ pan = '', clientCode = '', fromDate = '', toDate = '' } = {}) {
    const payload = {};
    if (clientCode) payload.client_code = clientCode;
    if (pan) payload.PAN = pan.toUpperCase();
    if (fromDate) payload.from_date = fromDate;
    if (toDate) payload.to_date = toDate;
    return this.post('/nsemfdesk/api/v2/reports/client_master_report', payload);
  }

  resolveRtaAmcCode(input) {
    return resolveRtaAmcCode(input);
  }

  // ── 13d. Official NSE MFSS eKYC Fresh Registration (NNF v1.9.8 Doc page 170-171) ──
  async initiateEkycRegistration({ amcCode = 'H', panNo, mobileNo, invEmail } = {}) {
    const primaryAmc = resolveRtaAmcCode(amcCode);
    const cleanPan = String(panNo || '').trim().toUpperCase();
    const cleanMobile = String(mobileNo || '').replace(/[^0-9]/g, '').slice(-10);
    const cleanEmail = String(invEmail || '').trim().toLowerCase();

    // Mock mode handling
    if (this.isMockMode()) {
      const mockRes = this.getMockResponse('/nsemfdesk/api/v1/EKYC/EKYCREG', {
        amcCode: primaryAmc,
        panNo: cleanPan,
        mobileNo: cleanMobile,
        invEmail: cleanEmail,
      });
      mockRes.usedAmcCode = primaryAmc;
      return mockRes;
    }

    const isAmcError = (res) => {
      if (!res || res.success) return false;
      const combined = `${res.message || ''} ${JSON.stringify(res.error || '')}`.toLowerCase();
      return combined.includes('invalid rta amc code') || combined.includes('rta amc');
    };

    // Candidate list starting with primary resolved code, followed by remaining valid codes
    const candidates = [
      primaryAmc,
      ...AUTHORIZED_RTA_AMC_CODES.filter((c) => c !== primaryAmc),
    ];

    let lastRes = null;
    let usedAmc = primaryAmc;

    for (const currentAmc of candidates) {
      usedAmc = currentAmc;
      const payload = {
        amcCode: currentAmc,
        panNo: cleanPan,
        mobileNo: cleanMobile,
        invEmail: cleanEmail,
      };

      console.log(`[NSE eKYC] Dispatching EKYCREG to NSE gateway with AMC code: '${currentAmc}' for PAN: ${cleanPan}`);
      lastRes = await this.post('/nsemfdesk/api/v1/EKYC/EKYCREG', payload);

      if (lastRes && lastRes.success) {
        lastRes.usedAmcCode = usedAmc;
        return lastRes;
      }

      if (!isAmcError(lastRes)) {
        // If error is unrelated to AMC code (e.g., invalid PAN, network failure, 403, etc.), return immediately
        if (lastRes) lastRes.usedAmcCode = usedAmc;
        return lastRes;
      }

      console.warn(`[NSE eKYC] NSE gateway rejected amcCode '${currentAmc}' with Invalid RTA AMC error. Automatically trying next candidate...`);
    }

    if (lastRes) lastRes.usedAmcCode = usedAmc;
    return lastRes;
  }

  // ── 14. Order Cancellation ──
  async cancelOrder(clientCode, orderNo, remarks = 'Cancelled by investor') {
    return this.post('/nsemfdesk/api/v2/cancellation/ORDER_CAN', {
      can_data: [
        {
          client_code: clientCode,
          order_no: String(orderNo),
          remarks,
        },
      ],
    });
  }

  // ── 15. XSIP Cancellation ──
  async cancelXsip(clientCode, xsipRegNo, remarks = '13:(User requested cancellation)') {
    return this.post('/nsemfdesk/api/v2/cancellation/XSIP_CAN', {
      can_data: [
        {
          client_code: clientCode,
          xsip_reg_no: String(xsipRegNo),
          remarks: String(remarks).slice(0, 100),
        },
      ],
    });
  }

  // ── 16. FATCA Upload (For Individual Only - Doc page 75) ──
  async uploadFatca(fatcaData) {
    const list = Array.isArray(fatcaData) ? fatcaData : [fatcaData];
    return this.post('/nsemfdesk/api/v2/registration/FATCA', {
      reg_details: list,
    });
  }

  // ── 17. Resend Communication API (Doc page 73) ──
  async resendCommunication(productType, productRefId) {
    return this.post('/nsemfdesk/api/v2/registration/RESEND_COMM', {
      productType, // 'CL_ACT', 'MANDATE_AUTH', 'PUR', etc.
      productRefId: String(productRefId),
    });
  }

  // ── 18. Client Detail Report API (Doc page 125) ──
  async getClientDetailReport({ clientCode = '', fromDate = '', toDate = '', authStatus = 'PENDING', dateType = 'MODIFIED_DATE' } = {}) {
    const payload = {};
    if (clientCode) payload.client_code = clientCode;
    if (fromDate) payload.from_date = fromDate;
    if (toDate) payload.to_date = toDate;
    if (authStatus) payload.auth_status = authStatus;
    if (dateType) payload.date_type = dateType;
    return this.post('/nsemfdesk/api/v2/reports/CLIENT_DETAIL_REPORT', payload);
  }

  // ── 19. Client Authorization Report API (Doc page 123) ──
  async getClientAuthorizationReport({ clientCode = '', fromDate = '', toDate = '', authStatus = '', dateType = 'AUTH_SENT_DATE' } = {}) {
    const payload = {};
    if (clientCode) payload.client_code = clientCode;
    if (fromDate) payload.from_date = fromDate;
    if (toDate) payload.to_date = toDate;
    if (authStatus) payload.auth_status = authStatus;
    if (dateType) payload.date_type = dateType;
    return this.post('/nsemfdesk/api/v2/reports/client_authorization', payload);
  }

  // ── 20. eLOG Upload API (Doc page 95) ──
  async uploadElog(elogData) {
    return this.post('/nsemfdesk/api/v2/registration/eLOG', elogData);
  }

  // ── 21. Client Bank Detail API (ADD/DEL - Doc page 59) ──
  async updateClientBankDetail(bankData) {
    const list = Array.isArray(bankData) ? bankData : [bankData];
    return this.post('/nsemfdesk/api/v2/registration/CLIENTBANKDTL', {
      bank_dtl: list,
    });
  }
}

module.exports = new NseClient();
