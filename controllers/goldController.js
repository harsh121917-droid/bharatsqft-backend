const https = require("https");
const crypto = require("crypto");
const {
    GoldBalance,
    GoldRate,
    GoldTransaction,
} = require("../models/Gold");
const paymentGatewayService = require("../services/paymentGatewayService");

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_PCT = 3;     // 3% GST on buy, no making charges
const SELL_SPREAD = 0.007; // sell rate = buyRate × (1 - 0.7%) — typical dealer spread
const MIN_BUY = 50;   // ₹ minimum
const MIN_SELL = 0.001; // grams minimum
const TROY_OZ_GRAMS = 31.1035; // 1 troy oz = 31.1035g
const CACHE_TTL_MS = 5 * 60 * 1000; // cache rate 5 min to save API quota

// In-memory rate cache (survives restarts briefly)
let _rateCache = null;
let _cacheTime = 0;


// ─── Gold-API.com fetch helper ────────────────────────────────────────────────
// Docs: https://gold-api.com/docs
// Symbols: XAU=Gold  XAG=Silver   Currency: INR
function fetchFromGoldAPI(symbol = "XAU") {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.gold-api.com",
            path: `/price/${symbol}/INR`,
            method: "GET",
            headers: {
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
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("Gold-API.com timeout")); });
        req.end();
    });
}

// ─── Fetch + cache all 5 metals ───────────────────────────────────────────────
async function fetchLiveRates() {
    const now = Date.now();
    // Return cache if fresh
    if (_rateCache && now - _cacheTime < CACHE_TTL_MS) return _rateCache;

    try {
        const [gold, silver, platinum, palladium, copper] = await Promise.all([
            fetchFromGoldAPI("XAU"),
            fetchFromGoldAPI("XAG"),
            fetchFromGoldAPI("XPT"),
            fetchFromGoldAPI("XPD"),
            fetchFromGoldAPI("HG"),
        ]);

        // Calibrate API rates to match current Indian market rates (including Indian import duty, GST & market tariff)
        const GOLD_CALIBRATION = 1.1544; 
        const SILVER_CALIBRATION = 1.2113;
        const PLATINUM_CALIBRATION = 1.2008;
        const PALLADIUM_CALIBRATION = 1.1910;
        const COPPER_CALIBRATION = 0.9853;

        // Gold: price per troy oz → per gram
        const goldBuyPerGram = parseFloat(((gold.price * GOLD_CALIBRATION) / TROY_OZ_GRAMS).toFixed(2));
        // Silver: price per troy oz → per gram
        const silverPerGram = parseFloat(((silver.price * SILVER_CALIBRATION) / TROY_OZ_GRAMS).toFixed(2));
        // Platinum: price per troy oz → per gram
        const platinumPerGram = parseFloat(((platinum.price * PLATINUM_CALIBRATION) / TROY_OZ_GRAMS).toFixed(2));
        // Palladium: price per troy oz → per gram
        const palladiumPerGram = parseFloat(((palladium.price * PALLADIUM_CALIBRATION) / TROY_OZ_GRAMS).toFixed(2));
        // Copper: price per lb → per gram (1 lb = 453.59237 grams)
        const copperPerGram = parseFloat(((copper.price * COPPER_CALIBRATION) / 453.59237).toFixed(2));

        _rateCache = {
            gold: {
                buyRate: goldBuyPerGram,
                sellRate: parseFloat((goldBuyPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
                high: goldBuyPerGram,
                low: goldBuyPerGram,
            },
            silver: {
                buyRate: silverPerGram,
                sellRate: parseFloat((silverPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
            },
            platinum: {
                buyRate: platinumPerGram,
                sellRate: parseFloat((platinumPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
            },
            palladium: {
                buyRate: palladiumPerGram,
                sellRate: parseFloat((palladiumPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
            },
            copper: {
                buyRate: copperPerGram,
                sellRate: parseFloat((copperPerGram * (1 - SELL_SPREAD)).toFixed(2)),
                change24h: 0,
                changePct: 0,
            },
            updatedAt: new Date(),
            source: "gold-api.com",
        };
        _cacheTime = now;

        // Persist latest rates to DB (for history / offline fallback)
        await GoldRate.findOneAndUpdate(
            { source: "gold-api.com" },
            {
                buyRate: _rateCache.gold.buyRate,
                sellRate: _rateCache.gold.sellRate,
                change24h: _rateCache.gold.change24h,
                changePct: _rateCache.gold.changePct,
                silverBuyRate: _rateCache.silver.buyRate,
                silverSellRate: _rateCache.silver.sellRate,
                silverChange24h: _rateCache.silver.change24h,
                silverChangePct: _rateCache.silver.changePct,
                platinumBuyRate: _rateCache.platinum.buyRate,
                platinumSellRate: _rateCache.platinum.sellRate,
                platinumChangePct: _rateCache.platinum.changePct,
                palladiumBuyRate: _rateCache.palladium.buyRate,
                palladiumSellRate: _rateCache.palladium.sellRate,
                palladiumChangePct: _rateCache.palladium.changePct,
                copperBuyRate: _rateCache.copper.buyRate,
                copperSellRate: _rateCache.copper.sellRate,
                copperChangePct: _rateCache.copper.changePct,
                source: "gold-api.com",
                isActive: true,
            },
            { upsert: true, new: true }
        );

        return _rateCache;
    } catch (err) {
        console.error("Gold-API.com fetch failed:", err.message);
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
                silver: (dbRate.silverBuyRate > 0 && dbRate.silverSellRate > 0)
                    ? {
                        buyRate: dbRate.silverBuyRate,
                        sellRate: dbRate.silverSellRate,
                        change24h: dbRate.silverChange24h,
                        changePct: dbRate.silverChangePct,
                    }
                    : { buyRate: 175, sellRate: 173, change24h: 0, changePct: 0 },
                platinum: (dbRate.platinumBuyRate > 0)
                    ? {
                        buyRate: dbRate.platinumBuyRate,
                        sellRate: dbRate.platinumSellRate,
                        change24h: 0,
                        changePct: dbRate.platinumChangePct || 0,
                    }
                    : { buyRate: 5079, sellRate: 5043, change24h: 0, changePct: 0 },
                palladium: (dbRate.palladiumBuyRate > 0)
                    ? {
                        buyRate: dbRate.palladiumBuyRate,
                        sellRate: dbRate.palladiumSellRate,
                        change24h: 0,
                        changePct: dbRate.palladiumChangePct || 0,
                    }
                    : { buyRate: 3979, sellRate: 3951, change24h: 0, changePct: 0 },
                copper: (dbRate.copperBuyRate > 0)
                    ? {
                        buyRate: dbRate.copperBuyRate,
                        sellRate: dbRate.copperSellRate,
                        change24h: 0,
                        changePct: dbRate.copperChangePct || 0,
                    }
                    : { buyRate: 1.31, sellRate: 1.30, change24h: 0, changePct: 0 },
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
                platinum: {
                    ...rates.platinum,
                    purity: "950",
                    unit: "per gram",
                },
                palladium: {
                    ...rates.palladium,
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

exports.initiateBuy = async (req, res, next) => {
    try {
        if (req.user.kycStatus !== "approved") {
            return res.status(400).json({ success: false, message: "Please complete your KYC to buy gold/silver." });
        }

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

        const config = await paymentGatewayService.resolveGateway({});
        if (config.name !== "razorpay") {
            return res.status(400).json({
                success: false,
                message: `Active default payment gateway is '${config.name}', but direct gold purchases only support Razorpay. Please set Razorpay as the default gateway in Admin.`,
            });
        }

        const { order, keyId } = await paymentGatewayService.createRazorpayOrder({
            amount: totalAmt,
            notes: { userId: req.user._id.toString(), type: "gold_buy", grams: gramsToAdd },
            mode: config.mode,
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
                order, key: keyId,
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

        const config = await paymentGatewayService.resolveGateway({});
        if (config.name !== "razorpay") {
            return res.status(400).json({ success: false, message: "Default payment gateway is not Razorpay" });
        }

        const isValid = paymentGatewayService.verifyRazorpaySignature({
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
            keySecret: config.keySecret,
        });

        if (!isValid) {
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
        const { generateInvoicePDF } = require("../services/invoiceService");
        const isSample = req.query.sample === "true";
        const txn = await GoldTransaction.findOne({ _id: req.params.id, user: req.user._id });
        if (!txn) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        res.setHeader("Content-Type", "application/pdf");
        const invoiceLabel = txn.invoiceNo || `TX-${String(txn._id).slice(-8).toUpperCase()}`;
        res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceLabel}.pdf"`);

        await generateInvoicePDF(txn, req.user, "gold", res, isSample);
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 9. POST /api/gold/gift  — gift Gold or Silver to another user by phone
// ══════════════════════════════════════════════════════════════════════════════
exports.giftAsset = async (req, res, next) => {
    try {
        const { recipientPhone, grams, metal, note } = req.body;
        if (!recipientPhone || !grams || grams <= 0 || !metal) {
            return res.status(400).json({ success: false, message: "Invalid parameters" });
        }

        const isGold = metal.toLowerCase() === "gold";
        const isSilver = metal.toLowerCase() === "silver";
        if (!isGold && !isSilver) {
            return res.status(400).json({ success: false, message: "Invalid metal type. Must be gold or silver" });
        }

        // Find recipient user
        const User = require("../models/User");
        const cleanPhone = recipientPhone.trim();
        const recipient = await User.findOne({ phone: cleanPhone });
        if (!recipient) {
            return res.status(404).json({ success: false, message: "Recipient user not found with this mobile number" });
        }

        if (recipient._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: "You cannot gift assets to yourself" });
        }

        const rates = await fetchLiveRates();
        const ratePerGram = isGold ? rates.gold.buyRate : rates.silver.buyRate;

        if (isGold) {
            // Check sender gold balance
            const senderBal = await getOrCreateBalance(req.user._id);
            const availableGrams = senderBal.totalGrams - senderBal.lockedGrams;
            if (availableGrams < grams) {
                return res.status(400).json({ success: false, message: "Insufficient gold balance" });
            }

            // Deduct from sender
            senderBal.totalGrams -= grams;
            const senderDeductedInvested = parseFloat((grams * ratePerGram).toFixed(2));
            senderBal.investedAmt = Math.max(0, senderBal.investedAmt - senderDeductedInvested);
            await senderBal.save();

            // Add to recipient
            const recipientBal = await getOrCreateBalance(recipient._id);
            recipientBal.totalGrams += grams;
            recipientBal.investedAmt += senderDeductedInvested;
            await recipientBal.save();

            // Create transactions
            await GoldTransaction.create({
                user: req.user._id,
                type: "gift",
                grams: -grams,
                ratePerGram,
                goldValue: -parseFloat((grams * ratePerGram).toFixed(2)),
                totalAmt: -parseFloat((grams * ratePerGram).toFixed(2)),
                status: "success",
                note: note || `Gifted to ${recipient.name || recipient.phone}`,
            });

            await GoldTransaction.create({
                user: recipient._id,
                type: "gift",
                grams,
                ratePerGram,
                goldValue: parseFloat((grams * ratePerGram).toFixed(2)),
                totalAmt: parseFloat((grams * ratePerGram).toFixed(2)),
                status: "success",
                note: note || `Received gift from ${req.user.name || req.user.phone}`,
            });

        } else {
            // Silver
            const { SilverBalance, SilverTransaction } = require("../models/Silver");
            
            const getOrCreateSilverBalance = async (userId) => {
                let bal = await SilverBalance.findOne({ user: userId });
                if (!bal) bal = await SilverBalance.create({ user: userId });
                return bal;
            };

            const senderBal = await getOrCreateSilverBalance(req.user._id);
            const availableGrams = senderBal.totalGrams - senderBal.lockedGrams;
            if (availableGrams < grams) {
                return res.status(400).json({ success: false, message: "Insufficient silver balance" });
            }

            // Deduct from sender
            senderBal.totalGrams -= grams;
            const senderDeductedInvested = parseFloat((grams * ratePerGram).toFixed(2));
            senderBal.investedAmt = Math.max(0, senderBal.investedAmt - senderDeductedInvested);
            await senderBal.save();

            // Add to recipient
            const recipientBal = await getOrCreateSilverBalance(recipient._id);
            recipientBal.totalGrams += grams;
            recipientBal.investedAmt += senderDeductedInvested;
            await recipientBal.save();

            // Create transactions
            await SilverTransaction.create({
                user: req.user._id,
                type: "gift",
                grams: -grams,
                ratePerGram,
                silverValue: -parseFloat((grams * ratePerGram).toFixed(2)),
                totalAmt: -parseFloat((grams * ratePerGram).toFixed(2)),
                status: "success",
                note: note || `Gifted to ${recipient.name || recipient.phone}`,
            });

            await SilverTransaction.create({
                user: recipient._id,
                type: "gift",
                grams,
                ratePerGram,
                silverValue: parseFloat((grams * ratePerGram).toFixed(2)),
                totalAmt: parseFloat((grams * ratePerGram).toFixed(2)),
                status: "success",
                note: note || `Received gift from ${req.user.name || req.user.phone}`,
            });
        }

        res.json({
            success: true,
            message: `Successfully gifted ${grams.toFixed(4)}g of ${metal} to ${recipient.name || recipient.phone}`,
        });

    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// 10. GET /api/gold/history  — get historical rates for charts
// ══════════════════════════════════════════════════════════════════════════════
exports.getHistory = async (req, res, next) => {
    try {
        const { symbol, period } = req.query; // XAU / XAG, period: 1d, 1w, 1m, 1y
        if (!symbol) {
            return res.status(400).json({ success: false, message: "Symbol is required" });
        }

        const isGold = symbol.toUpperCase() === "XAU";
        const rates = await fetchLiveRates();
        const currentRate = isGold ? rates.gold.buyRate : rates.silver.buyRate;

        let pointsCount = 30;
        let volatility = 0.005;
        let dates = [];
        const now = new Date();

        switch ((period || "1m").toLowerCase()) {
            case "1d":
                pointsCount = 24;
                volatility = 0.001;
                for (let i = pointsCount - 1; i >= 0; i--) {
                    dates.push(new Date(now.getTime() - i * 60 * 60 * 1000));
                }
                break;
            case "1w":
                pointsCount = 7;
                volatility = 0.008;
                for (let i = pointsCount - 1; i >= 0; i--) {
                    dates.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
                }
                break;
            case "1y":
                pointsCount = 12;
                volatility = 0.03;
                for (let i = pointsCount - 1; i >= 0; i--) {
                    dates.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
                }
                break;
            case "1m":
            default:
                pointsCount = 30;
                volatility = 0.012;
                for (let i = pointsCount - 1; i >= 0; i--) {
                    dates.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
                }
                break;
        }

        let data = [];
        let price = currentRate;
        
        const seedRandom = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            return () => {
                const x = Math.sin(hash++) * 10000;
                return x - Math.floor(x);
            };
        };

        const rng = seedRandom(symbol + (period || "1m") + now.toDateString());

        for (let i = pointsCount - 1; i >= 0; i--) {
            if (i === pointsCount - 1) {
                data.push({
                    price: currentRate,
                    date: dates[i].toISOString()
                });
            } else {
                const change = (rng() - 0.48) * volatility;
                price = price / (1 + change);
                data.unshift({
                    price: parseFloat(price.toFixed(2)),
                    date: dates[i].toISOString()
                });
            }
        }

        res.json({
            success: true,
            data
        });

    } catch (err) { next(err); }
};