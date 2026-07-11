const Investment = require("../models/Investment");
const Saving = require("../models/Saving");

// ── GET /api/transactions  ──────────────────────────────────────────────────
// Returns all transactions (brick purchases + saving payments) merged + sorted
exports.getMyTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // ── 1. Brick purchase transactions ──────────────────────────────────────
        const investments = await Investment.find({ user: userId })
            .populate("property", "title location images propertyType price")
            .sort({ createdAt: -1 });

        const brickTxns = investments.map((inv) => ({
            id: inv._id,
            type: "brick_purchase",
            category: "Investment",
            title: inv.property?.title ?? "Property Investment",
            subtitle: `${inv.bricks} brick${inv.bricks > 1 ? "s" : ""} × ₹${inv.pricePerBrick}`,
            amount: inv.totalAmount,
            status: inv.status,
            propertyId: inv.property?._id,
            city: inv.property?.location?.city ?? null,
            coverImage: inv.property?.images?.[0]?.url ?? null,
            razorpayPaymentId: inv.razorpayPaymentId ?? null,
            razorpayOrderId: inv.razorpayOrderId ?? null,
            bricks: inv.bricks,
            pricePerBrick: inv.pricePerBrick,
            createdAt: inv.createdAt,
        }));

        // ── 2. Saving cycle transactions ─────────────────────────────────────────
        const savings = await Saving.find({ user: userId });

        const savingTxns = [];
        for (const s of savings) {
            for (const cycle of (s.cycles || [])) {
                savingTxns.push({
                    id: `${s._id}_${cycle._id ?? cycle.date}`,
                    type: s.type === "daily" ? "daily_saving" : "monthly_saving",
                    category: "Savings",
                    title: s.type === "daily" ? "Daily Saving" : "Monthly Saving",
                    subtitle: `₹${cycle.amount} deposited`,
                    amount: cycle.amount,
                    status: "success",
                    razorpayPaymentId: s.razorpayPaymentId ?? null,
                    razorpayOrderId: s.razorpayOrderId ?? null,
                    savingId: s._id,
                    note: cycle.note ?? null,
                    createdAt: new Date(cycle.date),
                });
            }
        }

        // ── Merge + sort newest first ─────────────────────────────────────────────
        const all = [...brickTxns, ...savingTxns].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        // ── Summary stats ─────────────────────────────────────────────────────────
        const totalInvested = brickTxns
            .filter((t) => t.status === "success")
            .reduce((s, t) => s + t.amount, 0);

        const totalSaved = savingTxns.reduce((s, t) => s + t.amount, 0);

        res.json({
            success: true,
            data: all,
            count: all.length,
            summary: {
                totalTransactions: all.length,
                totalInvested,
                totalSaved,
                totalSpent: totalInvested + totalSaved,
            },
        });
    } catch (err) { next(err); }
};

// ── GET /api/transactions/:id  ───────────────────────────────────────────────
// Single transaction receipt detail
exports.getTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        // Try investment first
        const inv = await Investment.findOne({ _id: id, user: userId })
            .populate("property", "title location images propertyType price brickPrice");

        if (inv) {
            return res.json({
                success: true,
                data: {
                    id: inv._id,
                    type: "brick_purchase",
                    category: "Investment",
                    title: inv.property?.title ?? "Property Investment",
                    subtitle: `${inv.bricks} bricks`,
                    amount: inv.totalAmount,
                    status: inv.status,
                    bricks: inv.bricks,
                    pricePerBrick: inv.pricePerBrick,
                    property: inv.property,
                    razorpayPaymentId: inv.razorpayPaymentId,
                    razorpayOrderId: inv.razorpayOrderId,
                    createdAt: inv.createdAt,
                },
            });
        }

        res.status(404).json({ success: false, message: "Transaction not found" });
    } catch (err) { next(err); }
};