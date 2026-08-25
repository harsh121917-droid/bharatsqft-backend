const Investment = require("../models/Investment");
const Saving = require("../models/Saving");
const { CopperTransaction } = require("../models/Copper");
const { GoldTransaction } = require("../models/Gold");
const { SilverTransaction } = require("../models/Silver");
const { Wallet, WalletTxn } = require("../models/Wallet");

// ── GET /api/transactions  ──────────────────────────────────────────────────
// Returns all transactions (Copper/Gold/Silver Bullion + Wallet + Investments + Savings) merged + sorted
exports.getMyTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // ── 1. Copper Bullion Transactions ──────────────────────────────────────
        const copperTxnsPromise = CopperTransaction.find({ user: userId }).sort({ createdAt: -1 });

        // ── 2. Gold Bullion Transactions ────────────────────────────────────────
        const goldTxnsPromise = GoldTransaction.find({ user: userId }).sort({ createdAt: -1 });

        // ── 3. Silver Bullion Transactions ──────────────────────────────────────
        const silverTxnsPromise = SilverTransaction.find({ user: userId }).sort({ createdAt: -1 });

        // ── 4. Wallet Ledger Transactions ───────────────────────────────────────
        const walletTxnsPromise = WalletTxn.find({ user: userId }).sort({ createdAt: -1 });

        // ── 5. Brick purchase transactions ──────────────────────────────────────
        const investmentsPromise = Investment.find({ user: userId })
            .populate("property", "title location images propertyType price")
            .sort({ createdAt: -1 });

        // ── 6. Saving cycle transactions ────────────────────────────────────────
        const savingsPromise = Saving.find({ user: userId });

        const [copperRaw, goldRaw, silverRaw, walletRaw, investments, savings] = await Promise.all([
            copperTxnsPromise,
            goldTxnsPromise,
            silverTxnsPromise,
            walletTxnsPromise,
            investmentsPromise,
            savingsPromise,
        ]);

        // Map Copper Transactions
        const copperTxns = copperRaw.map((t) => {
            const isBuy = t.type === "buy" || t.type === "sip_buy";
            const amt = t.totalAmt || t.copperValue || (t.grams * t.ratePerGram) || 0;
            return {
                id: t._id,
                invoiceNo: t.invoiceNo || `CPPR-${String(t._id).slice(-8).toUpperCase()}`,
                type: t.type,
                transactionType: isBuy ? "Buy" : "Sell",
                metal: "copper",
                category: "Digi Copper",
                title: isBuy ? "Copper Purchased" : "Copper Sold",
                subtitle: `${t.grams?.toFixed(4) || 0}g @ ₹${t.ratePerGram?.toFixed(2) || 0}/g`,
                grams: t.grams || 0,
                quantity: t.grams || 0,
                rate: t.ratePerGram || 0,
                ratePerGram: t.ratePerGram || 0,
                taxableValue: t.copperValue || 0,
                gstAmt: t.gstAmt || 0,
                amount: amt,
                totalAmt: amt,
                status: t.status || "success",
                paymentMethod: t.paymentMethod || "wallet",
                note: t.note || null,
                createdAt: t.createdAt,
            };
        });

        // Map Gold Transactions
        const goldTxns = goldRaw.map((t) => {
            const isBuy = t.type === "buy" || t.type === "sip_buy";
            const amt = t.totalAmt || t.goldValue || (t.grams * t.ratePerGram) || 0;
            return {
                id: t._id,
                invoiceNo: t.invoiceNo || `GLD-${String(t._id).slice(-8).toUpperCase()}`,
                type: t.type,
                transactionType: isBuy ? "Buy" : "Sell",
                metal: "gold",
                category: "Digi Gold",
                title: isBuy ? "Gold Purchased" : "Gold Sold",
                subtitle: `${t.grams?.toFixed(4) || 0}g @ ₹${t.ratePerGram?.toFixed(2) || 0}/g`,
                grams: t.grams || 0,
                quantity: t.grams || 0,
                rate: t.ratePerGram || 0,
                ratePerGram: t.ratePerGram || 0,
                taxableValue: t.goldValue || 0,
                gstAmt: t.gstAmt || 0,
                amount: amt,
                totalAmt: amt,
                status: t.status || "success",
                paymentMethod: t.paymentMethod || "wallet",
                note: t.note || null,
                createdAt: t.createdAt,
            };
        });

        // Map Silver Transactions
        const silverTxns = silverRaw.map((t) => {
            const isBuy = t.type === "buy" || t.type === "sip_buy";
            const amt = t.totalAmt || t.silverValue || (t.grams * t.ratePerGram) || 0;
            return {
                id: t._id,
                invoiceNo: t.invoiceNo || `SLV-${String(t._id).slice(-8).toUpperCase()}`,
                type: t.type,
                transactionType: isBuy ? "Buy" : "Sell",
                metal: "silver",
                category: "Digi Silver",
                title: isBuy ? "Silver Purchased" : "Silver Sold",
                subtitle: `${t.grams?.toFixed(4) || 0}g @ ₹${t.ratePerGram?.toFixed(2) || 0}/g`,
                grams: t.grams || 0,
                quantity: t.grams || 0,
                rate: t.ratePerGram || 0,
                ratePerGram: t.ratePerGram || 0,
                taxableValue: t.silverValue || 0,
                gstAmt: t.gstAmt || 0,
                amount: amt,
                totalAmt: amt,
                status: t.status || "success",
                paymentMethod: t.paymentMethod || "wallet",
                note: t.note || null,
                createdAt: t.createdAt,
            };
        });

        // Map Wallet Transactions (exclude direct bullion buy/sells if redundant)
        const walletTxns = walletRaw
            .filter((w) => ["add", "deduct", "withdraw", "refund", "manual_credit", "manual_debit"].includes(w.type))
            .map((w) => ({
                id: w._id,
                invoiceNo: w.txnId || `WLT-${String(w._id).slice(-8).toUpperCase()}`,
                type: w.type,
                transactionType: w.entryType === "credit" ? "Credit" : "Debit",
                metal: "wallet",
                category: "Wallet",
                title: w.type === "add" ? "Wallet Top-up" : (w.type === "withdraw" ? "Bank Withdrawal" : (w.reason || "Wallet Transaction")),
                subtitle: w.entryType === "credit" ? `+₹${w.amount} Credited` : `-₹${w.amount} Debited`,
                grams: 0,
                quantity: 0,
                rate: 0,
                ratePerGram: 0,
                amount: w.amount,
                totalAmt: w.amount,
                status: w.status || "success",
                note: w.note || w.reason || null,
                createdAt: w.createdAt,
            }));

        // Map Brick Purchases
        const brickTxns = investments.map((inv) => ({
            id: inv._id,
            invoiceNo: `PROP-${String(inv._id).slice(-8).toUpperCase()}`,
            type: "brick_purchase",
            transactionType: "Buy",
            metal: "property",
            category: "Real Estate",
            title: inv.property?.title ?? "Property Investment",
            subtitle: `${inv.bricks} brick${inv.bricks > 1 ? "s" : ""} × ₹${inv.pricePerBrick}`,
            amount: inv.totalAmount,
            totalAmt: inv.totalAmount,
            status: inv.status,
            propertyId: inv.property?._id,
            city: inv.property?.location?.city ?? null,
            coverImage: inv.property?.images?.[0]?.url ?? null,
            razorpayPaymentId: inv.razorpayPaymentId ?? null,
            razorpayOrderId: inv.razorpayOrderId ?? null,
            bricks: inv.bricks,
            quantity: inv.bricks,
            pricePerBrick: inv.pricePerBrick,
            createdAt: inv.createdAt,
        }));

        // Map Savings
        const savingTxns = [];
        for (const s of savings) {
            for (const cycle of (s.cycles || [])) {
                savingTxns.push({
                    id: `${s._id}_${cycle._id ?? cycle.date}`,
                    invoiceNo: `SAV-${String(s._id).slice(-6).toUpperCase()}`,
                    type: s.type === "daily" ? "daily_saving" : "monthly_saving",
                    transactionType: "Deposit",
                    metal: "savings",
                    category: "Savings",
                    title: s.type === "daily" ? "Daily Saving" : "Monthly Saving",
                    subtitle: `₹${cycle.amount} deposited`,
                    amount: cycle.amount,
                    totalAmt: cycle.amount,
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
        const all = [
            ...copperTxns,
            ...goldTxns,
            ...silverTxns,
            ...walletTxns,
            ...brickTxns,
            ...savingTxns,
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // ── Summary stats ─────────────────────────────────────────────────────────
        const totalInvested = brickTxns
            .filter((t) => t.status === "success")
            .reduce((s, t) => s + t.amount, 0);

        const totalCopperVolume = copperTxns.reduce((s, t) => s + t.amount, 0);
        const totalGoldVolume = goldTxns.reduce((s, t) => s + t.amount, 0);
        const totalSilverVolume = silverTxns.reduce((s, t) => s + t.amount, 0);
        const totalSaved = savingTxns.reduce((s, t) => s + t.amount, 0);

        res.json({
            success: true,
            data: all,
            count: all.length,
            summary: {
                totalTransactions: all.length,
                totalCopperVolume,
                totalGoldVolume,
                totalSilverVolume,
                totalInvested,
                totalSaved,
                totalSpent: totalInvested + totalCopperVolume + totalGoldVolume + totalSilverVolume + totalSaved,
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

        // 1. Try Copper Transaction
        const copper = await CopperTransaction.findOne({ _id: id, user: userId });
        if (copper) {
            return res.json({
                success: true,
                data: {
                    id: copper._id,
                    invoiceNo: copper.invoiceNo || `CPPR-${String(copper._id).slice(-8).toUpperCase()}`,
                    type: copper.type,
                    transactionType: copper.type === "sell" ? "Sell" : "Buy",
                    metal: "copper",
                    category: "Digi Copper",
                    title: copper.type === "sell" ? "Copper Sold" : "Copper Purchased",
                    subtitle: `${copper.grams}g @ ₹${copper.ratePerGram}/g`,
                    grams: copper.grams,
                    quantity: copper.grams,
                    rate: copper.ratePerGram,
                    ratePerGram: copper.ratePerGram,
                    taxableValue: copper.copperValue,
                    gstAmt: copper.gstAmt,
                    amount: copper.totalAmt || copper.copperValue,
                    totalAmt: copper.totalAmt || copper.copperValue,
                    status: copper.status,
                    note: copper.note,
                    createdAt: copper.createdAt,
                }
            });
        }

        // 2. Try Gold Transaction
        const gold = await GoldTransaction.findOne({ _id: id, user: userId });
        if (gold) {
            return res.json({
                success: true,
                data: {
                    id: gold._id,
                    invoiceNo: gold.invoiceNo || `GLD-${String(gold._id).slice(-8).toUpperCase()}`,
                    type: gold.type,
                    transactionType: gold.type === "sell" ? "Sell" : "Buy",
                    metal: "gold",
                    category: "Digi Gold",
                    title: gold.type === "sell" ? "Gold Sold" : "Gold Purchased",
                    subtitle: `${gold.grams}g @ ₹${gold.ratePerGram}/g`,
                    grams: gold.grams,
                    quantity: gold.grams,
                    rate: gold.ratePerGram,
                    ratePerGram: gold.ratePerGram,
                    taxableValue: gold.goldValue,
                    gstAmt: gold.gstAmt,
                    amount: gold.totalAmt || gold.goldValue,
                    totalAmt: gold.totalAmt || gold.goldValue,
                    status: gold.status,
                    note: gold.note,
                    createdAt: gold.createdAt,
                }
            });
        }

        // 3. Try Silver Transaction
        const silver = await SilverTransaction.findOne({ _id: id, user: userId });
        if (silver) {
            return res.json({
                success: true,
                data: {
                    id: silver._id,
                    invoiceNo: silver.invoiceNo || `SLV-${String(silver._id).slice(-8).toUpperCase()}`,
                    type: silver.type,
                    transactionType: silver.type === "sell" ? "Sell" : "Buy",
                    metal: "silver",
                    category: "Digi Silver",
                    title: silver.type === "sell" ? "Silver Sold" : "Silver Purchased",
                    subtitle: `${silver.grams}g @ ₹${silver.ratePerGram}/g`,
                    grams: silver.grams,
                    quantity: silver.grams,
                    rate: silver.ratePerGram,
                    ratePerGram: silver.ratePerGram,
                    taxableValue: silver.silverValue,
                    gstAmt: silver.gstAmt,
                    amount: silver.totalAmt || silver.silverValue,
                    totalAmt: silver.totalAmt || silver.silverValue,
                    status: silver.status,
                    note: silver.note,
                    createdAt: silver.createdAt,
                }
            });
        }

        // 4. Try Wallet Transaction
        const wtxn = await WalletTxn.findOne({ _id: id, user: userId });
        if (wtxn) {
            return res.json({
                success: true,
                data: {
                    id: wtxn._id,
                    invoiceNo: wtxn.txnId || `WLT-${String(wtxn._id).slice(-8).toUpperCase()}`,
                    type: wtxn.type,
                    transactionType: wtxn.entryType === "credit" ? "Credit" : "Debit",
                    metal: "wallet",
                    category: "Wallet",
                    title: wtxn.reason || (wtxn.type === "add" ? "Wallet Deposit" : "Wallet Transaction"),
                    subtitle: wtxn.note || "",
                    amount: wtxn.amount,
                    totalAmt: wtxn.amount,
                    status: wtxn.status,
                    createdAt: wtxn.createdAt,
                }
            });
        }

        // 5. Try Investment
        const inv = await Investment.findOne({ _id: id, user: userId })
            .populate("property", "title location images propertyType price brickPrice");

        if (inv) {
            return res.json({
                success: true,
                data: {
                    id: inv._id,
                    invoiceNo: `PROP-${String(inv._id).slice(-8).toUpperCase()}`,
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