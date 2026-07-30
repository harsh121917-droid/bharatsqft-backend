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
        // Full keyId/clientId are shown (not secret), full secrets are masked
        // in list view — editing re-enters the value fresh rather than
        // round-tripping the masked string.
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/payment-gateways  — list all configured gateways (secrets masked)
// ══════════════════════════════════════════════════════════════════════════════
exports.getGateways = async (req, res, next) => {
    try {
        const gateways = await PaymentGateway.find().sort({ name: 1, mode: 1 });
        res.json({ success: true, data: gateways.map(maskConfig) });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/payment-gateways  — create or update a (name, mode) config
// body: { name, mode, keyId?, keySecret?, clientId?, clientSecret?, isActive?, isDefault? }
// ══════════════════════════════════════════════════════════════════════════════
exports.upsertGateway = async (req, res, next) => {
    try {
        const { name, mode, keyId, keySecret, clientId, clientSecret, isActive, isDefault } = req.body;
        if (!name || !mode) {
            return res.status(400).json({ success: false, message: "name and mode are required" });
        }
        if (!["razorpay", "cashfree", "cashfree_payout"].includes(name)) {
            return res.status(400).json({ success: false, message: "Invalid gateway name" });
        }
        if (!["live", "demo"].includes(mode)) {
            return res.status(400).json({ success: false, message: "mode must be 'live' or 'demo'" });
        }

        const update = { updatedBy: req.user._id };
        if (keyId !== undefined) update.keyId = keyId;
        if (keySecret !== undefined && keySecret !== "") update.keySecret = keySecret; // don't overwrite with blank/masked value
        if (clientId !== undefined) update.clientId = clientId;
        if (clientSecret !== undefined && clientSecret !== "") update.clientSecret = clientSecret;
        if (isActive !== undefined) update.isActive = isActive;

        const config = await PaymentGateway.findOneAndUpdate(
            { name, mode },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Only one gateway/mode can be default at a time
        if (isDefault === true) {
            await PaymentGateway.updateMany({ _id: { $ne: config._id } }, { isDefault: false });
            config.isDefault = true;
            await config.save();
        }

        res.json({ success: true, message: `${name} (${mode}) saved`, data: maskConfig(config) });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/payment-gateways/:id
// ══════════════════════════════════════════════════════════════════════════════
exports.deleteGateway = async (req, res, next) => {
    try {
        const deleted = await PaymentGateway.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Gateway config deleted" });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/payment-gateways/:id/set-default
// ══════════════════════════════════════════════════════════════════════════════
exports.setDefaultGateway = async (req, res, next) => {
    try {
        const config = await PaymentGateway.findById(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: "Not found" });
        if (!config.isActive) {
            return res.status(400).json({ success: false, message: "Cannot set an inactive gateway as default — activate it first" });
        }
        await PaymentGateway.updateMany({}, { isDefault: false });
        config.isDefault = true;
        await config.save();
        res.json({ success: true, message: `${config.name} (${config.mode}) is now default`, data: maskConfig(config) });
    } catch (err) { next(err); }
};