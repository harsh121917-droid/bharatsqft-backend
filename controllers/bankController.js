const BankAccount = require("../models/BankAccount");

// ── GET /api/bank  — list user's bank accounts ────────────────────────────────
exports.getAccounts = async (req, res, next) => {
    try {
        const accounts = await BankAccount.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
        res.json({ success: true, data: accounts, count: accounts.length });
    } catch (err) { next(err); }
};

// ── POST /api/bank  — add bank account ────────────────────────────────────────
exports.addAccount = async (req, res, next) => {
    try {
        const { accountHolder, accountNumber, ifsc, bankName, accountType } = req.body;
        if (!accountHolder || !accountNumber || !ifsc || !bankName) {
            return res.status(400).json({ success: false, message: "All fields required" });
        }
        // Basic IFSC validation
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
            return res.status(400).json({ success: false, message: "Invalid IFSC code" });
        }
        // Check duplicate
        const exists = await BankAccount.findOne({ user: req.user._id, accountNumber });
        if (exists) {
            return res.status(400).json({ success: false, message: "Account already added" });
        }
        // If first account — make default
        const count = await BankAccount.countDocuments({ user: req.user._id });
        const account = await BankAccount.create({
            user: req.user._id, accountHolder,
            accountNumber, ifsc: ifsc.toUpperCase(),
            bankName, accountType: accountType || "savings",
            isDefault: count === 0,
        });
        res.status(201).json({ success: true, message: "Bank account added", data: account });
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
        res.json({ success: true, message: "Default account updated", data: account });
    } catch (err) { next(err); }
};

// ── DELETE /api/bank/:id  — remove account ────────────────────────────────────
exports.deleteAccount = async (req, res, next) => {
    try {
        const account = await BankAccount.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!account) return res.status(404).json({ success: false, message: "Account not found" });
        // If deleted was default, set next one as default
        if (account.isDefault) {
            const next = await BankAccount.findOne({ user: req.user._id });
            if (next) { next.isDefault = true; await next.save(); }
        }
        res.json({ success: true, message: "Bank account removed" });
    } catch (err) { next(err); }
};