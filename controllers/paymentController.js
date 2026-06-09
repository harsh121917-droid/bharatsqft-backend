const Razorpay = require("razorpay");
const crypto = require("crypto");
const Property = require("../models/Property");
const Investment = require("../models/Investment");

/* lazy init — only created when first API call hits */
function getRazorpay() {
    if (!process.env.RAZORPAY_KEY_ID) throw new Error("RAZORPAY_KEY_ID missing in .env");
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

/* ─────────────────────────────────────────
   POST /api/payments/create-order
   Body: { propertyId, bricks }
   Auth: required (logged in user)
───────────────────────────────────────── */
exports.createOrder = async (req, res, next) => {
    try {
        const { propertyId, bricks } = req.body;

        if (!propertyId || !bricks || bricks < 1) {
            return res.status(400).json({ success: false, message: "propertyId and bricks required" });
        }

        const property = await Property.findById(propertyId);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        if (property.status !== "published") return res.status(400).json({ success: false, message: "Property not available" });

        // Check bricks available
        const soldBricks = await Investment.aggregate([
            { $match: { property: property._id, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$bricks" } } }
        ]);
        const sold = soldBricks[0]?.total || 0;
        const available = property.totalBricks - sold;

        if (bricks > available) {
            return res.status(400).json({ success: false, message: `Only ${available} bricks available` });
        }

        const totalAmount = bricks * property.brickPrice;
        const amountPaise = totalAmount * 100; // Razorpay uses paise

        // Create Razorpay order
        const order = await getRazorpay().orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: `bsqft_${Date.now()}`,
            notes: {
                propertyId: propertyId,
                propertyTitle: property.title,
                bricks: bricks.toString(),
                userId: req.user._id.toString(),
            },
        });

        // Save pending investment
        const investment = await Investment.create({
            user: req.user._id,
            property: propertyId,
            bricks,
            pricePerBrick: property.brickPrice,
            totalAmount,
            razorpayOrderId: order.id,
            status: "pending",
        });

        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            investment: {
                id: investment._id,
                bricks,
                pricePerBrick: property.brickPrice,
                totalAmount,
                propertyTitle: property.title,
            },
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   POST /api/payments/verify
   Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, investmentId }
───────────────────────────────────────── */
exports.verifyPayment = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, investmentId } = req.body;

        // Verify signature
        const body = razorpayOrderId + "|" + razorpayPaymentId;
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expected !== razorpaySignature) {
            await Investment.findByIdAndUpdate(investmentId, { status: "failed" });
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        // Mark investment as paid
        const investment = await Investment.findByIdAndUpdate(
            investmentId,
            {
                status: "paid",
                razorpayPaymentId,
                razorpaySignature,
            },
            { new: true }
        ).populate("property", "title location brickPrice totalBricks");

        // Update property soldBricks count
        const soldBricks = await Investment.aggregate([
            { $match: { property: investment.property._id, status: "paid" } },
            { $group: { _id: null, total: { $sum: "$bricks" } } }
        ]);
        await require("../models/Property").findByIdAndUpdate(
            investment.property._id,
            { soldBricks: soldBricks[0]?.total || 0 }
        );

        res.json({
            success: true,
            message: "Payment successful! Bricks allocated.",
            investment,
        });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   GET /api/payments/my
   User's own investments
───────────────────────────────────────── */
exports.getMyInvestments = async (req, res, next) => {
    try {
        const investments = await Investment.find({ user: req.user._id, status: "paid" })
            .populate("property", "title location images brickPrice totalBricks")
            .sort("-createdAt");

        res.json({ success: true, count: investments.length, data: investments });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   GET /api/admin/investments
   Admin sees all investments
───────────────────────────────────────── */
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
                .sort("-createdAt")
                .skip(skip).limit(limit),
            Investment.countDocuments(filter),
        ]);

        // Total revenue
        const revenue = await Investment.aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);

        res.json({
            success: true, total, page,
            pages: Math.ceil(total / limit),
            totalRevenue: revenue[0]?.total || 0,
            data: investments,
        });
    } catch (err) { next(err); }
};