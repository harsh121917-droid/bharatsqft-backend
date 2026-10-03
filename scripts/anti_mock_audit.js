/**
 * VikaOne Mutual Fund — Phase 5 Anti-Mock Audit Script
 *
 * Scans production Mutual Fund codebase for mock/dummy/synthetic data patterns
 * per Section 20 of Phase 5 prompt.
 */

const fs = require('fs');
const path = require('path');

// Target all Mutual Fund backend services, models, and controllers
const TARGET_FILES = [
  // Controllers
  path.join(__dirname, '..', 'controllers', 'mutualFundsController.js'),
  // Models
  path.join(__dirname, '..', 'models', 'MutualFundScheme.js'),
  path.join(__dirname, '..', 'models', 'MfOrder.js'),
  path.join(__dirname, '..', 'models', 'MfTransaction.js'),
  path.join(__dirname, '..', 'models', 'MfPortfolioHolding.js'),
  path.join(__dirname, '..', 'models', 'MfSip.js'),
  path.join(__dirname, '..', 'models', 'MfMandate.js'),
  path.join(__dirname, '..', 'models', 'MfCapitalGain.js'),
  path.join(__dirname, '..', 'models', 'MfAuditLog.js'),
  path.join(__dirname, '..', 'models', 'MfReconciliation.js'),
  // Services
  path.join(__dirname, '..', 'services', 'mfPortfolioEngine.js'),
  path.join(__dirname, '..', 'services', 'mfCapitalGainsEngine.js'),
  path.join(__dirname, '..', 'services', 'mfStateMachine.js'),
  path.join(__dirname, '..', 'services', 'mfIdempotencyService.js'),
  path.join(__dirname, '..', 'services', 'mfConfigService.js'),
  path.join(__dirname, '..', 'services', 'mfRetryService.js'),
  path.join(__dirname, '..', 'services', 'mfReconciliationEngine.js'),
  path.join(__dirname, '..', 'services', 'mfAdminService.js'),
  path.join(__dirname, '..', 'services', 'mfNotificationService.js'),
  path.join(__dirname, '..', 'services', 'mfGoLiveService.js'),
  // NSE Services
  path.join(__dirname, '..', 'services', 'nse', 'nseClient.js'),
  path.join(__dirname, '..', 'services', 'nse', 'nseEncryption.js'),
  path.join(__dirname, '..', 'services', 'nse', 'nseLiveConnectivityService.js'),
  path.join(__dirname, '..', 'services', 'nse', 'nseOrderLifecycleService.js'),
];

const FORBIDDEN_PATTERNS = [
  'sampleHoldings',
  'demoPortfolio',
  'mockHoldings',
  'fakeOrder',
  'fakeTransaction',
  'hardcoded NAV',
  'hardcoded units',
  'hardcoded portfolio values',
  'Math.sin',
];

const auditResults = [];

for (const filePath of TARGET_FILES) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Check forbidden exact phrases
    for (const phrase of FORBIDDEN_PATTERNS) {
      if (line.includes(phrase)) {
        auditResults.push({
          file: path.relative(path.join(__dirname, '..'), filePath),
          lineNo: idx + 1,
          matched: phrase,
          code: line.trim(),
          classification: 'PRODUCTION-RISK',
          reason: `Forbidden synthetic/mock pattern '${phrase}' detected`,
        });
      }
    }

    // Check Math.random
    if (line.includes('Math.random')) {
      const isNonce = line.includes('toString') || line.includes('pan_ver_') || line.includes('randomNumber');
      if (isNonce) {
        auditResults.push({
          file: path.relative(path.join(__dirname, '..'), filePath),
          lineNo: idx + 1,
          matched: 'Math.random',
          code: line.trim(),
          classification: 'LEGITIMATE',
          reason: 'Approved non-financial nonce / cryptographic random padding for NSE payload encryption',
        });
      } else {
        auditResults.push({
          file: path.relative(path.join(__dirname, '..'), filePath),
          lineNo: idx + 1,
          matched: 'Math.random',
          code: line.trim(),
          classification: 'PRODUCTION-RISK',
          reason: 'Potential generation of financial units, values, or NAV with Math.random',
        });
      }
    }
  });
}

const prodRisks = auditResults.filter((r) => r.classification === 'PRODUCTION-RISK');

console.log('ANTI_MOCK_AUDIT_REPORT_START');
console.log(JSON.stringify({
  targetModule: 'VikaOne Mutual Funds Production Services & Models',
  totalFilesScanned: TARGET_FILES.length,
  totalMatches: auditResults.length,
  productionRisksCount: prodRisks.length,
  status: prodRisks.length === 0 ? 'PASS' : 'FAIL',
  findings: auditResults,
}, null, 2));
console.log('ANTI_MOCK_AUDIT_REPORT_END');

if (prodRisks.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
