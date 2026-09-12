const crypto = require("crypto");
const User = require("../models/User");
const Property = require("../models/Property");
const Investment = require("../models/Investment");
const Kyc = require("../models/Kyc");
const paymentGatewayService = require("../services/paymentGatewayService");

exports.createOrder = async (req, res, next) => {
    try {
        let { propertyId, bricks, isDirectBuy, purchaseType } = req.body;
        const isDirect = isDirectBuy === true || purchaseType === "direct";

        if (!propertyId) {
            return res.status(400).json({ success: false, message: "propertyId is required" });
        }

        // KYC check — required before any brick investment
        const kyc = await Kyc.findOne({ user: req.user._id });
        if (!kyc || kyc.status !== "approved") {
            return res.status(403).json({
                success: false,
                code: "KYC_REQUIRED",
                kycStatus: kyc?.status || "not_submitted",
                message: kyc?.status === "pending"
                    ? "Your KYC is under review. Please wait for approval before investing."
                    : kyc?.status === "rejected"
                        ? "Your KYC was rejected. Please resubmit with correct details."
                        : "Please complete KYC verification before investing in bricks.",
            });
        }

        const property = await Property.findById(propertyId);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        if (property.status !== "published") return res.status(400).json({ success: false, message: "Property not available for investment" });
        if (!property.investmentEnabled) return res.status(400).json({ success: false, message: "Brick investment not enabled for this property" });
        if (!property.brickPrice || property.brickPrice <= 0) return res.status(400).json({ success: false, message: "Brick price not set" });
        if (!property.totalBricks || property.totalBricks <= 0) return res.status(400).json({ success: false, message: "Total bricks not set" });

        const pMode = property.purchaseMode || "both";
        if (pMode === "direct" && !isDirect) {
            return res.status(400).json({
                success: false,
                message: "This property is exclusively available for Direct Buy (Full Property Purchase) only."
            });
        }
        if (pMode === "bricks" && isDirect) {
            return res.status(400).json({
                success: false,
                message: "This property is available for Fractional Bricks investment only."
            });
        }

        const soldAgg = await Investment.aggregate([
            { $match: { property: property._id, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$bricks" } } }
        ]);
        const sold = soldAgg[0]?.total || 0;
        const available = property.totalBricks - sold;

        if (available <= 0) {
            return res.status(400).json({ success: false, message: "This property is completely sold out" });
        }

        if (isDirect) {
            bricks = available;
        } else {
            if (!bricks || bricks < 1) {
                return res.status(400).json({ success: false, message: "Valid number of bricks required" });
            }
            if (bricks > available) {
                return res.status(400).json({ success: false, message: `Only ${available} bricks available` });
            }
        }

        const totalAmount = bricks * property.brickPrice;
        const amountPaise = totalAmount * 100;
        let order;
        let keyId;
        try {
            const result = await paymentGatewayService.createRazorpayOrder({
                amount: totalAmount,
                purpose: "spot",
                notes: {
                    userId: String(req.user._id),
                    type: isDirect ? "direct_buy" : "investment",
                    propertyId: String(property._id),
                    isDirectBuy: isDirect ? "true" : "false",
                },
            });
            order = result.order;
            keyId = result.keyId;
        } catch (rzpErr) {
            console.error("Razorpay error:", JSON.stringify(rzpErr));
            return res.status(500).json({ success: false, message: "Payment gateway error: " + (rzpErr?.error?.description || rzpErr?.message || JSON.stringify(rzpErr)) });
        }

        const investment = await Investment.create({
            user: req.user._id,
            property: propertyId,
            bricks,
            pricePerBrick: property.brickPrice,
            totalAmount,
            razorpayOrderId: order.id,
            status: "pending",
            purchaseType: isDirect ? "direct" : "bricks",
            isDirectBuy: isDirect,
        });

        return res.json({
            success: true,
            order: { id: order.id, amount: order.amount, currency: order.currency },
            investment: {
                id: investment._id,
                bricks,
                pricePerBrick: property.brickPrice,
                totalAmount,
                propertyTitle: property.title,
                isDirectBuy: isDirect,
                purchaseType: isDirect ? "direct" : "bricks",
            },
            key: keyId,
        });
    } catch (err) {
        console.error("createOrder error:", err?.message || JSON.stringify(err));
        next(err);
    }
};

// @desc    Verify Razorpay payment signature and mark investment paid
// @route   POST /api/payments/verify
// @access  Private
exports.verifyPayment = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, investmentId } = req.body;

        const keySecret = await paymentGatewayService.getRazorpayKeySecret(undefined, { purpose: "spot" });
        const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
            keySecret,
            purpose: "spot",
        });

        if (!isValid) {
            await Investment.findByIdAndUpdate(investmentId, { status: "failed" });
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        const investment = await Investment.findByIdAndUpdate(
            investmentId,
            { status: "paid", razorpayPaymentId, razorpaySignature },
            { new: true }
        ).populate("property", "title location brickPrice totalBricks");

        const soldAgg = await Investment.aggregate([
            { $match: { property: investment.property._id, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$bricks" } } }
        ]);
        await Property.findByIdAndUpdate(
            investment.property._id,
            { soldBricks: soldAgg[0]?.total || 0 }
        );

        return res.json({ success: true, message: "Payment successful! Bricks allocated.", investment });
    } catch (err) {
        console.error("verifyPayment error:", err.message);
        next(err);
    }
};

exports.getMyInvestments = async (req, res, next) => {
    try {
        const investments = await Investment.find({ user: req.user._id, status: "paid" })
            .populate("property", "title location images brickPrice totalBricks")
            .sort("-createdAt");
        return res.json({ success: true, count: investments.length, data: investments });
    } catch (err) { next(err); }
};

exports.getAllInvestments = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
        if (req.query.propertyId && req.query.propertyId !== "all") filter.property = req.query.propertyId;

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            const [matchingUsers, matchingProps] = await Promise.all([
                User.find({ $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }] }).select("_id"),
                Property.find({ $or: [{ title: searchRegex }, { "location.city": searchRegex }] }).select("_id")
            ]);
            filter.$or = [
                { user: { $in: matchingUsers.map(u => u._id) } },
                { property: { $in: matchingProps.map(p => p._id) } }
            ];
        }

        const [investments, total, revenueAgg, uniqueInvestors] = await Promise.all([
            Investment.find(filter)
                .populate("user", "name email phone avatar profilePicture")
                .populate("property", "title location brickPrice totalBricks soldBricks expectedRentalYield expectedAppreciation propertyType images price totalInvestmentRequired")
                .sort("-createdAt").skip(skip).limit(limit),
            Investment.countDocuments(filter),
            Investment.aggregate([
                { $match: { status: "paid" } },
                { $group: { _id: null, total: { $sum: "$totalAmount" }, totalBricks: { $sum: "$bricks" } } }
            ]),
            Investment.distinct("user", { status: "paid" })
        ]);

        return res.json({
            success: true, total, page,
            pages: Math.ceil(total / limit),
            totalRevenue: revenueAgg[0]?.total || 0,
            totalBricks: revenueAgg[0]?.totalBricks || 0,
            uniqueInvestorsCount: uniqueInvestors?.length || 0,
            data: investments,
        });
    } catch (err) { next(err); }
};

// ── RAZORPAY WEBHOOK LISTENER ──────────────────────────────────
// Webhook endpoint to catch order.paid, payment.captured, payment.authorized
exports.handleRazorpayWebhook = async (req, res, next) => {
    try {
        const { resolveTransactionByRazorpayOrder } = require("../services/transactionResolutionService");
        const event = req.body?.event;
        const payload = req.body?.payload;

        console.log(`[Razorpay Webhook Received] Event: ${event}`);

        if (event === "order.paid" || event === "payment.captured" || event === "payment.authorized") {
            const orderId = payload?.payment?.entity?.order_id || payload?.order?.entity?.id;
            const paymentId = payload?.payment?.entity?.id;

            if (orderId) {
                const result = await resolveTransactionByRazorpayOrder(orderId, paymentId, "webhook");
                if (result) {
                    console.log(`[Razorpay Webhook] Auto-credited and completed order ${orderId}:`, result.message);
                }
            }
        }

        return res.status(200).json({ status: "ok" });
    } catch (err) {
        console.error("[Razorpay Webhook Error]:", err.message);
        return res.status(200).json({ status: "error", message: err.message });
    }
};