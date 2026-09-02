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
        const { name, mode = "live", keyId, keySecret, clientId, clientSecret, label, purpose, isActive = true, isDefault = false } = req.body;
        if (!name || !mode) {
            return res.status(400).json({ success: false, message: "name and mode are required" });
        }

        const lowerName = name.toLowerCase();
        let defaultLabel = label;
        let defaultPurpose = purpose || "all";

        if (lowerName === "razorpay_idfc" || lowerName === "razorpay_hdfc") {
            defaultLabel = label || "IDFC Razorpay (0% Fee — Buy Metals, Wallet, Orders)";
            defaultPurpose = purpose || "spot";
        } else if (lowerName === "razorpay_standard") {
            defaultLabel = label || "Normal Razorpay (SIP Subscriptions & Schemes)";
            defaultPurpose = purpose || "sip_scheme";
        } else if (lowerName === "razorpay") {
            defaultLabel = label || "General Razorpay";
        } else if (lowerName === "cashfree") {
            defaultLabel = label || "Cashfree Payments";
            defaultPurpose = purpose || "spot";
        } else if (lowerName === "cashfree_payout") {
            defaultLabel = label || "Cashfree Payouts (Bank Transfers)";
            defaultPurpose = purpose || "payout";
        }

        const update = {
            updatedBy: req.user._id,
            mode: mode.toLowerCase(),
            label: defaultLabel,
            purpose: defaultPurpose
        };
        if (keyId !== undefined) update.keyId = keyId;
        if (keySecret !== undefined && keySecret !== "") update.keySecret = keySecret;
        if (clientId !== undefined) update.clientId = clientId;
        if (clientSecret !== undefined && clientSecret !== "") update.clientSecret = clientSecret;
        if (isActive !== undefined) update.isActive = isActive;

        const config = await PaymentGateway.findOneAndUpdate(
            { name: lowerName, mode: mode.toLowerCase() },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (isDefault === true || isDefault === "true") {
            const targetPurpose = (defaultPurpose === "spot" || lowerName === "razorpay_idfc" || lowerName === "razorpay_hdfc")
                ? "spot"
                : (defaultPurpose === "sip_scheme" || lowerName === "razorpay_standard")
                ? "sip_scheme"
                : null;
            if (targetPurpose) {
                await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: targetPurpose }, { isDefault: false });
            } else {
                await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: { $nin: ["spot", "sip_scheme"] } }, { isDefault: false });
            }
            config.isDefault = true;
            await config.save();
        }

        res.json({ success: true, message: `${config.label || name} (${mode}) saved successfully`, data: maskConfig(config) });
    } catch (err) { next(err); }
};

// PUT /api/admin/payment-gateways/:id
exports.updateGateway = async (req, res, next) => {
    try {
        const { name, mode, keyId, keySecret, clientId, clientSecret, label, purpose, isActive, isDefault } = req.body;
        const config = await PaymentGateway.findById(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: "Gateway not found" });

        if (name) config.name = name.toLowerCase();
        if (mode) config.mode = mode.toLowerCase();
        if (label !== undefined) config.label = label;
        if (purpose !== undefined) config.purpose = purpose;
        if (keyId !== undefined) config.keyId = keyId;
        if (keySecret && keySecret.trim() !== "" && !keySecret.includes("••••")) config.keySecret = keySecret.trim();
        if (clientId !== undefined) config.clientId = clientId;
        if (clientSecret && clientSecret.trim() !== "" && !clientSecret.includes("••••")) config.clientSecret = clientSecret.trim();
        if (isActive !== undefined) config.isActive = isActive;
        config.updatedBy = req.user._id;

        if (isDefault === true || isDefault === "true") {
            const targetPurpose = (config.purpose === "spot" || config.name === "razorpay_idfc" || config.name === "razorpay_hdfc")
                ? "spot"
                : (config.purpose === "sip_scheme" || config.name === "razorpay_standard")
                ? "sip_scheme"
                : null;
            if (targetPurpose) {
                await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: targetPurpose }, { isDefault: false });
            } else {
                await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: { $nin: ["spot", "sip_scheme"] } }, { isDefault: false });
            }
            config.isDefault = true;
        } else if (isDefault === false || isDefault === "false") {
            config.isDefault = false;
        }

        await config.save();
        res.json({ success: true, message: `${config.label || config.name} updated successfully`, data: maskConfig(config) });
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

        // If clicking on an already-default gateway, allow toggling it off
        if (config.isDefault) {
            config.isDefault = false;
            await config.save();
            return res.json({
                success: true,
                message: `${config.label || config.name} default status removed`,
                data: maskConfig(config)
            });
        }

        // Target purpose: allows 2 active defaults (1 for spot / IDFC, 1 for sip_scheme / standard)
        const targetPurpose = (config.purpose === "spot" || config.name === "razorpay_idfc" || config.name === "razorpay_hdfc")
            ? "spot"
            : (config.purpose === "sip_scheme" || config.name === "razorpay_standard")
            ? "sip_scheme"
            : null;

        if (targetPurpose) {
            await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: targetPurpose }, { isDefault: false });
        } else {
            await PaymentGateway.updateMany({ _id: { $ne: config._id }, purpose: { $nin: ["spot", "sip_scheme"] } }, { isDefault: false });
        }

        config.isDefault = true;
        await config.save();

        const purposeLabel = targetPurpose === "spot"
            ? "Spot (Buy Metals, Wallet Top-ups, Orders)"
            : targetPurpose === "sip_scheme"
            ? "SIP AutoPay & Schemes"
            : "General Transactions";

        res.json({
            success: true,
            message: `${config.label || config.name} is now the ACTIVE DEFAULT for ${purposeLabel}`,
            data: maskConfig(config)
        });
    } catch (err) { next(err); }
};
