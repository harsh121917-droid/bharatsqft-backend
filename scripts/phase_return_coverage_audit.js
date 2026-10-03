const { auditReturnCoverage } = require('./mutual_fund_return_coverage');

if (require.main === module) {
  auditReturnCoverage().catch((err) => {
    console.error('Audit error:', err);
    process.exit(1);
  });
}

module.exports = { auditReturnCoverage };
