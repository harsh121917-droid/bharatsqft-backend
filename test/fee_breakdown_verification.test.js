const test = require("node:test");
const assert = require("node:assert");
const { getFeeBreakdown, getUserTransactions } = require("../controllers/adminController");

test("GST and Platform Fee Breakdown Controller Verification", async (t) => {
    await t.test("getFeeBreakdown function exists and is a valid middleware handler", () => {
        assert.strictEqual(typeof getFeeBreakdown, "function");
    });

    await t.test("getUserTransactions function exists and is a valid middleware handler", () => {
        assert.strictEqual(typeof getUserTransactions, "function");
    });
});
