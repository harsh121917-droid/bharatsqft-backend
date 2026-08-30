const PaymentGateway = require("../models/PaymentGateway");

function maskSecret(s) {
    if (!s) return "";
    if (s.length <= 6) return "••••";
    return s.slice(0, 4) + "•".repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

function maskConfig(doc) {
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
        ...obj,
        keySecret: obj.keySecret ? maskSecret(obj.keySecret) : undefined,
        clientSecret: obj.clientSecret ? maskSecret(obj.clientSecret) : undefined,
    };
}

// GET /api/admin/payment-gateways
exports.getGateways = async (req, res, next) => {
    try {
        const gateways = await PaymentGateway.find().sort({ isDefault: -1, createdAt: -1 });
        res.json({ success: true, data: gateways.map(maskConfig) });
    } catch (err) { next(err); }
};

// POST /api/admin/payment-gateways
exports.upsertGateway = async (req, res, next) => {
    try {
        const { name, mode = "live", keyId, keySecret, clientId, clientSecret, isActive = true, isDefault = false } = req.body;
        if (!name || !mode) {
            return res.status(400).json({ success: false, message: "name and mode are required" });
        }

        const update = { updatedBy: req.user._id, mode: mode.toLowerCase() };
        if (keyId !== undefined) update.keyId = keyId;
        if (keySecret !== undefined && keySecret !== "") update.keySecret = keySecret;
        if (clientId !== undefined) update.clientId = clientId;
        if (clientSecret !== undefined && clientSecret !== "") update.clientSecret = clientSecret;
        if (isActive !== undefined) update.isActive = isActive;

        const config = await PaymentGateway.findOneAndUpdate(
            { name: name.toLowerCase(), mode: mode.toLowerCase() },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (isDefault === true || isDefault === "true") {
            await PaymentGateway.updateMany({ _id: { $ne: config._id } }, { isDefault: false });
            config.isDefault = true;
            await config.save();
        }

        res.json({ success: true, message: `${name} (${mode}) saved successfully`, data: maskConfig(config) });
    } catch (err) { next(err); }
};

// PUT /api/admin/payment-gateways/:id
exports.updateGateway = async (req, res, next) => {
    try {
        const { name, mode, keyId, keySecret, clientId, clientSecret, isActive, isDefault } = req.body;
        const config = await PaymentGateway.findById(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: "Gateway not found" });

        if (name) config.name = name.toLowerCase();
        if (mode) config.mode = mode.toLowerCase();
        if (keyId !== undefined) config.keyId = keyId;
        if (keySecret && keySecret.trim() !== "" && !keySecret.includes("••••")) config.keySecret = keySecret.trim();
        if (clientId !== undefined) config.clientId = clientId;
        if (clientSecret && clientSecret.trim() !== "" && !clientSecret.includes("••••")) config.clientSecret = clientSecret.trim();
        if (isActive !== undefined) config.isActive = isActive;
        config.updatedBy = req.user._id;

        if (isDefault === true || isDefault === "true") {
            await PaymentGateway.updateMany({ _id: { $ne: config._id } }, { isDefault: false });
            config.isDefault = true;
        }

        await config.save();
        res.json({ success: true, message: "Gateway updated successfully", data: maskConfig(config) });
    } catch (err) { next(err); }
};

// PATCH /api/admin/payment-gateways/:id/toggle
exports.toggleGateway = async (req, res, next) => {
    try {
        const config = await PaymentGateway.findById(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: "Gateway not found" });

        config.isActive = req.body.isActive !== undefined ? !!req.body.isActive : !config.isActive;
        await config.save();
        res.json({ success: true, message: `Gateway is now ${config.isActive ? 'Active' : 'Inactive'}`, data: maskConfig(config) });
    } catch (err) { next(err); }
};

// DELETE /api/admin/payment-gateways/:id
exports.deleteGateway = async (req, res, next) => {
    try {
        const deleted = await PaymentGateway.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "Gateway not found" });
        res.json({ success: true, message: "Gateway config deleted" });
    } catch (err) { next(err); }
};

// PATCH /api/admin/payment-gateways/:id/set-default
exports.setDefaultGateway = async (req, res, next) => {
    try {
        const config = await PaymentGateway.findById(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: "Gateway not found" });
        
        config.isActive = true;
        await PaymentGateway.updateMany({}, { isDefault: false });
        config.isDefault = true;
        await config.save();
        res.json({ success: true, message: `${config.name} (${config.mode}) is now the DEFAULT gateway for all transactions`, data: maskConfig(config) });
    } catch (err) { next(err); }
};
