/**
 * Cybrilla UPI AutoPay & Mandate Service
 * Completely isolated service for managing recurring payment mandates,
 * user profile registration, and UPI AutoPay intent links.
 */

const client = require('./cybrillaClient');
const config = require('./cybrillaConfig');

class CybrillaMandateService {
  /**
   * Create an individual investor profile on Fintech Primitives
   * @param {Object} params
   * @param {string} params.pan - 10-char PAN (in sandbox: XXXPX3751X for KYC compliant)
   * @param {string} params.name - Full name of investor
   * @param {string} [params.type='individual']
   */
  async createInvestorProfile({ pan, name, type = 'individual' }) {
    const res = await client.post('/v2/investor_profiles', {
      type,
      pan: pan ? pan.toUpperCase() : undefined,
      name
    });
    return res.data;
  }

  /**
   * Register investor phone number (mandatory for mandate SMS & OTP)
   * @param {Object} params
   * @param {string} params.profileId - e.g. invp_...
   * @param {string} params.number - 10-digit mobile number
   * @param {string} [params.isd='91']
   */
  async addPhoneNumber({ profileId, number, isd = '91' }) {
    const res = await client.post('/v2/phone_numbers', {
      profile: profileId,
      isd,
      number: String(number)
    });
    return res.data;
  }

  /**
   * Register investor email address (mandatory for mandate verification)
   * @param {Object} params
   * @param {string} params.profileId - e.g. invp_...
   * @param {string} params.email - Valid email address
   */
  async addEmailAddress({ profileId, email }) {
    const res = await client.post('/v2/email_addresses', {
      profile: profileId,
      email
    });
    return res.data;
  }

  /**
   * Link an investor bank account
   * @param {Object} params
   * @param {string} params.profileId - Investor profile ID
   * @param {string} params.accountNumber - Bank account number
   * @param {string} params.ifscCode - IFSC code
   * @param {string} params.holderName - Primary account holder name
   * @param {string} [params.type='savings'] - 'savings' | 'current'
   */
  async createBankAccount({ profileId, accountNumber, ifscCode, holderName, type = 'savings' }) {
    const res = await client.post('/v2/bank_accounts', {
      profile: profileId,
      account_number: String(accountNumber),
      ifsc_code: ifscCode.toUpperCase(),
      primary_account_holder_name: holderName,
      type
    });
    return res.data;
  }

  /**
   * Create a UPI AutoPay Mandate
   * @param {Object} params
   * @param {number|string} params.bankAccountId - Internal numeric bank account ID (old_id)
   * @param {number} [params.limit=100000] - Mandate upper ceiling amount
   * @param {string} [params.providerName='CYBRILLAPOA']
   */
  async createUpiMandate({ bankAccountId, limit = 100000, providerName = config.providerName }) {
    const res = await client.post('/api/pg/mandates', {
      mandate_type: 'UPI',
      bank_account_id: Number(bankAccountId),
      mandate_limit: Number(limit),
      provider_name: providerName
    });
    return res.data;
  }

  /**
   * Initiate Mandate Authorization to obtain live UPI AutoPay intent/checkout URL
   * @param {Object} params
   * @param {number|string} params.mandateId - Mandate ID returned from createUpiMandate
   * @param {string} [params.postbackUrl] - Redirect URL after completion
   */
  async authorizeMandate({ mandateId, postbackUrl }) {
    const payload = {
      mandate_id: Number(mandateId)
    };
    if (postbackUrl) {
      payload.payment_postback_url = postbackUrl;
    }

    const res = await client.post('/api/pg/payments/emandate/auth', payload);
    return res.data;
  }

  /**
   * Fetch current mandate details and status
   * @param {number|string} mandateId
   */
  async getMandate(mandateId) {
    const res = await client.get(`/api/pg/mandates/${mandateId}`);
    return res.data;
  }

  /**
   * List mandates filtered by bank account ID
   * @param {Object} params
   * @param {number|string} params.bankAccountId
   */
  async listMandates({ bankAccountId } = {}) {
    const query = bankAccountId ? `?bank_account_id=${bankAccountId}` : '';
    const res = await client.get(`/api/pg/mandates${query}`);
    return res.data;
  }

  /**
   * Complete End-to-End Onboarding & UPI Mandate Setup
   * Orchestrates: Profile -> Contacts -> Bank -> Mandate -> Auth URL
   */
  async setupFullUpiAutopay({ investor, bank, mandateLimit = 100000, postbackUrl }) {
    // 1. Investor Profile
    const profile = await this.createInvestorProfile({
      pan: investor.pan,
      name: investor.name,
      type: investor.type || 'individual'
    });

    // 2. Contacts (Phone + Email)
    const phone = await this.addPhoneNumber({
      profileId: profile.id,
      number: investor.phone
    });

    const email = await this.addEmailAddress({
      profileId: profile.id,
      email: investor.email
    });

    // 3. Bank Account
    const bankAccount = await this.createBankAccount({
      profileId: profile.id,
      accountNumber: bank.accountNumber,
      ifscCode: bank.ifscCode,
      holderName: bank.holderName || investor.name,
      type: bank.type || 'savings'
    });

    // 4. Mandate Creation (using bankAccount.old_id)
    const mandate = await this.createUpiMandate({
      bankAccountId: bankAccount.old_id,
      limit: mandateLimit
    });

    // 5. Authorization (generates token_url for UPI Apps / QR)
    const auth = await this.authorizeMandate({
      mandateId: mandate.id,
      postbackUrl
    });

    return {
      success: true,
      profile: {
        id: profile.id,
        pan: profile.pan,
        name: profile.name
      },
      contacts: {
        phoneId: phone.id,
        phone: phone.number,
        emailId: email.id,
        email: email.email
      },
      bankAccount: {
        id: bankAccount.id,
        numericId: bankAccount.old_id,
        bankName: bankAccount.bank_name,
        accountNumber: bankAccount.account_number,
        ifsc: bankAccount.ifsc_code
      },
      mandate: {
        id: mandate.id,
        mandateRef: mandate.mandate_ref,
        limit: mandateLimit,
        type: 'UPI'
      },
      authorization: {
        id: auth.id,
        tokenUrl: auth.token_url
      }
    };
  }
}

module.exports = new CybrillaMandateService();
