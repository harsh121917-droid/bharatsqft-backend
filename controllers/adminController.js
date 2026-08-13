const User = require("../models/User");
const Enquiry = require("../models/Enquiry");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { GoldScheme, SchemeEnrollment } = require("../models/Scheme");

const Investment = require("../models/Investment");
const Property = require("../models/Property");
const JewelleryRedemption = require("../models/JewelleryRedemption");
const Jewellery = require("../models/Jewellery");

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
                { phone: { $regex: req.query.search, $options: "i" } },
            ];
        }

        const pipeline = [
            { $match: filter },
            {
                $lookup: {
                    from: "investments",
                    let: { userId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $and: [ { $eq: ["$user", "$$userId"] }, { $eq: ["$status", "paid"] } ] } } },
                        { $lookup: { from: "properties", localField: "property", foreignField: "_id", as: "prop" } },
                        { $unwind: { path: "$prop", preserveNullAndEmptyArrays: true } }
                    ],
                    as: "propertyTxns"
                }
            },
            {
                $lookup: {
                    from: "goldbalances",
                    localField: "_id",
                    foreignField: "user",
                    as: "goldBal"
                }
            },
            {
                $lookup: {
                    from: "silverbalances",
                    localField: "_id",
                    foreignField: "user",
                    as: "silverBal"
                }
            },
            {
                $addFields: {
                    propertyInvestments: {
                        totalInvested: { $sum: "$propertyTxns.totalAmount" },
                        items: {
                            $map: {
                                input: "$propertyTxns",
                                as: "pt",
                                in: {
                                    propertyId: "$$pt.property",
                                    propertyName: "$$pt.prop.title",
                                    bricks: "$$pt.bricks",
                                    totalAmount: "$$pt.totalAmount",
                                    ownershipPercent: "$$pt.ownershipPercent"
                                }
                            }
                        }
                    },
                    goldInvestments: {
                        totalInvested: { $ifNull: [ { $arrayElemAt: ["$goldBal.investedAmt", 0] }, 0 ] },
                        grams: { $ifNull: [ { $arrayElemAt: ["$goldBal.totalGrams", 0] }, 0 ] }
                    },
                    silverInvestments: {
                        totalInvested: { $ifNull: [ { $arrayElemAt: ["$silverBal.investedAmt", 0] }, 0 ] },
                        grams: { $ifNull: [ { $arrayElemAt: ["$silverBal.totalGrams", 0] }, 0 ] }
                    }
                }
            },
            {
                $addFields: {
                    totalInvested: {
                        $add: [
                            "$goldInvestments.totalInvested",
                            "$silverInvestments.totalInvested"
                        ]
                    }
                }
            }
        ];

        // Filtering by investment presence
        if (req.query.hasInvestment === "true") {
            pipeline.push({ $match: { totalInvested: { $gt: 0 } } });
        } else if (req.query.hasInvestment === "false") {
            pipeline.push({ $match: { totalInvested: 0 } });
        }

        // Filtering by investment type
        if (req.query.investmentType === "property") {
            pipeline.push({ $match: { "propertyInvestments.totalInvested": { $gt: 0 } } });
        } else if (req.query.investmentType === "gold") {
            pipeline.push({ $match: { "goldInvestments.totalInvested": { $gt: 0 } } });
        } else if (req.query.investmentType === "silver") {
            pipeline.push({ $match: { "silverInvestments.totalInvested": { $gt: 0 } } });
        }

        pipeline.push({
            $facet: {
                metadata: [ { $count: "total" } ],
                data: [ { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit } ]
            }
        });

        const results = await User.aggregate(pipeline);
        const total = results[0]?.metadata[0]?.total || 0;
        const users = results[0]?.data || [];

        // Calculate holdings details using live rates
        const { fetchLiveRates } = require("./goldController");
        let rates;
        try {
            rates = await fetchLiveRates();
        } catch (e) {
            // fallback rates if live API is temporarily unavailable
            rates = { gold: { buyRate: 7500, sellRate: 7450 }, silver: { buyRate: 90, sellRate: 88 } };
        }

        const goldSellRate = rates?.gold?.sellRate || 7450;
        const silverSellRate = rates?.silver?.sellRate || 88;

        const userIds = users.map(u => u._id);
        const wallets = await Wallet.find({ user: { $in: userIds } });
        const walletMap = {};
        wallets.forEach(w => {
            walletMap[w.user.toString()] = w.balance;
        });

        const usersWithHoldings = users.map(user => {
            const goldGrams = user.goldInvestments?.grams || 0;
            const goldSpent = user.goldInvestments?.totalInvested || 0;
            const goldAvgPrice = goldGrams > 0 ? parseFloat((goldSpent / goldGrams).toFixed(2)) : 0;
            const goldCurrentValue = parseFloat((goldGrams * goldSellRate).toFixed(2));
            const goldProfitLoss = parseFloat((goldCurrentValue - goldSpent).toFixed(2));

            const silverGrams = user.silverInvestments?.grams || 0;
            const silverSpent = user.silverInvestments?.totalInvested || 0;
            const silverAvgPrice = silverGrams > 0 ? parseFloat((silverSpent / silverGrams).toFixed(2)) : 0;
            const silverCurrentValue = parseFloat((silverGrams * silverSellRate).toFixed(2));
            const silverProfitLoss = parseFloat((silverCurrentValue - silverSpent).toFixed(2));

            return {
                ...user,
                walletBalance: walletMap[user._id.toString()] || 0,
                goldInvestments: {
                    ...user.goldInvestments,
                    avgBuyPrice: goldAvgPrice,
                    currentValue: goldCurrentValue,
                    profitLoss: goldProfitLoss
                },
                silverInvestments: {
                    ...user.silverInvestments,
                    avgBuyPrice: silverAvgPrice,
                    currentValue: silverCurrentValue,
                    profitLoss: silverProfitLoss
                }
            };
        });

        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: usersWithHoldings });
    } catch (err) { next(err); }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const wallet = await Wallet.findOne({ user: user._id });
        const walletBalance = wallet ? wallet.balance : 0;
        res.json({
            success: true,
            data: {
                ...user.toObject(),
                walletBalance
            }
        });
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

exports.addWalletMoney = async (req, res, next) => {
    try {
        const { amount, showTransaction } = req.body;
        const userId = req.params.id;

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount" });
        }

        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({ user: userId, balance: 0 });
        }

        const balanceBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance + parseFloat(amount)).toFixed(2));
        wallet.totalAdded = parseFloat((wallet.totalAdded + parseFloat(amount)).toFixed(2));
        await wallet.save();

        if (showTransaction) {
            await WalletTxn.create({
                user: userId,
                type: "add",
                amount: parseFloat(amount),
                balanceBefore,
                balanceAfter: wallet.balance,
                status: "success",
                note: "Owner gave you a small gift"
            });
        }

        res.json({ success: true, message: "Money added to user's wallet successfully", balance: wallet.balance });
    } catch (err) { next(err); }
};

exports.recalculateVaultBalance = async (req, res, next) => {
    try {
        const userId = req.params.id;
        
        // 1. Recalculate Gold Balance
        const goldTxns = await GoldTransaction.find({ user: userId, status: "success", type: { $ne: "sip_buy" } });
        let runningGrams = 0;
        let runningCost = 0;
        for (const t of goldTxns) {
            if (["buy", "gift"].includes(t.type)) {
                runningGrams += t.grams;
                if (t.type === "buy") {
                    runningCost += (t.goldValue || t.totalAmt);
                }
            } else if (["sell", "redeem"].includes(t.type)) {
                if (runningGrams > 0) {
                    const avgRate = runningCost / runningGrams;
                    runningCost -= (avgRate * t.grams);
                }
                runningGrams -= t.grams;
            }
        }
        const totalGoldGrams = Math.max(0, runningGrams);
        const goldInvestedAmt = Math.max(0, runningCost);

        let goldBal = await GoldBalance.findOne({ user: userId });
        if (!goldBal) goldBal = new GoldBalance({ user: userId });
        goldBal.totalGrams = parseFloat(totalGoldGrams.toFixed(6));
        goldBal.investedAmt = parseFloat(goldInvestedAmt.toFixed(2));
        await goldBal.save();

        // 2. Recalculate Silver Balance
        const silverTxns = await SilverTransaction.find({ user: userId, status: "success", type: { $ne: "sip_buy" } });
        let runningSilverGrams = 0;
        let runningSilverCost = 0;
        for (const t of silverTxns) {
            if (["buy", "gift"].includes(t.type)) {
                runningSilverGrams += t.grams;
                if (t.type === "buy") {
                    runningSilverCost += (t.silverValue || t.totalAmt);
                }
            } else if (["sell", "redeem"].includes(t.type)) {
                if (runningSilverGrams > 0) {
                    const avgRate = runningSilverCost / runningSilverGrams;
                    runningSilverCost -= (avgRate * t.grams);
                }
                runningSilverGrams -= t.grams;
            }
        }
        const totalSilverGrams = Math.max(0, runningSilverGrams);
        const silverInvestedAmt = Math.max(0, runningSilverCost);

        let silverBal = await SilverBalance.findOne({ user: userId });
        if (!silverBal) silverBal = new SilverBalance({ user: userId });
        silverBal.totalGrams = parseFloat(totalSilverGrams.toFixed(6));
        silverBal.investedAmt = parseFloat(silverInvestedAmt.toFixed(2));
        await silverBal.save();

        res.json({
            success: true,
            message: `Vault balance recalculated successfully. New Gold: ${goldBal.totalGrams}g, New Silver: ${silverBal.totalGrams}g`,
            data: {
                goldGrams: goldBal.totalGrams,
                silverGrams: silverBal.totalGrams
            }
        });
    } catch (err) {
        next(err);
    }
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

        // Deduct the metal and reduce the investedAmt proportionally based on average purchase cost
        const avgRate = bal.totalGrams > 0 ? (bal.investedAmt / bal.totalGrams) : 0;
        const costBasisOfSoldGrams = txn.grams * avgRate;

        bal.totalGrams = parseFloat((bal.totalGrams - txn.grams).toFixed(6));
        bal.lockedGrams = parseFloat((bal.lockedGrams - txn.grams).toFixed(6));
        bal.investedAmt = parseFloat(Math.max(0, bal.investedAmt - costBasisOfSoldGrams).toFixed(2));
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

exports.getAdminCoins = async (req, res, next) => {
    try {
        const { fetchLiveRates } = require("./goldController");
        const Coin = require("../models/Coin");
        
        const rates = await fetchLiveRates();
        const coins = await Coin.find().sort({ metal: 1, grams: 1 });
        
        const data = coins.map(c => {
            const rate = c.metal === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const value = parseFloat((c.grams * rate).toFixed(2));
            const making = parseFloat((value * c.makingChargePct / 100).toFixed(2));
            return {
                ...c.toObject(),
                ratePerGram: rate,
                value,
                makingCharge: making,
                totalValue: parseFloat((value + making).toFixed(2))
            };
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

exports.createCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        const { name, metal, grams, makingChargePct, image, isActive } = req.body;
        if (!name || !metal || !grams || makingChargePct === undefined) {
            return res.status(400).json({ success: false, message: "Name, metal, grams, and making charge percent are required" });
        }
        const coin = await Coin.create({ name, metal, grams, makingChargePct, image, isActive });
        res.status(201).json({ success: true, message: "Coin created successfully", data: coin });
    } catch (err) { next(err); }
};

exports.updateCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        const { name, metal, grams, makingChargePct, image, isActive } = req.body;
        const coin = await Coin.findById(req.params.id);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });

        if (name !== undefined) coin.name = name;
        if (metal !== undefined) coin.metal = metal;
        if (grams !== undefined) coin.grams = grams;
        if (makingChargePct !== undefined) coin.makingChargePct = makingChargePct;
        if (image !== undefined) coin.image = image;
        if (isActive !== undefined) coin.isActive = isActive;

        await coin.save();
        res.json({ success: true, message: "Coin updated successfully", data: coin });
    } catch (err) { next(err); }
};

exports.deleteCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        const coin = await Coin.findByIdAndDelete(req.params.id);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });
        res.json({ success: true, message: "Coin deleted successfully" });
    } catch (err) { next(err); }
};

const AppConfig = require("../models/AppConfig");

exports.getAppConfig = async (req, res, next) => {
    try {
        let config = await AppConfig.findOne();
        if (!config) {
            config = await AppConfig.create({});
        }
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

exports.updateAppConfig = async (req, res, next) => {
    try {
        const { latestVersion, forceUpdate, playStoreUrl } = req.body;
        let config = await AppConfig.findOne();
        if (!config) {
            config = await AppConfig.create({ latestVersion, forceUpdate, playStoreUrl });
        } else {
            if (latestVersion !== undefined) config.latestVersion = latestVersion;
            if (forceUpdate !== undefined) config.forceUpdate = forceUpdate;
            if (playStoreUrl !== undefined) config.playStoreUrl = playStoreUrl;
            await config.save();
        }
        res.json({ success: true, message: "App version configuration updated successfully", data: config });
    } catch (err) { next(err); }
};

exports.getJewelleryOrders = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        const filter = {};

        // Delivery Status filter
        if (req.query.deliveryStatus && req.query.deliveryStatus !== "all") {
            filter.deliveryStatus = req.query.deliveryStatus;
        }

        // Payment status filter (completed, pending, failed)
        if (req.query.status && req.query.status !== "all") {
            filter.status = req.query.status;
        }

        // Metal filter
        if (req.query.metalType && req.query.metalType !== "all") {
            filter.metalType = req.query.metalType;
        }

        // Search filter (User Name, Email, Phone, or Jewellery Name)
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
                { jewelleryName: searchRegex }
            ];
        }

        // Calculate statistics for the summary cards
        const stats = {
            total: await JewelleryRedemption.countDocuments(),
            pending: await JewelleryRedemption.countDocuments({ deliveryStatus: "pending" }),
            processing: await JewelleryRedemption.countDocuments({ deliveryStatus: "processing" }),
            shipped: await JewelleryRedemption.countDocuments({ deliveryStatus: "shipped" }),
            delivered: await JewelleryRedemption.countDocuments({ deliveryStatus: "delivered" }),
            cancelled: await JewelleryRedemption.countDocuments({ deliveryStatus: "cancelled" })
        };

        const count = await JewelleryRedemption.countDocuments(filter);
        const orders = await JewelleryRedemption.find(filter)
            .populate("user", "name email phone")
            .populate("jewellery", "name category imageUrl purity weightGrams makingCharges")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            data: orders,
            stats,
            pagination: {
                total: count,
                page,
                limit,
                pages: Math.ceil(count / limit)
            }
        });
    } catch (err) { next(err); }
};

exports.updateJewelleryOrder = async (req, res, next) => {
    try {
        const { deliveryStatus, trackingId, trackingUrl, shippingAddress } = req.body;
        const order = await JewelleryRedemption.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (deliveryStatus) order.deliveryStatus = deliveryStatus;
        if (trackingId !== undefined) order.trackingId = trackingId;
        if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
        if (shippingAddress !== undefined) order.shippingAddress = shippingAddress;

        await order.save();
        res.json({ success: true, message: "Order updated successfully", data: order });
    } catch (err) { next(err); }
};