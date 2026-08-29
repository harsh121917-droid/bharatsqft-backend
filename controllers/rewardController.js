const User = require("../models/User");
const { Wallet, WalletTxn } = require("../models/Wallet");
const RewardSettings = require("../models/RewardSettings");
const RewardTxn = require("../models/RewardTxn");

// Helper to compute expiresAt based on current settings
function calculateExpiresAt(settings) {
    if (!settings || !settings.expiryEnabled || settings.expiryType === "never") {
        return null;
    }
    let days = settings.expiryDays || 30;
    if (settings.expiryType === "daily") days = 1;
    else if (settings.expiryType === "weekly") days = 7;
    else if (settings.expiryType === "monthly") days = 30;
    else if (settings.expiryType === "quarterly") days = 90;
    else if (settings.expiryType === "yearly") days = 365;

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Helper to process and deduct expired points for a single user
async function processExpiredPoints(userId) {
    try {
        const settings = await RewardSettings.findOne({ isActive: true });
        if (!settings || !settings.expiryEnabled || settings.expiryType === "never") {
            return { expiredPoints: 0, count: 0 };
        }

        const now = new Date();
        const expiredTxns = await RewardTxn.find({
            user: userId,
            points: { $gt: 0 },
            isExpired: { $ne: true },
            expiresAt: { $exists: true, $ne: null, $lte: now },
        });

        if (!expiredTxns || expiredTxns.length === 0) {
            return { expiredPoints: 0, count: 0 };
        }

        let totalExpired = 0;
        for (const tx of expiredTxns) {
            totalExpired += tx.points;
            tx.isExpired = true;
            tx.expiredAt = now;
            await tx.save();
        }

        if (totalExpired > 0) {
            const user = await User.findById(userId);
            if (user) {
                user.rewardPoints = Math.max(0, (user.rewardPoints || 0) - totalExpired);
                await user.save();

                await RewardTxn.create({
                    user: userId,
                    type: "expired",
                    points: -totalExpired,
                    description: `Expired ${totalExpired} reward points past validity date`,
                    extra: {
                        expiredTxnIds: expiredTxns.map((t) => t._id),
                        expiredAt: now,
                    },
                });
            }
        }

        return { expiredPoints: totalExpired, count: expiredTxns.length };
    } catch (err) {
        console.error("Error processing expired points for user:", userId, err);
        return { expiredPoints: 0, count: 0 };
    }
}

// Global expiry sweep across all users (used by admin or cron)
exports.runGlobalExpirySweep = async () => {
    const settings = await RewardSettings.findOne({ isActive: true });
    if (!settings || !settings.expiryEnabled || settings.expiryType === "never") {
        return { sweptUsers: 0, totalPointsExpired: 0, message: "Rewards expiry is currently disabled." };
    }

    const now = new Date();
    const expiredTxns = await RewardTxn.find({
        points: { $gt: 0 },
        isExpired: { $ne: true },
        expiresAt: { $exists: true, $ne: null, $lte: now },
    });

    if (!expiredTxns || expiredTxns.length === 0) {
        return { sweptUsers: 0, totalPointsExpired: 0, message: "No expired points found." };
    }

    // Group by user
    const userMap = {};
    for (const tx of expiredTxns) {
        const uId = tx.user.toString();
        if (!userMap[uId]) userMap[uId] = [];
        userMap[uId].push(tx);
    }

    let totalPoints = 0;
    let userCount = 0;

    for (const [uId, txns] of Object.entries(userMap)) {
        let userExpired = 0;
        for (const tx of txns) {
            userExpired += tx.points;
            tx.isExpired = true;
            tx.expiredAt = now;
            await tx.save();
        }

        if (userExpired > 0) {
            const user = await User.findById(uId);
            if (user) {
                user.rewardPoints = Math.max(0, (user.rewardPoints || 0) - userExpired);
                await user.save();

                await RewardTxn.create({
                    user: uId,
                    type: "expired",
                    points: -userExpired,
                    description: `Expired ${userExpired} reward points past validity period`,
                    extra: {
                        expiredTxnIds: txns.map((t) => t._id),
                        expiredAt: now,
                    },
                });

                totalPoints += userExpired;
                userCount++;
            }
        }
    }

    return {
        sweptUsers: userCount,
        totalPointsExpired: totalPoints,
        message: `Successfully expired ${totalPoints} points across ${userCount} users.`,
    };
};

exports.calculateExpiresAt = calculateExpiresAt;
exports.processExpiredPoints = processExpiredPoints;

// ── GET /api/rewards/balance ─────────────────────────────────────────────────
exports.getRewardBalance = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Process any expired points for this user first
        await processExpiredPoints(userId);

        const user = await User.findById(userId);
        const settings = await RewardSettings.findOne({ isActive: true });

        // Fetch spin transactions since start of today (IST midnight reset) to verify daily spin count (max 3)
        const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        nowIST.setUTCHours(0, 0, 0, 0);
        const startOfTodayIST = new Date(nowIST.getTime() - 5.5 * 60 * 60 * 1000);

        const spinCount = await RewardTxn.countDocuments({
            user: user._id,
            type: "spin_win",
            createdAt: { $gte: startOfTodayIST }
        });

        let canSpin = true;
        let timeRemaining = 0; // seconds
        let nextSpinTime = null;
        const spinsLeft = Math.max(0, 3 - spinCount);

        if (spinCount >= 3) {
            canSpin = false;
            nextSpinTime = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);
            timeRemaining = Math.ceil((nextSpinTime.getTime() - Date.now()) / 1000);
        }

        // Check points expiring soon (within next 7 days)
        const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const expiringTxns = await RewardTxn.find({
            user: user._id,
            points: { $gt: 0 },
            isExpired: { $ne: true },
            expiresAt: { $exists: true, $ne: null, $gte: new Date(), $lte: in7Days }
        }).sort({ expiresAt: 1 });

        const expiringSoonPoints = expiringTxns.reduce((sum, t) => sum + t.points, 0);
        const nextExpiryDate = expiringTxns.length > 0 ? expiringTxns[0].expiresAt : null;

        res.json({
            success: true,
            data: {
                rewardPoints: user.rewardPoints || 0,
                referralCode: user.referralCode || "",
                referredBy: user.referredBy || null,
                canSpin,
                spinsLeft,
                timeRemaining,
                nextSpinTime,
                expirySettings: {
                    expiryEnabled: settings ? settings.expiryEnabled : true,
                    expiryType: settings ? settings.expiryType : "monthly",
                    expiryDays: settings ? settings.expiryDays : 30,
                },
                expiringSoonPoints,
                nextExpiryDate,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/rewards/spin ───────────────────────────────────────────────────
exports.spinWheel = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        // Verify daily spin count limit (3 spins per calendar day, resetting at IST midnight)
        const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        nowIST.setUTCHours(0, 0, 0, 0);
        const startOfTodayIST = new Date(nowIST.getTime() - 5.5 * 60 * 60 * 1000);

        const spinCount = await RewardTxn.countDocuments({
            user: user._id,
            type: "spin_win",
            createdAt: { $gte: startOfTodayIST }
        });

        if (spinCount >= 3) {
            const nextMidnight = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);
            const waitSec = Math.ceil((nextMidnight.getTime() - Date.now()) / 1000);
            
            return res.status(400).json({
                success: false,
                message: `Limit reached (3 spins/day). Please wait ${Math.floor(waitSec / 3600)}h ${Math.floor((waitSec % 3600) / 60)}m.`,
            });
        }

        // Fetch reward config settings
        let settings = await RewardSettings.findOne({ isActive: true });
        const spinPool = settings && settings.spinPoints && settings.spinPoints.length > 0
            ? settings.spinPoints
            : [10, 20, 50, 100, 150, 200]; // defaults

        // Use client-reported pointsWinner (to sync with mobile wheel animation segment) or fallback
        let pointsWon = parseInt(req.body.pointsWinner, 10);
        if (isNaN(pointsWon)) {
            const randomIndex = Math.floor(Math.random() * spinPool.length);
            pointsWon = spinPool[randomIndex];
        }

        // Award points and save
        user.rewardPoints = (user.rewardPoints || 0) + pointsWon;
        await user.save();

        // Log points transaction with expiration
        const expiresAt = calculateExpiresAt(settings);
        await RewardTxn.create({
            user: user._id,
            type: "spin_win",
            points: pointsWon,
            description: `Won ${pointsWon} points on Daily Spin to Win`,
            expiresAt,
        });

        res.json({
            success: true,
            message: `Congratulations! You won ${pointsWon} points.`,
            data: {
                pointsWon,
                newBalance: user.rewardPoints,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/rewards/redeem ─────────────────────────────────────────────────
exports.redeemPoints = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        
        let { points } = req.body;
        const pointsToRedeem = parseInt(points, 10) || user.rewardPoints || 0;

        if (pointsToRedeem <= 0) {
            return res.status(400).json({ success: false, message: "Enter a valid number of points to redeem" });
        }
        if (user.rewardPoints < pointsToRedeem) {
            return res.status(400).json({ success: false, message: "Insufficient points balance" });
        }
        
        const minRedeem = 100; // minimum point threshold
        if (pointsToRedeem < minRedeem) {
            return res.status(400).json({ success: false, message: `Minimum redemption amount is ${minRedeem} points` });
        }

        // Retrieve point conversion rate
        let settings = await RewardSettings.findOne({ isActive: true });
        const rate = settings ? settings.pointToWalletRate : 0.10; // default: 1 point = ₹0.10

        const cashAmount = parseFloat((pointsToRedeem * rate).toFixed(2));
        if (cashAmount <= 0) {
            return res.status(400).json({ success: false, message: "Redeemable points cash value is too low" });
        }

        // Deduct points
        user.rewardPoints -= pointsToRedeem;
        await user.save();

        // Create negative RewardTxn entry
        const pointTx = await RewardTxn.create({
            user: user._id,
            type: "redeem",
            points: -pointsToRedeem,
            description: `Redeemed ${pointsToRedeem} points to Wallet cash`,
        });

        // Credit Wallet
        let wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
            wallet = await Wallet.create({ user: user._id });
        }

        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance + cashAmount).toFixed(2));
        wallet.totalAdded = parseFloat((wallet.totalAdded + cashAmount).toFixed(2));
        await wallet.save();

        // Log Wallet Transaction
        const walletTx = await WalletTxn.create({
            user: user._id,
            type: "add", // standard add transaction
            amount: cashAmount,
            balanceBefore: balBefore,
            balanceAfter: wallet.balance,
            note: `Points Redemption: converted ${pointsToRedeem} points to ₹${cashAmount}`,
            status: "success",
            extra: { rewardTxnId: pointTx._id }
        });

        // Link wallet transaction back to points ledger
        pointTx.extra = { walletTxnId: walletTx._id };
        await pointTx.save();

        res.json({
            success: true,
            message: `Redeemed ${pointsToRedeem} points to ₹${cashAmount} wallet cash!`,
            data: {
                pointsRedeemed: pointsToRedeem,
                cashAdded: cashAmount,
                newPointsBalance: user.rewardPoints,
                newWalletBalance: wallet.balance,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/rewards/history ─────────────────────────────────────────────────
exports.getRewardHistory = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const [history, total] = await Promise.all([
            RewardTxn.find({ user: req.user._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            RewardTxn.countDocuments({ user: req.user._id }),
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

// ── GET /api/rewards/referrals ───────────────────────────────────────────────
exports.getUserReferrals = async (req, res, next) => {
    try {
        const Referral = require("../models/Referral");
        const referrals = await Referral.find({ referrer: req.user._id })
            .populate("referredUser", "name email phone createdAt")
            .sort({ createdAt: -1 });

        const totalEarnedAmount = referrals.reduce((sum, r) => sum + (r.rewardAmount || 50), 0);
        const totalEarnedPoints = referrals.reduce((sum, r) => sum + (r.rewardPoints || 0), 0);

        res.json({
            success: true,
            referralCode: req.user.referralCode || "",
            referralBalance: req.user.referralBalance || 0,
            totalReferrals: referrals.length,
            totalEarnedAmount,
            totalEarnedPoints,
            data: referrals,
        });
    } catch (err) {
        next(err);
    }
};

