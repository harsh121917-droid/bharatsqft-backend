const express = require('express');
const router = express.Router();
const {
  getSchemes,
  getSchemeDetail,
  getSchemeHoldings,
  getUserUcc,
  registerUserUcc,
  createPurchaseOrder,
  verifyPurchasePayment,
  registerSipOrder,
  verifySipPayment,
  abandonSipOrder,
  getPortfolio,
  getPortfolioHistory,
  getHoldingDetail,
  getTransactions,
  getTransactionDetail,
  getUserSips,
  getSipDetail,
  pauseUserSip,
  resumeUserSip,
  cancelUserSip,
  getCapitalGains,
  confirmOrderAllotment,
  settleRedemptionOrder,
  getMyOrders,
  simulatePayment,
  renderCheckoutSimulator,
  resetTestData,
  syncNavsNow,
  createRedemptionOrder,
  createSwitchOrder,
  registerStpOrder,
  registerSwpOrder,
  getOnboardingStatus,
  verifyPanDetails,
  setupUserMandate,
  verifyUserMandate,
} = require('../controllers/mutualFundsController');
const { protect } = require('../middleware/authMiddleware');

// ── Public Routes (Scheme catalog & checkout simulator) ──
router.get('/schemes', getSchemes);
router.get('/schemes/:code/holdings', getSchemeHoldings);
router.get('/schemes/:code', getSchemeDetail);
router.get('/checkout/:orderId', renderCheckoutSimulator);
router.post('/orders/:orderId/simulate-payment', simulatePayment);
router.post('/sync-nav', syncNavsNow);

// ── Protected Routes (User-specific transactions & portfolio) ──
router.use(protect);

router.post('/pan/verify', verifyPanDetails);
router.get('/onboarding-status', getOnboardingStatus);
router.post('/mandates/setup', setupUserMandate);
router.post('/mandates/:id/verify', verifyUserMandate);
router.get('/ucc/me', getUserUcc);
router.post('/ucc/register', registerUserUcc);
router.post('/orders/purchase', createPurchaseOrder);
router.post('/orders/verify', verifyPurchasePayment);
router.post('/orders/redeem', createRedemptionOrder);
router.post('/orders/switch', createSwitchOrder);
router.post('/orders/:orderId/confirm-allotment', confirmOrderAllotment);
router.post('/orders/:orderId/settle-redemption', settleRedemptionOrder);
router.post('/stp/register', registerStpOrder);
router.post('/swp/register', registerSwpOrder);
router.post('/sip/register', registerSipOrder);
router.post('/sip/verify', verifySipPayment);
router.post('/sip/:id/abandon', abandonSipOrder);
router.get('/sips', getUserSips);
router.get('/sips/:id', getSipDetail);
router.post('/sips/:id/pause', pauseUserSip);
router.post('/sips/:id/resume', resumeUserSip);
router.post('/sips/:id/cancel', cancelUserSip);
router.get('/portfolio', getPortfolio);
router.get('/portfolio/history', getPortfolioHistory);
router.get('/portfolio/holdings/:schemeCode', getHoldingDetail);
router.get('/transactions', getTransactions);
router.get('/transactions/:id', getTransactionDetail);
router.get('/tax/capital-gains', getCapitalGains);
router.get('/orders/my', getMyOrders);
router.post('/test/reset', resetTestData);

module.exports = router;


