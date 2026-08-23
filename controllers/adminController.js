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

            const copperGrams = user.copperInvestments?.grams || 0;
            const copperSpent = user.copperInvestments?.totalInvested || 0;
            const copperAvgPrice = copperGrams > 0 ? parseFloat((copperSpent / copperGrams).toFixed(2)) : 0;
            const copperCurrentValue = parseFloat((copperGrams * copperSellRate).toFixed(2));
            const copperProfitLoss = parseFloat((copperCurrentValue - copperSpent).toFixed(2));

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

exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, message: "User deleted" });
    } catch (err) { next(err); }
};

exports.addWalletMoney = async (req, res, next) => {
    try {
        const { amount, showTransaction, note } = req.body;
        const userId = req.params.id;

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid amount greater than 0" });
        }

        const addAmt = parseFloat(parseFloat(amount).toFixed(2));
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({ user: userId, balance: 0 });
        }

        const balanceBefore = wallet.balance || 0;
        wallet.balance = parseFloat((balanceBefore + addAmt).toFixed(2));
        wallet.totalAdded = parseFloat(((wallet.totalAdded || 0) + addAmt).toFixed(2));
        await wallet.save();

        if (showTransaction) {
            await WalletTxn.create({
                user: userId,
                type: "add",
                amount: addAmt,
                balanceBefore,
                balanceAfter: wallet.balance,
                status: "success",
                note: note || "Admin wallet credit"
            });
        }

        res.json({
            success: true,
            message: `₹${addAmt.toLocaleString("en-IN")} added to wallet successfully`,
            balance: wallet.balance
        });
    } catch (err) { next(err); }
};

exports.deductWalletMoney = async (req, res, next) => {
    try {
        const { amount, showTransaction, note } = req.body;
        const userId = req.params.id;

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid amount greater than 0" });
        }

        const deductAmt = parseFloat(parseFloat(amount).toFixed(2));
        let wallet = await Wallet.findOne({ user: userId });
        const currentBal = wallet ? (wallet.balance || 0) : 0;

        if (!wallet || currentBal < deductAmt) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Current balance is ₹${currentBal.toLocaleString("en-IN")}, cannot deduct ₹${deductAmt.toLocaleString("en-IN")}.`
            });
        }

        const balanceBefore = currentBal;
        wallet.balance = parseFloat((currentBal - deductAmt).toFixed(2));
        await wallet.save();

        if (showTransaction) {
            await WalletTxn.create({
                user: userId,
                type: "deduct",
                amount: deductAmt,
                balanceBefore,
                balanceAfter: wallet.balance,
                status: "success",
                note: note || "Admin wallet deduction"
            });
        }

        res.json({
            success: true,
            message: `₹${deductAmt.toLocaleString("en-IN")} deducted from wallet successfully`,
            balance: wallet.balance
        });
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

exports.resetAllUserData = async (req, res, next) => {
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

        // Reset Wallet & Wallet Transactions
        await Wallet.findOneAndUpdate(
            { user: userId },
            { balance: 0, lockedBalance: 0, pendingCredit: 0, totalAdded: 0, totalWithdrawn: 0 },
            { upsert: true }
        );
        await WalletTxn.deleteMany({ user: userId });

        // Reset Reward Points & Referral balance
        await User.findByIdAndUpdate(userId, { rewardPoints: 0, referralBalance: 0 });

        res.json({
            success: true,
            message: "All testing data (Bullion Vault, Wallet Balance & all Transaction history) for this user has been wiped clean to 0.",
            data: { goldGrams: 0, silverGrams: 0, copperGrams: 0, balance: 0 }
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

        const wantGold = metal === "all" || metal === "gold";
        const wantSilver = metal === "all" || metal === "silver";
        const wantCopper = metal === "all" || metal === "copper";

        const [goldTxns, silverTxns, copperTxns] = await Promise.all([
            wantGold ? GoldTransaction.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }) : [],
            wantSilver ? SilverTransaction.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }) : [],
            wantCopper ? CopperTransaction.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }) : [],
        ]);

        const combined = [
            ...goldTxns.map(t => ({ ...t.toObject(), metal: "gold", value: t.goldValue })),
            ...silverTxns.map(t => ({ ...t.toObject(), metal: "silver", value: t.silverValue })),
            ...copperTxns.map(t => ({ ...t.toObject(), metal: "copper", value: t.copperValue })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = combined.length;
        const start = (page - 1) * limit;
        const paged = combined.slice(start, start + Number(limit));

        res.json({ success: true, data: paged, total, page: +page, pages: Math.ceil(total / limit) });
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
        const { deliveryStatus, trackingId, trackingUrl, courierName, estimatedDeliveryDate, statusNote, shippingAddress } = req.body;
        const order = await JewelleryRedemption.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        let statusChanged = false;
        if (deliveryStatus && deliveryStatus !== order.deliveryStatus) {
            order.deliveryStatus = deliveryStatus;
            statusChanged = true;
        }

        if (trackingId !== undefined) order.trackingId = trackingId;
        if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
        if (courierName !== undefined) order.courierName = courierName;
        if (estimatedDeliveryDate !== undefined) order.estimatedDeliveryDate = estimatedDeliveryDate;
        if (statusNote !== undefined) order.statusNote = statusNote;
        if (shippingAddress !== undefined) order.shippingAddress = shippingAddress;

        if (statusChanged) {
            const statusTitles = {
                placed: "Order Placed",
                pending: "Order Received",
                processing: "Processing & Quality Check",
                out_of_warehouse: "Out of Warehouse",
                shipped: "Shipped via Courier",
                out_for_delivery: "Out for Delivery",
                delivered: "Delivered Successfully",
                cancelled: "Order Cancelled"
            };
            const statusDescs = {
                placed: "Order placed successfully.",
                pending: "Order is pending verification.",
                processing: "Item being crafted, inspected, and hallmarked.",
                out_of_warehouse: "Package has departed from central warehouse hub.",
                shipped: `Dispatched with ${order.courierName || 'Courier'}. Tracking ID: ${order.trackingId || 'N/A'}`,
                out_for_delivery: "Courier delivery agent is out to deliver your package today.",
                delivered: "Item delivered safely to recipient.",
                cancelled: "Order has been cancelled."
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
        res.json({ success: true, message: "Order updated successfully", data: order });
    } catch (err) { next(err); }
};