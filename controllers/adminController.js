const User = require("../models/User");
const Enquiry = require("../models/Enquiry");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldBalance, GoldTransaction, GoldRate } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { CopperBalance, CopperTransaction } = require("../models/Copper");
const { GoldScheme, SchemeEnrollment } = require("../models/Scheme");
const Kyc = require("../models/Kyc");
const Saving = require("../models/Saving");
const Coupon = require("../models/Coupon");

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
                    from: "kycs",
                    localField: "_id",
                    foreignField: "user",
                    as: "kycDoc"
                }
            },
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
                $lookup: {
                    from: "copperbalances",
                    localField: "_id",
                    foreignField: "user",
                    as: "copperBal"
                }
            },
            {
                $addFields: {
                    kycStatus: {
                        $cond: {
                            if: { $eq: [ { $arrayElemAt: ["$kycDoc.status", 0] }, "approved" ] },
                            then: "approved",
                            else: {
                                $ifNull: [
                                    "$kycStatus",
                                    { $ifNull: [ { $arrayElemAt: ["$kycDoc.status", 0] }, "not_submitted" ] }
                                ]
                            }
                        }
                    },
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
                    },
                    copperInvestments: {
                        totalInvested: { $ifNull: [ { $arrayElemAt: ["$copperBal.investedAmt", 0] }, 0 ] },
                        grams: { $ifNull: [ { $arrayElemAt: ["$copperBal.totalGrams", 0] }, 0 ] }
                    }
                }
            },
            {
                $addFields: {
                    totalInvested: {
                        $add: [
                            "$goldInvestments.totalInvested",
                            "$silverInvestments.totalInvested",
                            "$copperInvestments.totalInvested"
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
        } else if (req.query.investmentType === "copper") {
            pipeline.push({ $match: { "copperInvestments.totalInvested": { $gt: 0 } } });
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
            rates = { gold: { buyRate: 7500, sellRate: 7450 }, silver: { buyRate: 90, sellRate: 88 }, copper: { buyRate: 1.36, sellRate: 1.35 } };
        }

        const goldSellRate = rates?.gold?.sellRate || 7450;
        const silverSellRate = rates?.silver?.sellRate || 88;
        const copperSellRate = rates?.copper?.sellRate || 1.35;

        const userIds = users.map(u => u._id);
        const wallets = await Wallet.find({ user: { $in: userIds } });
        const walletMap = {};
        wallets.forEach(w => {
            walletMap[w.user.toString()] = w.balance;
        });

        // ── Referral & Reward Data Aggregations ────────────────────────
        const Referral = require("../models/Referral");
        const RewardTxn = require("../models/RewardTxn");

        const [referralAggs, rewardEarnedAggs, referrerUsers] = await Promise.all([
            Referral.aggregate([
                { $match: { referrer: { $in: userIds } } },
                {
                    $group: {
                        _id: "$referrer",
                        count: { $sum: 1 },
                        totalBonus: { $sum: "$rewardAmount" },
                        totalPoints: { $sum: "$rewardPoints" }
                    }
                }
            ]),
            RewardTxn.aggregate([
                { $match: { user: { $in: userIds }, points: { $gt: 0 } } },
                {
                    $group: {
                        _id: "$user",
                        totalPointsEarned: { $sum: "$points" },
                        rewardTxnCount: { $sum: 1 }
                    }
                }
            ]),
            User.find({ _id: { $in: users.map(u => u.referredBy).filter(Boolean) } })
                .select("name email phone referralCode")
                .lean()
        ]);

        const refStatsMap = {};
        referralAggs.forEach(r => {
            refStatsMap[r._id.toString()] = r;
        });

        const rewardStatsMap = {};
        rewardEarnedAggs.forEach(r => {
            rewardStatsMap[r._id.toString()] = r;
        });

        const referrerMap = {};
        referrerUsers.forEach(ru => {
            referrerMap[ru._id.toString()] = ru;
        });

        const usersWithHoldings = users.map(user => {
            const uidStr = user._id.toString();
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

            const copperGrams = user.copperInvestments?.grams || 0;
            const copperSpent = user.copperInvestments?.totalInvested || 0;
            const copperAvgPrice = copperGrams > 0 ? parseFloat((copperSpent / copperGrams).toFixed(2)) : 0;
            const copperCurrentValue = parseFloat((copperGrams * copperSellRate).toFixed(2));
            const copperProfitLoss = parseFloat((copperCurrentValue - copperSpent).toFixed(2));

            const refStat = refStatsMap[uidStr] || { count: 0, totalBonus: 0, totalPoints: 0 };
            const rewStat = rewardStatsMap[uidStr] || { totalPointsEarned: user.rewardPoints || 0, rewardTxnCount: 0 };
            const referrerInfo = user.referredBy ? (referrerMap[user.referredBy.toString()] || null) : null;

            return {
                ...user,
                walletBalance: walletMap[uidStr] || 0,
                referralsCount: refStat.count || 0,
                referralRewardsEarned: refStat.totalBonus || (user.referralBalance || 0),
                totalRewardPointsEarned: rewStat.totalPointsEarned || (user.rewardPoints || 0),
                referredByInfo: referrerInfo,
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
                },
                copperInvestments: {
                    ...user.copperInvestments,
                    avgBuyPrice: copperAvgPrice,
                    currentValue: copperCurrentValue,
                    profitLoss: copperProfitLoss
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
        const allowed = ["name", "phone", "role", "isActive", "kycStatus"];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // If kycStatus was changed, sync to Kyc model if exists
        if (updates.kycStatus) {
            await Kyc.findOneAndUpdate({ user: user._id }, { status: updates.kycStatus });
        }

        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.clearUserLocation = async (req, res, next) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $unset: { location: 1 } },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, message: "User location deleted successfully", data: user });
    } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const user = await User.findByIdAndDelete(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Clean up all related data to prevent orphaned documents
        const RewardTxn = require("../models/RewardTxn");
        await Promise.all([
            GoldBalance.deleteMany({ user: userId }),
            GoldTransaction.deleteMany({ user: userId }),
            SilverBalance.deleteMany({ user: userId }),
            SilverTransaction.deleteMany({ user: userId }),
            CopperBalance.deleteMany({ user: userId }),
            CopperTransaction.deleteMany({ user: userId }),
            Wallet.deleteMany({ user: userId }),
            WalletTxn.deleteMany({ user: userId }),
            RewardTxn.deleteMany({ user: userId }),
            Saving.deleteMany({ user: userId }),
            SchemeEnrollment.deleteMany({ user: userId }),
        ]);

        res.json({ success: true, message: "User and all associated data deleted successfully" });
    } catch (err) { next(err); }
};

exports.addWalletMoney = async (req, res, next) => {
    try {
        const { amount, note, reason } = req.body;
        const userId = req.params.id;

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid amount greater than 0" });
        }

        const addAmt = parseFloat(parseFloat(amount).toFixed(2));
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({ user: userId, balance: 0 });
        }

        const balanceBefore = parseFloat((wallet.balance || 0).toFixed(2));
        wallet.balance = parseFloat((balanceBefore + addAmt).toFixed(2));
        wallet.totalAdded = parseFloat(((wallet.totalAdded || 0) + addAmt).toFixed(2));
        await wallet.save();

        const remarks = (reason || note || "Admin Wallet Credit").trim();
        const adminName = req.user?.name || req.user?.email || "Admin Console";
        const adminId = req.user?._id;

        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const txnId = `TXN-WAL-${Date.now().toString().slice(-8)}-${rand}`;

        // Audit Trail Transaction Record
        const txn = await WalletTxn.create({
            user: userId,
            txnId,
            entryType: "credit",
            type: "add",
            amount: addAmt,
            balanceBefore,
            balanceAfter: wallet.balance,
            reason: remarks,
            note: remarks,
            adminId,
            adminName,
            status: "success"
        });

        res.json({
            success: true,
            message: `₹${addAmt.toLocaleString("en-IN")} credited to wallet successfully (Txn ID: ${txn.txnId})`,
            balance: wallet.balance,
            transaction: txn
        });
    } catch (err) { next(err); }
};

exports.deductWalletMoney = async (req, res, next) => {
    try {
        const { amount, note, reason } = req.body;
        const userId = req.params.id;

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid amount greater than 0" });
        }

        const deductAmt = parseFloat(parseFloat(amount).toFixed(2));
        let wallet = await Wallet.findOne({ user: userId });
        const currentBal = wallet ? parseFloat((wallet.balance || 0).toFixed(2)) : 0;

        if (!wallet || currentBal < deductAmt) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Current balance is ₹${currentBal.toLocaleString("en-IN")}, cannot deduct ₹${deductAmt.toLocaleString("en-IN")}.`
            });
        }

        const balanceBefore = currentBal;
        wallet.balance = parseFloat((currentBal - deductAmt).toFixed(2));
        await wallet.save();

        const remarks = (reason || note || "Admin Wallet Deduction").trim();
        const adminName = req.user?.name || req.user?.email || "Admin Console";
        const adminId = req.user?._id;

        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const txnId = `TXN-WAL-${Date.now().toString().slice(-8)}-${rand}`;

        // Audit Trail Transaction Record
        const txn = await WalletTxn.create({
            user: userId,
            txnId,
            entryType: "debit",
            type: "deduct",
            amount: deductAmt,
            balanceBefore,
            balanceAfter: wallet.balance,
            reason: remarks,
            note: remarks,
            adminId,
            adminName,
            status: "success"
        });

        res.json({
            success: true,
            message: `₹${deductAmt.toLocaleString("en-IN")} debited from wallet successfully (Txn ID: ${txn.txnId})`,
            balance: wallet.balance,
            transaction: txn
        });
    } catch (err) { next(err); }
};

// ── GET FULL WALLET AUDIT LEDGER (Admin) ───────────────────────
exports.getWalletLedger = async (req, res, next) => {
    try {
        const { page = 1, limit = 25, search, entryType, type, userId, startDate, endDate } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 25);
        const skip = (pageNum - 1) * limitNum;

        let filter = {};

        if (userId) {
            filter.user = userId;
        }

        if (entryType && ["credit", "debit"].includes(entryType)) {
            filter.entryType = entryType;
        }

        if (type && type !== "all") {
            filter.type = type;
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), "i");
            const User = require("../models/User");
            const matchingUsers = await User.find({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex }
                ]
            }).select("_id");
            const userIds = matchingUsers.map(u => u._id);

            filter.$or = [
                { txnId: searchRegex },
                { reason: searchRegex },
                { note: searchRegex },
                { adminName: searchRegex },
                { user: { $in: userIds } }
            ];
        }

        // Aggregate statistics
        const [totalCount, statsAggregation] = await Promise.all([
            WalletTxn.countDocuments(filter),
            WalletTxn.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: "$entryType",
                        totalAmt: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        let totalCredits = 0;
        let totalDebits = 0;
        let creditCount = 0;
        let debitCount = 0;

        statsAggregation.forEach(s => {
            if (s._id === "credit") {
                totalCredits = s.totalAmt;
                creditCount = s.count;
            } else if (s._id === "debit") {
                totalDebits = s.totalAmt;
                debitCount = s.count;
            }
        });

        const txns = await WalletTxn.find(filter)
            .populate("user", "name email phone")
            .populate("adminId", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        // Format transactions for clean presentation
        const formattedTxns = txns.map(t => {
            const created = new Date(t.createdAt);
            return {
                ...t,
                txnId: t.txnId || `TXN-WAL-${String(t._id).slice(-8).toUpperCase()}`,
                entryType: t.entryType || (["add", "gold_sell", "silver_sell", "copper_sell", "refund", "manual_credit"].includes(t.type) ? "credit" : "debit"),
                reason: t.reason || t.note || (t.type === "add" ? "Wallet Deposit" : (t.type === "deduct" ? "Wallet Deduction" : t.type)),
                adminName: t.adminName || (t.adminId?.name || t.adminId?.email) || "System",
                formattedDate: created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                formattedTime: created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
            };
        });

        res.json({
            success: true,
            data: formattedTxns,
            stats: {
                totalTxns: totalCount,
                totalCredits: Math.round(totalCredits * 100) / 100,
                totalDebits: Math.round(totalDebits * 100) / 100,
                netVolume: Math.round((totalCredits - totalDebits) * 100) / 100,
                creditCount,
                debitCount
            },
            pagination: {
                total: totalCount,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(totalCount / limitNum) || 1
            }
        });
    } catch (err) { next(err); }
};

// ── GET USER SPECIFIC WALLET LEDGER (Admin) ─────────────────────
exports.getUserWalletLedger = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const txns = await WalletTxn.find({ user: userId })
            .populate("adminId", "name email")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const formatted = txns.map(t => {
            const created = new Date(t.createdAt);
            return {
                ...t,
                txnId: t.txnId || `TXN-WAL-${String(t._id).slice(-8).toUpperCase()}`,
                entryType: t.entryType || (["add", "gold_sell", "silver_sell", "copper_sell", "refund", "manual_credit"].includes(t.type) ? "credit" : "debit"),
                reason: t.reason || t.note || (t.type === "add" ? "Wallet Deposit" : (t.type === "deduct" ? "Wallet Deduction" : t.type)),
                adminName: t.adminName || (t.adminId?.name || t.adminId?.email) || "System",
                formattedDate: created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                formattedTime: created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
            };
        });

        res.json({ success: true, data: formatted });
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
                    runningCost += (t.totalAmt || t.goldValue);
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
                    runningSilverCost += (t.totalAmt || t.silverValue);
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

        // 3. Recalculate Copper Balance
        const copperTxns = await CopperTransaction.find({ user: userId, status: "success", type: { $ne: "sip_buy" } });
        let runningCopperGrams = 0;
        let runningCopperCost = 0;
        for (const t of copperTxns) {
            if (["buy", "gift"].includes(t.type)) {
                runningCopperGrams += t.grams;
                if (t.type === "buy") {
                    runningCopperCost += (t.totalAmt || t.copperValue);
                }
            } else if (["sell", "redeem"].includes(t.type)) {
                if (runningCopperGrams > 0) {
                    const avgRate = runningCopperCost / runningCopperGrams;
                    runningCopperCost -= (avgRate * t.grams);
                }
                runningCopperGrams -= t.grams;
            }
        }
        const totalCopperGrams = Math.max(0, runningCopperGrams);
        const copperInvestedAmt = Math.max(0, runningCopperCost);

        let copperBal = await CopperBalance.findOne({ user: userId });
        if (!copperBal) copperBal = new CopperBalance({ user: userId });
        copperBal.totalGrams = parseFloat(totalCopperGrams.toFixed(6));
        copperBal.investedAmt = parseFloat(copperInvestedAmt.toFixed(2));
        await copperBal.save();

        res.json({
            success: true,
            message: `Vault balance recalculated successfully. New Gold: ${goldBal.totalGrams}g, New Silver: ${silverBal.totalGrams}g, New Copper: ${copperBal.totalGrams}g`,
            data: {
                goldGrams: goldBal.totalGrams,
                silverGrams: silverBal.totalGrams,
                copperGrams: copperBal.totalGrams
            }
        });
    } catch (err) {
        next(err);
    }
};

// ── Testing & Admin Data Reset Handlers ──────────────────────────────────────
exports.resetUserVault = async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Reset Gold
        await GoldBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await GoldTransaction.deleteMany({ user: userId });

        // Reset Silver
        await SilverBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await SilverTransaction.deleteMany({ user: userId });

        // Reset Copper
        await CopperBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await CopperTransaction.deleteMany({ user: userId });

        // Reset Schemes & Savings
        await Saving.deleteMany({ user: userId });
        await SchemeEnrollment.deleteMany({ user: userId });

        res.json({
            success: true,
            message: "User bullion holdings (Gold, Silver, Copper) and all trading transactions have been reset to 0.",
            data: { goldGrams: 0, silverGrams: 0, copperGrams: 0 }
        });
    } catch (err) { next(err); }
};

exports.resetUserWallet = async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Reset Wallet
        await Wallet.findOneAndUpdate(
            { user: userId },
            { balance: 0, lockedBalance: 0, pendingCredit: 0, totalAdded: 0, totalWithdrawn: 0 },
            { upsert: true }
        );

        // Delete Wallet Transactions
        await WalletTxn.deleteMany({ user: userId });

        res.json({
            success: true,
            message: "User wallet balance and transaction logs have been reset to ₹0.",
            balance: 0
        });
    } catch (err) { next(err); }
};

exports.resetUserRewards = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const RewardTxn = require("../models/RewardTxn");

        // Delete all points transactions & spin logs (resets spin count back to 3)
        await RewardTxn.deleteMany({ user: userId });

        // Reset user points balance & referral balance
        await User.findByIdAndUpdate(userId, { rewardPoints: 0, referralBalance: 0 });

        res.json({
            success: true,
            message: "Reward points (0 pts), spin count (3 spins available), and rewards history have been completely reset.",
            data: { rewardPoints: 0, spinsLeft: 3 }
        });
    } catch (err) { next(err); }
};

exports.resetAllUserData = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const RewardTxn = require("../models/RewardTxn");

        // Reset Gold
        await GoldBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await GoldTransaction.deleteMany({ user: userId });

        // Reset Silver
        await SilverBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await SilverTransaction.deleteMany({ user: userId });

        // Reset Copper
        await CopperBalance.findOneAndUpdate(
            { user: userId },
            { totalGrams: 0, investedAmt: 0, lockedGrams: 0 },
            { upsert: true }
        );
        await CopperTransaction.deleteMany({ user: userId });

        // Reset Schemes & Savings
        await Saving.deleteMany({ user: userId });
        await SchemeEnrollment.deleteMany({ user: userId });

        // Reset Wallet & Wallet Transactions
        await Wallet.findOneAndUpdate(
            { user: userId },
            { balance: 0, lockedBalance: 0, pendingCredit: 0, totalAdded: 0, totalWithdrawn: 0 },
            { upsert: true }
        );
        await WalletTxn.deleteMany({ user: userId });

        // Reset Reward Points, Referral balance & purge all Reward Transactions (so spins and history reset to 0/3)
        await RewardTxn.deleteMany({ user: userId });
        await User.findByIdAndUpdate(userId, { rewardPoints: 0, referralBalance: 0 });

        res.json({
            success: true,
            message: "All testing data (Bullion Vault, Wallet Balance, Reward Points, Spin Count & all Transaction history) for this user has been wiped clean to 0.",
            data: { goldGrams: 0, silverGrams: 0, copperGrams: 0, balance: 0, rewardPoints: 0, spinsLeft: 3 }
        });
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
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        // Fetch live rates
        let liveRates = {
            gold: { buyRate: 7500, sellRate: 7450, change24h: 0, changePct: 0, purity: "24K 99.9%" },
            silver: { buyRate: 90, sellRate: 88, change24h: 0, changePct: 0, purity: "999 Pure" }
        };

        try {
            const { fetchLiveRates } = require("./goldController");
            if (typeof fetchLiveRates === "function") {
                const fetched = await fetchLiveRates();
                if (fetched) {
                    if (fetched.gold) liveRates.gold = { ...liveRates.gold, ...fetched.gold, purity: "24K 99.9%" };
                    if (fetched.silver) liveRates.silver = { ...liveRates.silver, ...fetched.silver, purity: "999 Pure" };
                }
            }
        } catch (e) {
            console.log("Live rate fetch fallback in dashboard:", e.message);
        }

        const goldSellRate = liveRates.gold.sellRate || 7450;
        const silverSellRate = liveRates.silver.sellRate || 88;
        const goldBuyRate = liveRates.gold.buyRate || 7500;
        const silverBuyRate = liveRates.silver.buyRate || 90;

        const [
            // User stats
            totalUsers,
            activeUsers,
            kycVerifiedUsers,
            kycPendingCount,
            kycRejectedCount,

            // Gold & Silver balance aggregations
            goldHoldingAgg,
            silverHoldingAgg,

            // Gold lifetime buy/sell transactions
            goldBuyAgg,
            goldSellAgg,
            todayGoldBuyAgg,
            todayGoldSellAgg,

            // Silver lifetime buy/sell transactions
            silverBuyAgg,
            silverSellAgg,
            todaySilverBuyAgg,
            todaySilverSellAgg,

            // Properties / Investments
            propertyInvestmentsAgg,
            totalProperties,
            publishedProperties,

            // SIPs & Schemes
            activeSipsCount,
            sipSavedAgg,
            activeSchemesCount,
            totalEnrollmentsCount,
            schemeInvestedAgg,

            // Pendings / Action items
            pendingWithdrawalsAgg,
            pendingSellGoldCount,
            pendingSellSilverCount,
            pendingGoldPayments,
            pendingSilverPayments,
            pendingWalletPayments,
            pendingRedemptionsCount,
            newEnquiriesCount,
            totalEnquiriesCount,

            // Coupons & Discounts
            activeCouponsCount,
            totalCouponsCount,
            goldCouponAgg,
            silverCouponAgg,

            // Recent Transactions
            recentGoldTxns,
            recentSilverTxns,
            recentCopperTxns,
            recentWalletTxns,

            // Chart data aggregations (last 30 days)
            chartGoldDaily,
            chartSilverDaily
        ] = await Promise.all([
            // Users
            User.countDocuments({ role: "user" }),
            User.countDocuments({ role: "user", isActive: { $ne: false } }),
            User.countDocuments({ role: "user", kycVerified: true }),
            Kyc.countDocuments({ status: "pending" }),
            Kyc.countDocuments({ status: "rejected" }),

            // Gold Holdings
            GoldBalance.aggregate([
                { $group: { _id: null, totalGrams: { $sum: "$totalGrams" }, totalInvested: { $sum: "$investedAmt" } } }
            ]),
            // Silver Holdings
            SilverBalance.aggregate([
                { $group: { _id: null, totalGrams: { $sum: "$totalGrams" }, totalInvested: { $sum: "$investedAmt" } } }
            ]),

            // Gold Lifetime Buy (success)
            GoldTransaction.aggregate([
                { $match: { type: { $in: ["buy", "sip_buy"] }, status: "success" } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$totalAmt" }, count: { $sum: 1 }, gst: { $sum: "$gstAmt" } } }
            ]),
            // Gold Lifetime Sell (success/processing)
            GoldTransaction.aggregate([
                { $match: { type: "sell", status: { $in: ["success", "processing"] } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$goldValue" }, count: { $sum: 1 } } }
            ]),
            // Today Gold Buy
            GoldTransaction.aggregate([
                { $match: { type: { $in: ["buy", "sip_buy"] }, status: "success", createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$totalAmt" } } }
            ]),
            // Today Gold Sell
            GoldTransaction.aggregate([
                { $match: { type: "sell", status: { $in: ["success", "processing"] }, createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$goldValue" } } }
            ]),

            // Silver Lifetime Buy
            SilverTransaction.aggregate([
                { $match: { type: "buy", status: "success" } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$totalAmt" }, count: { $sum: 1 }, gst: { $sum: "$gstAmt" } } }
            ]),
            // Silver Lifetime Sell
            SilverTransaction.aggregate([
                { $match: { type: "sell", status: { $in: ["success", "processing"] } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$silverValue" }, count: { $sum: 1 } } }
            ]),
            // Today Silver Buy
            SilverTransaction.aggregate([
                { $match: { type: "buy", status: "success", createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$totalAmt" } } }
            ]),
            // Today Silver Sell
            SilverTransaction.aggregate([
                { $match: { type: "sell", status: { $in: ["success", "processing"] }, createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, totalGrams: { $sum: "$grams" }, totalAmt: { $sum: "$silverValue" } } }
            ]),

            // Properties / Investments
            Investment.aggregate([
                { $match: { status: "paid" } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]),
            Property.countDocuments(),
            Property.countDocuments({ isPublished: true }),

            // SIPs & Schemes
            Saving.countDocuments({ isActive: true }),
            Saving.aggregate([
                { $group: { _id: null, totalSaved: { $sum: "$savedAmount" } } }
            ]),
            GoldScheme.countDocuments({ active: true }),
            SchemeEnrollment.countDocuments({ status: "active" }),
            SchemeEnrollment.aggregate([
                { $group: { _id: null, totalInvested: { $sum: "$totalInvested" } } }
            ]),

            // Pendings / Action Items
            WalletTxn.aggregate([
                { $match: { type: "withdraw", status: "pending" } },
                { $group: { _id: null, count: { $sum: 1 }, totalAmt: { $sum: "$amount" } } }
            ]),
            GoldTransaction.countDocuments({ type: "sell", status: "processing" }),
            SilverTransaction.countDocuments({ type: "sell", status: "processing" }),
            GoldTransaction.countDocuments({ status: "pending" }),
            SilverTransaction.countDocuments({ status: "pending" }),
            WalletTxn.countDocuments({ status: "pending" }),
            JewelleryRedemption.countDocuments({ status: "pending" }),
            Enquiry.countDocuments({ status: "new" }),
            Enquiry.countDocuments(),

            // Coupons & Discounts
            Coupon.countDocuments({ isActive: true }),
            Coupon.countDocuments(),
            GoldTransaction.aggregate([
                { $match: { isCouponApplied: true } },
                { $group: { _id: null, count: { $sum: 1 }, discount: { $sum: "$couponDiscount" }, bonus: { $sum: "$couponBonus" } } }
            ]),
            SilverTransaction.aggregate([
                { $match: { isCouponApplied: true } },
                { $group: { _id: null, count: { $sum: 1 }, discount: { $sum: "$couponDiscount" }, bonus: { $sum: "$couponBonus" } } }
            ]),

            // Recent Transactions
            GoldTransaction.find().populate("user", "name email phone").sort({ createdAt: -1 }).limit(10).lean(),
            SilverTransaction.find().populate("user", "name email phone").sort({ createdAt: -1 }).limit(10).lean(),
            CopperTransaction.find().populate("user", "name email phone").sort({ createdAt: -1 }).limit(10).lean(),
            WalletTxn.find({ type: { $in: ["add", "withdraw"] } }).populate("user", "name email phone").sort({ createdAt: -1 }).limit(10).lean(),

            // Daily chart trend (Gold 30d)
            GoldTransaction.aggregate([
                { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $in: ["success", "processing"] } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            type: "$type"
                        },
                        totalAmt: { $sum: "$totalAmt" },
                        grams: { $sum: "$grams" }
                    }
                }
            ]),
            // Daily chart trend (Silver 30d)
            SilverTransaction.aggregate([
                { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $in: ["success", "processing"] } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            type: "$type"
                        },
                        totalAmt: { $sum: "$totalAmt" },
                        grams: { $sum: "$grams" }
                    }
                }
            ])
        ]);

        // Process Gold Holdings
        const totalGoldGramsHeld = parseFloat((goldHoldingAgg[0]?.totalGrams || 0).toFixed(4));
        const totalGoldInvestedAmt = parseFloat((goldHoldingAgg[0]?.totalInvested || 0).toFixed(2));
        const totalGoldCurrentVal = parseFloat((totalGoldGramsHeld * goldSellRate).toFixed(2));

        // Process Silver Holdings
        const totalSilverGramsHeld = parseFloat((silverHoldingAgg[0]?.totalGrams || 0).toFixed(4));
        const totalSilverInvestedAmt = parseFloat((silverHoldingAgg[0]?.totalInvested || 0).toFixed(2));
        const totalSilverCurrentVal = parseFloat((totalSilverGramsHeld * silverSellRate).toFixed(2));

        // Process Property Investments
        const totalPropertyInvested = parseFloat((propertyInvestmentsAgg[0]?.totalAmount || 0).toFixed(2));

        // Total Investment Value
        const totalInvestmentValue = parseFloat((totalGoldCurrentVal + totalSilverCurrentVal + totalPropertyInvested).toFixed(2));

        // Lifetime Gold Purchases & Sales
        const totalGoldPurchasedGrams = parseFloat((goldBuyAgg[0]?.totalGrams || 0).toFixed(4));
        const totalGoldPurchasedAmt = parseFloat((goldBuyAgg[0]?.totalAmt || 0).toFixed(2));
        const totalGoldSoldGrams = parseFloat((goldSellAgg[0]?.totalGrams || 0).toFixed(4));
        const totalGoldSoldAmt = parseFloat((goldSellAgg[0]?.totalAmt || 0).toFixed(2));

        // Lifetime Silver Purchases & Sales
        const totalSilverPurchasedGrams = parseFloat((silverBuyAgg[0]?.totalGrams || 0).toFixed(4));
        const totalSilverPurchasedAmt = parseFloat((silverBuyAgg[0]?.totalAmt || 0).toFixed(2));
        const totalSilverSoldGrams = parseFloat((silverSellAgg[0]?.totalGrams || 0).toFixed(4));
        const totalSilverSoldAmt = parseFloat((silverSellAgg[0]?.totalAmt || 0).toFixed(2));

        // Today's Buy & Sell Volumes
        const todayGoldBuyGrams = parseFloat((todayGoldBuyAgg[0]?.totalGrams || 0).toFixed(4));
        const todayGoldBuyAmt = parseFloat((todayGoldBuyAgg[0]?.totalAmt || 0).toFixed(2));
        const todayGoldSellGrams = parseFloat((todayGoldSellAgg[0]?.totalGrams || 0).toFixed(4));
        const todayGoldSellAmt = parseFloat((todayGoldSellAgg[0]?.totalAmt || 0).toFixed(2));

        const todaySilverBuyGrams = parseFloat((todaySilverBuyAgg[0]?.totalGrams || 0).toFixed(4));
        const todaySilverBuyAmt = parseFloat((todaySilverBuyAgg[0]?.totalAmt || 0).toFixed(2));
        const todaySilverSellGrams = parseFloat((todaySilverSellAgg[0]?.totalGrams || 0).toFixed(4));
        const todaySilverSellAmt = parseFloat((todaySilverSellAgg[0]?.totalAmt || 0).toFixed(2));

        const todayBuyVolumeAmt = parseFloat((todayGoldBuyAmt + todaySilverBuyAmt).toFixed(2));
        const todaySellVolumeAmt = parseFloat((todayGoldSellAmt + todaySilverSellAmt).toFixed(2));

        // SIPs & Schemes
        const totalSipSaved = parseFloat((sipSavedAgg[0]?.totalSaved || 0).toFixed(2));
        const totalSchemeInvested = parseFloat((schemeInvestedAgg[0]?.totalInvested || 0).toFixed(2));

        // Action Items & Pendings
        const pendingWithdrawalsCount = pendingWithdrawalsAgg[0]?.count || 0;
        const pendingWithdrawalsAmt = parseFloat((pendingWithdrawalsAgg[0]?.totalAmt || 0).toFixed(2));
        const pendingSellApprovalsCount = (pendingSellGoldCount || 0) + (pendingSellSilverCount || 0);
        const pendingPaymentsCount = (pendingGoldPayments || 0) + (pendingSilverPayments || 0) + (pendingWalletPayments || 0);

        // Coupons & Revenue
        const couponUsageCount = (goldCouponAgg[0]?.count || 0) + (silverCouponAgg[0]?.count || 0);
        const totalCouponDiscounts = parseFloat(
            ((goldCouponAgg[0]?.discount || 0) + (goldCouponAgg[0]?.bonus || 0) +
             (silverCouponAgg[0]?.discount || 0) + (silverCouponAgg[0]?.bonus || 0)).toFixed(2)
        );

        // GST & Platform Revenue Estimation
        const totalGstCollected = parseFloat(((goldBuyAgg[0]?.gst || 0) + (silverBuyAgg[0]?.gst || 0)).toFixed(2));
        const totalTurnover = totalGoldPurchasedAmt + totalSilverPurchasedAmt + totalGoldSoldAmt + totalSilverSoldAmt;
        const estimatedRevenue = parseFloat((totalGstCollected + (totalTurnover * 0.005)).toFixed(2)); // estimated platform margin + fees

        // Combine and sort recent transactions
        const unifiedTxns = [];

        (recentGoldTxns || []).forEach(t => {
            unifiedTxns.push({
                id: t._id,
                invoiceNo: t.invoiceNo || `GLD-${String(t._id).slice(-6).toUpperCase()}`,
                asset: "Gold",
                metal: "gold",
                type: t.type,
                user: t.user ? { name: t.user.name, email: t.user.email, phone: t.user.phone } : null,
                grams: t.grams || 0,
                rate: t.ratePerGram || 0,
                amount: t.totalAmt || t.goldValue || 0,
                status: t.status,
                createdAt: t.createdAt
            });
        });

        (recentSilverTxns || []).forEach(t => {
            unifiedTxns.push({
                id: t._id,
                invoiceNo: t.invoiceNo || `SLV-${String(t._id).slice(-6).toUpperCase()}`,
                asset: "Silver",
                metal: "silver",
                type: t.type,
                user: t.user ? { name: t.user.name, email: t.user.email, phone: t.user.phone } : null,
                grams: t.grams || 0,
                rate: t.ratePerGram || 0,
                amount: t.totalAmt || t.silverValue || 0,
                status: t.status,
                createdAt: t.createdAt
            });
        });

        (recentCopperTxns || []).forEach(t => {
            unifiedTxns.push({
                id: t._id,
                invoiceNo: t.invoiceNo || `CPPR-${String(t._id).slice(-6).toUpperCase()}`,
                asset: "Copper",
                metal: "copper",
                type: t.type,
                user: t.user ? { name: t.user.name, email: t.user.email, phone: t.user.phone } : null,
                grams: t.grams || 0,
                rate: t.ratePerGram || 0,
                amount: t.totalAmt || t.copperValue || 0,
                status: t.status,
                createdAt: t.createdAt
            });
        });

        (recentWalletTxns || []).forEach(t => {
            unifiedTxns.push({
                id: t._id,
                invoiceNo: `WLT-${String(t._id).slice(-6).toUpperCase()}`,
                asset: "Wallet",
                metal: "wallet",
                type: t.type,
                user: t.user ? { name: t.user.name, email: t.user.email, phone: t.user.phone } : null,
                grams: 0,
                rate: 0,
                amount: t.amount || 0,
                status: t.status,
                createdAt: t.createdAt
            });
        });

        unifiedTxns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const recentTransactions = unifiedTxns.slice(0, 12);

        // Build 30-day continuous timeline for chart
        const chartDays = 30;
        const chartLabels = [];
        const goldBuySeries = [];
        const goldSellSeries = [];
        const silverBuySeries = [];
        const silverSellSeries = [];
        const totalBuySeries = [];
        const totalSellSeries = [];

        const goldMap = {};
        chartGoldDaily.forEach(item => {
            const key = `${item._id.date}_${item._id.type}`;
            goldMap[key] = (goldMap[key] || 0) + (item.totalAmt || 0);
        });

        const silverMap = {};
        chartSilverDaily.forEach(item => {
            const key = `${item._id.date}_${item._id.type}`;
            silverMap[key] = (silverMap[key] || 0) + (item.totalAmt || 0);
        });

        for (let i = chartDays - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const labelStr = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
            chartLabels.push(labelStr);

            const gBuy = (goldMap[`${dateStr}_buy`] || 0) + (goldMap[`${dateStr}_sip_buy`] || 0);
            const gSell = goldMap[`${dateStr}_sell`] || 0;
            const sBuy = silverMap[`${dateStr}_buy`] || 0;
            const sSell = silverMap[`${dateStr}_sell`] || 0;

            goldBuySeries.push(parseFloat(gBuy.toFixed(2)));
            goldSellSeries.push(parseFloat(gSell.toFixed(2)));
            silverBuySeries.push(parseFloat(sBuy.toFixed(2)));
            silverSellSeries.push(parseFloat(sSell.toFixed(2)));

            totalBuySeries.push(parseFloat((gBuy + sBuy).toFixed(2)));
            totalSellSeries.push(parseFloat((gSell + sSell).toFixed(2)));
        }

        res.json({
            success: true,
            data: {
                // 1. Users
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    kycVerified: kycVerifiedUsers,
                    kycPending: kycPendingCount,
                    kycRejected: kycRejectedCount
                },
                // 2. Gold Stats
                gold: {
                    totalGramsHeld: totalGoldGramsHeld,
                    totalInvestedAmt: totalGoldInvestedAmt,
                    currentValue: totalGoldCurrentVal,
                    totalPurchasedGrams: totalGoldPurchasedGrams,
                    totalPurchasedAmt: totalGoldPurchasedAmt,
                    totalSoldGrams: totalGoldSoldGrams,
                    totalSoldAmt: totalGoldSoldAmt,
                    todayBuyGrams: todayGoldBuyGrams,
                    todayBuyAmt: todayGoldBuyAmt,
                    todaySellGrams: todayGoldSellGrams,
                    todaySellAmt: todayGoldSellAmt
                },
                // 3. Silver Stats
                silver: {
                    totalGramsHeld: totalSilverGramsHeld,
                    totalInvestedAmt: totalSilverInvestedAmt,
                    currentValue: totalSilverCurrentVal,
                    totalPurchasedGrams: totalSilverPurchasedGrams,
                    totalPurchasedAmt: totalSilverPurchasedAmt,
                    totalSoldGrams: totalSilverSoldGrams,
                    totalSoldAmt: totalSilverSoldAmt,
                    todayBuyGrams: todaySilverBuyGrams,
                    todayBuyAmt: todaySilverBuyAmt,
                    todaySellGrams: todaySilverSellGrams,
                    todaySellAmt: todaySilverSellAmt
                },
                // 4. Combined Volume & Portfolio Value
                investments: {
                    totalInvestmentValue,
                    totalPropertyInvested,
                    totalGoldCurrentVal,
                    totalSilverCurrentVal,
                    totalProperties,
                    publishedProperties
                },
                // 5. Today's Volumes
                today: {
                    totalBuyAmt: todayBuyVolumeAmt,
                    totalBuyGoldGrams: todayGoldBuyGrams,
                    totalBuySilverGrams: todaySilverBuyGrams,
                    totalSellAmt: todaySellVolumeAmt,
                    totalSellGoldGrams: todayGoldSellGrams,
                    totalSellSilverGrams: todaySilverSellGrams
                },
                // 6. SIPs & Schemes
                schemesAndSips: {
                    activeSips: activeSipsCount,
                    totalSipSaved,
                    activeSchemes: activeSchemesCount,
                    totalEnrollments: totalEnrollmentsCount,
                    totalSchemeInvested
                },
                // 7. Pendings & Action Items
                actionItems: {
                    pendingWithdrawals: pendingWithdrawalsCount,
                    pendingWithdrawalsAmt,
                    pendingSellApprovals: pendingSellApprovalsCount,
                    pendingKyc: kycPendingCount,
                    pendingPayments: pendingPaymentsCount,
                    pendingRedemptions: pendingRedemptionsCount,
                    newEnquiries: newEnquiriesCount,
                    totalEnquiries: totalEnquiriesCount
                },
                // 8. Coupons & Revenue
                commercials: {
                    totalCoupons: totalCouponsCount,
                    activeCoupons: activeCouponsCount,
                    couponUsageCount,
                    totalDiscountDistributed: totalCouponDiscounts,
                    revenue: estimatedRevenue,
                    gstCollected: totalGstCollected
                },
                // 9. Live Rate Cards
                rates: {
                    gold: {
                        buyRate: goldBuyRate,
                        sellRate: goldSellRate,
                        change24h: liveRates.gold.change24h || 0,
                        changePct: liveRates.gold.changePct || 0,
                        purity: "24K 99.9%"
                    },
                    silver: {
                        buyRate: silverBuyRate,
                        sellRate: silverSellRate,
                        change24h: liveRates.silver.change24h || 0,
                        changePct: liveRates.silver.changePct || 0,
                        purity: "999 Pure"
                    },
                    updatedAt: new Date()
                },
                // 10. Recent Transactions Feed
                recentTransactions,
                // 11. Interactive Chart Data
                charts: {
                    labels: chartLabels,
                    goldBuy: goldBuySeries,
                    goldSell: goldSellSeries,
                    silverBuy: silverBuySeries,
                    silverSell: silverSellSeries,
                    totalBuy: totalBuySeries,
                    totalSell: totalSellSeries
                }
            }
        });
    } catch (err) {
        next(err);
    }
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

// GET /api/admin/sell-approvals?metal=gold|silver|copper|all&status=processing
exports.getSellApprovals = async (req, res, next) => {
    try {
        const { metal = "all", status = "processing", page = 1, limit = 30 } = req.query;
        const filter = { type: "sell" };
        if (status !== "all") filter.status = status;

        const AppConfig = require("../models/AppConfig");
        let appConfig = await AppConfig.findOne();
        const holdingDays = (appConfig && appConfig.newUsersSellHoldingDays !== undefined) ? Number(appConfig.newUsersSellHoldingDays) : 30;

        const wantGold = metal === "all" || metal === "gold";
        const wantSilver = metal === "all" || metal === "silver";
        const wantCopper = metal === "all" || metal === "copper";

        const [goldTxns, silverTxns, copperTxns] = await Promise.all([
            wantGold ? GoldTransaction.find(filter).populate("user", "name email phone createdAt").sort({ createdAt: -1 }) : [],
            wantSilver ? SilverTransaction.find(filter).populate("user", "name email phone createdAt").sort({ createdAt: -1 }) : [],
            wantCopper ? CopperTransaction.find(filter).populate("user", "name email phone createdAt").sort({ createdAt: -1 }) : [],
        ]);

        const combined = [
            ...goldTxns.map(t => ({ ...t.toObject(), metal: "gold", value: t.goldValue })),
            ...silverTxns.map(t => ({ ...t.toObject(), metal: "silver", value: t.silverValue })),
            ...copperTxns.map(t => ({ ...t.toObject(), metal: "copper", value: t.copperValue })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Annotate each transaction with first buy date and holding period info
        const userIds = [...new Set(combined.map(t => t.user?._id || t.user).filter(Boolean))];
        const [userGoldFirstBuys, userSilverFirstBuys, userCopperFirstBuys] = await Promise.all([
            GoldTransaction.aggregate([
                { $match: { user: { $in: userIds }, type: { $in: ["buy", "sip_buy"] }, status: "success" } },
                { $group: { _id: "$user", firstDate: { $min: "$createdAt" } } }
            ]),
            SilverTransaction.aggregate([
                { $match: { user: { $in: userIds }, type: { $in: ["buy", "sip_buy"] }, status: "success" } },
                { $group: { _id: "$user", firstDate: { $min: "$createdAt" } } }
            ]),
            CopperTransaction ? CopperTransaction.aggregate([
                { $match: { user: { $in: userIds }, type: { $in: ["buy", "sip_buy"] }, status: "success" } },
                { $group: { _id: "$user", firstDate: { $min: "$createdAt" } } }
            ]) : []
        ]);

        const firstBuyMap = {};
        userGoldFirstBuys.forEach(x => {
            firstBuyMap[String(x._id)] = x.firstDate;
        });
        userSilverFirstBuys.forEach(x => {
            const uid = String(x._id);
            if (!firstBuyMap[uid] || x.firstDate < firstBuyMap[uid]) {
                firstBuyMap[uid] = x.firstDate;
            }
        });
        userCopperFirstBuys.forEach(x => {
            const uid = String(x._id);
            if (!firstBuyMap[uid] || x.firstDate < firstBuyMap[uid]) {
                firstBuyMap[uid] = x.firstDate;
            }
        });

        const total = combined.length;
        const start = (page - 1) * limit;
        const paged = combined.slice(start, start + Number(limit)).map(t => {
            const uid = String(t.user?._id || t.user || "");
            const firstBuyDate = firstBuyMap[uid] || t.user?.createdAt || null;
            let daysSinceFirstBuy = null;
            let isHoldingPeriodMet = true;
            let daysRemainingInHold = 0;

            if (firstBuyDate && holdingDays > 0) {
                const elapsedMs = new Date(t.createdAt).getTime() - new Date(firstBuyDate).getTime();
                daysSinceFirstBuy = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
                isHoldingPeriodMet = daysSinceFirstBuy >= holdingDays;
                if (!isHoldingPeriodMet) {
                    daysRemainingInHold = Math.max(1, Math.ceil(holdingDays - (elapsedMs / (24 * 60 * 60 * 1000))));
                }
            }

            return {
                ...t,
                holdingDaysConfigured: holdingDays,
                firstBuyDate,
                daysSinceFirstBuy,
                isHoldingPeriodMet,
                daysRemainingInHold
            };
        });

        res.json({
            success: true,
            data: paged,
            total,
            page: +page,
            pages: Math.ceil(total / limit),
            newUsersSellHoldingDays: holdingDays
        });
    } catch (err) { next(err); }
};

// PATCH /api/admin/sell-approvals/:id/approve?metal=gold|silver|copper
// Moves pendingCredit → balance, deducts locked grams, marks the sale complete.
exports.approveSellPayout = async (req, res, next) => {
    try {
        const { metal } = req.query;
        if (metal !== "gold" && metal !== "silver" && metal !== "copper") {
            return res.status(400).json({ success: false, message: "metal query param must be 'gold', 'silver', or 'copper'" });
        }

        let Transaction = GoldTransaction;
        let Balance = GoldBalance;
        let linkField = "goldTxnId";

        if (metal === "silver") {
            Transaction = SilverTransaction;
            Balance = SilverBalance;
            linkField = "silverTxnId";
        } else if (metal === "copper") {
            Transaction = CopperTransaction;
            Balance = CopperBalance;
            linkField = "copperTxnId";
        }

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
                .populate("user", "name email phone referralCode")
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

// ── GET /api/admin/referrals ─────────────────────────────────────────────────
exports.getAdminReferrals = async (req, res, next) => {
    try {
        const Referral = require("../models/Referral");
        const User = require("../models/User");

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status && req.query.status !== "all") {
            filter.status = req.query.status;
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            const matchingUsers = await User.find({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex },
                    { referralCode: searchRegex }
                ],
            }).select("_id");
            const userIds = matchingUsers.map(u => u._id);

            filter.$or = [
                { referrer: { $in: userIds } },
                { referredUser: { $in: userIds } },
                { referralCode: searchRegex }
            ];
        }

        const [referrals, total] = await Promise.all([
            Referral.find(filter)
                .populate("referrer", "name email phone referralCode referralBalance")
                .populate("referredUser", "name email phone createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Referral.countDocuments(filter),
        ]);

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: referrals,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/admin/rewards/summary ───────────────────────────────────────────
exports.getAdminRewardsSummary = async (req, res, next) => {
    try {
        const RewardTxn = require("../models/RewardTxn");
        const Referral = require("../models/Referral");
        const User = require("../models/User");

        const [
            totalRewardTxns,
            rewardTypeStats,
            totalReferralsCount,
            totalReferralCashDistributed,
            uniqueReferrersCount,
            totalUsersWithPoints
        ] = await Promise.all([
            RewardTxn.countDocuments(),
            RewardTxn.aggregate([
                {
                    $group: {
                        _id: "$type",
                        totalPoints: { $sum: "$points" },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Referral.countDocuments(),
            Referral.aggregate([
                { $group: { _id: null, totalCash: { $sum: "$rewardAmount" }, totalPoints: { $sum: "$rewardPoints" } } }
            ]),
            Referral.distinct("referrer"),
            User.countDocuments({ rewardPoints: { $gt: 0 } })
        ]);

        let totalPointsGiven = 0;
        let totalPointsRedeemed = 0;
        let registrationPointsGiven = 0;
        let referralPointsGiven = 0;
        let spinPointsGiven = 0;

        rewardTypeStats.forEach(stat => {
            if (stat._id === "redeem") {
                totalPointsRedeemed += Math.abs(stat.totalPoints);
            } else {
                totalPointsGiven += stat.totalPoints;
                if (stat._id === "registration") registrationPointsGiven += stat.totalPoints;
                if (stat._id === "referral") referralPointsGiven += stat.totalPoints;
                if (stat._id === "spin_win") spinPointsGiven += stat.totalPoints;
            }
        });

        const cashDistributed = totalReferralCashDistributed[0]?.totalCash || 0;

        res.json({
            success: true,
            data: {
                totalRewardsDistributed: {
                    totalPointsGiven,
                    totalPointsRedeemed,
                    netActivePoints: Math.max(0, totalPointsGiven - totalPointsRedeemed),
                    totalReferralCashBonus: cashDistributed,
                    overallTotalRupeesEquivalent: parseFloat((cashDistributed + (totalPointsGiven * 0.05)).toFixed(2))
                },
                breakdown: {
                    registrationPointsGiven,
                    referralPointsGiven,
                    spinPointsGiven,
                    totalPointsRedeemed
                },
                referralStats: {
                    totalReferralsCount,
                    uniqueActiveReferrers: uniqueReferrersCount.length,
                    totalCashDistributed: cashDistributed,
                },
                usersWithRewardsCount: totalUsersWithPoints,
                totalTransactions: totalRewardTxns
            }
        });
    } catch (err) {
        next(err);
    }
};

// Helper: Generate Unique SKU for Bullion Coin
async function generateUniqueCoinSku(metal, grams) {
    const Coin = require("../models/Coin");
    const m = (metal || "gold").toUpperCase();
    const g = parseFloat(grams || 1);
    const count = await Coin.countDocuments();
    let serial = count + 1;
    let sku = `VIKA-${m}-COIN-${g}G-${String(serial).padStart(3, "0")}`;
    let exists = await Coin.findOne({ sku });
    while (exists) {
        serial++;
        sku = `VIKA-${m}-COIN-${g}G-${String(serial).padStart(3, "0")}`;
        exists = await Coin.findOne({ sku });
    }
    return sku;
}

exports.getAdminCoins = async (req, res, next) => {
    try {
        const { fetchLiveRates } = require("./goldController");
        const Coin = require("../models/Coin");
        
        const rates = await fetchLiveRates();
        const coins = await Coin.find().sort({ metal: 1, grams: 1 });
        
        const data = coins.map(c => {
            const rate = c.metal === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const value = parseFloat((c.grams * rate).toFixed(2));
            const making = parseFloat((value * (c.makingChargePct || 5) / 100).toFixed(2));
            const calculatedTotal = parseFloat((value + making).toFixed(2));
            return {
                ...c.toObject(),
                ratePerGram: rate,
                value,
                makingCharge: making,
                totalValue: c.price && c.price > 0 ? c.price : calculatedTotal
            };
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

exports.createCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        let { name, sku, metal, purity, category, grams, price, priceAdjustment, makingChargePct, image, availableQty, lowStockThreshold, isActive } = req.body;
        if (!name || !metal || !grams || makingChargePct === undefined) {
            return res.status(400).json({ success: false, message: "Name, metal, grams, and making charge percent are required" });
        }

        if (sku && String(sku).trim()) {
            sku = String(sku).trim().toUpperCase();
            const existing = await Coin.findOne({ sku });
            if (existing) {
                return res.status(400).json({ success: false, message: `SKU "${sku}" is already in use by another coin product.` });
            }
        } else {
            sku = await generateUniqueCoinSku(metal, grams);
        }

        let primaryImg = image || imageUrl || "";
        let imgList = [];
        if (Array.isArray(images) && images.length > 0) {
            imgList = images.map(img => String(img).trim()).filter(Boolean);
        }
        if (primaryImg) {
            primaryImg = String(primaryImg).trim();
            imgList = [primaryImg, ...imgList.filter(x => x !== primaryImg)];
        } else if (imgList.length > 0) {
            primaryImg = imgList[0];
        }

        const coin = await Coin.create({
            name,
            sku,
            metal,
            purity: purity || (metal === "gold" ? "24K 999 Purity" : "999 Fine Silver"),
            category: category || "Coins & Bars",
            grams: Number(grams),
            price: price !== undefined && Number(price) > 0 ? Number(price) : 0,
            priceAdjustment: priceAdjustment !== undefined ? Number(priceAdjustment) || 0 : 0,
            makingChargePct: Number(makingChargePct),
            image: primaryImg,
            imageUrl: primaryImg,
            images: imgList,
            availableQty: availableQty !== undefined ? Number(availableQty) : 50,
            reservedQty: 0,
            soldQty: 0,
            lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 10,
            isActive: isActive !== undefined ? isActive : true
        });
        res.status(201).json({ success: true, message: "Coin created successfully", data: coin });
    } catch (err) { next(err); }
};

exports.updateCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        let { name, sku, metal, purity, category, grams, price, priceAdjustment, makingChargePct, image, imageUrl, images, availableQty, reservedQty, soldQty, lowStockThreshold, isActive } = req.body;
        const coin = await Coin.findById(req.params.id);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });

        if (sku) {
            sku = String(sku).trim().toUpperCase();
            const existing = await Coin.findOne({ sku, _id: { $ne: req.params.id } });
            if (existing) {
                return res.status(400).json({ success: false, message: `SKU "${sku}" is already assigned to "${existing.name}".` });
            }
            coin.sku = sku;
        }

        if (name !== undefined) coin.name = name;
        if (metal !== undefined) coin.metal = metal;
        if (purity !== undefined) coin.purity = purity;
        if (category !== undefined) coin.category = category;
        if (grams !== undefined) coin.grams = Number(grams);
        if (price !== undefined) coin.price = Math.max(0, Number(price) || 0);
        if (priceAdjustment !== undefined) coin.priceAdjustment = Number(priceAdjustment) || 0;
        if (makingChargePct !== undefined) coin.makingChargePct = Number(makingChargePct);
        
        let primaryImg = (imageUrl !== undefined ? imageUrl : image);
        if (primaryImg !== undefined) {
            primaryImg = String(primaryImg).trim();
            coin.image = primaryImg;
            coin.imageUrl = primaryImg;
            if (Array.isArray(images) && images.length > 0) {
                const rest = images.map(img => String(img).trim()).filter(x => x && x !== primaryImg);
                coin.images = [primaryImg, ...rest];
            } else if (primaryImg) {
                coin.images = [primaryImg];
            }
        } else if (Array.isArray(images) && images.length > 0) {
            coin.images = images.map(img => String(img).trim()).filter(Boolean);
            coin.image = coin.images[0] || "";
            coin.imageUrl = coin.images[0] || "";
        }

        if (availableQty !== undefined) coin.availableQty = Math.max(0, Number(availableQty));
        if (reservedQty !== undefined) coin.reservedQty = Math.max(0, Number(reservedQty));
        if (soldQty !== undefined) coin.soldQty = Math.max(0, Number(soldQty));
        if (lowStockThreshold !== undefined) coin.lowStockThreshold = Math.max(0, Number(lowStockThreshold));
        if (isActive !== undefined) coin.isActive = isActive;

        await coin.save();
        res.json({ success: true, message: "Coin updated successfully", data: coin });
    } catch (err) { next(err); }
};

exports.uploadCoinImage = (req, res) => {
    const { uploadJewelleryImage } = require("../middleware/uploadMiddleware");
    const Coin = require("../models/Coin");
    uploadJewelleryImage(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || "Upload failed" });
        try {
            if (!req.file) return res.status(400).json({ success: false, message: "No image file provided" });
            const imageUrl = req.file.path;
            const coin = await Coin.findById(req.params.id);
            if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });
            coin.image = imageUrl;
            coin.imageUrl = imageUrl;
            let currentImages = Array.isArray(coin.images) ? coin.images.filter(x => x && x !== imageUrl) : [];
            coin.images = [imageUrl, ...currentImages];
            await coin.save();
            res.json({ success: true, imageUrl, images: coin.images, message: "Coin image uploaded successfully" });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

exports.deleteCoin = async (req, res, next) => {
    try {
        const Coin = require("../models/Coin");
        const coin = await Coin.findByIdAndDelete(req.params.id);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });
        res.json({ success: true, message: "Coin deleted successfully" });
    } catch (err) { next(err); }
};

// ── INVENTORY MANAGEMENT SUITE ───────────────────────────────────────────────
exports.getInventory = async (req, res, next) => {
    try {
        const Jewellery = require("../models/Jewellery");
        const Coin = require("../models/Coin");
        const { fetchLiveRates } = require("./goldController");
        const rates = await fetchLiveRates();

        const { search, metal, status, type } = req.query;

        const [jewelleryItems, coinItems] = await Promise.all([
            Jewellery.find().sort({ createdAt: -1 }),
            Coin.find().sort({ createdAt: -1 })
        ]);

        let unifiedInventory = [];

        // 1. Process Jewellery Items
        jewelleryItems.forEach(j => {
            const avail = j.availableQty !== undefined ? j.availableQty : (j.inStock ? 10 : 0);
            const lowThreshold = j.lowStockThreshold || 5;
            let stockStatus = "in_stock";
            if (avail <= 0) stockStatus = "out_of_stock";
            else if (avail <= lowThreshold) stockStatus = "low_stock";

            const rate = j.metalType === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const bullionVal = (j.weightGrams || 0) * rate;
            const estVal = Math.round(bullionVal + (j.makingCharges || 1500));

            unifiedInventory.push({
                id: j._id,
                type: "jewellery",
                sku: j.sku || `VIKA-${(j.metalType || 'gold').toUpperCase()}-JEWEL-${String(j._id).slice(-4).toUpperCase()}`,
                name: j.name,
                category: j.category || "Jewellery",
                metal: j.metalType || "gold",
                purity: j.purity || (j.metalType === "gold" ? "22K Gold" : "999 Silver"),
                weightGrams: j.weightGrams || 0,
                price: j.price || 0,
                makingCharges: j.makingCharges || 1500,
                availableQty: avail,
                reservedQty: j.reservedQty || 0,
                soldQty: j.soldQty || 0,
                lowStockThreshold: lowThreshold,
                stockStatus,
                inStock: avail > 0,
                imageUrl: j.imageUrl || (j.images && j.images[0]) || "",
                currentUnitValue: j.price && j.price > 0 ? j.price : estVal,
                createdAt: j.createdAt
            });
        });

        // 2. Process Coin & Bar Items
        coinItems.forEach(c => {
            const avail = c.availableQty !== undefined ? c.availableQty : (c.isActive ? 50 : 0);
            const lowThreshold = c.lowStockThreshold || 10;
            let stockStatus = "in_stock";
            if (avail <= 0) stockStatus = "out_of_stock";
            else if (avail <= lowThreshold) stockStatus = "low_stock";

            const rate = c.metal === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const bullionVal = (c.grams || 0) * rate;
            const making = (bullionVal * (c.makingChargePct || 5)) / 100;
            const estVal = Math.round(bullionVal + making);

            unifiedInventory.push({
                id: c._id,
                type: "coin",
                sku: c.sku || `VIKA-${(c.metal || 'gold').toUpperCase()}-COIN-${c.grams}G-${String(c._id).slice(-4).toUpperCase()}`,
                name: c.name,
                category: c.category || "Coins & Bars",
                metal: c.metal || "gold",
                purity: c.purity || (c.metal === "gold" ? "24K 999 Purity" : "999 Fine Silver"),
                weightGrams: c.grams || 0,
                price: c.price || 0,
                makingCharges: Math.round(making),
                availableQty: avail,
                reservedQty: c.reservedQty || 0,
                soldQty: c.soldQty || 0,
                lowStockThreshold: lowThreshold,
                stockStatus,
                inStock: avail > 0,
                imageUrl: c.image || "",
                currentUnitValue: c.price && c.price > 0 ? c.price : estVal,
                createdAt: c.createdAt
            });
        });

        // Calculate Summary Statistics across the full catalog
        const stats = {
            totalProducts: unifiedInventory.length,
            inStockCount: unifiedInventory.filter(item => item.stockStatus === "in_stock").length,
            lowStockCount: unifiedInventory.filter(item => item.stockStatus === "low_stock").length,
            outOfStockCount: unifiedInventory.filter(item => item.stockStatus === "out_of_stock").length,
            totalAvailableUnits: unifiedInventory.reduce((acc, item) => acc + (item.availableQty || 0), 0),
            totalReservedUnits: unifiedInventory.reduce((acc, item) => acc + (item.reservedQty || 0), 0),
            totalSoldUnits: unifiedInventory.reduce((acc, item) => acc + (item.soldQty || 0), 0),
            totalGoldWeightGrams: unifiedInventory.filter(i => i.metal === "gold").reduce((acc, item) => acc + ((item.weightGrams || 0) * (item.availableQty || 0)), 0),
            totalSilverWeightGrams: unifiedInventory.filter(i => i.metal === "silver").reduce((acc, item) => acc + ((item.weightGrams || 0) * (item.availableQty || 0)), 0),
        };

        // Apply filters
        let filtered = unifiedInventory;

        if (type && type !== "all") {
            filtered = filtered.filter(i => i.type === type);
        }

        if (metal && metal !== "all") {
            filtered = filtered.filter(i => i.metal.toLowerCase() === metal.toLowerCase());
        }

        if (status && status !== "all") {
            filtered = filtered.filter(i => i.stockStatus === status);
        }

        if (search) {
            const q = search.toLowerCase().trim();
            filtered = filtered.filter(i =>
                (i.sku || "").toLowerCase().includes(q) ||
                (i.name || "").toLowerCase().includes(q) ||
                (i.category || "").toLowerCase().includes(q) ||
                (i.purity || "").toLowerCase().includes(q) ||
                (i.metal || "").toLowerCase().includes(q)
            );
        }

        res.json({
            success: true,
            data: filtered,
            stats
        });
    } catch (err) { next(err); }
};

exports.updateInventoryStock = async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const { availableQty, lowStockThreshold, sku, action, adjustment } = req.body;

        const Jewellery = require("../models/Jewellery");
        const Coin = require("../models/Coin");

        let target = type === "coin" ? await Coin.findById(id) : await Jewellery.findById(id);
        if (!target) return res.status(404).json({ success: false, message: "Product not found in inventory" });

        if (sku) {
            const cleanSku = String(sku).trim().toUpperCase();
            const Model = type === "coin" ? Coin : Jewellery;
            const conflict = await Model.findOne({ sku: cleanSku, _id: { $ne: id } });
            if (conflict) {
                return res.status(400).json({ success: false, message: `SKU "${cleanSku}" already belongs to "${conflict.name}"` });
            }
            target.sku = cleanSku;
        }

        if (action === "add" && adjustment) {
            target.availableQty = (target.availableQty || 0) + Number(adjustment);
        } else if (action === "deduct" && adjustment) {
            target.availableQty = Math.max(0, (target.availableQty || 0) - Number(adjustment));
        } else if (availableQty !== undefined) {
            target.availableQty = Math.max(0, Number(availableQty));
        }

        if (lowStockThreshold !== undefined) {
            target.lowStockThreshold = Math.max(0, Number(lowStockThreshold));
        }

        if (type === "jewellery") {
            target.inStock = target.availableQty > 0;
        } else {
            target.isActive = target.availableQty > 0;
        }

        await target.save();

        res.json({
            success: true,
            message: `Inventory stock updated for "${target.name}" (SKU: ${target.sku}). Available: ${target.availableQty} units.`,
            data: target
        });
    } catch (err) { next(err); }
};

exports.backfillInventorySkus = async (req, res, next) => {
    try {
        const Jewellery = require("../models/Jewellery");
        const Coin = require("../models/Coin");
        const JewelleryRedemption = require("../models/JewelleryRedemption");

        let jCount = 0;
        let cCount = 0;
        let oCount = 0;

        // 1. Backfill Jewellery
        const jewellers = await Jewellery.find();
        for (let j of jewellers) {
            let changed = false;
            if (!j.sku) {
                j.sku = await generateUniqueJewellerySku(j.metalType, j.category);
                changed = true;
            }
            if (j.availableQty === undefined) {
                j.availableQty = 10;
                j.reservedQty = 0;
                j.soldQty = 0;
                j.lowStockThreshold = 5;
                changed = true;
            }
            if (changed) {
                await j.save();
                jCount++;
            }
        }

        // 2. Backfill Coins
        const coins = await Coin.find();
        for (let c of coins) {
            let changed = false;
            if (!c.sku) {
                c.sku = await generateUniqueCoinSku(c.metal, c.grams);
                changed = true;
            }
            if (c.availableQty === undefined) {
                c.availableQty = 50;
                c.reservedQty = 0;
                c.soldQty = 0;
                c.lowStockThreshold = 10;
                changed = true;
            }
            if (!c.purity) {
                c.purity = c.metal === "gold" ? "24K 999 Purity" : "999 Fine Silver";
                changed = true;
            }
            if (changed) {
                await c.save();
                cCount++;
            }
        }

        // 3. Backfill Orders with SKU snapshot
        const orders = await JewelleryRedemption.find({ $or: [{ sku: "" }, { sku: { $exists: false } }] }).populate("jewellery");
        for (let o of orders) {
            if (o.jewellery && o.jewellery.sku) {
                o.sku = o.jewellery.sku;
                await o.save();
                oCount++;
            }
        }

        res.json({
            success: true,
            message: `SKU & Inventory backfill complete! Updated ${jCount} jewellery products, ${cCount} bullion coins, and ${oCount} orders.`,
            stats: { jewelleryUpdated: jCount, coinsUpdated: cCount, ordersUpdated: oCount }
        });
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
        const { latestVersion, forceUpdate, playStoreUrl, newUsersSellHoldingDays } = req.body;
        let config = await AppConfig.findOne();
        if (!config) {
            config = await AppConfig.create({ latestVersion, forceUpdate, playStoreUrl, newUsersSellHoldingDays });
        } else {
            if (latestVersion !== undefined) config.latestVersion = latestVersion;
            if (forceUpdate !== undefined) config.forceUpdate = forceUpdate;
            if (playStoreUrl !== undefined) config.playStoreUrl = playStoreUrl;
            if (newUsersSellHoldingDays !== undefined) config.newUsersSellHoldingDays = Math.max(0, Math.floor(Number(newUsersSellHoldingDays)));
            await config.save();
        }
        res.json({ success: true, message: "App configuration updated successfully", data: config });
    } catch (err) { next(err); }
};

// ── NEW USER SELL HOLDING SETTINGS (Lock-in Period) ───────────────
exports.getSellSettings = async (req, res, next) => {
    try {
        let config = await AppConfig.findOne();
        if (!config) {
            config = await AppConfig.create({});
        }
        res.json({
            success: true,
            data: {
                newUsersSellHoldingDays: config.newUsersSellHoldingDays !== undefined ? config.newUsersSellHoldingDays : 30
            }
        });
    } catch (err) { next(err); }
};

exports.updateSellSettings = async (req, res, next) => {
    try {
        let { newUsersSellHoldingDays } = req.body;
        if (newUsersSellHoldingDays === undefined || isNaN(Number(newUsersSellHoldingDays)) || Number(newUsersSellHoldingDays) < 0) {
            return res.status(400).json({ success: false, message: "Valid number of days is required (0 to disable restriction)" });
        }
        newUsersSellHoldingDays = Math.max(0, Math.floor(Number(newUsersSellHoldingDays)));

        let config = await AppConfig.findOne();
        if (!config) {
            config = await AppConfig.create({ newUsersSellHoldingDays });
        } else {
            config.newUsersSellHoldingDays = newUsersSellHoldingDays;
            await config.save();
        }

        res.json({
            success: true,
            message: `New user sell holding period updated to ${newUsersSellHoldingDays} days`,
            data: {
                newUsersSellHoldingDays: config.newUsersSellHoldingDays
            }
        });
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

        // Search filter (User Name, Email, Phone, Jewellery Name, or SKU)
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
                { jewelleryName: searchRegex },
                { sku: searchRegex }
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
            .populate("jewellery", "name sku category imageUrl purity weightGrams makingCharges")
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
        const { deliveryStatus, trackingId, trackingUrl, courierName, estimatedDeliveryDate, statusNote, shippingAddress, refundStatus } = req.body;
        const Jewellery = require("../models/Jewellery");
        const order = await JewelleryRedemption.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const oldStatus = order.deliveryStatus;
        let statusChanged = false;
        if (deliveryStatus && deliveryStatus !== oldStatus) {
            order.deliveryStatus = deliveryStatus;
            statusChanged = true;
        }

        if (refundStatus !== undefined) order.refundStatus = refundStatus;
        if (trackingId !== undefined) order.trackingId = trackingId;
        if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
        if (courierName !== undefined) order.courierName = courierName;
        if (estimatedDeliveryDate !== undefined) order.estimatedDeliveryDate = estimatedDeliveryDate;
        if (statusNote !== undefined) order.statusNote = statusNote;
        if (shippingAddress !== undefined) order.shippingAddress = shippingAddress;

        // Synchronize product inventory on order status change
        if (statusChanged && order.jewellery) {
            const product = await Jewellery.findById(order.jewellery);
            if (product) {
                const qty = order.quantity || 1;

                if (deliveryStatus === "delivered" && oldStatus !== "delivered") {
                    // Item successfully delivered -> move from reserved to sold
                    product.reservedQty = Math.max(0, (product.reservedQty || 0) - qty);
                    product.soldQty = (product.soldQty || 0) + qty;
                    await product.save();
                } else if (["cancelled", "returned", "refunded"].includes(deliveryStatus) && !["cancelled", "returned", "refunded"].includes(oldStatus)) {
                    // Item cancelled / returned / refunded -> restore stock
                    if (oldStatus === "delivered") {
                        product.soldQty = Math.max(0, (product.soldQty || 0) - qty);
                    } else {
                        product.reservedQty = Math.max(0, (product.reservedQty || 0) - qty);
                    }
                    product.availableQty = (product.availableQty || 0) + qty;
                    product.inStock = product.availableQty > 0;
                    await product.save();
                }
            }
        }

        if (statusChanged) {
            const statusTitles = {
                placed: "Order Placed",
                pending: "Order Received",
                processing: "Processing & Quality Check",
                out_of_warehouse: "Out of Warehouse",
                shipped: "Shipped via Courier",
                out_for_delivery: "Out for Delivery",
                delivered: "Delivered Successfully",
                cancelled: "Order Cancelled",
                returned: "Order Returned to Warehouse",
                refunded: "Order Refunded"
            };
            const statusDescs = {
                placed: "Order placed successfully.",
                pending: "Order is pending verification.",
                processing: "Item being crafted, inspected, and hallmarked.",
                out_of_warehouse: "Package has departed from central warehouse hub.",
                shipped: `Dispatched with ${order.courierName || 'Courier'}. Tracking ID: ${order.trackingId || 'N/A'}`,
                out_for_delivery: "Courier delivery agent is out to deliver your package today.",
                delivered: "Item delivered safely to recipient.",
                cancelled: "Order has been cancelled.",
                returned: "Item was returned by recipient and received back into inventory.",
                refunded: "Redemption amount and bullion units have been refunded."
            };

            if (!order.statusHistory) order.statusHistory = [];
            order.statusHistory.push({
                status: deliveryStatus,
                title: statusTitles[deliveryStatus] || deliveryStatus,
                description: statusNote || statusDescs[deliveryStatus] || "Status updated by admin",
                date: new Date()
            });
        }

        await order.save();
        res.json({ success: true, message: "Order updated successfully and inventory synchronized", data: order });
    } catch (err) { next(err); }
};