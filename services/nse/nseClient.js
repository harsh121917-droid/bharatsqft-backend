const axios = require('axios');
const nseEncryption = require('./nseEncryption');

/**
 * NSE Mutual Funds Service System (NSEINVEST NNF v1.9.8)
 * Client Gateway
 */

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

    if (endpoint.includes('MANDATE')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          message: 'Mandate registered successfully in Sandbox Mode',
          reg_data: [
            {
              mandate_id: `MND_TEST_${timestamp}`,
              status: 'SUCCESS',
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
          firstHolderLink: `${backendUrl}/api/mutual-funds/checkout/${refId}?mode=sandbox`,
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
          pan: pan,
          kyc_status: 'S',
          kyc_status_remark: 'KYC REGISTERED',
          kra_name: 'cvlkra',
        },
      };
    }

    if (endpoint.includes('ORDER_STATUS')) {
      const orderRef = payload.order_ref_number || '';
      const orderStatus = payload.mockStatus || 'SUCCESS';
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          orders: [
            {
              order_ref_number: orderRef,
              order_status: orderStatus,
              status: orderStatus,
              allotted_units: orderStatus === 'ALLOTTED' ? '100.000' : '0.000',
              nav: '100.00',
              rejection_reason: orderStatus === 'REJECTED' ? 'Payment timed out or rejected by bank' : '',
            },
          ],
        },
      };
    }

    if (endpoint.includes('upi_status_check')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          payment_status: 'SUCCESS',
        },
      };
    }

    if (endpoint.includes('purchase_payment')) {
      return {
        success: true,
        status: 200,
        data: {
          status: '100',
          payment_status: 'INITIATED',
          payment_ref_no: `PAY_TEST_${timestamp}`,
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
    return this.post('/nsemfdesk/api/v2/transaction/NORMAL', {
      transaction_details: list,
    });
  }

  // ── 3. Switch Order Entry ──
  async createSwitchOrder(switchDetails) {
    const list = Array.isArray(switchDetails) ? switchDetails : [switchDetails];
    return this.post('/nsemfdesk/api/v2/transaction/SWITCH', {
      transaction_details: list,
    });
  }

  // ── 4. XSIP Registration ──
  async registerXsip(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/XSIP', {
      reg_data: list,
    });
  }

  // ── 5. Standard SIP Registration ──
  async registerSip(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/SIP', {
      reg_data: list,
    });
  }

  // ── 6. (X)SIP Topup Registration ──
  async registerSipTopup(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/SIP_TOPUP', {
      reg_data: list,
    });
  }

  // ── 6b. STP (Systematic Transfer Plan) Registration ──
  async registerStp(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/STP', {
      reg_data: list,
    });
  }

  // ── 6c. SWP (Systematic Withdrawal Plan) Registration ──
  async registerSwp(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/SWP', {
      reg_data: list,
    });
  }

  // ── 7. Mandate Registration (eNACH / Physical) ──
  async registerMandate(regData) {
    const list = Array.isArray(regData) ? regData : [regData];
    return this.post('/nsemfdesk/api/v2/registration/product/MANDATE', {
      reg_data: list,
    });
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

  // ── 11. Order Status Report ──
  async getOrderStatusReport(filter) {
    return this.post('/nsemfdesk/api/v2/reports/ORDER_STATUS', filter);
  }

  // ── 12. Scheme Master & NAV Download ──
  async downloadMaster(fileType = 'SCH') {
    // SCH = Consolidated Scheme master, SIP = SIP master, NAV = NAV Download
    return this.post('/nsemfdesk/api/v2/reports/MASTER_DOWNLOAD', {
      file_type: fileType,
    });
  }

  // ── 13. Official NSE MFSS Utility KYC Check ──
  async checkKycStatus(panNo) {
    return this.post('/nsemfdesk/api/v2/utility/KYC_CHECK', {
      pan_no: String(panNo || '').trim().toUpperCase(),
    });
  }

  // ── 13b. Client KYC Status Report ──
  async checkClientKycStatus(panNo, clientCode = '') {
    const payload = { pan_no: panNo };
    if (clientCode && !panNo) {
      payload.client_code = clientCode;
    }
    return this.post('/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT', payload);
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
          remarks,
        },
      ],
    });
  }
}

module.exports = new NseClient();
