const mongoose = require('mongoose');
const User = require('../models/User');
const MfClientUcc = require('../models/MfClientUcc');
const MfMandate = require('../models/MfMandate');
const nseClient = require('./nse/nseClient');

/**
 * Central Investor Readiness Validation Service for Mutual Funds
 * Enforces strict SEBI & NSE Exchange pre-requisites:
 * - Purchase: KYC Approved + Active NSE UCC + Verified Bank Details
 * - SIP: KYC Approved + Active NSE UCC + Verified Bank Details + Authorized Mandate with UMRN
 */
class MfInvestorReadinessService {
  /**
   * Verify whether the investor is eligible and exchange-ready to execute transactions.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {'PURCHASE'|'SIP'|'REDEEM'|'SWITCH'} mode
   * @returns {Promise<{ ready: boolean, code?: string, message?: string, user?: any, ucc?: any, mandate?: any, data?: any }>}
   */
  async checkInvestorReady(userId, mode = 'PURCHASE') {
    if (!userId) {
      return {
        ready: false,
        code: 'USER_NOT_FOUND',
        message: 'User authentication required.',
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      return {
        ready: false,
        code: 'USER_NOT_FOUND',
        message: 'Investor user account not found.',
      };
    }

    // 1. KYC Validation
    let isKycApproved = (
      user.isKycVerified === true ||
      user.kycStatus === 'approved' ||
      user.kycStatus === 'verified'
    );

    if (!isKycApproved) {
      try {
        const Kyc = mongoose.models.Kyc || require('../models/Kyc');
        const kycDoc = await Kyc.findOne({ user: userId });
        if (kycDoc && (kycDoc.status === 'approved' || kycDoc.status === 'verified')) {
          isKycApproved = true;
        }
      } catch (_) {}
    }

    if (!isKycApproved) {
      return {
        ready: false,
        code: 'NSE_KYC_NOT_READY',
        message: 'Your KYC verification is pending. Please complete KYC verification before investing in Mutual Funds.',
        data: {
          kycStatus: user.kycStatus || 'pending',
          isKycVerified: Boolean(user.isKycVerified),
        },
      };
    }

    // 2. UCC Validation
    const ucc = await MfClientUcc.findOne({ user: userId });
    const isUccApproved = Boolean(
      ucc &&
      ucc.clientCode &&
      ucc.nseStatus === 'ACTIVE'
    );

    if (!isUccApproved) {
      return {
        ready: false,
        code: 'NSE_UCC_NOT_READY',
        message: 'Your Mutual Fund account is not yet approved for investment. Please complete investor onboarding.',
        data: {
          hasUcc: Boolean(ucc),
          uccStatus: ucc?.nseStatus || 'NOT_REGISTERED',
          clientCode: ucc?.clientCode || null,
        },
      };
    }

    // 3. Bank Account Validation
    const hasValidBank = Boolean(
      ucc.primaryBank &&
      ucc.primaryBank.accountNo &&
      ucc.primaryBank.accountNo.trim().length >= 9 &&
      ucc.primaryBank.ifsc &&
      ucc.primaryBank.ifsc.trim().length === 11
    );

    if (!hasValidBank) {
      return {
        ready: false,
        code: 'NSE_BANK_NOT_VERIFIED',
        message: 'Your primary bank account is not verified for Mutual Fund investments. Please complete bank details.',
        data: {
          bankName: ucc.primaryBank?.bankName || '',
          hasAccountNo: Boolean(ucc.primaryBank?.accountNo),
          hasIfsc: Boolean(ucc.primaryBank?.ifsc),
        },
      };
    }

    // For Purchase / Redeem, KYC + UCC + Bank is sufficient
    if (mode === 'PURCHASE' || mode === 'REDEEM' || mode === 'SWITCH') {
      return {
        ready: true,
        user,
        ucc,
      };
    }

    // 4. Mandate / eNACH Validation (strictly required for SIP / XSIP)
    if (mode === 'SIP') {
      const mandate = await MfMandate.findOne({ user: userId }).sort({ createdAt: -1 });
      const isApprovedStatus = Boolean(
        mandate &&
        ['APPROVED', 'AUTHORIZED', 'ACTIVE', 'ACCEPTED_BY_BANK'].includes(mandate.status)
      );

      // In production, an authorized mandate requires a valid UMRN assigned by NPCI/bank
      const hasValidUmrn = Boolean(
        mandate &&
        typeof mandate.umrn === 'string' &&
        mandate.umrn.trim().length > 0
      );

      const isMock = nseClient.isMockMode();
      const isMandateAuthorized = isApprovedStatus && (hasValidUmrn || isMock);

      if (!isMandateAuthorized) {
        return {
          ready: false,
          code: 'NSE_MANDATE_NOT_READY',
          message: 'Your bank mandate is not yet authorized. Please complete mandate authorization before starting a SIP.',
          data: {
            hasMandate: Boolean(mandate),
            mandateStatus: mandate?.status || 'NOT_REGISTERED',
            mandateId: mandate?.mandateId || null,
            hasUmrn: Boolean(hasValidUmrn),
          },
        };
      }

      return {
        ready: true,
        user,
        ucc,
        mandate,
      };
    }

    return {
      ready: true,
      user,
      ucc,
    };
  }
}

module.exports = new MfInvestorReadinessService();
