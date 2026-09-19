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
  }

  getBaseUrl() {
    return this.env === 'PROD' ? this.prodUrl : this.uatUrl;
  }

  /**
   * Internal dispatcher creating axios requests with strict TLS v1.3 agent and headers
   */
  async post(endpoint, payload) {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    const headers = nseEncryption.generateAuthHeaders();
    const httpsAgent = nseEncryption.getHttpsAgent();

    try {
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
      return {
        success: false,
        status,
        error: errorData,
        message: error.message,
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

  // ── 13. Client KYC Status Report ──
  async checkClientKycStatus(panNo, clientCode = '') {
    return this.post('/nsemfdesk/api/v2/reports/CLIENT_KYC_REPORT', {
      pan_no: panNo,
      client_code: clientCode,
    });
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
