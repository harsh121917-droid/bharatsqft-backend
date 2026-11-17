const test = require("node:test");
const assert = require("node:assert/strict");
const { isStrongBankNameMatch } = require("../services/nameMatchingService");
const { sanitizeKycDto, verifyCashfreePan } = require("../controllers/kycController");
const Kyc = require("../models/Kyc");

test("Name Matching Service - strict cross identity verification", () => {
    // 1. Cross-identity mismatch (Ashahad Samir Shaikh vs Vikas Ashok Saini)
    const mismatch1 = isStrongBankNameMatch("ASHAHAD SAMIR SHAIKH", "VIKAS ASHOK SAINI");
    assert.equal(mismatch1.match, false, "Must reject different individuals");
    assert.equal(mismatch1.reason, "TOKEN_CONFLICT_SURNAME_MISMATCH");

    // 2. Exact match
    const matchExact = isStrongBankNameMatch("ASHAHAD SAMIR SHAIKH", "ASHAHAD SAMIR SHAIKH");
    assert.equal(matchExact.match, true);

    // 3. Transposed name matching (UIDAI vs PAN format)
    const matchTransposed = isStrongBankNameMatch("ASHAHAD SAMIR SHAIKH", "SHAIKH ASHAHAD SAMIR");
    assert.equal(matchTransposed.match, true);

    // 4. Two-token vs three-token same person
    const matchTwoToken = isStrongBankNameMatch("ASHAHAD SHAIKH", "ASHAHAD SAMIR SHAIKH");
    assert.equal(matchTwoToken.match, true);

    // 5. Surname conflict with same first name
    const surnameConflict = isStrongBankNameMatch("VIKAS SAINI", "VIKAS SHARMA");
    assert.equal(surnameConflict.match, false);
});

test("Kyc Schema includes identity verification & cross-match flags", () => {
    const paths = Kyc.schema.paths;
    assert.ok(paths.aadhaarVerified, "aadhaarVerified path must exist");
    assert.ok(paths.aadhaarRegisteredName, "aadhaarRegisteredName path must exist");
    assert.ok(paths.panAadhaarNameMatched, "panAadhaarNameMatched path must exist");
});

test("sanitizeKycDto - masks Aadhaar and exports name matching status", () => {
    const rawKyc = {
        _id: "507f1f77bcf86cd799439011",
        fullName: "ASHAHAD SAMIR SHAIKH",
        panNumber: "ABCDE1234F",
        panVerified: true,
        panRegisteredName: "ASHAHAD SAMIR SHAIKH",
        aadhaarNumber: "123456789012",
        aadhaarVerified: true,
        aadhaarRegisteredName: "ASHAHAD SAMIR SHAIKH",
        panAadhaarNameMatched: true,
        status: "approved",
    };

    const sanitized = sanitizeKycDto(rawKyc);
    assert.equal(sanitized.fullName, "ASHAHAD SAMIR SHAIKH");
    assert.equal(sanitized.panAadhaarNameMatched, true);
    assert.equal(sanitized.aadhaarVerified, true);
    assert.equal(sanitized.maskedAadhaar, "XXXX-XXXX-9012", "Must properly mask Aadhaar keeping last 4 digits");
    assert.equal(sanitized.aadhaarNumber, "XXXX-XXXX-9012");
    assert.equal(sanitized.panNumberMasked, "AB******4F");
});

test("verifyCashfreePan - rejects mismatched PAN name against verified Aadhaar", async () => {
    process.env.NODE_ENV = "test";

    // Mock Kyc.findOne to return existing record with verified Aadhaar under Ashahad Samir Shaikh
    const originalFindOne = Kyc.findOne;
    const originalFindByIdAndUpdate = Kyc.findByIdAndUpdate;

    try {
        Kyc.findOne = (query) => ({
            select: () => Promise.resolve({
                _id: "kyc_123",
                user: "user_123",
                fullName: "ASHAHAD SAMIR SHAIKH",
                aadhaarVerified: true,
                aadhaarRegisteredName: "ASHAHAD SAMIR SHAIKH",
                aadhaarNumber: "123456789012"
            })
        });

        let statusSent = null;
        let jsonSent = null;
        const res = {
            status: (code) => {
                statusSent = code;
                return {
                    json: (data) => {
                        jsonSent = data;
                        return data;
                    }
                };
            },
            json: (data) => {
                statusSent = 200;
                jsonSent = data;
                return data;
            }
        };

        // Attempt to verify Vikas Sir's PAN for Ashahad's Aadhaar account
        const reqMismatch = {
            body: {
                pan: "BNWPS7663F",
                name: "VIKAS ASHOK SAINI"
            },
            user: {
                _id: "user_123",
                name: "Ashahad Shaikh",
                kycStatus: "pending"
            }
        };

        await verifyCashfreePan(reqMismatch, res, () => {});

        assert.equal(statusSent, 400, "Must return HTTP 400 on identity mismatch");
        assert.equal(jsonSent.code, "PAN_AADHAAR_NAME_MISMATCH", "Must return PAN_AADHAAR_NAME_MISMATCH code");
        assert.equal(jsonSent.valid, false);
        assert.ok(jsonSent.message.includes("does not match your verified Aadhaar name"));

        // Now attempt with matching name (transposed format: Shaikh Ashahad Samir)
        const User = require("../models/User");
        const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
        User.findByIdAndUpdate = () => Promise.resolve({});

        Kyc.findByIdAndUpdate = (id, payload) => ({
            select: () => Promise.resolve({
                ...payload,
                _id: id,
                toObject: () => ({ ...payload, _id: id })
            })
        });

        const reqMatch = {
            body: {
                pan: "BNWPS7663F",
                name: "SHAIKH ASHAHAD SAMIR"
            },
            user: {
                _id: "user_123",
                name: "Ashahad Shaikh",
                kycStatus: "pending",
                save: () => Promise.resolve()
            }
        };

        let matchStatus = null;
        let matchJson = null;
        const resMatch = {
            status: (code) => {
                matchStatus = code;
                return {
                    json: (data) => {
                        matchJson = data;
                        return data;
                    }
                };
            },
            json: (data) => {
                matchStatus = 200;
                matchJson = data;
                return data;
            }
        };

        await verifyCashfreePan(reqMatch, resMatch, (err) => { if (err) console.error("Match next error:", err); });

        User.findByIdAndUpdate = origUserFindByIdAndUpdate;

        assert.equal(matchStatus, 200, "Must approve when names belong to same individual");
        assert.equal(matchJson.valid, true);
        assert.equal(matchJson.panAadhaarNameMatched, true);
    } finally {
        Kyc.findOne = originalFindOne;
        Kyc.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
});

test("verifyCashfreeOtp - rejects mismatched Aadhaar OTP when PAN is already verified", async () => {
    const { verifyCashfreeOtp } = require("../controllers/kycController");
    const originalFindOne = Kyc.findOne;

    try {
        // User has already verified PAN as "VIKAS ASHOK SAINI"
        Kyc.findOne = () => ({
            select: () => Promise.resolve({
                _id: "kyc_456",
                user: "user_456",
                fullName: "VIKAS ASHOK SAINI",
                panVerified: true,
                panRegisteredName: "VIKAS ASHOK SAINI",
                panNumber: "BNWPS7663F"
            })
        });

        let statusSent = null;
        let jsonSent = null;
        const res = {
            status: (code) => {
                statusSent = code;
                return {
                    json: (data) => {
                        jsonSent = data;
                        return data;
                    }
                };
            },
            json: (data) => {
                statusSent = 200;
                jsonSent = data;
                return data;
            }
        };

        // When mock / missing refId or otp
        const reqMissing = {
            body: { otp: "", refId: "" },
            user: { _id: "user_456" }
        };
        await verifyCashfreeOtp(reqMissing, res, () => {});
        assert.equal(statusSent, 400);
    } finally {
        Kyc.findOne = originalFindOne;
    }
});

test("submitKyc - enforces applicant and bank account holder name consistency", async () => {
    const { submitKyc } = require("../controllers/kycController");
    const originalFindOne = Kyc.findOne;
    Kyc.findOne = () => Promise.resolve(null);

    try {
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status: (code) => {
                statusSent = code;
                return {
                    json: (data) => {
                        jsonSent = data;
                        return data;
                    }
                };
            },
            json: (data) => {
                statusSent = 200;
                jsonSent = data;
                return data;
            }
        };

        const reqMismatchBank = {
            body: {
                fullName: "ASHAHAD SAMIR SHAIKH",
                dob: "1998-05-12",
                "address.line1": "Flat 201, Green View",
                "address.city": "Mumbai",
                "address.state": "Maharashtra",
                "address.pincode": "400001",
                panNumber: "ABCDE1234F",
                aadhaarNumber: "123456789012",
                "bankDetails.accountHolderName": "VIKAS ASHOK SAINI",
                "bankDetails.accountNumber": "987654321012",
                "bankDetails.ifscCode": "SBIN0001234",
                isPhotoOnly: false
            },
            files: {
                panImage: [{ path: "uploads/pan.jpg" }],
                aadhaarFront: [{ path: "uploads/af.jpg" }],
                aadhaarBack: [{ path: "uploads/ab.jpg" }]
            },
            user: { _id: "user_789", name: "Ashahad Shaikh" }
        };

        await submitKyc(reqMismatchBank, res, (err) => { if (err) console.error("submitKyc err:", err); });
        assert.equal(statusSent, 400);
        assert.equal(jsonSent.code, "BANK_NAME_MISMATCH");
        assert.ok(jsonSent.message.includes("does not match applicant name"));
    } finally {
        Kyc.findOne = originalFindOne;
    }
});
