const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { fetchLiveRates } = require("./goldController");

async function getOrCreateBalance(userId) {
    let bal = await SilverBalance.findOne({ user: userId });
    if (!bal) bal = await SilverBalance.create({ user: userId });
    return bal;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/balance
// ══════════════════════════════════════════════════════════════════════════════
exports.getBalance = async (req, res, next) => {
    try {
        const [bal, rates] = await Promise.all([
            getOrCreateBalance(req.user._id),
            fetchLiveRates(),
        ]);

        const sellRate = rates.silver.sellRate;
        const currentValue = parseFloat((bal.totalGrams * sellRate).toFixed(2));
        const gainLoss = parseFloat((currentValue - bal.investedAmt).toFixed(2));
        const gainLossPct = bal.investedAmt > 0
            ? parseFloat(((gainLoss / bal.investedAmt) * 100).toFixed(2)) : 0;
        const avgBuyRate = bal.totalGrams > 0
            ? parseFloat((bal.investedAmt / bal.totalGrams).toFixed(2)) : 0;

        res.json({
            success: true,
            data: {
                totalGrams: bal.totalGrams,
                availableGrams: parseFloat((bal.totalGrams - bal.lockedGrams).toFixed(6)),
                lockedGrams: bal.lockedGrams,
                investedAmt: bal.investedAmt,
                currentValue,
                gainLoss,
                gainLossPct,
                avgBuyRate,
                currentBuyRate: rates.silver.buyRate,
                currentSellRate: rates.silver.sellRate,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactions = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const query = { user: req.user._id };
        if (type) query.type = type;

        const [txns, total, all] = await Promise.all([
            SilverTransaction.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
            SilverTransaction.countDocuments(query),
            SilverTransaction.find({ user: req.user._id, status: "success" }),
        ]);

        const bought = all.filter(t => t.type === "buy").reduce((s, t) => s + t.grams, 0);
        const sold = all.filter(t => t.type === "sell").reduce((s, t) => s + t.grams, 0);
        const spent = all.filter(t => t.type === "buy").reduce((s, t) => s + t.totalAmt, 0);

        res.json({
            success: true,
            data: txns.map(t => ({
                id: t._id, invoiceNo: t.invoiceNo, type: t.type, grams: t.grams,
                ratePerGram: t.ratePerGram, silverValue: t.silverValue,
                gstAmt: t.gstAmt, totalAmt: t.totalAmt,
                status: t.status, note: t.note, createdAt: t.createdAt,
            })),
            total, page: +page, pages: Math.ceil(total / limit),
            summary: {
                totalBought: parseFloat(bought.toFixed(4)),
                totalSold: parseFloat(sold.toFixed(4)),
                totalSpent: parseFloat(spent.toFixed(2)),
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions/:id  — single transaction detail
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionDetail = async (req, res, next) => {
    try {
        const txn = await SilverTransaction.findOne({ _id: req.params.id, user: req.user._id });
        if (!txn) return res.status(404).json({ success: false, message: "Transaction not found" });
        res.json({
            success: true,
            data: {
                id: txn._id, invoiceNo: txn.invoiceNo, type: txn.type, grams: txn.grams,
                ratePerGram: txn.ratePerGram, silverValue: txn.silverValue,
                gstAmt: txn.gstAmt, totalAmt: txn.totalAmt,
                status: txn.status, note: txn.note, createdAt: txn.createdAt,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/silver/transactions/:id/invoice  — download PDF invoice
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionInvoice = async (req, res, next) => {
    try {
        const { generateInvoicePDF } = require("../services/invoiceService");
        const txn = await SilverTransaction.findOne({ _id: req.params.id, user: req.user._id });
        if (!txn) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        const invoiceLabel = txn.invoiceNo || `TX-${String(txn._id).slice(-8).toUpperCase()}`;
        res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceLabel}.pdf"`);

        await generateInvoicePDF(txn, req.user, "silver", res);
    } catch (err) { next(err); }
};