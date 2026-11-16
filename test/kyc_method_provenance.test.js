const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveKycMethodInfo } = require("../controllers/kycController");
const Kyc = require("../models/Kyc");

test("KYC Method Provenance - resolveKycMethodInfo correctly resolves channels", () => {
    // 1. Cashfree PAN
    const cashfreePan = resolveKycMethodInfo({ verificationSource: "CASHFREE_GOVT_NSDL" });
    assert.equal(cashfreePan.kycMethod, "cashfree");
    assert.equal(cashfreePan.kycMethodLabel, "⚡ Cashfree PAN");
    assert.equal(cashfreePan.kycMethodBadge, "badge-success");

    // 2. Cashfree Aadhaar
    const cashfreeAadhaar = resolveKycMethodInfo({ verificationSource: "CASHFREE_AADHAAR_OKYC" });
    assert.equal(cashfreeAadhaar.kycMethod, "cashfree");
    assert.equal(cashfreeAadhaar.kycMethodLabel, "⚡ Cashfree Aadhaar");
    assert.equal(cashfreeAadhaar.kycMethodBadge, "badge-success");

    // 3. Mutual Funds / NSE / KRA
    const mfNse = resolveKycMethodInfo({ verificationSource: "NSE_MFSS_KYC_VERIFY" });
    assert.equal(mfNse.kycMethod, "mutual_funds");
    assert.equal(mfNse.kycMethodLabel, "📈 Mutual Funds (NSE/KRA)");
    assert.equal(mfNse.kycMethodBadge, "badge-purple");

    const mfKra = resolveKycMethodInfo({ kraName: "CAMSKRA", verificationSource: undefined });
    assert.equal(mfKra.kycMethod, "mutual_funds");

    // 4. Manual Photo Upload
    const manualUpload = resolveKycMethodInfo({ verificationSource: "MANUAL_PHOTO_UPLOAD" });
    assert.equal(manualUpload.kycMethod, "manual_upload");
    assert.equal(manualUpload.kycMethodLabel, "📸 Photo Upload");
    assert.equal(manualUpload.kycMethodBadge, "badge-amber");

    // 5. Digio
    const digio = resolveKycMethodInfo({ verificationSource: "DIGIO_DIGITAL_KYC" });
    assert.equal(digio.kycMethod, "digio");
    assert.equal(digio.kycMethodLabel, "✍️ Digio e-Sign");

    // 6. Admin
    const admin = resolveKycMethodInfo({ verificationSource: "ADMIN_DOCUMENT_VERIFIED" });
    assert.equal(admin.kycMethod, "admin");
    assert.equal(admin.kycMethodLabel, "🛡️ Admin Manual");

    // 7. Fallback / Null
    const empty = resolveKycMethodInfo(null);
    assert.equal(empty.kycMethod, "manual_upload");
});

test("Kyc Schema verificationSource includes new methods", () => {
    const enumValues = Kyc.schema.path("verificationSource").enumValues;
    assert.ok(enumValues.includes("CASHFREE_GOVT_NSDL"));
    assert.ok(enumValues.includes("CASHFREE_AADHAAR_OKYC"));
    assert.ok(enumValues.includes("NSE_MFSS_KYC_VERIFY"));
    assert.ok(enumValues.includes("MANUAL_PHOTO_UPLOAD"));
    assert.ok(enumValues.includes("DIGIO_DIGITAL_KYC"));
    assert.ok(enumValues.includes("ADMIN_DOCUMENT_VERIFIED"));
});
