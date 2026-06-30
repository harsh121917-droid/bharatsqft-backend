const Saving = require("../models/Saving");
const Property = require("../models/Property");

// ── GET /api/savings  ──────────────────────────────────────────────────────────
// Returns all saving plans for the logged-in user
exports.getMySavings = async (req, res, next) => {
    try {
        const savings = await Saving.find({ user: req.user._id })
            .populate("targetProperty", "title images brickPrice")
            .sort({ createdAt: -1 });

        const summary = {
            totalSaved: savings.reduce((s, x) => s + x.savedAmount, 0),
            totalTarget: savings.reduce((s, x) => s + x.targetAmount, 0),
            activePlans: savings.filter((x) => x.isActive).length,
        };

        res.json({ success: true, data: savings, summary });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/savings  ─────────────────────────────────────────────────────────
// Create a new saving plan
exports.createSaving = async (req, res, next) => {
    try {
        const { type, targetAmount, amountPerCycle, targetPropertyId } = req.body;

        if (!type || !["daily", "monthly"].includes(type)) {
            return res.status(400).json({ success: false, message: "type must be 'daily' or 'monthly'" });
        }
        if (!targetAmount || targetAmount < 1) {
            return res.status(400).json({ success: false, message: "targetAmount required (min 1)" });
        }
        if (!amountPerCycle || amountPerCycle < 1) {
            return res.status(400).json({ success: false, message: "amountPerCycle required (min 1)" });
        }

        // Validate targetProperty if provided
        if (targetPropertyId) {
            const prop = await Property.findById(targetPropertyId);
            if (!prop) return res.status(404).json({ success: false, message: "Target property not found" });
        }

        const saving = await Saving.create({
            user: req.user._id,
            type,
            targetAmount,
            amountPerCycle,
            targetProperty: targetPropertyId || null,
        });

        await saving.populate("targetProperty", "title images brickPrice");

        res.status(201).json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/savings/:id/deposit  ────────────────────────────────────────────
// Log a manual deposit / cycle for a plan
exports.deposit = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });
        if (!saving.isActive) return res.status(400).json({ success: false, message: "Plan is paused" });

        const amount = req.body.amount || saving.amountPerCycle;
        const note = req.body.note || "";

        saving.savedAmount += amount;
        saving.lastCycleDate = new Date();
        saving.cycles.push({ date: new Date(), amount, note });

        await saving.save();
        await saving.populate("targetProperty", "title images brickPrice");

        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};

// ── PATCH /api/savings/:id  ───────────────────────────────────────────────────
// Update plan (pause/resume, change amountPerCycle, targetAmount)
exports.updateSaving = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });

        const allowed = ["isActive", "amountPerCycle", "targetAmount", "targetProperty"];
        allowed.forEach((key) => {
            if (req.body[key] !== undefined) saving[key] = req.body[key];
        });

        await saving.save();
        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/savings/:id  ──────────────────────────────────────────────────
exports.deleteSaving = async (req, res, next) => {
    try {
        const saving = await Saving.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Saving plan deleted" });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/savings/:id/history  ────────────────────────────────────────────
// Returns cycle history for a single plan
exports.getHistory = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id })
            .populate("targetProperty", "title images brickPrice");
        if (!saving) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};