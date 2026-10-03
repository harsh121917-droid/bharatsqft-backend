/**
 * VikaOne Mutual Fund — Source Health & Registry Monitor
 * Verifies official AMC sources, parser versions, fetch cadences, and status.
 */

const { AMC_REGISTRY, getAmcHealthMatrix } = require('../services/amcSourceRegistry');

function runSourceHealthAudit() {
  console.log('='.repeat(85));
  console.log('VIKAONE MUTUAL FUND — AMC SOURCE HEALTH & REGISTRY AUDIT');
  console.log('='.repeat(85));
  console.log(`Execution Time: ${new Date().toISOString()}\n`);

  const matrix = getAmcHealthMatrix();
  console.log(`Total Registered Official AMCs: ${matrix.length}\n`);

  console.log(
    'AMC Code'.padEnd(24) +
    'Status'.padEnd(16) +
    'Cadence'.padEnd(12) +
    'Parser'.padEnd(14) +
    'Last Success'
  );
  console.log('-'.repeat(85));

  let verifiedCount = 0;
  let failedCount = 0;

  for (const amc of matrix) {
    console.log(
      amc.amcCode.padEnd(24) +
      amc.status.padEnd(16) +
      amc.cadence.padEnd(12) +
      amc.parserVersion.padEnd(14) +
      (amc.lastSuccessfulFetch ? amc.lastSuccessfulFetch.split('T')[0] : 'NEVER')
    );

    if (amc.status === 'LIVE_VERIFIED') {
      verifiedCount++;
    } else {
      failedCount++;
    }
  }

  console.log('-'.repeat(85));
  console.log(`Total Verified AMCs:   ${verifiedCount} / ${matrix.length}`);
  console.log(`Total Failed / Stale:  ${failedCount} / ${matrix.length}`);
  console.log(`Rating Source Status:  SOURCE_NOT_AUTHORIZED (No uncontracted scraping)`);
  console.log('='.repeat(85));

  return {
    totalAmcs: matrix.length,
    verifiedCount,
    failedCount,
    matrix,
  };
}

if (require.main === module) {
  runSourceHealthAudit();
}

module.exports = { runSourceHealthAudit };
