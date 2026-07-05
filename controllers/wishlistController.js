const Wishlist = require("../models/Wishlist");
const Property = require("../models/Property");

// GET /api/wishlist  — get user's saved properties
exports.getWishlist = async (req, res, next) => {
    try {
        const items = await Wishlist.find({ user: req.user._id })
            .populate("property")
            .sort({ createdAt: -1 });
        const properties = items
            .filter((w) => w.property)
            .map((w) => w.property);
        res.json({ success: true, data: properties, count: properties.length });
    } catch (err) { next(err); }
};

// POST /api/wishlist/:propertyId  — add to wishlist
exports.addToWishlist = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.propertyId);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        await Wishlist.create({ user: req.user._id, property: req.params.propertyId });
        res.status(201).json({ success: true, message: "Added to wishlist", saved: true });
    } catch (err) {
        // duplicate key = already saved
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "Already in wishlist" });
        }
        next(err);
    }
};

// DELETE /api/wishlist/:propertyId  — remove from wishlist
exports.removeFromWishlist = async (req, res, next) => {
    try {
        const result = await Wishlist.findOneAndDelete({
            user: req.user._id,
            property: req.params.propertyId,
        });
        if (!result) return res.status(404).json({ success: false, message: "Not in wishlist" });
        res.json({ success: true, message: "Removed from wishlist", saved: false });
    } catch (err) { next(err); }
};

// GET /api/wishlist/check/:propertyId  — check if saved
exports.checkWishlist = async (req, res, next) => {
    try {
        const exists = await Wishlist.exists({
            user: req.user._id,
            property: req.params.propertyId,
        });
        res.json({ success: true, saved: !!exists });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/wishlist/admin/all
// All wishlist entries with user + property populated — paginated
exports.adminGetAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Wishlist.find()
                .populate("user", "name email phone role")
                .populate("property", "title propertyType location price images")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Wishlist.countDocuments(),
        ]);

        res.json({
            success: true,
            data: items,
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (err) { next(err); }
};

// GET /api/wishlist/admin/by-property
// Each property with count of saves + list of users who saved it
exports.adminByProperty = async (req, res, next) => {
    try {
        const agg = await Wishlist.aggregate([
            {
                $group: {
                    _id: "$property",
                    saveCount: { $sum: 1 },
                    users: { $push: "$user" },
                    lastSaved: { $max: "$createdAt" },
                },
            },
            { $sort: { saveCount: -1 } },
            {
                $lookup: {
                    from: "properties",
                    localField: "_id",
                    foreignField: "_id",
                    as: "property",
                },
            },
            { $unwind: { path: "$property", preserveNullAndEmpty: false } },
            {
                $lookup: {
                    from: "users",
                    localField: "users",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $project: {
                    property: { _id: 1, title: 1, propertyType: 1, "location.city": 1, "price.amount": 1, images: 1 },
                    saveCount: 1,
                    lastSaved: 1,
                    userDetails: { _id: 1, name: 1, email: 1, phone: 1 },
                },
            },
        ]);

        res.json({ success: true, data: agg, total: agg.length });
    } catch (err) { next(err); }
};

// GET /api/wishlist/admin/by-user
// Each user with count + properties they saved
exports.adminByUser = async (req, res, next) => {
    try {
        const agg = await Wishlist.aggregate([
            {
                $group: {
                    _id: "$user",
                    saveCount: { $sum: 1 },
                    properties: { $push: "$property" },
                    lastSaved: { $max: "$createdAt" },
                },
            },
            { $sort: { saveCount: -1 } },
            {
                $lookup: {
                    from: "users", localField: "_id", foreignField: "_id", as: "user",
                },
            },
            { $unwind: { path: "$user", preserveNullAndEmpty: false } },
            {
                $lookup: {
                    from: "properties", localField: "properties", foreignField: "_id", as: "propertyDetails",
                },
            },
            {
                $project: {
                    user: { _id: 1, name: 1, email: 1, phone: 1 },
                    saveCount: 1,
                    lastSaved: 1,
                    propertyDetails: { _id: 1, title: 1, "location.city": 1, "price.amount": 1 },
                },
            },
        ]);

        res.json({ success: true, data: agg, total: agg.length });
    } catch (err) { next(err); }
};

// GET /api/wishlist/admin/stats
// Summary stats: total saves, unique users, most saved property, trend
exports.adminStats = async (req, res, next) => {
    try {
        const [totalSaves, uniqueUsers, topProperty, last7days] = await Promise.all([
            Wishlist.countDocuments(),
            Wishlist.distinct("user").then((arr) => arr.length),
            Wishlist.aggregate([
                { $group: { _id: "$property", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 1 },
                { $lookup: { from: "properties", localField: "_id", foreignField: "_id", as: "property" } },
                { $unwind: "$property" },
                { $project: { count: 1, "property.title": 1, "property._id": 1 } },
            ]),
            Wishlist.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }),
        ]);

        res.json({
            success: true,
            stats: {
                totalSaves,
                uniqueUsers,
                last7days,
                topProperty: topProperty[0] || null,
            },
        });
    } catch (err) { next(err); }
};