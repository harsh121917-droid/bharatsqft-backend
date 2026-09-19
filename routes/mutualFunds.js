const express = require('express');
const router = express.Router();
const {
  getSchemes,
  getSchemeDetail,
  getUserUcc,
  registerUserUcc,
  createPurchaseOrder,
  registerSipOrder,
  getPortfolio,
  getMyOrders,
} = require('../controllers/mutualFundsController');
const { protect } = require('../middleware/authMiddleware');

// ── Public Routes (Scheme catalog & performance) ──
router.get('/schemes', getSchemes);
router.get('/schemes/:code', getSchemeDetail);

// ── Protected Routes (User-specific transactions & portfolio) ──
router.use(protect);

router.get('/ucc/me', getUserUcc);
router.post('/ucc/register', registerUserUcc);
router.post('/orders/purchase', createPurchaseOrder);
router.post('/sip/register', registerSipOrder);
router.get('/portfolio', getPortfolio);
router.get('/orders/my', getMyOrders);

module.exports = router;
