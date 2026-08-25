const crypto = require("crypto");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldTransaction, GoldBalance } = require("../models/Gold");
const paymentGatewayService = require("../services/paymentGatewayService");

// ── Helper ─────────────────────────────────────────────────────────────────────
async function getOrCreateWallet(userId) {
    let w = await Wallet.findOne({ user: userId });
    if (!w) w = await Wallet.create({ user: userId });
    return w;
}

async function recordTxn(userId, type, amount, balBefore, balAfter, extra = {}) {
    return WalletTxn.create({
        user: userId, type, amount,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        ...extra,
    });
}

async function checkSellHoldPeriod(userId) {
    const AppConfig = require("../models/AppConfig");
    let config = await AppConfig.findOne();
    const holdingDays = (config && config.newUsersSellHoldingDays !== undefined) ? Number(config.newUsersSellHoldingDays) : 30;

    // If holding period is set to 0, sell restriction is disabled
    if (holdingDays <= 0) {
        return { allowed: true, holdingDays: 0 };
    }

    const { GoldTransaction } = require("../models/Gold");
    const { SilverTransaction } = require("../models/Silver");
    const Copper = require("../models/Copper");
    const CopperTransaction = Copper && Copper.CopperTransaction ? Copper.CopperTransaction : null;

    // Earliest successful buy/sip_buy gold transaction
    const firstGoldTxn = await GoldTransaction.findOne({
        user: userId,
        type: { $in: ["buy", "sip_buy"] },
        status: "success"
    }).sort({ createdAt: 1 });

    // Earliest successful buy/sip_buy silver transaction
    const firstSilverTxn = await SilverTransaction.findOne({
        user: userId,
        type: { $in: ["buy", "sip_buy"] },
        status: "success"
    }).sort({ createdAt: 1 });

    // Earliest successful buy/sip_buy copper transaction
    const firstCopperTxn = CopperTransaction ? await CopperTransaction.findOne({
        user: userId,
        type: { $in: ["buy", "sip_buy"] },
        status: "success"
    }).sort({ createdAt: 1 }) : null;

    let firstTxnDate = null;
    if (firstGoldTxn) firstTxnDate = firstGoldTxn.createdAt;
    if (firstSilverTxn) {
        if (!firstTxnDate || firstSilverTxn.createdAt < firstTxnDate) {
            firstTxnDate = firstSilverTxn.createdAt;
        }
    }
    if (firstCopperTxn) {
        if (!firstTxnDate || firstCopperTxn.createdAt < firstTxnDate) {
            firstTxnDate = firstCopperTxn.createdAt;
        }
    }

    if (firstTxnDate) {
        const daysDiff = (Date.now() - new Date(firstTxnDate).getTime()) / (24 * 60 * 60 * 1000);
        if (daysDiff < holdingDays) {
            const daysLeft = Math.max(1, Math.ceil(holdingDays - daysDiff));
            return {
                allowed: false,
                holdingDays,
                daysLeft,
                firstTxnDate,
                message: `For security reasons, new users can only sell gold or silver after ${holdingDays} days from their first purchase. Please wait another ${daysLeft} day${daysLeft > 1 ? "s" : ""}.`
            };
        }
    }
    return { allowed: true, holdingDays, firstTxnDate };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GET /api/wallet  — get wallet balance + recent transactions
// ══════════════════════════════════════════════════════════════════════════════
exports.getWallet = async (req, res, next) => {
    try {
        const [wallet, txns] = await Promise.all([
            getOrCreateWallet(req.user._id),
            WalletTxn.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20),
        ]);
        res.json({
            success: true,
            data: {
                balance: wallet.balance,
                lockedBalance: wallet.lockedBalance,
                pendingCredit: wallet.pendingCredit,
                availableBalance: wallet.balance - wallet.lockedBalance,
                totalAdded: wallet.totalAdded,
                totalWithdrawn: wallet.totalWithdrawn,
                transactions: txns,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. POST /api/wallet/add/initiate  — create Razorpay order to add money
// body: { amount }  (min ₹100)
// ══════════════════════════════════════════════════════════════════════════════
exports.initiateAdd = async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 100) {
            return res.status(400).json({ success: false, message: "Minimum add is ₹100" });
        }

        const config = await paymentGatewayService.resolveGateway({});
        if (config.name !== "razorpay") {
            return res.status(400).json({
                success: false,
                message: `Active default payment gateway is '${config.name}', but this endpoint only supports Razorpay. Please configure Razorpay as default in Admin.`,
            });
        }

        const { order, keyId } = await paymentGatewayService.createRazorpayOrder({
            amount,
            notes: { userId: req.user._id.toString(), type: "wallet_add" },
            mode: config.mode,
        });

        res.json({
            success: true,
            data: { order, key: keyId, amount },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. POST /api/wallet/add/verify  — verify payment + credit wallet
// body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount }
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyAdd = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;

        const config = await paymentGatewayService.resolveGateway({});
        if (config.name !== "razorpay") {
            return res.status(400).json({ success: false, message: "Default payment gateway is not Razorpay" });
        }

        const isValid = paymentGatewayService.verifyRazorpaySignature({
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
            keySecret: config.keySecret,
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        // Credit wallet
        const wallet = await getOrCreateWallet(req.user._id);
        const balBefore = wallet.balance;
        wallet.balance += parseFloat(amount);
        wallet.totalAdded += parseFloat(amount);
        await wallet.save();

        await recordTxn(req.user._id, "add", amount, balBefore, wallet.balance, {
            razorpayOrderId, razorpayPaymentId, razorpaySignature,
            note: `Added ₹${amount} via Razorpay (${config.mode})`,
            status: "success",
        });

        res.json({
            success: true,
            message: `₹${amount} added to your wallet`,
            data: { balance: wallet.balance },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. POST /api/wallet/buy-gold  — buy gold using wallet balance
// body: { amountInRupees } OR { grams }
// Calls gold rate, deducts from wallet, credits gold
// ══════════════════════════════════════════════════════════════════════════════
exports.buyGoldFromWallet = async (req, res, next) => {
    try {
        if (req.user.kycStatus !== "approved") {
            return res.status(400).json({ success: false, message: "Please complete your KYC to buy gold/silver." });
        }

        const { GoldBalance, GoldTransaction } = require("../models/Gold");
        const { fetchLiveRates } = require("./goldController");
        const User = require("../models/User");
        const RewardTxn = require("../models/RewardTxn");
        const Coupon = require("../models/Coupon");

        const rates = await fetchLiveRates();
        const buyRate = rates.gold.buyRate;
        const GST_PCT = 3;

        let { amountInRupees, grams, pointsRedeemed, redeemReferral, couponCode } = req.body;
        if (grams && !amountInRupees) amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        if (!amountInRupees || amountInRupees < 50) {
            return res.status(400).json({ success: false, message: "Minimum purchase is ₹50" });
        }

        const dbUser = await User.findById(req.user._id);

        // ── Coupon Validation (One time use only) ──────────────────────────────
        let couponBonus = 0;
        let couponDiscount = 0;
        let appliedCoupon = null;

        if (couponCode) {
            const upperCode = couponCode.toUpperCase().trim();
            const coupon = await Coupon.findOne({ code: upperCode, isActive: true });
            if (!coupon) {
                return res.status(400).json({ success: false, message: "Invalid or inactive coupon code." });
            }
            if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
                return res.status(400).json({ success: false, message: "This coupon has expired." });
            }
            const grossPurchaseAmt = amountInRupees * (1 + GST_PCT / 100);
            if (amountInRupees < coupon.minPurchaseAmount && Math.round(grossPurchaseAmt) < coupon.minPurchaseAmount) {
                return res.status(400).json({
                    success: false,
                    message: "Minimum purchase of ₹" + coupon.minPurchaseAmount + " is required for coupon " + upperCode,
                });
            }
            if (coupon.metalType !== "both" && coupon.metalType !== "gold") {
                return res.status(400).json({ success: false, message: "This coupon is not valid for Gold purchases." });
            }

            // Check if user has ALREADY USED this coupon once
            const alreadyUsed = await GoldTransaction.findOne({
                user: req.user._id,
                couponCode: upperCode,
                status: "success",
            });
            if (alreadyUsed) {
                return res.status(400).json({
                    success: false,
                    message: "You have already used coupon '" + upperCode + "'. This coupon can only be used once per user.",
                });
            }

            appliedCoupon = coupon;
            if (coupon.type === "extra_gold") {
                couponBonus = coupon.valueType === "percentage" ? (amountInRupees * coupon.value / 100) : coupon.value;
                if (coupon.maxDiscountAmount > 0) couponBonus = Math.min(couponBonus, coupon.maxDiscountAmount);
            } else if (coupon.type === "discount") {
                couponDiscount = coupon.valueType === "percentage" ? (amountInRupees * coupon.value / 100) : coupon.value;
                if (coupon.maxDiscountAmount > 0) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
            }
        }

        // If redeeming referral, validate conditions
        let isRedeemed = false;
        let referralBonus = 0;

        if (redeemReferral) {
            if (!dbUser.referralBalance || dbUser.referralBalance < 50) {
                return res.status(400).json({ success: false, message: "Insufficient referral balance (minimum ₹50 required)." });
            }
            if (amountInRupees < 1000) {
                return res.status(400).json({ success: false, message: "Minimum metal purchase of ₹1000 is required to redeem referral bonus." });
            }
            isRedeemed = true;
            referralBonus = 50;
        }

        let pointsDiscount = 0;
        if (pointsRedeemed && pointsRedeemed > 0) {
            if (!dbUser.rewardPoints || dbUser.rewardPoints < pointsRedeemed) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient reward points. You have " + (dbUser.rewardPoints || 0) + " points, trying to redeem " + pointsRedeemed,
                });
            }
            pointsDiscount = parseFloat((pointsRedeemed * 0.01).toFixed(2));
            
            dbUser.rewardPoints -= pointsRedeemed;
            await dbUser.save();

            await RewardTxn.create({
                user: req.user._id,
                type: "redeem",
                points: -pointsRedeemed,
                description: "Redeemed " + pointsRedeemed + " points for extra gold purchase",
            });
        }

        if (isRedeemed) {
            dbUser.referralBalance = Math.max(0, (dbUser.referralBalance || 0) - 50);
            await dbUser.save();
        }

        // User is charged: amountInRupees (minus discount) + GST
        const effectiveAmountPaid = Math.max(0, amountInRupees - couponDiscount);
        const gstAmt = parseFloat((effectiveAmountPaid * GST_PCT / 100).toFixed(2));
        const totalAmt = parseFloat((effectiveAmountPaid + gstAmt).toFixed(2));

        // User receives gold worth: Base Amount + Coupon Bonus (e.g. ₹100 + ₹15 = ₹115) + Referral + Points
        const totalGoldCreditedValue = parseFloat((amountInRupees + couponBonus + referralBonus + pointsDiscount).toFixed(2));
        const gramsToAdd = parseFloat((totalGoldCreditedValue / buyRate).toFixed(6));

        // Check wallet balance
        const wallet = await getOrCreateWallet(req.user._id);
        if (wallet.balance < totalAmt) {
            return res.status(400).json({
                success: false,
                message: "Insufficient wallet balance. Have ₹" + wallet.balance.toFixed(2) + ", need ₹" + totalAmt.toFixed(2),
                data: { walletBalance: wallet.balance, required: totalAmt },
            });
        }

        // Deduct from wallet
        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance - totalAmt).toFixed(2));
        await wallet.save();

        // Credit gold
        let goldBal = await GoldBalance.findOne({ user: req.user._id });
        if (!goldBal) goldBal = await GoldBalance.create({ user: req.user._id });
        goldBal.totalGrams = parseFloat((goldBal.totalGrams + gramsToAdd).toFixed(6));
        goldBal.investedAmt = parseFloat((goldBal.investedAmt + (totalAmt || totalGoldCreditedValue)).toFixed(2));
        await goldBal.save();

        let txnNote = "Purchased via wallet";
        if (appliedCoupon) {
            txnNote = "Purchased via wallet (Used coupon " + appliedCoupon.code + " for ₹" + couponBonus + " Free Gold)";
        } else if (pointsRedeemed) {
            txnNote = "Purchased via wallet (Redeemed " + pointsRedeemed + " pts for extra gold)";
        } else if (isRedeemed) {
            txnNote = "Purchased via wallet (Redeemed ₹50 referral bonus)";
        }

        // Record gold transaction
        const goldTxn = await GoldTransaction.create({
            user: req.user._id,
            type: "buy",
            grams: gramsToAdd,
            ratePerGram: buyRate,
            goldValue: totalGoldCreditedValue, // ₹115 worth
            gstAmt,
            totalAmt, // amount actually paid (₹100 + GST)
            status: "success",
            isReferralRedeemed: isRedeemed,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            couponBonus,
            couponDiscount,
            isCouponApplied: !!appliedCoupon,
            note: txnNote,
        });

        // Record wallet transaction
        await recordTxn(req.user._id, "gold_buy", totalAmt, balBefore, wallet.balance, {
            goldTxnId: goldTxn._id,
            note: "Bought " + gramsToAdd + "g gold @ ₹" + buyRate + "/g" + (appliedCoupon ? " (Coupon: " + appliedCoupon.code + " +₹" + couponBonus + " Free Gold)" : ""),
            status: "success",
        });

        res.json({
            success: true,
            message: gramsToAdd + "g gold credited to your account (Worth ₹" + totalGoldCreditedValue + ")",
            data: {
                grams: gramsToAdd,
                totalGrams: goldBal.totalGrams,
                goldValue: totalGoldCreditedValue,
                amountDeducted: totalAmt,
                couponCode: appliedCoupon ? appliedCoupon.code : null,
                couponBonus,
                walletBalance: wallet.balance,
                breakdown: { goldValue: totalGoldCreditedValue, gstAmt, totalAmt, ratePerGram: buyRate },
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. POST /api/wallet/sell-gold  — sell gold → credit wallet (locked)
// ══════════════════════════════════════════════════════════════════════════════
exports.sellGoldToWallet = async (req, res, next) => {
    try {
        const { GoldBalance, GoldTransaction } = require("../models/Gold");
        const { fetchLiveRates } = require("./goldController");

        const { grams } = req.body;
        if (!grams || grams < 0.001) {
            return res.status(400).json({ success: false, message: "Minimum sell is 0.001g" });
        }

        const holdCheck = await checkSellHoldPeriod(req.user._id);
        if (!holdCheck.allowed) {
            return res.status(400).json({ success: false, message: holdCheck.message });
        }

        const [rates, goldBal, wallet] = await Promise.all([
            fetchLiveRates(),
            GoldBalance.findOne({ user: req.user._id }),
            getOrCreateWallet(req.user._id),
        ]);

        if (!goldBal || goldBal.totalGrams - goldBal.lockedGrams < grams) {
            return res.status(400).json({
                success: false,
                message: `Insufficient gold. Available: ${(goldBal?.totalGrams - goldBal?.lockedGrams || 0).toFixed(4)}g`,
            });
        }

        const sellRate = rates.gold.sellRate;
        const sellValue = parseFloat((grams * sellRate).toFixed(2));

        // Lock gold grams
        goldBal.lockedGrams = parseFloat((goldBal.lockedGrams + grams).toFixed(6));
        await goldBal.save();

        // Add sell value as PENDING CREDIT — not yet in balance, and must NOT
        // reduce availableBalance (it isn't held from balance, it's awaiting release)
        const balBefore = wallet.balance;
        wallet.pendingCredit = parseFloat((wallet.pendingCredit + sellValue).toFixed(2));
        await wallet.save();

        // Record gold transaction
        const goldTxn = await GoldTransaction.create({
            user: req.user._id, type: "sell", grams,
            ratePerGram: sellRate, goldValue: sellValue,
            gstAmt: 0, totalAmt: sellValue, status: "processing",
            note: "Sold — pending wallet credit",
        });

        // Record wallet transaction as pending
        await recordTxn(req.user._id, "gold_sell", sellValue, balBefore, wallet.balance, {
            goldTxnId: goldTxn._id,
            note: `Sold ${grams}g @ ₹${sellRate}/g — releasing in 24h`,
            status: "pending",
        });

        // Cron job (goldCron.js) handles the 24h release — no setTimeout needed
        res.json({
            success: true,
            message: `₹${sellValue} will be credited to your wallet within 24 hours`,
            data: {
                grams, sellValue, ratePerGram: sellRate,
                walletPendingCredit: wallet.pendingCredit,
                releaseTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. POST /api/wallet/withdraw/initiate  — withdraw from wallet to bank
// body: { amount, bankAccountId }
// ══════════════════════════════════════════════════════════════════════════════
exports.initiateWithdraw = async (req, res, next) => {
    try {
        const { amount, bankAccountId } = req.body;
        if (!amount || amount < 100) {
            return res.status(400).json({ success: false, message: "Minimum withdraw is ₹100" });
        }
        if (!bankAccountId) {
            return res.status(400).json({ success: false, message: "Bank account required" });
        }

        const wallet = await getOrCreateWallet(req.user._id);
        const available = wallet.balance - wallet.lockedBalance;
        if (amount > available) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: ₹${available.toFixed(2)}`,
            });
        }

        // Lock the amount during processing
        const balBefore = wallet.balance;
        wallet.lockedBalance = parseFloat((wallet.lockedBalance + amount).toFixed(2));
        await wallet.save();

        const walletTxn = await recordTxn(
            req.user._id, "withdraw", amount, balBefore, wallet.balance,
            { note: `Withdraw ₹${amount} to bank`, status: "pending" }
        );

        // Cron job handles the 24h bank release — no setTimeout needed
        res.json({
            success: true,
            message: "Withdrawal initiated. Will reach your bank within 24 hours.",
            data: {
                amount, bankAccountId,
                walletBalance: wallet.balance,
                lockedBalance: wallet.lockedBalance,
                releaseTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4b. POST /api/wallet/buy-silver  — buy silver using wallet balance
// body: { amountInRupees } OR { grams }
// ══════════════════════════════════════════════════════════════════════════════
exports.buySilverFromWallet = async (req, res, next) => {
    try {
        if (req.user.kycStatus !== "approved") {
            return res.status(400).json({ success: false, message: "Please complete your KYC to buy gold/silver." });
        }

        const { SilverBalance, SilverTransaction } = require("../models/Silver");
        const { fetchLiveRates } = require("./goldController");
        const User = require("../models/User");
        const RewardTxn = require("../models/RewardTxn");

        const rates = await fetchLiveRates();
        const buyRate = rates.silver.buyRate;
        if (!buyRate || buyRate <= 0) {
            return res.status(503).json({ success: false, message: "Silver rate unavailable right now" });
        }
        const GST_PCT = 3;

        let { amountInRupees, grams, pointsRedeemed } = req.body;
        if (grams && !amountInRupees) amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        if (!amountInRupees || amountInRupees < 50) {
            return res.status(400).json({ success: false, message: "Minimum purchase is ₹50" });
        }

        const gstAmt = parseFloat((amountInRupees * GST_PCT / 100).toFixed(2));
        let pointsDiscount = 0;
        if (pointsRedeemed && pointsRedeemed > 0) {
            const dbUser = await User.findById(req.user._id);
            if (!dbUser.rewardPoints || dbUser.rewardPoints < pointsRedeemed) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient reward points. You have ${dbUser.rewardPoints || 0} points, trying to redeem ${pointsRedeemed}`,
                });
            }
            pointsDiscount = parseFloat((pointsRedeemed * 0.01).toFixed(2));
            
            // Deduct points
            dbUser.rewardPoints -= pointsRedeemed;
            await dbUser.save();

            // Record in RewardTxn
            await RewardTxn.create({
                user: req.user._id,
                type: "redeem",
                points: -pointsRedeemed,
                description: `Redeemed ${pointsRedeemed} points for extra silver purchase`,
            });
        }
        const totalAmt = parseFloat((amountInRupees + gstAmt).toFixed(2));
        const gramsToAdd = parseFloat(((amountInRupees + pointsDiscount) / buyRate).toFixed(6));

        const wallet = await getOrCreateWallet(req.user._id);
        if (wallet.balance < totalAmt) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Have ₹${wallet.balance.toFixed(2)}, need ₹${totalAmt.toFixed(2)}`,
                data: { walletBalance: wallet.balance, required: totalAmt },
            });
        }

        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance - totalAmt).toFixed(2));
        await wallet.save();

        let silverBal = await SilverBalance.findOne({ user: req.user._id });
        if (!silverBal) silverBal = await SilverBalance.create({ user: req.user._id });
        silverBal.totalGrams = parseFloat((silverBal.totalGrams + gramsToAdd).toFixed(6));
        silverBal.investedAmt = parseFloat((silverBal.investedAmt + (totalAmt || amountInRupees)).toFixed(2));
        await silverBal.save();

        const silverTxn = await SilverTransaction.create({
            user: req.user._id, type: "buy", grams: gramsToAdd,
            ratePerGram: buyRate, silverValue: amountInRupees,
            gstAmt, totalAmt, status: "success",
            note: pointsRedeemed ? `Purchased via wallet (Redeemed ${pointsRedeemed} pts for extra silver)` : "Purchased via wallet",
        });

        await recordTxn(req.user._id, "silver_buy", totalAmt, balBefore, wallet.balance, {
            silverTxnId: silverTxn._id,
            note: pointsRedeemed ? `Bought ${gramsToAdd}g silver @ ₹${buyRate}/g (Redeemed ${pointsRedeemed} pts for extra silver)` : `Bought ${gramsToAdd}g silver @ ₹${buyRate}/g`,
            status: "success",
        });

        res.json({
            success: true,
            message: `${gramsToAdd}g silver credited to your account`,
            data: {
                grams: gramsToAdd,
                totalGrams: silverBal.totalGrams,
                amountDeducted: totalAmt,
                walletBalance: wallet.balance,
                breakdown: { silverValue: amountInRupees, gstAmt, totalAmt, ratePerGram: buyRate },
                invoiceNo: silverTxn.invoiceNo,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5b. POST /api/wallet/sell-silver  — sell silver → credit wallet (locked)
// body: { grams }
// ══════════════════════════════════════════════════════════════════════════════
exports.sellSilverToWallet = async (req, res, next) => {
    try {
        const { SilverBalance, SilverTransaction } = require("../models/Silver");
        const { fetchLiveRates } = require("./goldController");

        const { grams } = req.body;
        if (!grams || grams < 0.001) {
            return res.status(400).json({ success: false, message: "Minimum sell is 0.001g" });
        }

        const holdCheck = await checkSellHoldPeriod(req.user._id);
        if (!holdCheck.allowed) {
            return res.status(400).json({ success: false, message: holdCheck.message });
        }

        const [rates, silverBal, wallet] = await Promise.all([
            fetchLiveRates(),
            SilverBalance.findOne({ user: req.user._id }),
            getOrCreateWallet(req.user._id),
        ]);

        if (!silverBal || silverBal.totalGrams - silverBal.lockedGrams < grams) {
            return res.status(400).json({
                success: false,
                message: `Insufficient silver. Available: ${(silverBal?.totalGrams - silverBal?.lockedGrams || 0).toFixed(4)}g`,
            });
        }

        const sellRate = rates.silver.sellRate;
        if (!sellRate || sellRate <= 0) {
            return res.status(503).json({ success: false, message: "Silver rate unavailable right now" });
        }
        const sellValue = parseFloat((grams * sellRate).toFixed(2));

        silverBal.lockedGrams = parseFloat((silverBal.lockedGrams + grams).toFixed(6));
        await silverBal.save();

        const balBefore = wallet.balance;
        wallet.pendingCredit = parseFloat((wallet.pendingCredit + sellValue).toFixed(2));
        await wallet.save();

        const silverTxn = await SilverTransaction.create({
            user: req.user._id, type: "sell", grams,
            ratePerGram: sellRate, silverValue: sellValue,
            gstAmt: 0, totalAmt: sellValue, status: "processing",
            note: "Sold — pending wallet credit",
        });

        await recordTxn(req.user._id, "silver_sell", sellValue, balBefore, wallet.balance, {
            silverTxnId: silverTxn._id,
            note: `Sold ${grams}g silver @ ₹${sellRate}/g — releasing in 24h`,
            status: "pending",
        });

        // Reuses the same goldCron.js release job pattern — see note below
        // on wiring the 24h release for silver sells too.
        res.json({
            success: true,
            message: `₹${sellValue} will be credited to your wallet within 24 hours`,
            data: {
                grams, sellValue, ratePerGram: sellRate,
                walletPendingCredit: wallet.pendingCredit,
                releaseTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
                invoiceNo: silverTxn.invoiceNo,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4c. POST /api/wallet/buy-copper  — buy copper using wallet balance
// body: { amountInRupees } OR { grams }
// ══════════════════════════════════════════════════════════════════════════════
exports.buyCopperFromWallet = async (req, res, next) => {
    try {
        if (req.user.kycStatus !== "approved") {
            return res.status(400).json({ success: false, message: "Please complete your KYC to buy bullion metals." });
        }

        const { CopperBalance, CopperTransaction } = require("../models/Copper");
        const { fetchLiveRates } = require("./goldController");
        const User = require("../models/User");
        const RewardTxn = require("../models/RewardTxn");

        const rates = await fetchLiveRates();
        const buyRate = rates.copper.buyRate;
        if (!buyRate || buyRate <= 0) {
            return res.status(503).json({ success: false, message: "Copper rate unavailable right now" });
        }
        const GST_PCT = 18; // 18% GST on Copper (9% CGST + 9% SGST)

        let { amountInRupees, grams, pointsRedeemed } = req.body;
        if (grams && !amountInRupees) amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        if (!amountInRupees || amountInRupees < 50) {
            return res.status(400).json({ success: false, message: "Minimum purchase is ₹50" });
        }

        const gstAmt = parseFloat((amountInRupees * GST_PCT / 100).toFixed(2));
        let pointsDiscount = 0;
        if (pointsRedeemed && pointsRedeemed > 0) {
            const dbUser = await User.findById(req.user._id);
            if (!dbUser.rewardPoints || dbUser.rewardPoints < pointsRedeemed) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient reward points. You have ${dbUser.rewardPoints || 0} points, trying to redeem ${pointsRedeemed}`,
                });
            }
            pointsDiscount = parseFloat((pointsRedeemed * 0.01).toFixed(2));
            
            // Deduct points
            dbUser.rewardPoints -= pointsRedeemed;
            await dbUser.save();

            // Record in RewardTxn
            await RewardTxn.create({
                user: req.user._id,
                type: "redeem",
                points: -pointsRedeemed,
                description: `Redeemed ${pointsRedeemed} points for extra copper purchase`,
            });
        }
        const totalAmt = parseFloat((amountInRupees + gstAmt).toFixed(2));
        const gramsToAdd = parseFloat(((amountInRupees + pointsDiscount) / buyRate).toFixed(6));

        const wallet = await getOrCreateWallet(req.user._id);
        if (wallet.balance < totalAmt) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Have ₹${wallet.balance.toFixed(2)}, need ₹${totalAmt.toFixed(2)}`,
                data: { walletBalance: wallet.balance, required: totalAmt },
            });
        }

        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance - totalAmt).toFixed(2));
        await wallet.save();

        let copperBal = await CopperBalance.findOne({ user: req.user._id });
        if (!copperBal) copperBal = await CopperBalance.create({ user: req.user._id });
        copperBal.totalGrams = parseFloat((copperBal.totalGrams + gramsToAdd).toFixed(6));
        copperBal.investedAmt = parseFloat((copperBal.investedAmt + (totalAmt || amountInRupees)).toFixed(2));
        await copperBal.save();

        const copperTxn = await CopperTransaction.create({
            user: req.user._id, type: "buy", grams: gramsToAdd,
            ratePerGram: buyRate, copperValue: amountInRupees,
            gstAmt, totalAmt, status: "success",
            note: pointsRedeemed ? `Purchased via wallet (Redeemed ${pointsRedeemed} pts for extra copper)` : "Purchased via wallet",
        });

        await recordTxn(req.user._id, "copper_buy", totalAmt, balBefore, wallet.balance, {
            copperTxnId: copperTxn._id,
            note: pointsRedeemed ? `Bought ${gramsToAdd}g copper @ ₹${buyRate}/g (Redeemed ${pointsRedeemed} pts for extra copper)` : `Bought ${gramsToAdd}g copper @ ₹${buyRate}/g`,
            status: "success",
        });

        res.json({
            success: true,
            message: `${gramsToAdd}g copper credited to your account`,
            data: {
                grams: gramsToAdd,
                totalGrams: copperBal.totalGrams,
                amountDeducted: totalAmt,
                walletBalance: wallet.balance,
                breakdown: { copperValue: amountInRupees, gstAmt, totalAmt, ratePerGram: buyRate },
                invoiceNo: copperTxn.invoiceNo,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5c. POST /api/wallet/sell-copper  — sell copper → credit wallet (locked)
// body: { grams }
// ══════════════════════════════════════════════════════════════════════════════
exports.sellCopperToWallet = async (req, res, next) => {
    try {
        const { CopperBalance, CopperTransaction } = require("../models/Copper");
        const { fetchLiveRates } = require("./goldController");

        const { grams } = req.body;
        if (!grams || grams < 0.001) {
            return res.status(400).json({ success: false, message: "Minimum sell is 0.001g" });
        }

        const holdCheck = await checkSellHoldPeriod(req.user._id);
        if (!holdCheck.allowed) {
            return res.status(400).json({ success: false, message: holdCheck.message });
        }

        const [rates, copperBal, wallet] = await Promise.all([
            fetchLiveRates(),
            CopperBalance.findOne({ user: req.user._id }),
            getOrCreateWallet(req.user._id),
        ]);

        if (!copperBal || copperBal.totalGrams - copperBal.lockedGrams < grams) {
            return res.status(400).json({
                success: false,
                message: `Insufficient copper. Available: ${(copperBal?.totalGrams - copperBal?.lockedGrams || 0).toFixed(4)}g`,
            });
        }

        const sellRate = rates.copper.sellRate;
        if (!sellRate || sellRate <= 0) {
            return res.status(503).json({ success: false, message: "Copper rate unavailable right now" });
        }
        const sellValue = parseFloat((grams * sellRate).toFixed(2));

        copperBal.lockedGrams = parseFloat((copperBal.lockedGrams + grams).toFixed(6));
        await copperBal.save();

        const balBefore = wallet.balance;
        wallet.pendingCredit = parseFloat((wallet.pendingCredit + sellValue).toFixed(2));
        await wallet.save();

        const copperTxn = await CopperTransaction.create({
            user: req.user._id, type: "sell", grams,
            ratePerGram: sellRate, copperValue: sellValue,
            gstAmt: 0, totalAmt: sellValue, status: "processing",
            note: "Sold — pending wallet credit",
        });

        await recordTxn(req.user._id, "copper_sell", sellValue, balBefore, wallet.balance, {
            copperTxnId: copperTxn._id,
            note: `Sold ${grams}g copper @ ₹${sellRate}/g — releasing in 24h`,
            status: "pending",
        });

        res.json({
            success: true,
            message: `₹${sellValue} will be credited to your wallet within 24 hours`,
            data: {
                grams, sellValue, ratePerGram: sellRate,
                walletPendingCredit: wallet.pendingCredit,
                releaseTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
                invoiceNo: copperTxn.invoiceNo,
            },
        });
    } catch (err) { next(err); }
};

// Exported for reuse by schemeController and gold/silver controllers
exports.getOrCreateWallet = getOrCreateWallet;
exports.checkSellHoldPeriod = checkSellHoldPeriod;