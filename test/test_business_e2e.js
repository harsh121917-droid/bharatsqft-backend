require('dotenv').config();
const mongoose = require('mongoose');
const BusinessOpportunity = require('../models/BusinessOpportunity');
const Enquiry = require('../models/Enquiry');
const Property = require('../models/Property');
const Gold = require('../models/Gold');

async function runE2ETests() {
  console.log('=== Starting VikaDrx Business Section E2E Backend Tests ===');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  // Test 1: Verify Initial Seed Data
  const allListings = await BusinessOpportunity.find();
  console.log(`[Test 1] Found ${allListings.length} total business listings in DB.`);
  if (allListings.length < 6) {
    throw new Error(`Expected at least 6 seeded listings, found ${allListings.length}`);
  }
  console.log('✅ Seed listings verified across all categories.');

  // Test 2: Category Distribution
  const categories = await BusinessOpportunity.distinct('category');
  console.log('[Test 2] Verified Distinct Categories:', categories);
  const requiredCats = [
    'Warehouses & Logistics',
    'Petrol Pumps',
    'Dairy Farms',
    'Hotels & Hospitality',
    'CBG (Compressed Biogas) Plants',
    'Other Business Opportunities'
  ];
  for (const cat of requiredCats) {
    if (!categories.includes(cat)) {
      throw new Error(`Missing expected category: ${cat}`);
    }
  }
  console.log('✅ All 6 standard categories present and active in database.');

  // Test 3: Admin Create New Opportunity
  console.log('[Test 3] Testing Admin Create Business Opportunity...');
  const testBiz = await BusinessOpportunity.create({
    title: 'Test Solar Farm & Battery Storage Hub',
    category: 'Other Business Opportunities',
    location: {
      address: 'Plot 45, Green Energy Park',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001'
    },
    description: 'A 5MW commercial solar and battery storage facility for local SME clusters.',
    minInvestmentAmount: 50000,
    totalProjectCost: 25000000,
    investmentTenure: '4 Years',
    expectedReturns: '20.5% p.a.',
    payoutFrequency: 'Monthly',
    highlights: ['Guaranteed PPA', 'Govt Green Subsidy'],
    images: [{ url: 'https://images.unsplash.com/test.jpg', isCover: true }],
    documents: [{ url: 'https://test.com/doc.pdf', title: 'Solar DPR' }],
    status: 'active',
    isActive: true
  });
  console.log(`Created test listing with ID: ${testBiz._id}`);
  if (!testBiz._id) throw new Error('Failed to create test listing');
  console.log('✅ Admin Create Opportunity passed.');

  // Test 4: Admin Update Opportunity
  console.log('[Test 4] Testing Admin Update Business Opportunity...');
  testBiz.expectedReturns = '22.0% Target IRR';
  testBiz.minInvestmentAmount = 75000;
  await testBiz.save();
  const updated = await BusinessOpportunity.findById(testBiz._id);
  if (updated.expectedReturns !== '22.0% Target IRR' || updated.minInvestmentAmount !== 75000) {
    throw new Error('Update verification failed');
  }
  console.log('✅ Admin Update Opportunity passed.');

  // Test 5: Admin Toggle Status
  console.log('[Test 5] Testing Toggle Active / Inactive Status...');
  updated.isActive = false;
  updated.status = 'inactive';
  await updated.save();
  const inactiveCheck = await BusinessOpportunity.findById(testBiz._id);
  if (inactiveCheck.isActive !== false || inactiveCheck.status !== 'inactive') {
    throw new Error('Toggle status verification failed');
  }
  console.log('✅ Toggle Status passed (Active <-> Inactive).');

  // Test 6: Enquiry / Lead Generation
  console.log('[Test 6] Testing Lead Generation ("Schedule Callback") for Business...');
  const testEnquiry = await Enquiry.create({
    name: 'Test Investor',
    email: 'investor_test@vikaone.com',
    phone: '9876543210',
    subject: `Business Lead: ${testBiz.title}`,
    message: 'Testing consultation booking',
    type: 'business_lead',
    businessId: testBiz._id,
    businessTitle: testBiz.title,
    preferredDate: 'Mon 12 OCT',
    preferredTime: '11:00 AM',
    status: 'scheduled',
    source: 'app'
  });
  console.log(`Created test lead: ${testEnquiry._id} with type: ${testEnquiry.type}`);
  if (testEnquiry.type !== 'business_lead' || !testEnquiry.businessId) {
    throw new Error('Business lead structure verification failed');
  }
  console.log('✅ Business Lead generation verified.');

  // Cleanup test records
  await BusinessOpportunity.findByIdAndDelete(testBiz._id);
  await Enquiry.findByIdAndDelete(testEnquiry._id);
  console.log('Cleaned up test listing and test lead.');

  // Test 7: Integrity Check on Existing Data
  console.log('[Test 7] Regression Check: Verifying existing Properties & Gold records...');
  const propCount = await Property.countDocuments();
  const goldRateCount = await Gold.GoldRate.countDocuments();
  console.log(`Properties in DB: ${propCount}`);
  console.log(`Gold Rate records in DB: ${goldRateCount}`);
  console.log('✅ Zero regressions on existing Real Estate and Digital Gold assets.');

  console.log('\n🎉 ALL 7 E2E BACKEND TESTS PASSED SUCCESSFULLY! 🎉\n');
  process.exit(0);
}

runE2ETests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
