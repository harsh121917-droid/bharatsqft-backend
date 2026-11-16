const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Sip = require("../models/Sip");
const User = require("../models/User");
const sipController = require("../controllers/sipController");

test("SIP Model Schema: supports sipType and soldier goalCategory", () => {
    const sipPaths = Sip.schema.paths;
    assert.ok(sipPaths.sipType, "sipType should exist on Sip schema");
    assert.deepEqual(sipPaths.sipType.enumValues, ["veer_jawan", "simple"]);
    assert.equal(sipPaths.sipType.defaultValue, "simple");

    assert.ok(sipPaths.goalCategory, "goalCategory should exist on Sip schema");
    assert.ok(sipPaths.goalCategory.enumValues.includes("soldier"), "goalCategory should include soldier");
    assert.ok(sipPaths.goalCategory.enumValues.includes("car"), "goalCategory should include car");
});

test("SIP Controller & Admin APIs: getAdminSips and getAdminSipsSummary", async (t) => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bharatsqft";
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri);
    }

    // 1. Test getAdminSipsSummary returns categories breakdown
    const reqSummary = {};
    let summaryData = null;
    const resSummary = {
        json: (payload) => {
            summaryData = payload;
        }
    };

    await sipController.getAdminSipsSummary(reqSummary, resSummary, (err) => {
        if (err) throw err;
    });

    assert.ok(summaryData, "Summary response should not be null");
    assert.equal(summaryData.success, true, "Summary response should have success: true");
    assert.ok(summaryData.data, "Summary response data should exist");
    assert.ok(summaryData.data.categories, "Summary should have categories breakdown");
    assert.ok(summaryData.data.categories.veerJawan, "Summary categories should have veerJawan");
    assert.ok(summaryData.data.categories.simple, "Summary categories should have simple");
    assert.equal(typeof summaryData.data.categories.veerJawan.totalInvested, "number");
    assert.equal(typeof summaryData.data.categories.simple.totalInvested, "number");

    // 2. Test getAdminSips with all, veer_jawan, and simple filters
    const reqAll = { query: { page: 1, limit: 10 } };
    let allData = null;
    const resAll = {
        json: (payload) => {
            allData = payload;
        }
    };
    await sipController.getAdminSips(reqAll, resAll, (err) => {
        if (err) throw err;
    });

    assert.equal(allData.success, true);
    assert.ok(Array.isArray(allData.data));
    allData.data.forEach((sip) => {
        assert.ok(sip.sipType, "Each sip item should have sipType");
        assert.ok(["veer_jawan", "simple"].includes(sip.sipType));
        assert.ok(sip.sipTypeLabel, "Each sip item should have sipTypeLabel");
        assert.ok(sip.customerId, "Each sip item should have customerId");
    });

    // 3. Test getAdminSips with sipType="veer_jawan"
    const reqVJ = { query: { page: 1, limit: 10, sipType: "veer_jawan" } };
    let vjData = null;
    const resVJ = {
        json: (payload) => {
            vjData = payload;
        }
    };
    await sipController.getAdminSips(reqVJ, resVJ, (err) => {
        if (err) throw err;
    });

    assert.equal(vjData.success, true);
    assert.ok(Array.isArray(vjData.data));
    vjData.data.forEach((sip) => {
        assert.equal(sip.sipType, "veer_jawan");
        assert.equal(sip.sipTypeLabel, "Veer Jawan SIP");
    });

    // 4. Test getAdminSips with sipType="simple"
    const reqSimple = { query: { page: 1, limit: 10, sipType: "simple" } };
    let simpleData = null;
    const resSimple = {
        json: (payload) => {
            simpleData = payload;
        }
    };
    await sipController.getAdminSips(reqSimple, resSimple, (err) => {
        if (err) throw err;
    });

    assert.equal(simpleData.success, true);
    assert.ok(Array.isArray(simpleData.data));
    simpleData.data.forEach((sip) => {
        assert.equal(sip.sipType, "simple");
        assert.equal(sip.sipTypeLabel, "Simple SIP");
    });

    // 5. Test getSipDetail returns sipType and milestone journey
    if (allData.data.length > 0) {
        const testSipId = allData.data[0]._id;
        const reqDetail = {
            params: { id: testSipId },
            user: { role: "admin" }
        };
        let detailData = null;
        const resDetail = {
            json: (payload) => {
                detailData = payload;
            }
        };
        await sipController.getSipDetail(reqDetail, resDetail, (err) => {
            if (err) throw err;
        });

        assert.equal(detailData.success, true);
        assert.ok(detailData.data.sip);
        assert.ok(detailData.data.sip.sipType);
        assert.ok(detailData.data.sip.sipTypeLabel);
        assert.ok(detailData.data.sip.customerId);
        assert.ok(Array.isArray(detailData.data.journey));
    }

    // Close connection after test
    await mongoose.connection.close();
});
