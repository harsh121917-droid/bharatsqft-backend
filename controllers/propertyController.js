const Property = require("../models/Property");

/* ==================== PUBLIC ==================== */

/* @route  GET /api/properties
   @access Public */
exports.getPublicProperties = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const filter = { status: "published" };
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
            status: "published",
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
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;
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

        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: properties });
    } catch (err) { next(err); }
};

/* @route  GET /api/admin/properties/:id
   @access Admin */
exports.getPropertyById = async (req, res, next) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });
        res.json({ success: true, data: property });
    } catch (err) { next(err); }
};

/* @route  POST /api/admin/properties
   @access Admin */
exports.createProperty = async (req, res, next) => {
    try {
        const property = await Property.create({
            ...req.body,
            createdBy: req.user._id,
        });
        res.status(201).json({ success: true, data: property });
    } catch (err) { next(err); }
};

/* @route  PUT /api/admin/properties/:id
   @access Admin */
exports.updateProperty = async (req, res, next) => {
    try {
        const property = await Property.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
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
        property.status = property.status === "published" ? "unpublished" : "published";
        await property.save();
        res.json({ success: true, status: property.status, data: property });
    } catch (err) { next(err); }
};