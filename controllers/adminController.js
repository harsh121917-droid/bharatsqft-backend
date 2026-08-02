const User = require("../models/User");
const Enquiry = require("../models/Enquiry");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { GoldScheme, SchemeEnrollment } = require("../models/Scheme");

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

// ══════════════════════════════════════════════════════════════════════════════
// ── Sell Payout Approvals (gold + silver) ─────────────────────────────────────
// Selling gold/silver no longer auto-releases to the wallet after 24h — an
// admin must manually approve it first. Once approved, the money moves from
// pendingCredit → balance and becomes withdrawable.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/sell-approvals?metal=gold|silver|all&status=processing
exports.getSellApprovals = async (req, res, next) => {
    try {
        const { metal = "all", status = "processing", page = 1, limit = 30 } = req.query;
        const filter = { type: "sell" };
        if (status !== "all") filter.status = status;

        const wantGold = metal === "all" || metal === "gold";
        const wantSilver = metal === "all" || metal === "silver";

        const [goldTxns, silverTxns] = await Promise.all([
            wantGold ? GoldTransaction.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }) : [],
            wantSilver ? SilverTransaction.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }) : [],
        ]);

        const combined = [
            ...goldTxns.map(t => ({ ...t.toObject(), metal: "gold", value: t.goldValue })),
            ...silverTxns.map(t => ({ ...t.toObject(), metal: "silver", value: t.silverValue })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = combined.length;
        const start = (page - 1) * limit;
        const paged = combined.slice(start, start + Number(limit));

        res.json({ success: true, data: paged, total, page: +page, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
};

// PATCH /api/admin/sell-approvals/:id/approve?metal=gold|silver
// Moves pendingCredit → balance, deducts locked grams, marks the sale complete.
exports.approveSellPayout = async (req, res, next) => {
    try {
        const { metal } = req.query;
        if (metal !== "gold" && metal !== "silver") {
            return res.status(400).json({ success: false, message: "metal query param must be 'gold' or 'silver'" });
        }

        const Transaction = metal === "gold" ? GoldTransaction : SilverTransaction;
        const Balance = metal === "gold" ? GoldBalance : SilverBalance;
        const valueField = metal === "gold" ? "goldValue" : "silverValue";
        const linkField = metal === "gold" ? "goldTxnId" : "silverTxnId";

        const txn = await Transaction.findById(req.params.id);
        if (!txn || txn.type !== "sell") {
            return res.status(404).json({ success: false, message: "Sell transaction not found" });
        }
        if (txn.status !== "processing") {
            return res.status(400).json({ success: false, message: `Already ${txn.status}` });
        }

        const [bal, wallet] = await Promise.all([
            Balance.findOne({ user: txn.user }),
            Wallet.findOne({ user: txn.user }),
        ]);
        if (!bal || !wallet) {
            return res.status(404).json({ success: false, message: "User balance/wallet not found" });
        }

        // Deduct the metal (it was only locked, not yet removed, until now)
        bal.totalGrams = parseFloat((bal.totalGrams - txn.grams).toFixed(6));
        bal.lockedGrams = parseFloat((bal.lockedGrams - txn.grams).toFixed(6));
        bal.investedAmt = parseFloat(Math.max(0, bal.investedAmt - txn[valueField] * 0.9).toFixed(2));
        await bal.save();

        // Move pendingCredit → balance — now withdrawable
        wallet.balance = parseFloat((wallet.balance + txn.totalAmt).toFixed(2));
        wallet.pendingCredit = parseFloat(Math.max(0, wallet.pendingCredit - txn.totalAmt).toFixed(2));
        await wallet.save();

        txn.status = "success";
        await txn.save();

        await WalletTxn.findOneAndUpdate(
            { [linkField]: txn._id },
            {
                status: "success", balanceAfter: wallet.balance,
                note: `₹${txn.totalAmt} approved & credited to wallet from ${metal} sale`,
            }
        );

        res.json({ success: true, message: `${metal} sell payout approved — ₹${txn.totalAmt} now withdrawable`, data: txn });
    } catch (err) { next(err); }
};

exports.getSchemeEnrollments = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        const filter = {};

        // Metal filter
        if (req.query.metal && req.query.metal !== "all") {
            filter.metal = req.query.metal;
        }

        // Status filters (active, completed, cancelled, cart/unpaid)
        if (req.query.status && req.query.status !== "all") {
            if (req.query.status === "cart") {
                filter.installmentsPaid = 0;
            } else {
                filter.status = req.query.status;
                filter.installmentsPaid = { $gt: 0 }; // only show actual paid ones
            }
        }

        // Search filter (User Name, Email, Phone, or Scheme Name)
        if (req.query.search) {
            const searchRegex = { $regex: req.query.search, $options: "i" };
            
            const matchingUsers = await User.find({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex }
                ]
            }).select("_id");
            
            const userIds = matchingUsers.map(u => u._id);

            filter.$or = [
                { user: { $in: userIds } },
                { schemeName: searchRegex }
            ];
        }

        const [enrollments, total] = await Promise.all([
            SchemeEnrollment.find(filter)
                .populate("user", "name email phone")
                .populate("scheme", "name minAmount durationMonths")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            SchemeEnrollment.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: enrollments
        });
    } catch (err) {
        next(err);
    }
};

// ── Admin Rewards Settings ───────────────────────────────────────────────────
exports.getRewardSettings = async (req, res, next) => {
    try {
        const RewardSettings = require("../models/RewardSettings");
        let settings = await RewardSettings.findOne();
        if (!settings) {
            settings = await RewardSettings.create({
                registrationPoints: 100,
                referralPoints: 200,
                pointToWalletRate: 0.10,
                spinPoints: [10, 20, 50, 100, 150, 200],
                isActive: true,
            });
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        next(err);
    }
};

exports.updateRewardSettings = async (req, res, next) => {
    try {
        const RewardSettings = require("../models/RewardSettings");
        const { registrationPoints, referralPoints, pointToWalletRate, spinPoints, isActive } = req.body;

        let settings = await RewardSettings.findOne();
        if (!settings) {
            settings = new RewardSettings();
        }

        if (registrationPoints !== undefined) settings.registrationPoints = registrationPoints;
        if (referralPoints !== undefined) settings.referralPoints = referralPoints;
        if (pointToWalletRate !== undefined) settings.pointToWalletRate = pointToWalletRate;
        if (spinPoints !== undefined) settings.spinPoints = spinPoints;
        if (isActive !== undefined) settings.isActive = isActive;

        await settings.save();
        res.json({ success: true, message: "Reward settings updated successfully", data: settings });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/admin/rewards/history ────────────────────────────────────────────
exports.getAllRewardHistory = async (req, res, next) => {
    try {
        const RewardTxn = require("../models/RewardTxn");
        const User = require("../models/User");

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        if (req.query.userId) filter.user = req.query.userId;

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, "i");
            const matchingUsers = await User.find({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex },
                ],
            }).select("_id");
            const userIds = matchingUsers.map((u) => u._id);
            filter.user = { $in: userIds };
        }

        const [history, total] = await Promise.all([
            RewardTxn.find(filter)
                .populate("user", "name email phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            RewardTxn.countDocuments(filter),
        ]);

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: history,
        });
    } catch (err) {
        next(err);
    }
};