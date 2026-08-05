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
        const { GoldBalance, GoldTransaction } = require("../models/Gold");
        const { fetchLiveRates } = require("./goldController");

        const rates = await fetchLiveRates();
        const buyRate = rates.gold.buyRate;
        const GST_PCT = 3;

        let { amountInRupees, grams, pointsRedeemed } = req.body;
        if (grams && !amountInRupees) amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        if (!amountInRupees || amountInRupees < 100) {
            return res.status(400).json({ success: false, message: "Minimum purchase is ₹100" });
        }

        const gstAmt = parseFloat((amountInRupees * GST_PCT / 100).toFixed(2));
        let pointsDiscount = 0;
        if (pointsRedeemed) {
            pointsDiscount = parseFloat((pointsRedeemed * 0.1).toFixed(2));
        }
        const totalAmt = parseFloat((amountInRupees + gstAmt).toFixed(2));
        const gramsToAdd = parseFloat(((amountInRupees + pointsDiscount) / buyRate).toFixed(6));

        // Check wallet balance
        const wallet = await getOrCreateWallet(req.user._id);
        if (wallet.balance < totalAmt) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Have ₹${wallet.balance.toFixed(2)}, need ₹${totalAmt.toFixed(2)}`,
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
        goldBal.investedAmt = parseFloat((goldBal.investedAmt + amountInRupees).toFixed(2));
        await goldBal.save();

        // Record gold transaction
        const goldTxn = await GoldTransaction.create({
            user: req.user._id, type: "buy", grams: gramsToAdd,
            ratePerGram: buyRate, goldValue: amountInRupees,
            gstAmt, totalAmt, status: "success",
            note: pointsRedeemed ? `Purchased via wallet (Redeemed ${pointsRedeemed} pts for extra gold)` : "Purchased via wallet",
        });

        // Record wallet transaction
        await recordTxn(req.user._id, "gold_buy", totalAmt, balBefore, wallet.balance, {
            goldTxnId: goldTxn._id,
            note: pointsRedeemed ? `Bought ${gramsToAdd}g gold @ ₹${buyRate}/g (Redeemed ${pointsRedeemed} pts for extra gold)` : `Bought ${gramsToAdd}g gold @ ₹${buyRate}/g`,
            status: "success",
        });

        res.json({
            success: true,
            message: `${gramsToAdd}g gold credited to your account`,
            data: {
                grams: gramsToAdd,
                totalGrams: goldBal.totalGrams,
                amountDeducted: totalAmt,
                walletBalance: wallet.balance,
                breakdown: { goldValue: amountInRupees, gstAmt, totalAmt, ratePerGram: buyRate },
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. POST /api/wallet/sell-gold  — sell gold → credit wallet (locked)
// body: { grams }
// Money goes to wallet.lockedBalance first, then released after 24h
// ══════════════════════════════════════════════════════════════════════════════
exports.sellGoldToWallet = async (req, res, next) => {
    try {
        const { GoldBalance, GoldTransaction } = require("../models/Gold");
        const { fetchLiveRates } = require("./goldController");

        const { grams } = req.body;
        if (!grams || grams < 0.001) {
            return res.status(400).json({ success: false, message: "Minimum sell is 0.001g" });
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
        const { SilverBalance, SilverTransaction } = require("../models/Silver");
        const { fetchLiveRates } = require("./goldController");

        const rates = await fetchLiveRates();
        const buyRate = rates.silver.buyRate;
        if (!buyRate || buyRate <= 0) {
            return res.status(503).json({ success: false, message: "Silver rate unavailable right now" });
        }
        const GST_PCT = 3;

        let { amountInRupees, grams, pointsRedeemed } = req.body;
        if (grams && !amountInRupees) amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        if (!amountInRupees || amountInRupees < 100) {
            return res.status(400).json({ success: false, message: "Minimum purchase is ₹100" });
        }

        const gstAmt = parseFloat((amountInRupees * GST_PCT / 100).toFixed(2));
        let pointsDiscount = 0;
        if (pointsRedeemed) {
            pointsDiscount = parseFloat((pointsRedeemed * 0.1).toFixed(2));
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
        silverBal.investedAmt = parseFloat((silverBal.investedAmt + amountInRupees).toFixed(2));
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


// Exported for reuse by schemeController (installment payments deduct from wallet)
exports.getOrCreateWallet = getOrCreateWallet;