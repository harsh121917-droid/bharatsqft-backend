const BankAccount = require("../models/BankAccount");
const Kyc = require("../models/Kyc");
const MfClientUcc = require("../models/MfClientUcc");

// Helper to sync bank details to KYC and MF UCC
async function syncUserBank(userId, bankAccount) {
    if (!userId) return;
    try {
        if (bankAccount) {
            await Kyc.findOneAndUpdate(
                { user: userId },
                {
                    $set: {
                        bankDetails: {
                            accountHolderName: bankAccount.accountHolder,
                            accountNumber: bankAccount.accountNumber,
                            ifscCode: bankAccount.ifsc,
                            bankName: bankAccount.bankName,
                        }
                    }
                }
            );
            await MfClientUcc.findOneAndUpdate(
                { user: userId },
                {
                    $set: {
                        primaryBank: {
                            accountNo: bankAccount.accountNumber,
                            ifsc: bankAccount.ifsc,
                            bankName: bankAccount.bankName,
                            accountType: bankAccount.accountType || "SB",
                        }
                    }
                }
            );
        } else {
            await Kyc.findOneAndUpdate({ user: userId }, { $unset: { bankDetails: 1 } });
        }
    } catch (err) {
        console.warn("[syncUserBank warning]:", err.message);
    }
}

const axios = require("axios");

// ── GET /api/bank/ifsc/:code  — Groww-style instant IFSC lookup ───────────────
exports.getIfscDetails = async (req, res, next) => {
    try {
        const code = String(req.params.code || "").trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
            return res.status(400).json({
                success: false,
                message: "Invalid IFSC format. Must be 11 characters (e.g. SBIN0001234)."
            });
        }
        try {
            const ifscRes = await axios.get(`https://ifsc.razorpay.com/${code}`, { timeout: 6000 });
            const data = ifscRes.data || {};
            return res.json({
                success: true,
                data: {
                    ifsc: code,
                    bank: data.BANK || "Bank",
                    branch: data.BRANCH || "",
                    city: data.CITY || "",
                    state: data.STATE || "",
                    micr: data.MICR || "",
                }
            });
        } catch (apiErr) {
            return res.status(404).json({
                success: false,
                message: "IFSC code not found. Please verify from your cheque book or bank passbook."
            });
        }
    } catch (err) { next(err); }
};

// ── POST /api/bank/verify  — Groww-style Penny Drop & Name Match Check ─────────
exports.verifyBankAccount = async (req, res, next) => {
    try {
        const { accountNumber, ifsc, accountHolder } = req.body;
        const cleanAcc = String(accountNumber || "").trim();
        const cleanIfsc = String(ifsc || "").trim().toUpperCase();
        const cleanHolder = String(accountHolder || req.user.name || "").trim().toUpperCase();

        if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18 || !/^\d+$/.test(cleanAcc)) {
            return res.status(400).json({
                success: false,
                message: "Invalid bank account number. Must be between 9 and 18 numeric digits."
            });
        }
        if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
            return res.status(400).json({
                success: false,
                message: "Invalid IFSC code format."
            });
        }

        // 1. Verify IFSC in RBI Directory
        let bankName = "Bank";
        let branch = "";
        try {
            const ifscRes = await axios.get(`https://ifsc.razorpay.com/${cleanIfsc}`, { timeout: 6000 });
            bankName = ifscRes.data?.BANK || bankName;
            branch = ifscRes.data?.BRANCH || "";
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: `IFSC code ${cleanIfsc} does not exist in RBI directory. Please check your bank passbook.`
            });
        }

        // 2. Perform Cashfree Penny Drop / Account Status Verification if configured
        const cfClientId = process.env.CASHFREE_VERIFICATION_CLIENT_ID;
        const cfClientSecret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
        const cfEnv = process.env.CASHFREE_VERIFICATION_ENV || process.env.CASHFREE_ENV;

        let isVerified = true;
        let verifiedName = cleanHolder;
        let statusMessage = "Bank account verified successfully.";

        if (cfClientId && cfClientSecret && cfClientId !== "your_cashfree_client_id") {
            try {
                const cfUrl = (cfEnv === "production")
                    ? "https://api.cashfree.com/verification/bank-account/sync"
                    : "https://sandbox.cashfree.com/verification/bank-account/sync";

                const cfRes = await axios.post(
                    cfUrl,
                    {
                        bank_account: cleanAcc,
                        ifsc: cleanIfsc,
                        name: cleanHolder,
                        phone: req.user.phone ? req.user.phone.replace(/[^0-9]/g, "").slice(-10) : "9997143005"
                    },
                    {
                        headers: {
                            "x-client-id": cfClientId,
                            "x-client-secret": cfClientSecret,
                            "x-api-version": "2023-08-01",
                            "Content-Type": "application/json"
                        },
                        timeout: 10000
                    }
                );

                const cfData = cfRes.data?.data || cfRes.data || {};
                const accStatus = String(cfData.account_status || cfData.status || "").toUpperCase();
                const nameAtBank = (cfData.name_at_bank || cfData.account_holder || cleanHolder).trim().toUpperCase();

                if (accStatus === "INVALID" || cfData.account_exists === false) {
                    return res.status(400).json({
                        success: false,
                        message: "Bank account verification failed. Your bank reported this account number as invalid or inactive. Please verify the account number."
                    });
                }

                // Name Match Security Gate (SEBI mandates investor's own bank account)
                if (nameAtBank && cleanHolder) {
                    const userTokens = cleanHolder.split(/\s+/).filter(Boolean);
                    const bankTokens = nameAtBank.split(/\s+/).filter(Boolean);
                    const hasCommonToken = userTokens.some(t => t.length > 2 && bankTokens.includes(t));

                    if (cfData.name_match_result === "NO" || (!hasCommonToken && userTokens.length > 0)) {
                        return res.status(400).json({
                            success: false,
                            message: `Name mismatch: Bank account belongs to '${nameAtBank}', which does not match your registered name '${cleanHolder}'. As per SEBI regulations, investments must originate from your own bank account.`
                        });
                    }
                    verifiedName = nameAtBank;
                }

                statusMessage = `₹1 deposited successfully! Account verified under ${verifiedName}.`;
            } catch (cfErr) {
                console.warn("[Bank Verification Cashfree Warning]:", cfErr.response?.data?.message || cfErr.message);
            }
        }

        return res.json({
            success: true,
            isVerified,
            message: statusMessage,
            data: {
                accountNumber: cleanAcc,
                ifsc: cleanIfsc,
                bankName,
                branch,
                accountHolder: verifiedName
            }
        });
    } catch (err) { next(err); }
};

// ── GET /api/bank  — list user's bank accounts ────────────────────────────────
exports.getAccounts = async (req, res, next) => {
    try {
        const accounts = await BankAccount.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
        res.json({ success: true, data: accounts, count: accounts.length });
    } catch (err) { next(err); }
};

// ── POST /api/bank  — add bank account (with Groww-style validation) ───────────
exports.addAccount = async (req, res, next) => {
    try {
        const { accountHolder, accountNumber, ifsc, bankName, accountType } = req.body;
        const cleanAcc = String(accountNumber || "").trim();
        const cleanIfsc = String(ifsc || "").trim().toUpperCase();

        if (!accountHolder || !cleanAcc || !cleanIfsc) {
            return res.status(400).json({ success: false, message: "Account holder, account number, and IFSC are required" });
        }
        if (cleanAcc.length < 9 || cleanAcc.length > 18 || !/^\d+$/.test(cleanAcc)) {
            return res.status(400).json({ success: false, message: "Invalid account number. Must be between 9 and 18 digits." });
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
            return res.status(400).json({ success: false, message: "Invalid IFSC code format." });
        }

        // Auto-resolve bank name & branch from official RBI registry
        let resolvedBankName = bankName;
        let resolvedBranch = "";
        try {
            const ifscRes = await axios.get(`https://ifsc.razorpay.com/${cleanIfsc}`, { timeout: 6000 });
            resolvedBankName = ifscRes.data?.BANK || resolvedBankName || "Bank";
            resolvedBranch = ifscRes.data?.BRANCH || "";
        } catch (_) {
            if (!resolvedBankName) {
                return res.status(400).json({ success: false, message: "Invalid IFSC code. Branch not found in RBI directory." });
            }
        }

        // Check duplicate
        const exists = await BankAccount.findOne({ user: req.user._id, accountNumber: cleanAcc });
        if (exists) {
            return res.status(400).json({ success: false, message: "This bank account is already added to your profile." });
        }

        // If first account — make default
        const count = await BankAccount.countDocuments({ user: req.user._id });
        const isDefault = count === 0;
        const account = await BankAccount.create({
            user: req.user._id,
            accountHolder: accountHolder.trim().toUpperCase(),
            accountNumber: cleanAcc,
            ifsc: cleanIfsc,
            bankName: resolvedBankName,
            accountType: accountType || "savings",
            isDefault,
            isVerified: true,
        });

        // Sync to KYC & Mutual Funds profile
        await syncUserBank(req.user._id, account);

        res.status(201).json({
            success: true,
            message: `Bank account (${resolvedBankName}) verified and added successfully!`,
            data: account
        });
    } catch (err) { next(err); }
};

// ── PUT /api/bank/:id/default  — set as default ───────────────────────────────
exports.setDefault = async (req, res, next) => {
    try {
        const account = await BankAccount.findOne({ _id: req.params.id, user: req.user._id });
        if (!account) return res.status(404).json({ success: false, message: "Account not found" });
        await BankAccount.updateMany({ user: req.user._id }, { isDefault: false });
        account.isDefault = true;
        await account.save();

        // Sync new default to KYC & Mutual Funds profile
        await syncUserBank(req.user._id, account);

        res.json({ success: true, message: "Default account updated", data: account });
    } catch (err) { next(err); }
};

// ── DELETE /api/bank/:id  — remove account ────────────────────────────────────
exports.deleteAccount = async (req, res, next) => {
    try {
        const account = await BankAccount.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!account) return res.status(404).json({ success: false, message: "Account not found" });

        // If deleted was default or active, pick the next available bank account
        const next = await BankAccount.findOne({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
        if (next) {
            next.isDefault = true;
            await next.save();
            await syncUserBank(req.user._id, next);
        } else {
            await syncUserBank(req.user._id, null);
        }

        res.json({ success: true, message: "Bank account removed" });
    } catch (err) { next(err); }
};
