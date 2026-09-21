const express = require('express');
const router = express.Router();
const {
  getSchemes,
  getSchemeDetail,
  getUserUcc,
  registerUserUcc,
  createPurchaseOrder,
  verifyPurchasePayment,
  registerSipOrder,
  verifySipPayment,
  getPortfolio,
  getMyOrders,
  simulatePayment,
  renderCheckoutSimulator,
  resetTestData,
  syncNavsNow,
} = require('../controllers/mutualFundsController');
const { protect } = require('../middleware/authMiddleware');

// ── Public Routes (Scheme catalog & checkout simulator) ──
router.get('/schemes', getSchemes);
router.get('/schemes/:code', getSchemeDetail);
router.get('/checkout/:orderId', renderCheckoutSimulator);
router.post('/orders/:orderId/simulate-payment', simulatePayment);
router.post('/sync-nav', syncNavsNow);

// ── Protected Routes (User-specific transactions & portfolio) ──
router.use(protect);

router.get('/ucc/me', getUserUcc);
router.post('/ucc/register', registerUserUcc);
router.post('/orders/purchase', createPurchaseOrder);
router.post('/orders/verify', verifyPurchasePayment);
router.post('/sip/register', registerSipOrder);
router.post('/sip/verify', verifySipPayment);
router.get('/portfolio', getPortfolio);
router.get('/orders/my', getMyOrders);
router.post('/test/reset', resetTestData);

module.exports = router;


