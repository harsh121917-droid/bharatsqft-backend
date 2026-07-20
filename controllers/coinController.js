const { GoldBalance, GoldTransaction, CoinOrder } = require("../models/Gold");
const { fetchLiveRates } = require("./goldController");

// ─── Static coin catalog ─────────────────────────────────────────────────────
// Only GOLD coins are redeemable right now (deducted from user's digital gold
// balance). Silver coins are shown for browsing only — no silver wallet exists
// yet, so "Buy" is disabled on those until that's built.
const CATALOG = [
    { id: "gold-1g", name: "1g Gold Coin (24K)", metal: "gold", grams: 1, makingChargePct: 8 },
    { id: "gold-2g", name: "2g Gold Coin (24K)", metal: "gold", grams: 2, makingChargePct: 7 },
    { id: "gold-5g", name: "5g Gold Coin (24K)", metal: "gold", grams: 5, makingChargePct: 6 },
    { id: "gold-10g", name: "10g Gold Coin (24K)", metal: "gold", grams: 10, makingChargePct: 5 },
    { id: "silver-10g", name: "10g Silver Coin (999)", metal: "silver", grams: 10, makingChargePct: 10 },
    { id: "silver-50g", name: "50g Silver Coin (999)", metal: "silver", grams: 50, makingChargePct: 8 },
];

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/coins  — catalog with live priced value
// ══════════════════════════════════════════════════════════════════════════════
exports.getCoins = async (req, res, next) => {
    try {
        const rates = await fetchLiveRates();
        const data = CATALOG.map(c => {
            const rate = c.metal === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const value = parseFloat((c.grams * rate).toFixed(2));
            const making = parseFloat((value * c.makingChargePct / 100).toFixed(2));
            return {
                ...c,
                ratePerGram: rate,
                value,
                makingCharge: making,
                totalValue: parseFloat((value + making).toFixed(2)),
                redeemable: c.metal === "gold", // silver not redeemable yet
            };
        });
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/coins/redeem  — redeem digital gold for a physical gold coin
// body: { coinId, addressLine, pincode, phone }
// ══════════════════════════════════════════════════════════════════════════════
exports.redeemCoin = async (req, res, next) => {
    try {
        const { coinId, addressLine, pincode, phone } = req.body;
        const coin = CATALOG.find(c => c.id === coinId);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });
        if (coin.metal !== "gold") {
            return res.status(400).json({ success: false, message: "Silver coin redemption isn't available yet" });
        }
        if (!addressLine || !pincode || !phone) {
            return res.status(400).json({ success: false, message: "Address, pincode and phone are required" });
        }

        const [rates, goldBal] = await Promise.all([
            fetchLiveRates(),
            GoldBalance.findOne({ user: req.user._id }),
        ]);

        const rate = rates.gold.buyRate;
        const goldValue = parseFloat((coin.grams * rate).toFixed(2));
        const makingCharge = parseFloat((goldValue * coin.makingChargePct / 100).toFixed(2));
        const totalValue = parseFloat((goldValue + makingCharge).toFixed(2));
        // Grams deducted from wallet = coin's gold weight only (making charge is
        // a service fee, not gold — but since there's no cash payment path here,
        // we express the making charge as extra grams deducted at current rate).
        const gramsToDeduct = parseFloat((totalValue / rate).toFixed(6));

        const available = (goldBal?.totalGrams || 0) - (goldBal?.lockedGrams || 0);
        if (!goldBal || available < gramsToDeduct) {
            return res.status(400).json({
                success: false,
                message: `Insufficient gold. Need ${gramsToDeduct.toFixed(4)}g, have ${available.toFixed(4)}g`,
            });
        }

        goldBal.totalGrams = parseFloat((goldBal.totalGrams - gramsToDeduct).toFixed(6));
        goldBal.investedAmt = parseFloat(Math.max(0, goldBal.investedAmt - goldValue * 0.9).toFixed(2));
        await goldBal.save();

        const goldTxn = await GoldTransaction.create({
            user: req.user._id, type: "redeem", grams: gramsToDeduct,
            ratePerGram: rate, goldValue, gstAmt: makingCharge, totalAmt: totalValue,
            status: "success", note: `Redeemed for ${coin.name}`,
        });

        const order = await CoinOrder.create({
            user: req.user._id, coinId: coin.id, coinName: coin.name, metal: coin.metal,
            grams: coin.grams, makingChargePct: coin.makingChargePct,
            goldValue, makingCharge, totalValue, ratePerGram: rate,
            goldTxnId: goldTxn._id, addressLine, pincode, phone,
        });

        res.json({
            success: true,
            message: `${coin.name} order placed! ${gramsToDeduct.toFixed(4)}g deducted from your gold.`,
            data: { order, remainingGrams: goldBal.totalGrams },
        });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/coins/orders  — user's coin redemption order history
// ══════════════════════════════════════════════════════════════════════════════
exports.getCoinOrders = async (req, res, next) => {
    try {
        const orders = await CoinOrder.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (err) { next(err); }
};