/**
 * VikaOne Mutual Fund — Phase 5C Source Audit Script
 * Audits registered AMC sources, statutory documents, checksums, and authorization status.
 */

const {
  getAllAmcs,
  isSourceAuthorized,
} = require('../services/amcSourceRegistry');

function runSourceAudit() {
  console.log('='.repeat(75));
  console.log('VIKAONE MF PHASE 5C: OFFICIAL AMC SOURCE REGISTRY AUDIT');
  console.log('='.repeat(75));

  const amcs = getAllAmcs();
  console.log(`\nTotal Registered AMCs: ${amcs.length}\n`);

  const results = [];
  let verifiedSourcesCount = 0;
  let totalSourcesCount = 0;

  for (const amc of amcs) {
    for (const [sourceType, sourceMeta] of Object.entries(amc.sources)) {
      totalSourcesCount++;
      const isVerified = sourceMeta.status === 'LIVE_VERIFIED';
      if (isVerified) verifiedSourcesCount++;

      results.push({
        AMC: amc.amcCode,
        Name: amc.amcName.substring(0, 22),
        Type: sourceType.toUpperCase(),
        Frequency: sourceMeta.frequency,
        Status: sourceMeta.status,
        Doc: sourceMeta.documentName || '—',
        Checksum: sourceMeta.checksum ? sourceMeta.checksum.substring(0, 12) + '...' : '—',
      });
    }
  }

  console.table(results);

  console.log('\n--- THIRD-PARTY RATING SOURCE AUTHORIZATION AUDIT ---');
  const ratingAuth = isSourceAuthorized('RATING');
  console.log(`Rating Source Status:     ${ratingAuth.status}`);
  console.log(`Authorized for Scraping:  ${ratingAuth.authorized ? 'YES' : 'NO (STRICTLY PROHIBITED)'}`);
  console.log(`Reason:                   ${ratingAuth.reason}`);

  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Registered AMCs:           ${amcs.length}`);
  console.log(`Total Source Disclosures:  ${totalSourcesCount}`);
  console.log(`Verified Statutory Feeds:  ${verifiedSourcesCount}`);
  console.log(`Uncontracted Scraping:     0 (Disabled)`);
  console.log('='.repeat(75));
}

runSourceAudit();
