const express    = require('express');
const router     = express.Router();
const { smcLogin } = require('../services/smcService');

/* GET /smc/test-login
   Calls SMC Login API and returns raw response.
   No auth required — test only, disable in production. */
router.get('/test-login', async (req, res) => {
  console.log('[SMC] /test-login hit');
  try {
    const result = await smcLogin();
    res.json({
      success:          true,
      registered_token: result.registered_token,
      smc_status:       result.status,
      smc_raw:          result.rawResponse,
    });
  } catch (err) {
    console.error('[SMC] Login error:', err.message);

    // Axios error — include SMC's actual error response if present
    const smcError = err.response?.data;
    res.status(500).json({
      success:   false,
      message:   err.message,
      smc_error: smcError || null,
      hint:      smcError
        ? 'SMC returned an error — check smc_error for details'
        : 'Could not reach SMC API — check SMC_BASE_URL and network',
    });
  }
});

module.exports = router;