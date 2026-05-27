const User = require("../models/User");
const Enquiry = require("../models/Enquiry");

exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.active) filter.isActive = req.query.active === "true";
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: "i" } },
                { email: { $regex: req.query.search, $options: "i" } },
            ];
        }
        const [users, total] = await Promise.all([
            User.find(filter).sort("-createdAt").skip(skip).limit(limit),
            User.countDocuments(filter),
        ]);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: users });
    } catch (err) { next(err); }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
    try {
        const allowed = ["name", "phone", "role", "isActive"];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, message: "User deleted" });
    } catch (err) { next(err); }
};

exports.getAllEnquiries = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: "i" } },
                { email: { $regex: req.query.search, $options: "i" } },
                { message: { $regex: req.query.search, $options: "i" } },
            ];
        }
        const [enquiries, total] = await Promise.all([
            Enquiry.find(filter).populate("userId", "name email").sort("-createdAt").skip(skip).limit(limit),
            Enquiry.countDocuments(filter),
        ]);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: enquiries });
    } catch (err) { next(err); }
};

exports.updateEnquiry = async (req, res, next) => {
    try {
        const allowed = ["status", "notes", "assignedTo"];
        const updates = {};
        allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
        const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
        res.json({ success: true, data: enquiry });
    } catch (err) { next(err); }
};

exports.deleteEnquiry = async (req, res, next) => {
    try {
        const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
        if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
        res.json({ success: true, message: "Enquiry deleted" });
    } catch (err) { next(err); }
};

exports.getDashboard = async (req, res, next) => {
    try {
        const [totalUsers, totalEnquiries, newEnquiries, resolvedEnquiries] = await Promise.all([
            User.countDocuments({ role: "user" }),
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: "new" }),
            Enquiry.countDocuments({ status: "resolved" }),
        ]);
        res.json({ success: true, data: { totalUsers, totalEnquiries, newEnquiries, resolvedEnquiries } });
    } catch (err) { next(err); }
};