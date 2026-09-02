const crypto = require("crypto");
const Property = require("../models/Property");
const Investment = require("../models/Investment");
const Kyc = require("../models/Kyc");
const paymentGatewayService = require("../services/paymentGatewayService");

exports.createOrder = async (req, res, next) => {
    try {
        const { propertyId, bricks } = req.body;

        if (!propertyId || !bricks || bricks < 1) {
            return res.status(400).json({ success: false, message: "propertyId and bricks required" });
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

        const soldAgg = await Investment.aggregate([
            { $match: { property: property._id, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$bricks" } } }
        ]);
        const sold = soldAgg[0]?.total || 0;
        const available = property.totalBricks - sold;

        if (bricks > available) {
            return res.status(400).json({ success: false, message: `Only ${available} bricks available` });
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
                    type: "investment",
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
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.propertyId) filter.property = req.query.propertyId;

        const [investments, total] = await Promise.all([
            Investment.find(filter)
                .populate("user", "name email phone")
                .populate("property", "title location")
                .sort("-createdAt").skip(skip).limit(limit),
            Investment.countDocuments(filter),
        ]);

        const revenue = await Investment.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);

        return res.json({
            success: true, total, page,
            pages: Math.ceil(total / limit),
            totalRevenue: revenue[0]?.total || 0,
            data: investments,
        });
    } catch (err) { next(err); }
};