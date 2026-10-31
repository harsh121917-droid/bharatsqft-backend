const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const mfCentralController = require('../controllers/mfCentralController');

// Public callback routes (accessed via browser redirect or webhook from MFCentral)
router.get('/cas/callback', mfCentralController.handleCasCallback);
router.post('/cas/callback', mfCentralController.handleCasCallback);

// Protected routes (Investor authenticated)
router.use(protect);
router.post('/cas/initiate', mfCentralController.initiateCas);
router.get('/cas/status/:reqId', mfCentralController.getCasStatus);
router.get('/portfolio/consolidated', mfCentralController.getConsolidatedPortfolio);
router.get('/holdings/external', mfCentralController.getExternalHoldings);

module.exports = router;
