const Razorpay = require("razorpay");
const crypto = require("crypto");
const Property = require("../models/Property");
const Investment = require("../models/Investment");

function getRazorpay() {
    if (!process.env.RAZORPAY_KEY_ID) throw new Error("RAZORPAY_KEY_ID missing in .env");
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

exports.createOrder = async (req, res, next) => {
    try {
        const { propertyId, bricks } = req.body;

        if (!propertyId || !bricks || bricks < 1) {
            return res.status(400).json({ success: false, message: "propertyId and bricks required" });
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

        const order = await getRazorpay().orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: `bsqft_${Date.now()}`,
            notes: {
                propertyId: propertyId,
                propertyTitle: property.title,
                bricks: String(bricks),
                userId: String(req.user._id),
            },
        });

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
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error("createOrder error:", err.message, err.stack);
        return res.status(500).json({ success: false, message: err.message || "Server error" });
    }
};

exports.verifyPayment = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, investmentId } = req.body;

        const body = razorpayOrderId + "|" + razorpayPaymentId;
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body).digest("hex");

        if (expected !== razorpaySignature) {
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