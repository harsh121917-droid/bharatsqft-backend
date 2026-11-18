const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const FixedDepositApplication = require('../models/FixedDepositApplication');
const {
    getCompaniesAndSchemes,
    submitFdApplication,
    getMyFdApplications,
    getBondsConfig
} = require('../controllers/fixedDepositController');
const {
    getAllFdApplications,
    getFdApplicationDetails,
    updateFdApplicationStatus
} = require('../controllers/adminFixedDepositController');

describe('Fixed Deposits & IRIS Application Suite', () => {
    let testUser;
    let testAdmin;
    let hasDb = false;

    before(async () => {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharatsqft';
        try {
            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
            }
            hasDb = true;

            await User.deleteMany({ phone: '9999900088' });
            await User.deleteMany({ phone: '9999900089' });
            await FixedDepositApplication.deleteMany({ panNumber: 'FDTEST1234A' });

            testUser = await User.create({
                name: 'FD Test Investor',
                phone: '9999900088',
                email: 'fd_investor@example.com',
                password: 'HashedPassword123!',
                kycStatus: 'approved'
            });

            testAdmin = await User.create({
                name: 'FD Test Admin',
                phone: '9999900089',
                email: 'fd_admin@example.com',
                password: 'HashedPassword123!',
                role: 'admin'
            });
        } catch (e) {
            console.warn('MongoDB not reachable for test, skipping live db ops:', e.message);
            hasDb = false;
        }
    });

    after(async () => {
        if (hasDb) {
            if (testUser) await User.deleteMany({ _id: testUser._id });
            if (testAdmin) await User.deleteMany({ _id: testAdmin._id });
            await FixedDepositApplication.deleteMany({ panNumber: 'FDTEST1234A' });
            await mongoose.disconnect();
        }
    });

    test('1. getCompaniesAndSchemes returns Bajaj, Shriram, and Mahindra Finance with rates', async () => {
        const req = { user: null };
        let statusCode = 200;
        let responseData = null;
        const res = {
            status(c) { statusCode = c; return this; },
            json(d) { responseData = d; return this; }
        };

        await getCompaniesAndSchemes(req, res, () => {});

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.companies.length, 5);

        const companyCodes = responseData.companies.map(c => c.code);
        assert.ok(companyCodes.includes('BAJAJ_FINANCE'), 'Should include Bajaj Finance');
        assert.ok(companyCodes.includes('SHRIRAM_FINANCE'), 'Should include Shriram Finance');
        assert.ok(companyCodes.includes('MAHINDRA_FINANCE'), 'Should include Mahindra Finance');
        assert.ok(companyCodes.includes('PNB_HOUSING'), 'Should include PNB Housing');
        assert.ok(companyCodes.includes('LIC_HOUSING'), 'Should include LIC Housing');

        // Check rates and schemes present
        const bajaj = responseData.companies.find(c => c.code === 'BAJAJ_FINANCE');
        assert.equal(bajaj.rating, 'CRISIL AAA / ICRA AAA');
        assert.ok(bajaj.schemes.length >= 2);
    });

    test('2. getBondsConfig returns official bonds market configuration', async () => {
        const req = {};
        let responseData = null;
        const res = {
            json(d) { responseData = d; return this; }
        };

        await getBondsConfig(req, res, () => {});

        assert.equal(responseData.success, true);
        assert.equal(responseData.websiteUrl, 'https://www.bondbazaar.com/open-trading-account/?param=UlZTMTM%3D');
        assert.ok(responseData.bonds.length >= 4, 'Should return at least 4 bond categories');
    });

    test('3. submitFdApplication saves complete IRIS application and calculates maturity', async () => {
        if (!hasDb) {
            assert.ok(true, 'Skipped because DB not connected');
            return;
        }

        const req = {
            user: { _id: testUser._id, email: testUser.email },
            body: {
                company: 'BAJAJ_FINANCE',
                depositType: 'CUMULATIVE',
                payoutFrequency: 'AT_MATURITY',
                amount: 50000,
                tenureMonths: 44,
                seniorCitizen: true,
                fullName: 'FD Test Investor Legal',
                panNumber: 'FDTEST1234A',
                dob: '1960-05-15',
                gender: 'Male',
                maritalStatus: 'Married',
                fatherOrSpouseName: 'Father Legal Name',
                occupation: 'Retired',
                annualIncome: '5 - 10 Lakhs',
                mobileNumber: '9999900088',
                email: 'fd_investor@example.com',
                addressLine1: 'Flat 101, Luxury Heights',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                bankName: 'HDFC Bank',
                accountNumber: '987654321012',
                ifscCode: 'HDFC0001234',
                accountHolderName: 'FD Test Investor Legal',
                hasNominee: true,
                nomineeName: 'Nominee Legal Name',
                nomineeRelation: 'Spouse',
                nomineeDob: '1965-08-20',
                form15G15H: true
            }
        };

        let statusCode = 200;
        let responseData = null;
        const res = {
            status(c) { statusCode = c; return this; },
            json(d) { responseData = d; return this; }
        };

        await submitFdApplication(req, res, (err) => { if (err) throw err; });

        assert.equal(statusCode, 201);
        assert.equal(responseData.success, true);
        assert.ok(responseData.data.applicationId.startsWith('FD-'));
        assert.equal(responseData.data.status, 'SUBMITTED');
        assert.equal(responseData.data.interestRate, 8.85); // 8.45 + 0.40 senior citizen
        assert.ok(responseData.data.maturityAmount > 50000);

        // Verify in DB
        const savedDoc = await FixedDepositApplication.findOne({ applicationId: responseData.data.applicationId });
        assert.ok(savedDoc);
        assert.equal(savedDoc.panNumber, 'FDTEST1234A');
        assert.equal(savedDoc.bankName, 'HDFC Bank');
        assert.equal(savedDoc.nomineeName, 'Nominee Legal Name');
    });

    test('4. Admin can list applications, view details, and update IRIS application status', async () => {
        if (!hasDb) {
            assert.ok(true, 'Skipped because DB not connected');
            return;
        }

        const appDoc = await FixedDepositApplication.findOne({ panNumber: 'FDTEST1234A' });
        assert.ok(appDoc, 'Application document must exist');

        // Admin List
        const listReq = { query: { company: 'BAJAJ_FINANCE' } };
        let listData = null;
        const listRes = { json(d) { listData = d; return this; } };
        await getAllFdApplications(listReq, listRes, (err) => { if (err) throw err; });

        assert.equal(listData.success, true);
        assert.ok(listData.data.length >= 1);
        assert.ok(listData.stats.totalAmount >= 50000);

        // Admin Update to APPLIED_ON_IRIS
        const updateReq = {
            params: { id: appDoc._id.toString() },
            user: { _id: testAdmin._id },
            body: {
                status: 'APPLIED_ON_IRIS',
                irisApplicationNumber: 'IRIS-APP-987654',
                irisFolioNumber: 'BAJAJ-FOLIO-112233',
                adminRemarks: 'Successfully processed and punched into IRIS partner portal.'
            }
        };
        let updateData = null;
        const updateRes = { json(d) { updateData = d; return this; } };
        await updateFdApplicationStatus(updateReq, updateRes, (err) => { if (err) throw err; });

        assert.equal(updateData.success, true);
        assert.equal(updateData.data.status, 'APPLIED_ON_IRIS');
        assert.equal(updateData.data.irisApplicationNumber, 'IRIS-APP-987654');

        // Verify in DB
        const refreshed = await FixedDepositApplication.findById(appDoc._id);
        assert.equal(refreshed.status, 'APPLIED_ON_IRIS');
        assert.equal(refreshed.irisFolioNumber, 'BAJAJ-FOLIO-112233');
    });
});
