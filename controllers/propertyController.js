const Property = require("../models/Property");

/* ==================== PUBLIC ==================== */

/* @route  GET /api/properties
   @access Public */
exports.getPublicProperties = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Support both "published" and "active" status values
        const filter = { status: { $in: ["published", "active"] } };
        if (req.query.featured !== undefined) {
            filter.featured = req.query.featured === "true" || req.query.featured === true;
        }
        if (req.query.type) filter.propertyType = req.query.type;
        if (req.query.city) filter["location.city"] = { $regex: req.query.city, $options: "i" };
        if (req.query.bhk) filter.bhk = req.query.bhk;
        if (req.query.minPrice || req.query.maxPrice) {
            filter["price.amount"] = {};
            if (req.query.minPrice) filter["price.amount"].$gte = +req.query.minPrice;
            if (req.query.maxPrice) filter["price.amount"].$lte = +req.query.maxPrice;
        }
        if (req.query.search) {
            filter.$or = [
                { title: { $regex: req.query.search, $options: "i" } },
                { "location.city": { $regex: req.query.search, $options: "i" } },
                { "location.address": { $regex: req.query.search, $options: "i" } },
            ];
        }

        const [properties, total] = await Promise.all([
            Property.find(filter).sort("-createdAt").skip(skip).limit(limit),
            Property.countDocuments(filter),
        ]);

        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: properties });
    } catch (err) { next(err); }
};

/* @route  GET /api/properties/:id
   @access Public */
exports.getPublicPropertyById = async (req, res, next) => {
    try {
        const property = await Property.findOne({
            _id: req.params.id,
            status: { $in: ["published", "active"] },
        });
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        res.json({ success: true, data: property });
    } catch (err) { next(err); }
};

/* ==================== ADMIN ==================== */

/* @route  GET /api/admin/properties
   @access Admin */
exports.getAllProperties = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) {
            if (req.query.status === "published") {
                filter.status = { $in: ["published", "active"] };
            } else {
                filter.status = req.query.status;
            }
        }
        if (req.query.type) filter.propertyType = req.query.type;
        if (req.query.search) {
            filter.$or = [
                { title: { $regex: req.query.search, $options: "i" } },
                { "location.city": { $regex: req.query.search, $options: "i" } },
            ];
        }

        const [properties, total] = await Promise.all([
            Property.find(filter).sort("-createdAt").skip(skip).limit(limit),
            Property.countDocuments(filter),
        ]);

        // Normalize virtuals for admin UI
        const normalized = properties.map(p => {
            const doc = p.toObject();
            doc.isPublished = doc.status === "published" || doc.status === "active";
            doc.totalInvestmentRequired = doc.totalInvestmentRequired || doc.price?.amount || (doc.brickPrice && doc.totalBricks ? doc.brickPrice * doc.totalBricks : 0);
            doc.fundedPercentage = doc.totalBricks > 0 ? Math.round(((doc.soldBricks || 0) / doc.totalBricks) * 100) : 0;
            return doc;
        });

        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: normalized });
    } catch (err) { next(err); }
};

/* @route  GET /api/admin/properties/:id
   @access Admin */
exports.getPropertyById = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        const doc = property.toObject();
        doc.isPublished = doc.status === "published" || doc.status === "active";
        doc.totalInvestmentRequired = doc.totalInvestmentRequired || doc.price?.amount || (doc.brickPrice && doc.totalBricks ? doc.brickPrice * doc.totalBricks : 0);
        res.json({ success: true, data: doc });
    } catch (err) { next(err); }
};

/* @route  POST /api/admin/properties
   @access Admin */
exports.createProperty = async (req, res, next) => {
    try {
        const body = { ...req.body };
        if (!body.price && (body.totalInvestmentRequired || (body.brickPrice && body.totalBricks))) {
            body.price = {
                amount: body.totalInvestmentRequired || (body.brickPrice * body.totalBricks),
                currency: "INR",
                label: "onwards",
            };
        }
        if (body.price?.amount && !body.totalInvestmentRequired) {
            body.totalInvestmentRequired = body.price.amount;
        }
        if (body.investmentEnabled === undefined) {
            body.investmentEnabled = true;
        }
        if (body.featured === undefined) {
            body.featured = true;
        }
        if (!body.status) {
            body.status = "published";
        }

        const property = await Property.create({
            ...body,
            createdBy: req.user._id,
        });
        res.status(201).json({ success: true, data: property });
    } catch (err) { next(err); }
};

/* @route  PUT /api/admin/properties/:id
   @access Admin */
exports.updateProperty = async (req, res, next) => {
    try {
        const body = { ...req.body };
        if (body.totalInvestmentRequired && (!body.price || !body.price.amount)) {
            body["price.amount"] = body.totalInvestmentRequired;
            if (!body.price) body.price = { amount: body.totalInvestmentRequired, currency: "INR", label: "onwards" };
        } else if (body.price?.amount && !body.totalInvestmentRequired) {
            body.totalInvestmentRequired = body.price.amount;
        }

        const property = await Property.findByIdAndUpdate(
            req.params.id,
            { $set: body },
            { new: true, runValidators: false }
        );
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        res.json({ success: true, data: property });
    } catch (err) { next(err); }
};

/* @route  DELETE /api/admin/properties/:id
   @access Admin */
exports.deleteProperty = async (req, res, next) => {
    try {
        const property = await Property.findByIdAndDelete(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        res.json({ success: true, message: "Property deleted" });
    } catch (err) { next(err); }
};

/* @route  PATCH /api/admin/properties/:id/toggle
   @access Admin — publish/unpublish */
exports.toggleStatus = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        const isCurrentlyPublished = property.status === "published" || property.status === "active";
        const newStatus = isCurrentlyPublished ? "draft" : "published";

        const updated = await Property.findByIdAndUpdate(
            req.params.id,
            { 
                $set: { 
                    status: newStatus,
                    featured: true,
                    investmentEnabled: true,
                    ...(property.title && (!property.seo || !property.seo.slug) ? {
                        "seo.slug": property.title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").substring(0, 100)
                    } : {})
                } 
            },
            { new: true }
        );

        res.json({
            success: true,
            status: updated.status,
            isPublished: updated.status === "published",
            data: updated,
        });
    } catch (err) { next(err); }
};