const MfCentralCasRequest = require('../models/MfCentralCasRequest');
const MfExternalHolding = require('../models/MfExternalHolding');
const MfPortfolioHolding = require('../models/MfPortfolioHolding');
const MfClientUcc = require('../models/MfClientUcc');
const Kyc = require('../models/Kyc');
const User = require('../models/User');
const mfCentralClient = require('../services/mfcentral/mfCentralClient');

// ── 1. POST /api/mutual-funds/mfcentral/cas/initiate ──
exports.initiateCas = async (req, res) => {
  try {
    const userId = req.user._id;
    const { casType = 'SUMMARY', fromDate = '', toDate = '', customRedirectUrl = '', pan: bodyPan } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Resolve PAN: check req.body first, then UCC, then Kyc, then User
    const ucc = await MfClientUcc.findOne({ user: userId });
    const kyc = await Kyc.findOne({ user: userId });
    const pan = (bodyPan || ucc?.pan || kyc?.panNumber || user?.panNumber || user?.pan || '').trim().toUpperCase();

    if (!pan) {
      return res.status(400).json({
        success: false,
        code: 'PAN_REQUIRED',
        message: 'A valid PAN is required to fetch your Consolidated Account Statement (CAS). Please complete PAN verification first.',
      });
    }

    const phone = (user.phone || '').slice(-10);
    const clientRefNo = `CAS_${Date.now()}_${userId.toString().slice(-4)}`;
    const backendUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'https://api.vikaone.com';
    const redirectUrl = customRedirectUrl || `${backendUrl}/api/mutual-funds/mfcentral/cas/callback?clientRefNo=${clientRefNo}`;

    const casResult = await mfCentralClient.initiateCasRequest({
      clientRefNo,
      pan,
      mobile: phone,
      email: user.email,
      redirectUrl,
      casType,
      fromDate,
      toDate,
    });

    const casRecord = await MfCentralCasRequest.create({
      user: userId,
      clientRefNo,
      reqId: casResult.reqId || '',
      pan,
      mobile: phone,
      email: user.email,
      status: 'PENDING_OTP',
      casType,
      fromDate,
      toDate,
      authUrl: casResult.authUrl,
      redirectUrl,
    });

    return res.status(200).json({
      success: true,
      message: 'CAS request initiated. Please complete OTP authentication on MFCentral.',
      data: {
        clientRefNo,
        reqId: casRecord.reqId,
        authUrl: casRecord.authUrl,
        mode: casResult.mode,
        expiresInSeconds: 900,
      },
    });
  } catch (error) {
    console.error('[initiateCas Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 2. GET/POST /api/mutual-funds/mfcentral/cas/callback ──
exports.handleCasCallback = async (req, res) => {
  try {
    const data = { ...req.query, ...req.body };
    const { reqId, clientRefNo, status = 'success', code = '', message = '' } = data;

    const query = clientRefNo ? { clientRefNo } : (reqId ? { reqId } : null);
    if (!query) {
      return res.status(400).json({ success: false, message: 'Missing clientRefNo or reqId in callback' });
    }

    const casReq = await MfCentralCasRequest.findOne(query);
    if (!casReq) {
      return res.status(404).json({ success: false, message: 'CAS request not found' });
    }

    if (String(status).toLowerCase() !== 'success') {
      casReq.status = 'FAILED';
      casReq.failureReason = message || code || 'User cancelled or failed authentication';
      await casReq.save();

      if (req.method === 'GET') {
        return res.send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 40px;">
              <h2 style="color: #e53e3e;">CAS Verification Failed</h2>
              <p>${casReq.failureReason}</p>
              <p>You can close this window and return to Vikaone app.</p>
            </body>
          </html>
        `);
      }
      return res.status(400).json({ success: false, message: casReq.failureReason });
    }

    // 1. Fetch CAS Portfolio JSON from MFCentral
    const effectiveReqId = reqId || casReq.reqId;
    const portfolioData = await mfCentralClient.fetchCasPortfolio(effectiveReqId, casReq.pan);

    // 2. Ingest Folios and Schemes into MfExternalHolding
    const folios = portfolioData?.folios || [];
    let importedSchemesCount = 0;
    let totalVal = 0;
    let totalCost = 0;

    for (const f of folios) {
      for (const s of (f.schemes || [])) {
        importedSchemesCount++;
        const curVal = Number(s.currentValue || (s.units * s.nav) || 0);
        const costVal = Number(s.costValue || 0);
        totalVal += curVal;
        totalCost += costVal;

        const unGain = curVal - costVal;
        const unGainPct = costVal > 0 ? (unGain / costVal) * 100 : 0;

        await MfExternalHolding.findOneAndUpdate(
          {
            user: casReq.user,
            folioNumber: String(f.folioNumber).trim(),
            isin: String(s.isin || '').trim().toUpperCase(),
          },
          {
            $set: {
              casRequestId: casReq._id,
              pan: casReq.pan,
              amcCode: f.amcCode || '',
              amcName: f.amcName || '',
              folioNumber: String(f.folioNumber).trim(),
              schemeCode: s.schemeCode || '',
              schemeName: s.schemeName,
              isin: String(s.isin || '').trim().toUpperCase(),
              rta: f.rta || 'CAMS',
              planType: s.planType || 'REGULAR',
              optionType: s.optionType || 'GROWTH',
              units: Number(s.units || 0),
              nav: Number(s.nav || 0),
              navDate: s.navDate ? new Date(s.navDate) : new Date(),
              costValue: costVal,
              currentValue: curVal,
              unrealizedGain: unGain,
              unrealizedGainPct: unGainPct,
              source: 'MFCENTRAL_CAS',
              holdingStatus: 'ACTIVE',
              lastSyncedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    // 3. Mark request COMPLETED
    casReq.status = 'COMPLETED';
    casReq.completedAt = new Date();
    casReq.summary = {
      totalFolios: folios.length,
      totalSchemes: importedSchemesCount,
      totalCurrentValue: Math.round(totalVal * 100) / 100,
      totalCostValue: Math.round(totalCost * 100) / 100,
      totalUnrealizedGain: Math.round((totalVal - totalCost) * 100) / 100,
      currency: 'INR',
    };
    await casReq.save();

    if (req.method === 'GET') {
      return res.send(`
        <html>
          <head>
            <title>CAS Imported Successfully</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px; background-color: #f7fafc;">
            <div style="background: white; border-radius: 16px; padding: 32px; max-width: 420px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
              <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
              <h2 style="color: #2d3748; margin-top: 0;">Portfolio Imported!</h2>
              <p style="color: #4a5568; font-size: 15px;">Successfully synced <strong>${importedSchemesCount} mutual funds</strong> across <strong>${folios.length} folios</strong>.</p>
              <div style="background: #edf2f7; border-radius: 8px; padding: 12px; margin: 20px 0;">
                <div style="font-size: 12px; color: #718096;">Total Portfolio Value</div>
                <div style="font-size: 22px; font-weight: bold; color: #1a202c;">₹${Math.round(totalVal).toLocaleString('en-IN')}</div>
              </div>
              <p style="color: #718096; font-size: 13px;">You can now close this tab and return to the Vikaone app.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'mfc-cas-complete', data: { status: 'success', reqId: '${effectiveReqId}', type: 'summary' } }, '*');
                setTimeout(() => window.close(), 1500);
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'mfc-cas-complete', data: { status: 'success', reqId: '${effectiveReqId}', type: 'summary' } }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }

    return res.status(200).json({
      success: true,
      message: 'Portfolio successfully synced from MFCentral',
      data: {
        summary: casReq.summary,
      },
    });
  } catch (error) {
    console.error('[handleCasCallback Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 3. GET /api/mutual-funds/mfcentral/portfolio/consolidated ──
exports.getConsolidatedPortfolio = async (req, res) => {
  try {
    const userId = req.user._id;

    // A. Fetch internal holdings (orders placed within Vikaone)
    const internalHoldings = await MfPortfolioHolding.find({ user: userId, holdingStatus: 'ACTIVE' });
    let internalTotalVal = 0;
    let internalTotalCost = 0;
    const internalFormatted = internalHoldings.map((h) => {
      const cur = Number(h.currentValue || (h.totalUnits * (h.currentNav || h.averageNav || 0)) || 0);
      const cost = Number(h.investedAmount || 0);
      internalTotalVal += cur;
      internalTotalCost += cost;
      return {
        id: h._id,
        schemeCode: h.schemeCode,
        schemeName: h.schemeName,
        amcName: h.amcName,
        folioNumber: h.folioNo,
        units: h.totalUnits,
        nav: h.currentNav || h.averageNav,
        currentValue: cur,
        investedAmount: cost,
        unrealizedProfitLoss: cur - cost,
        source: 'VIKAONE',
      };
    });

    // B. Fetch external holdings (imported via MFCentral CAS)
    const externalHoldings = await MfExternalHolding.find({ user: userId, holdingStatus: 'ACTIVE' });
    let externalTotalVal = 0;
    let externalTotalCost = 0;
    const externalFormatted = externalHoldings.map((h) => {
      const cur = Number(h.currentValue || 0);
      const cost = Number(h.costValue || 0);
      externalTotalVal += cur;
      externalTotalCost += cost;
      return {
        id: h._id,
        schemeCode: h.schemeCode,
        schemeName: h.schemeName,
        amcName: h.amcName,
        folioNumber: h.folioNumber,
        isin: h.isin,
        units: h.units,
        nav: h.nav,
        currentValue: cur,
        investedAmount: cost,
        unrealizedProfitLoss: cur - cost,
        planType: h.planType,
        optionType: h.optionType,
        rta: h.rta,
        source: 'MFCENTRAL_CAS',
      };
    });

    // C. Combine for consolidated totals
    const totalCurrentVal = Math.round((internalTotalVal + externalTotalVal) * 100) / 100;
    const totalInvested = Math.round((internalTotalCost + externalTotalCost) * 100) / 100;
    const totalProfitLoss = Math.round((totalCurrentVal - totalInvested) * 100) / 100;
    const totalReturnPct = totalInvested > 0 ? Math.round((totalProfitLoss / totalInvested) * 10000) / 100 : 0;

    return res.status(200).json({
      success: true,
      data: {
        consolidated: {
          totalCurrentValue: totalCurrentVal,
          totalInvestedAmount: totalInvested,
          totalProfitLoss,
          totalReturnPct,
          totalFundsCount: internalFormatted.length + externalFormatted.length,
        },
        breakdown: {
          vikaone: {
            currentValue: Math.round(internalTotalVal * 100) / 100,
            investedAmount: Math.round(internalTotalCost * 100) / 100,
            fundsCount: internalFormatted.length,
          },
          external: {
            currentValue: Math.round(externalTotalVal * 100) / 100,
            investedAmount: Math.round(externalTotalCost * 100) / 100,
            fundsCount: externalFormatted.length,
          },
        },
        holdings: {
          internal: internalFormatted,
          external: externalFormatted,
        },
      },
    });
  } catch (error) {
    console.error('[getConsolidatedPortfolio Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 4. GET /api/mutual-funds/mfcentral/holdings/external ──
exports.getExternalHoldings = async (req, res) => {
  try {
    const userId = req.user._id;
    const holdings = await MfExternalHolding.find({ user: userId, holdingStatus: 'ACTIVE' }).sort({ currentValue: -1 });
    return res.status(200).json({
      success: true,
      data: {
        totalHoldings: holdings.length,
        holdings,
      },
    });
  } catch (error) {
    console.error('[getExternalHoldings Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 5. GET /api/mutual-funds/mfcentral/cas/status/:reqId ──
exports.getCasStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { reqId } = req.params;

    const casReq = await MfCentralCasRequest.findOne({
      user: userId,
      $or: [{ reqId }, { clientRefNo: reqId }],
    });

    if (!casReq) {
      return res.status(404).json({ success: false, message: 'CAS request not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        clientRefNo: casReq.clientRefNo,
        reqId: casReq.reqId,
        status: casReq.status,
        summary: casReq.summary,
        completedAt: casReq.completedAt,
        failureReason: casReq.failureReason,
      },
    });
  } catch (error) {
    console.error('[getCasStatus Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
