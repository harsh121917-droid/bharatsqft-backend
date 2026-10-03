require('dotenv').config();
const mongoose = require('mongoose');
const mfPortfolioIngestionService = require('../services/mfPortfolioIngestionService');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('[Ingestion] Connected to MongoDB');

  const res = await mfPortfolioIngestionService.ingestAllDisclosures();
  console.log('[Ingestion Results]:', JSON.stringify(res, null, 2));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
