const User = require("../models/User");
const Enquiry = require("../models/Enquiry");
const { Wallet, WalletTxn } = require("../models/Wallet");

exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.active) filter.isActive = req.query.active === "true";
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: "i" } },
                { email: { $regex: req.query.search, $options: "i" } },
            ];
        }
        const [users, total] = await Promise.all([
            User.find(filter).sort("-createdAt").skip(skip).limit(limit),
            User.countDocuments(filter),
        ]);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: users });
    } catch (err) { next(err); }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
    try {
        const allowed = ["name", "phone", "role", "isActive"];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, message: "User deleted" });
    } catch (err) { next(err); }
};

exports.getAllEnquiries = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: "i" } },
                { email: { $regex: req.query.search, $options: "i" } },
                { message: { $regex: req.query.search, $options: "i" } },
            ];
        }
        const [enquiries, total] = await Promise.all([
            Enquiry.find(filter).populate("userId", "name email").sort("-createdAt").skip(skip).limit(limit),
            Enquiry.countDocuments(filter),
        ]);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: enquiries });
    } catch (err) { next(err); }
};

exports.updateEnquiry = async (req, res, next) => {
    try {
        const allowed = ["status", "notes", "assignedTo"];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
        res.json({ success: true, data: enquiry });
    } catch (err) { next(err); }
};

exports.deleteEnquiry = async (req, res, next) => {
    try {
        const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
        if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
        res.json({ success: true, message: "Enquiry deleted" });
    } catch (err) { next(err); }
};

exports.getDashboard = async (req, res, next) => {
    try {
        const [totalUsers, totalEnquiries, newEnquiries, resolvedEnquiries] = await Promise.all([
            User.countDocuments({ role: "user" }),
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: "new" }),
            Enquiry.countDocuments({ status: "resolved" }),
        ]);
        res.json({ success: true, data: { totalUsers, totalEnquiries, newEnquiries, resolvedEnquiries } });
    } catch (err) { next(err); }
};
// ══════════════════════════════════════════════════════════════════════════════
// ── Withdrawals ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/withdrawals  — list withdrawal requests (default: pending only)
exports.getWithdrawals = async (req, res, next) => {
    try {
        const { status = "pending", page = 1, limit = 30 } = req.query;
        const filter = { type: "withdraw" };
        if (status !== "all") filter.status = status;

        const [txns, total] = await Promise.all([
            WalletTxn.find(filter)
                .populate("user", "name email phone")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(+limit),
            WalletTxn.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: txns,
            total, page: +page, pages: Math.ceil(total / limit),
        });
    } catch (err) { next(err); }
};

// PATCH /api/admin/withdrawals/:id/complete  — manually release a pending withdrawal
// (does the exact same thing the 24h cron does, just triggered on-demand by admin)
exports.completeWithdrawal = async (req, res, next) => {
    try {
        const wtxn = await WalletTxn.findById(req.params.id);
        if (!wtxn || wtxn.type !== "withdraw") {
            return res.status(404).json({ success: false, message: "Withdrawal request not found" });
        }
        if (wtxn.status !== "pending") {
            return res.status(400).json({ success: false, message: `Already ${wtxn.status}` });
        }

        const wallet = await Wallet.findOne({ user: wtxn.user });
        if (!wallet) return res.status(404).json({ success: false, message: "Wallet not found" });

        wallet.balance = parseFloat((wallet.balance - wtxn.amount).toFixed(2));
        wallet.lockedBalance = parseFloat((wallet.lockedBalance - wtxn.amount).toFixed(2));
        wallet.totalWithdrawn = parseFloat((wallet.totalWithdrawn + wtxn.amount).toFixed(2));
        await wallet.save();

        wtxn.status = "success";
        wtxn.balanceAfter = wallet.balance;
        wtxn.note = `₹${wtxn.amount} withdrawn to bank (marked complete by admin)`;
        await wtxn.save();

        res.json({ success: true, message: "Withdrawal marked complete", data: wtxn });
    } catch (err) { next(err); }
};