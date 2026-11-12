const { describe, it } = require("node:test");
const assert = require("node:assert");
const adminController = require("../controllers/adminController");
const User = require("../models/User");

describe("Company Bank Details Visibility Test", () => {
    it("adminController has toggleCompanyBankVisibility function", () => {
        assert.strictEqual(typeof adminController.toggleCompanyBankVisibility, "function");
    });

    it("User schema defines showCompanyBankDetails with default false", () => {
        const schema = User.schema;
        const path = schema.path("showCompanyBankDetails");
        assert.ok(path, "showCompanyBankDetails path must exist on User schema");
        assert.strictEqual(path.instance, "Boolean");
        assert.strictEqual(path.defaultValue, false);
    });
});
