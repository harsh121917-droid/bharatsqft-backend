const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { fetchLiveRates } = require("./goldController");

async function getOrCreateBalance(userId) {
    let bal = await SilverBalance.findOne({ user: userId });
    if (!bal) bal = await SilverBalance.create({ user: userId });
    return bal;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/balance
// ══════════════════════════════════════════════════════════════════════════════
exports.getBalance = async (req, res, next) => {
    try {
        const [bal, rates] = await Promise.all([
            getOrCreateBalance(req.user._id),
            fetchLiveRates(),
        ]);

        const sellRate = rates.silver.sellRate;
        const currentValue = parseFloat((bal.totalGrams * sellRate).toFixed(2));
        const gainLoss = parseFloat((currentValue - bal.investedAmt).toFixed(2));
        const gainLossPct = bal.investedAmt > 0
            ? parseFloat(((gainLoss / bal.investedAmt) * 100).toFixed(2)) : 0;
        const avgBuyRate = bal.totalGrams > 0
            ? parseFloat((bal.investedAmt / bal.totalGrams).toFixed(2)) : 0;

        res.json({
            success: true,
            data: {
                totalGrams: bal.totalGrams,
                availableGrams: parseFloat((bal.totalGrams - bal.lockedGrams).toFixed(6)),
                lockedGrams: bal.lockedGrams,
                investedAmt: bal.investedAmt,
                currentValue,
                gainLoss,
                gainLossPct,
                avgBuyRate,
                currentBuyRate: rates.silver.buyRate,
                currentSellRate: rates.silver.sellRate,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactions = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type, status = "success" } = req.query;
        const query = { user: req.user._id };
        if (status && status !== "all") query.status = status;
        if (type) query.type = type;

        const [txns, total, all] = await Promise.all([
            SilverTransaction.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
            SilverTransaction.countDocuments(query),
            SilverTransaction.find({ user: req.user._id, status: "success" }),
        ]);

        const bought = all.filter(t => t.type === "buy").reduce((s, t) => s + t.grams, 0);
        const sold = all.filter(t => t.type === "sell").reduce((s, t) => s + t.grams, 0);
        const spent = all.filter(t => t.type === "buy").reduce((s, t) => s + t.totalAmt, 0);

        res.json({
            success: true,
            data: txns.map(t => ({
                id: t._id, invoiceNo: t.invoiceNo, type: t.type, grams: t.grams,
                ratePerGram: t.ratePerGram, silverValue: t.silverValue,
                gstAmt: t.gstAmt, totalAmt: t.totalAmt,
                status: t.status, note: t.note, createdAt: t.createdAt,
            })),
            total, page: +page, pages: Math.ceil(total / limit),
            summary: {
                totalBought: parseFloat(bought.toFixed(4)),
                totalSold: parseFloat(sold.toFixed(4)),
                totalSpent: parseFloat(spent.toFixed(2)),
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions/:id  — single transaction detail
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionDetail = async (req, res, next) => {
    try {
        const txn = await SilverTransaction.findOne({ _id: req.params.id, user: req.user._id, status: "success" });
        if (!txn) return res.status(404).json({ success: false, message: "Transaction not found" });
        res.json({
            success: true,
            data: {
                id: txn._id, invoiceNo: txn.invoiceNo, type: txn.type, grams: txn.grams,
                ratePerGram: txn.ratePerGram, silverValue: txn.silverValue,
                gstAmt: txn.gstAmt, totalAmt: txn.totalAmt,
                status: txn.status, note: txn.note, createdAt: txn.createdAt,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions/:id/invoice  — download PDF invoice
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionInvoice = async (req, res, next) => {
    try {
        const { generateInvoicePDF } = require("../services/invoiceService");
        const isSample = req.query.sample === "true" || req.params.id === "sample";
        
        let txn;
        if (req.params.id === "sample") {
            txn = {
                _id: "507f1f77bcf86cd799439012",
                invoiceNo: "SMPL-SLVR-2026-0001",
                createdAt: new Date(),
                type: "buy",
                grams: 11.2359,
                ratePerGram: 89.00,
                goldValue: 970.87,
                silverValue: 970.87,
                gstAmt: 29.13,
                totalAmt: 1000.00
            };
        } else {
            txn = await SilverTransaction.findOne({ _id: req.params.id, user: req.user._id });
        }

        if (!txn) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        const invoiceLabel = txn.invoiceNo || `TX-${String(txn._id).slice(-8).toUpperCase()}`;
        res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceLabel}.pdf"`);

        await generateInvoicePDF(txn, req.user, "silver", res, isSample);
    } catch (err) { next(err); }
};
// ══════════════════════════════════════════════════════════════════════════════
// POST /api/silver/buy (or /api/silver/buy/initiate) — Direct Razorpay Buy Order
// ══════════════════════════════════════════════════════════════════════════════
exports.initiateBuy = async (req, res, next) => {
    try {
        const { fetchLiveRates } = require("./goldController");
        const paymentGatewayService = require("../services/paymentGatewayService");
        const User = require("../models/User");
        const Coupon = require("../models/Coupon");

        if (req.user.kycStatus !== "approved") {
            return res.status(400).json({ success: false, message: "Please complete your KYC to buy silver." });
        }

        const rates = await fetchLiveRates();
        const buyRate = rates.silver?.buyRate || 95.0;
        let { amountInRupees, grams, redeemReferral, couponCode, pointsRedeemed } = req.body;

        if (!amountInRupees && !grams) {
            return res.status(400).json({ success: false, message: "Provide amountInRupees or grams" });
        }
        if (grams && !amountInRupees) {
            amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        }

        let isRedeemed = false;
        let purchaseValue = amountInRupees;
        if (redeemReferral) {
            const user = await User.findById(req.user._id);
            if (user.referralBalance && user.referralBalance >= 50 && amountInRupees >= 1000) {
                isRedeemed = true;
                purchaseValue = amountInRupees + 50;
            }
        }

        let couponBonus = 0;
        let couponDiscount = 0;
        let appliedCoupon = null;
        if (couponCode) {
            const cp = await Coupon.findOne({ code: couponCode.toUpperCase().trim(), isActive: true });
            if (cp && (!cp.minPurchase || amountInRupees >= cp.minPurchase) && (cp.metal === "both" || cp.metal === "silver")) {
                appliedCoupon = cp;
                if (cp.type === "discount") {
                    couponDiscount = cp.calcType === "percentage" ? (amountInRupees * cp.value) / 100 : cp.value;
                    if (cp.maxDiscount && couponDiscount > cp.maxDiscount) couponDiscount = cp.maxDiscount;
                } else if (cp.type === "extra_gold") {
                    couponBonus = cp.calcType === "percentage" ? (amountInRupees * cp.value) / 100 : cp.value;
                }
            }
        }

        const effectivePayAmount = Math.max(1, amountInRupees - couponDiscount);
        const gstAmt = parseFloat(((effectivePayAmount * 3.0) / 100).toFixed(2));
        const totalAmt = parseFloat((effectivePayAmount + gstAmt).toFixed(2));
        const gramsToAdd = parseFloat(((purchaseValue + couponBonus) / buyRate).toFixed(6));

        const { order, keyId } = await paymentGatewayService.createRazorpayOrder({
            amount: totalAmt,
            purpose: "spot",
            notes: {
                userId: req.user._id.toString(),
                type: "investment",
                couponCode: appliedCoupon ? appliedCoupon.code : "",
            },
        });

        const txn = await SilverTransaction.create({
            user: req.user._id,
            type: "buy",
            grams: gramsToAdd,
            ratePerGram: buyRate,
            silverValue: purchaseValue + couponBonus,
            gstAmt,
            totalAmt,
            status: "pending",
            razorpayOrderId: order.id,
            isReferralRedeemed: isRedeemed,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            couponBonus,
            couponDiscount,
            isCouponApplied: !!appliedCoupon,
        });

        res.json({
            success: true,
            data: {
                order,
                key: keyId,
                transaction: { id: txn._id },
                breakdown: { grams: gramsToAdd, silverValue: purchaseValue, gstAmt, totalAmt, ratePerGram: buyRate },
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/silver/buy/verify — Verify Razorpay Payment and Credit Silver
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyBuy = async (req, res, next) => {
    try {
        const paymentGatewayService = require("../services/paymentGatewayService");
        const User = require("../models/User");
        const {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            transactionId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        const orderId = razorpayOrderId || razorpay_order_id;
        const paymentId = razorpayPaymentId || razorpay_payment_id;
        const signature = razorpaySignature || razorpay_signature;

        const keySecret = await paymentGatewayService.getRazorpayKeySecret(undefined, { purpose: "spot" });
        const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
            orderId,
            paymentId,
            signature,
            keySecret,
            purpose: "spot",
        });

        if (!isValid) {
            if (transactionId) await SilverTransaction.findByIdAndUpdate(transactionId, { status: "failed" });
            return res.status(400).json({ success: false, message: "Payment signature verification failed" });
        }

        const txn = await SilverTransaction.findOne({
            $or: [{ _id: transactionId }, { razorpayOrderId: orderId }],
            user: req.user._id,
        });
        if (!txn) return res.status(404).json({ success: false, message: "Silver transaction not found" });

        if (txn.status !== "success") {
            const bal = await getOrCreateBalance(req.user._id);
            bal.totalGrams = parseFloat((bal.totalGrams + txn.grams).toFixed(6));
            bal.investedAmt = parseFloat((bal.investedAmt + txn.totalAmt).toFixed(2));
            await bal.save();

            if (txn.isReferralRedeemed) {
                const user = await User.findById(req.user._id);
                user.referralBalance = Math.max(0, (user.referralBalance || 0) - 50);
                await user.save();
            }

            txn.status = "success";
            txn.razorpayPaymentId = paymentId;
            txn.razorpaySignature = signature;
            await txn.save();
        }

        res.json({
            success: true,
            message: `${txn.grams}g silver successfully credited to your vault`,
            data: { grams: txn.grams, transaction: txn },
        });
    } catch (err) { next(err); }
};
