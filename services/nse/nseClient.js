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
            ? 'https://www.nseinvest.com/mf/'
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

  // ── 7b. Mandate Status Report (Doc page 70) ──
  async getMandateStatus(filter = {}) {
    const payload = {};
    if (filter.mandateId) payload.mandate_id = String(filter.mandateId);
    if (filter.clientCode) payload.client_code = filter.clientCode;
    if (filter.fromDate) payload.from_date = filter.fromDate;
    if (filter.toDate) payload.to_date = filter.toDate;
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

  // ── 11. Order Status Report ──
  async getOrderStatusReport(filter) {
    return this.post('/nsemfdesk/api/v2/reports/ORDER_STATUS', filter);
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
