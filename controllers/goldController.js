const https = require("https");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const {
    GoldBalance,
    GoldRate,
    GoldTransaction,
} = require("../models/Gold");

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_PCT = 3;     // 3% GST on buy, no making charges
const SELL_SPREAD = 0.007; // sell rate = buyRate × (1 - 0.7%) — typical dealer spread
const MIN_BUY = 100;   // ₹ minimum
const MIN_SELL = 0.001; // grams minimum
const TROY_OZ_GRAMS = 31.1035; // 1 troy oz = 31.1035g
const CACHE_TTL_MS = 5 * 60 * 1000; // cache rate 5 min to save API quota

// In-memory rate cache (survives restarts briefly)
let _rateCache = null;
let _cacheTime = 0;

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─── GoldAPI.io fetch helper ──────────────────────────────────────────────────
// Sign up free at https://goldapi.io → get your API key → add to .env as GOLDAPI_KEY
// Symbols: XAU=Gold  XAG=Silver  XCU=Copper   Currency: INR
function fetchFromGoldAPI(symbol = "XAU") {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "www.goldapi.io",
            path: `/api/${symbol}/INR`,
            method: "GET",
            headers: {
                "x-access-token": process.env.GOLDAPI_KEY,
                "Content-Type": "application/json",
            },
        };
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) return reject(new Error(parsed.error));
                    resolve(parsed);
                } catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("GoldAPI timeout")); });
        req.end();
    });
}

// ─── Fetch + cache all 3 metals ───────────────────────────────────────────────
async function fetchLiveRates() {
    const now = Date.now();
    // Return cache if fresh
    if (_rateCache && now - _cacheTime < CACHE_TTL_MS) return _rateCache;

    try {
        // GoldAPI.io free plan: XAU + XAG only — XCU (copper) not supported
        const [gold, silver] = await Promise.all([
            fetchFromGoldAPI("XAU"),
            fetchFromGoldAPI("XAG"),
        ]);

        // Gold: price_gram_24k is per gram in INR directly
        const goldBuyPerGram = parseFloat(
            (gold.price_gram_24k ?? gold.price / TROY_OZ_GRAMS).toFixed(2)
        );
        // Silver: price per troy oz → per gram
        const silverPerGram = parseFloat((silver.price / TROY_OZ_GRAMS).toFixed(2));
        // Copper: static MCX approx ₹0.85/gram — update via admin POST /api/gold/rate
        const copperPerGram = 0.85;

        _rateCache = {
            gold: {
                buyRate: goldBuyPerGram,
                sellRate: parseFloat((goldBuyPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: parseFloat((gold.ch ?? 0).toFixed(2)),
                changePct: parseFloat((gold.chp ?? 0).toFixed(2)),
                high: parseFloat(((gold.high_price ?? gold.price) / TROY_OZ_GRAMS).toFixed(2)),
                low: parseFloat(((gold.low_price ?? gold.price) / TROY_OZ_GRAMS).toFixed(2)),
            },
            silver: {
                buyRate: silverPerGram,
                sellRate: parseFloat((silverPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: parseFloat((silver.ch ?? 0).toFixed(2)),
                changePct: parseFloat((silver.chp ?? 0).toFixed(2)),
            },
            copper: {
                buyRate: copperPerGram,
                sellRate: parseFloat((copperPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
                note: "Static MCX approx — update via admin endpoint",
            },
            updatedAt: new Date(),
            source: "goldapi.io",
        };
        _cacheTime = now;

        // Persist latest gold rate to DB (for history / offline fallback)
        await GoldRate.findOneAndUpdate(
            { source: "goldapi.io" },
            {
                buyRate: _rateCache.gold.buyRate,
                sellRate: _rateCache.gold.sellRate,
                change24h: _rateCache.gold.change24h,
                changePct: _rateCache.gold.changePct,
                source: "goldapi.io",
                isActive: true,
            },
            { upsert: true, new: true }
        );

        return _rateCache;
    } catch (err) {
        console.error("GoldAPI fetch failed:", err.message);
        // Fallback: use last saved rate from DB — but only if it's actually usable.
        const dbRate = await GoldRate.findOne({ isActive: true }).sort({ updatedAt: -1 });
        if (dbRate && dbRate.buyRate > 0 && dbRate.sellRate > 0) {
            return {
                gold: {
                    buyRate: dbRate.buyRate,
                    sellRate: dbRate.sellRate,
                    change24h: dbRate.change24h,
                    changePct: dbRate.changePct,
                },
                silver: { buyRate: 0, sellRate: 0, change24h: 0, changePct: 0 },
                copper: { buyRate: 0, sellRate: 0, change24h: 0, changePct: 0 },
                updatedAt: dbRate.updatedAt,
                source: "db_fallback", // frontend should flag this as possibly stale
            };
        }
        // No usable fallback — don't hand back broken/zero prices, fail loudly instead
        throw new Error("Metal rates unavailable. Please try again shortly.");
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function getOrCreateBalance(userId) {
    let bal = await GoldBalance.findOne({ user: userId });
    if (!bal) bal = await GoldBalance.create({ user: userId });
    return bal;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GET /api/gold/rate  — live Gold + Silver + Copper rates in INR/gram
// ══════════════════════════════════════════════════════════════════════════════
exports.getRate = async (req, res, next) => {
    try {
        const rates = await fetchLiveRates();
        res.json({
            success: true,
            data: {
                gold: {
                    ...rates.gold,
                    purity: "24K",
                    unit: "per gram",
                    gstPct: GST_PCT,
                },
                silver: {
                    ...rates.silver,
                    purity: "999",
                    unit: "per gram",
                },
                copper: {
                    ...rates.copper,
                    purity: "999",
                    unit: "per gram",
                },
                updatedAt: rates.updatedAt,
                source: rates.source,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. GET /api/gold/balance  — user's gold portfolio
// ══════════════════════════════════════════════════════════════════════════════
exports.getBalance = async (req, res, next) => {
    try {
        const [bal, rates] = await Promise.all([
            getOrCreateBalance(req.user._id),
            fetchLiveRates(),
        ]);

        const sellRate = rates.gold.sellRate;
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
                currentBuyRate: rates.gold.buyRate,
                currentSellRate: rates.gold.sellRate,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3a. POST /api/gold/buy/initiate
// body: { amountInRupees }  OR  { grams }
// ══════════════════════════════════════════════════════════════════════════════
exports.initiateBuy = async (req, res, next) => {
    try {
        const rates = await fetchLiveRates();
        const buyRate = rates.gold.buyRate;
        let { amountInRupees, grams } = req.body;

        if (!amountInRupees && !grams) {
            return res.status(400).json({ success: false, message: "Provide amountInRupees or grams" });
        }
        if (grams && !amountInRupees) {
            amountInRupees = parseFloat((grams * buyRate).toFixed(2));
        }
        if (amountInRupees < MIN_BUY) {
            return res.status(400).json({ success: false, message: `Minimum purchase is ₹${MIN_BUY}` });
        }

        const gramsToAdd = parseFloat((amountInRupees / buyRate).toFixed(6));
        const gstAmt = parseFloat(((amountInRupees * GST_PCT) / 100).toFixed(2));
        const totalAmt = parseFloat((amountInRupees + gstAmt).toFixed(2));

        const order = await razorpay.orders.create({
            amount: Math.round(totalAmt * 100),
            currency: "INR",
            notes: { userId: req.user._id.toString(), type: "gold_buy", grams: gramsToAdd },
        });

        const txn = await GoldTransaction.create({
            user: req.user._id, type: "buy", grams: gramsToAdd,
            ratePerGram: buyRate, goldValue: amountInRupees,
            gstAmt, totalAmt, status: "pending",
            razorpayOrderId: order.id,
        });

        res.json({
            success: true,
            data: {
                order, key: process.env.RAZORPAY_KEY_ID,
                transaction: { id: txn._id },
                breakdown: { grams: gramsToAdd, goldValue: amountInRupees, gstAmt, totalAmt, ratePerGram: buyRate },
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3b. POST /api/gold/buy/verify
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyBuy = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, transactionId } = req.body;
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (expected !== razorpaySignature) {
            await GoldTransaction.findByIdAndUpdate(transactionId, { status: "failed" });
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        const txn = await GoldTransaction.findOne({
            _id: transactionId, user: req.user._id, status: "pending"
        });
        if (!txn) return res.status(404).json({ success: false, message: "Transaction not found" });

        const bal = await getOrCreateBalance(req.user._id);
        bal.totalGrams = parseFloat((bal.totalGrams + txn.grams).toFixed(6));
        bal.investedAmt = parseFloat((bal.investedAmt + txn.goldValue).toFixed(2));
        await bal.save();

        txn.status = "success";
        txn.razorpayPaymentId = razorpayPaymentId;
        txn.razorpaySignature = razorpaySignature;
        await txn.save();

        res.json({
            success: true,
            message: `${txn.grams}g gold credited to your account`,
            data: { grams: txn.grams, totalGrams: bal.totalGrams, paymentId: razorpayPaymentId },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. POST /api/gold/sell
// body: { grams, bankAccountId }
// ══════════════════════════════════════════════════════════════════════════════
exports.sellGold = async (req, res, next) => {
    try {
        const { grams, bankAccountId } = req.body;
        if (!grams || grams < MIN_SELL) {
            return res.status(400).json({ success: false, message: `Min sell is ${MIN_SELL}g` });
        }
        if (!bankAccountId) {
            return res.status(400).json({ success: false, message: "Bank account required" });
        }

        const [bal, rates] = await Promise.all([
            getOrCreateBalance(req.user._id),
            fetchLiveRates(),
        ]);

        const available = parseFloat((bal.totalGrams - bal.lockedGrams).toFixed(6));
        if (grams > available) {
            return res.status(400).json({
                success: false,
                message: `Insufficient gold. Available: ${available}g`,
            });
        }

        const sellRate = rates.gold.sellRate;
        const goldValue = parseFloat((grams * sellRate).toFixed(2));

        // Lock grams
        bal.lockedGrams = parseFloat((bal.lockedGrams + grams).toFixed(6));
        await bal.save();

        const txn = await GoldTransaction.create({
            user: req.user._id, type: "sell", grams,
            ratePerGram: sellRate, goldValue,
            gstAmt: 0, totalAmt: goldValue,
            status: "processing", bankAccountId,
        });

        // TODO: real payout via Razorpay X
        // Simulate completion after 5s
        setTimeout(async () => {
            try {
                const t = await GoldTransaction.findById(txn._id);
                const b = await GoldBalance.findOne({ user: req.user._id });
                b.totalGrams = parseFloat((b.totalGrams - grams).toFixed(6));
                b.lockedGrams = parseFloat((b.lockedGrams - grams).toFixed(6));
                b.investedAmt = parseFloat(Math.max(0, b.investedAmt - goldValue * 0.93).toFixed(2));
                await b.save();
                t.status = "success"; t.payoutStatus = "completed";
                await t.save();
            } catch (e) { console.error("Sell error:", e); }
        }, 5000);

        res.json({
            success: true,
            message: "Sell order placed. Amount credited in 1-2 working hours.",
            data: { transactionId: txn._id, grams, amount: goldValue, ratePerGram: sellRate, status: "processing" },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. GET /api/gold/transactions
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactions = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const query = { user: req.user._id };
        if (type) query.type = type;

        const [txns, total, all] = await Promise.all([
            GoldTransaction.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
            GoldTransaction.countDocuments(query),
            GoldTransaction.find({ user: req.user._id, status: "success" }),
        ]);

        const bought = all.filter(t => ["buy", "sip_buy"].includes(t.type)).reduce((s, t) => s + t.grams, 0);
        const sold = all.filter(t => t.type === "sell").reduce((s, t) => s + t.grams, 0);
        const spent = all.filter(t => ["buy", "sip_buy"].includes(t.type)).reduce((s, t) => s + t.totalAmt, 0);

        res.json({
            success: true,
            data: txns.map(t => ({
                id: t._id, invoiceNo: t.invoiceNo, type: t.type, grams: t.grams,
                ratePerGram: t.ratePerGram, goldValue: t.goldValue,
                gstAmt: t.gstAmt, totalAmt: t.totalAmt,
                status: t.status, razorpayPaymentId: t.razorpayPaymentId,
                note: t.note, createdAt: t.createdAt,
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
// 6. ADMIN — POST /api/gold/rate  — manual rate override
// ══════════════════════════════════════════════════════════════════════════════
exports.updateRate = async (req, res, next) => {
    try {
        const { buyRate, sellRate, change24h, changePct } = req.body;
        if (!buyRate || !sellRate) {
            return res.status(400).json({ success: false, message: "buyRate and sellRate required" });
        }
        await GoldRate.updateMany({}, { isActive: false });
        const rate = await GoldRate.create({
            buyRate, sellRate, change24h, changePct, isActive: true, source: "manual"
        });
        // Clear cache so next request gets this manual rate
        _rateCache = null;
        res.json({ success: true, message: "Rate updated", data: rate });
    } catch (err) { next(err); }
};

// Export for use in walletController
exports.fetchLiveRates = fetchLiveRates;

// ══════════════════════════════════════════════════════════════════════════════
// 7. GET /api/gold/transactions/:id  — single transaction full detail
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionDetail = async (req, res, next) => {
    try {
        const txn = await GoldTransaction.findOne({ _id: req.params.id, user: req.user._id });
        if (!txn) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }
        res.json({
            success: true,
            data: {
                id: txn._id, invoiceNo: txn.invoiceNo, type: txn.type, grams: txn.grams,
                ratePerGram: txn.ratePerGram, goldValue: txn.goldValue,
                gstAmt: txn.gstAmt, totalAmt: txn.totalAmt,
                status: txn.status, razorpayPaymentId: txn.razorpayPaymentId,
                note: txn.note, createdAt: txn.createdAt,
            },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. GET /api/gold/transactions/:id/invoice  — download PDF invoice
// ══════════════════════════════════════════════════════════════════════════════
exports.getTransactionInvoice = async (req, res, next) => {
    try {
        const PDFDocument = require("pdfkit");
        const txn = await GoldTransaction.findOne({ _id: req.params.id, user: req.user._id });
        if (!txn) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        const isBuy = ["buy", "sip_buy"].includes(txn.type);
        const doc = new PDFDocument({ size: "A4", margin: 50 });

        const invoiceLabel = txn.invoiceNo || `TX-${String(txn._id).slice(-8).toUpperCase()}`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceLabel}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).fillColor("#D4A017").text("Bharat SQFT", { continued: false });
        doc.fontSize(10).fillColor("#666").text("Digital Gold — Tax Invoice");
        doc.moveDown(1.5);

        doc.strokeColor("#D4A017").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);

        doc.fillColor("#000").fontSize(12).text(`Invoice #: ${invoiceLabel}`);
        doc.text(`Date: ${new Date(txn.createdAt).toLocaleString("en-IN")}`);
        doc.text(`Transaction Type: ${isBuy ? "Gold Purchase" : "Gold Sale"}`);
        doc.text(`Status: ${txn.status}`);
        doc.moveDown(1);

        // Table-ish breakdown
        const row = (label, value) => {
            doc.fontSize(11).fillColor("#333").text(label, 50, doc.y, { continued: true, width: 300 });
            doc.fillColor("#000").text(value, { align: "right" });
        };

        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        row("Gold Quantity", `${txn.grams.toFixed(4)} g (24K)`);
        row("Rate per Gram", `Rs. ${txn.ratePerGram.toFixed(2)}`);
        row("Gold Value", `Rs. ${txn.goldValue.toFixed(2)}`);
        row(isBuy ? "GST (3%)" : "GST", `Rs. ${(txn.gstAmt || 0).toFixed(2)}`);
        doc.moveDown(0.3);
        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        doc.fontSize(13).fillColor("#D4A017").text(
            isBuy ? "Total Paid" : "Total Received", 50, doc.y, { continued: true, width: 300 }
        );
        doc.text(`Rs. ${txn.totalAmt.toFixed(2)}`, { align: "right" });

        doc.moveDown(2);
        doc.fontSize(9).fillColor("#888").text(
            "This is a system-generated invoice and does not require a signature.",
            { align: "center" }
        );

        doc.end();
    } catch (err) { next(err); }
};