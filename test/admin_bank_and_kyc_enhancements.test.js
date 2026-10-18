const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Kyc = require('../models/Kyc');
const BankAccount = require('../models/BankAccount');
const { updateUserBank, oneClickApproveKyc } = require('../controllers/adminController');
const { bulkReviewKyc } = require('../controllers/kycController');

describe('Admin Bank Details and KYC Enhancements', () => {
    let testAdminUser;
    let testCustomer1;
    let testCustomer2;
    let testKyc1;
    let testKyc2;

    before(async () => {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (uri && mongoose.connection.readyState === 0) {
            await mongoose.connect(uri);
        }

        const timestamp = Date.now();

        testAdminUser = await User.create({
            name: `Test Admin ${timestamp}`,
            email: `admin_${timestamp}@example.com`,
            phone: `999${String(timestamp).slice(-7)}`,
            password: 'password123',
            role: 'admin',
        });

        testCustomer1 = await User.create({
            name: `Test Customer 1 ${timestamp}`,
            email: `customer1_${timestamp}@example.com`,
            phone: `998${String(timestamp).slice(-7)}`,
            password: 'password123',
            role: 'user',
            kycStatus: 'pending',
        });

        testCustomer2 = await User.create({
            name: `Test Customer 2 ${timestamp}`,
            email: `customer2_${timestamp}@example.com`,
            phone: `997${String(timestamp).slice(-7)}`,
            password: 'password123',
            role: 'user',
            kycStatus: 'pending',
        });

        testKyc1 = await Kyc.create({
            user: testCustomer1._id,
            fullName: testCustomer1.name,
            panNumber: 'ABCDE1234F',
            status: 'pending',
            bankDetails: {
                bankName: 'Old Bank',
                accountNumber: '111122223333',
                ifscCode: 'OLDB0001234',
                accountHolderName: testCustomer1.name,
            }
        });

        testKyc2 = await Kyc.create({
            user: testCustomer2._id,
            fullName: testCustomer2.name,
            panNumber: 'VWXYZ5678G',
            status: 'pending',
            bankDetails: {
                bankName: 'Old Bank 2',
                accountNumber: '444455556666',
                ifscCode: 'OLDB0005678',
                accountHolderName: testCustomer2.name,
            }
        });
    });

    after(async () => {
        if (testAdminUser) await User.findByIdAndDelete(testAdminUser._id);
        if (testCustomer1) {
            await User.findByIdAndDelete(testCustomer1._id);
            await Kyc.deleteMany({ user: testCustomer1._id });
            await BankAccount.deleteMany({ user: testCustomer1._id });
        }
        if (testCustomer2) {
            await User.findByIdAndDelete(testCustomer2._id);
            await Kyc.deleteMany({ user: testCustomer2._id });
            await BankAccount.deleteMany({ user: testCustomer2._id });
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });

    it('1. updateUserBank successfully updates BankAccount and Kyc bankDetails for a user', async () => {
        const req = {
            params: { id: testCustomer1._id.toString() },
            body: {
                bankName: 'HDFC Bank',
                accountHolder: 'Test Customer 1 Updated',
                accountNumber: '50100998877665',
                ifsc: 'HDFC0001234',
                accountType: 'savings',
                isVerified: true
            },
            user: testAdminUser
        };

        let responseData = null;
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(data) { responseData = data; return this; }
        };
        const next = (err) => { if (err) throw err; };

        await updateUserBank(req, res, next);

        assert.ok(responseData, 'Response data must exist');
        assert.equal(responseData.success, true, 'updateUserBank must return success: true');
        assert.equal(responseData.data.bankName, 'HDFC Bank');
        assert.equal(responseData.data.accountNumber, '50100998877665');
        assert.equal(responseData.data.ifsc, 'HDFC0001234');

        // Verify database persistence
        const bankRecord = await BankAccount.findOne({ user: testCustomer1._id });
        assert.ok(bankRecord, 'BankAccount record must exist in DB');
        assert.equal(bankRecord.bankName, 'HDFC Bank');
        assert.equal(bankRecord.accountNumber, '50100998877665');
        assert.equal(bankRecord.isVerified, true);

        const updatedKyc = await Kyc.findOne({ user: testCustomer1._id });
        assert.equal(updatedKyc.bankDetails.bankName, 'HDFC Bank');
        assert.equal(updatedKyc.bankDetails.accountNumber, '50100998877665');
    });

    it('2. oneClickApproveKyc approves user KYC instantly and sets verified status', async () => {
        const req = {
            params: { id: testCustomer1._id.toString() },
            user: testAdminUser
        };

        let responseData = null;
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(data) { responseData = data; return this; }
        };
        const next = (err) => { if (err) throw err; };

        await oneClickApproveKyc(req, res, next);

        assert.ok(responseData);
        assert.equal(responseData.success, true);
        assert.equal(responseData.data.kycStatus, 'approved');

        // Verify User and Kyc models are approved
        const refreshedUser = await User.findById(testCustomer1._id);
        assert.equal(refreshedUser.kycStatus, 'approved');

        const refreshedKyc = await Kyc.findOne({ user: testCustomer1._id });
        assert.equal(refreshedKyc.status, 'approved');
        assert.equal(refreshedKyc.panVerified, true);
        assert.equal(refreshedKyc.verificationSource, 'ADMIN_DOCUMENT_VERIFIED');
    });

    it('3. bulkReviewKyc multiple approves selected pending KYC records', async () => {
        const req = {
            body: {
                ids: [testKyc1._id.toString(), testKyc2._id.toString()],
                status: 'approved'
            },
            user: testAdminUser
        };

        let responseData = null;
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(data) { responseData = data; return this; }
        };
        const next = (err) => { if (err) throw err; };

        await bulkReviewKyc(req, res, next);

        assert.ok(responseData);
        assert.equal(responseData.success, true);
        assert.equal(responseData.processedCount, 2);

        const [k1, k2, u1, u2] = await Promise.all([
            Kyc.findById(testKyc1._id),
            Kyc.findById(testKyc2._id),
            User.findById(testCustomer1._id),
            User.findById(testCustomer2._id),
        ]);

        assert.equal(k1.status, 'approved');
        assert.equal(k2.status, 'approved');
        assert.equal(u1.kycStatus, 'approved');
        assert.equal(u2.kycStatus, 'approved');
    });

    it('4. bulkReviewKyc multiple rejects selected KYC records with reason', async () => {
        const req = {
            body: {
                ids: [testKyc2._id.toString()],
                status: 'rejected',
                rejectionReason: 'Invalid document photo uploaded'
            },
            user: testAdminUser
        };

        let responseData = null;
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(data) { responseData = data; return this; }
        };
        const next = (err) => { if (err) throw err; };

        await bulkReviewKyc(req, res, next);

        assert.ok(responseData);
        assert.equal(responseData.success, true);
        assert.equal(responseData.processedCount, 1);

        const [k2, u2] = await Promise.all([
            Kyc.findById(testKyc2._id),
            User.findById(testCustomer2._id),
        ]);

        assert.equal(k2.status, 'rejected');
        assert.equal(k2.rejectionReason, 'Invalid document photo uploaded');
        assert.equal(u2.kycStatus, 'rejected');
    });
});
