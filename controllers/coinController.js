const { GoldBalance, GoldTransaction, CoinOrder } = require("../models/Gold");
const { fetchLiveRates } = require("./goldController");
const Coin = require("../models/Coin");

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/coins  — catalog with live priced value
// ══════════════════════════════════════════════════════════════════════════════
exports.getCoins = async (req, res, next) => {
    try {
        const rates = await fetchLiveRates();
        const coins = await Coin.find({ isActive: true });
        const data = coins.map(c => {
            const rate = c.metal === "gold" ? rates.gold.buyRate : rates.silver.buyRate;
            const value = parseFloat((c.grams * rate).toFixed(2));
            const making = parseFloat((value * c.makingChargePct / 100).toFixed(2));
            return {
                id: c._id.toString(),
                _id: c._id.toString(),
                name: c.name,
                metal: c.metal,
                grams: c.grams,
                makingChargePct: c.makingChargePct,
                image: c.image || "",
                ratePerGram: rate,
                value,
                makingCharge: making,
                totalValue: parseFloat((value + making).toFixed(2)),
                redeemable: true,
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
        const { coinId, addressLine, pincode, phone, redeemDigital } = req.body;
        const shouldRedeemDigital = redeemDigital === true || redeemDigital === "true";
        const coin = await Coin.findById(coinId);
        if (!coin) return res.status(404).json({ success: false, message: "Coin not found" });
        if (!addressLine || !pincode || !phone) {
            return res.status(400).json({ success: false, message: "Address, pincode and phone are required" });
        }

        const { Wallet, WalletTxn } = require("../models/Wallet");

        if (coin.metal === "silver") {
            const { SilverBalance, SilverTransaction } = require("../models/Silver");
            const [rates, silverBal, wallet] = await Promise.all([
                fetchLiveRates(),
                SilverBalance.findOne({ user: req.user._id }),
                Wallet.findOne({ user: req.user._id }),
            ]);

            const rate = rates.silver.buyRate;
            const silverValue = parseFloat((coin.grams * rate).toFixed(2));
            const makingCharge = parseFloat((silverValue * coin.makingChargePct / 100).toFixed(2));
            const totalValue = parseFloat((silverValue + makingCharge).toFixed(2));

            let gramsToDeduct = 0;
            let cashToPay = totalValue;

            if (shouldRedeemDigital) {
                const availableGrams = silverBal ? ((silverBal.totalGrams || 0) - (silverBal.lockedGrams || 0)) : 0;
                const availableValue = availableGrams * rate;
                const maxValueFromMetal = Math.min(availableValue, totalValue);
                gramsToDeduct = parseFloat((maxValueFromMetal / rate).toFixed(6));
                cashToPay = parseFloat((totalValue - maxValueFromMetal).toFixed(2));
            }

            if (cashToPay > 0) {
                if (!wallet || wallet.balance < cashToPay) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient wallet balance. Need ₹${cashToPay.toFixed(2)} cash, but wallet has only ₹${(wallet?.balance || 0).toFixed(2)}.`,
                    });
                }
            }

            // Deduct from Silver Balance if any
            if (gramsToDeduct > 0 && silverBal) {
                silverBal.totalGrams = parseFloat((silverBal.totalGrams - gramsToDeduct).toFixed(6));
                silverBal.investedAmt = parseFloat(Math.max(0, silverBal.investedAmt - (gramsToDeduct * rate) * 0.9).toFixed(2));
                await silverBal.save();
            }

            // Deduct from Wallet if any
            let walletTxnId = null;
            if (cashToPay > 0 && wallet) {
                const balanceBefore = wallet.balance;
                wallet.balance = parseFloat((wallet.balance - cashToPay).toFixed(2));
                await wallet.save();

                const wTxn = await WalletTxn.create({
                    user: req.user._id,
                    type: "coin_redeem",
                    amount: cashToPay,
                    balanceBefore,
                    balanceAfter: wallet.balance,
                    status: "success",
                    note: `Cash part-payment for ${coin.name}`,
                });
                walletTxnId = wTxn._id;
            }

            let silverTxnId = null;
            if (gramsToDeduct > 0) {
                const silverTxn = await SilverTransaction.create({
                    user: req.user._id, type: "redeem", grams: gramsToDeduct,
                    ratePerGram: rate, silverValue: parseFloat((gramsToDeduct * rate).toFixed(2)),
                    gstAmt: 0, totalAmt: parseFloat((gramsToDeduct * rate).toFixed(2)),
                    status: "success", note: `Redeemed for ${coin.name}`,
                });
                silverTxnId = silverTxn._id;
            }

            const order = await CoinOrder.create({
                user: req.user._id, coinId: coin.id, coinName: coin.name, metal: coin.metal,
                grams: coin.grams, makingChargePct: coin.makingChargePct,
                goldValue: silverValue, makingCharge, totalValue, ratePerGram: rate,
                goldTxnId: silverTxnId, addressLine, pincode, phone,
                cashPaid: cashToPay, metalDeductedGrams: gramsToDeduct, walletTxnId,
            });

            return res.json({
                success: true,
                message: `${coin.name} order placed! Deducted ${gramsToDeduct.toFixed(4)}g silver and ₹${cashToPay} cash.`,
                data: { order, remainingGrams: silverBal ? silverBal.totalGrams : 0 },
            });
        }

        // Gold Flow
        const { GoldTransaction } = require("../models/Gold");
        const [rates, goldBal, wallet] = await Promise.all([
            fetchLiveRates(),
            GoldBalance.findOne({ user: req.user._id }),
            Wallet.findOne({ user: req.user._id }),
        ]);

        const rate = rates.gold.buyRate;
        const goldValue = parseFloat((coin.grams * rate).toFixed(2));
        const makingCharge = parseFloat((goldValue * coin.makingChargePct / 100).toFixed(2));
        const totalValue = parseFloat((goldValue + makingCharge).toFixed(2));

        let gramsToDeduct = 0;
        let cashToPay = totalValue;

        if (shouldRedeemDigital) {
            const availableGrams = goldBal ? ((goldBal.totalGrams || 0) - (goldBal.lockedGrams || 0)) : 0;
            const availableValue = availableGrams * rate;
            const maxValueFromMetal = Math.min(availableValue, totalValue);
            gramsToDeduct = parseFloat((maxValueFromMetal / rate).toFixed(6));
            cashToPay = parseFloat((totalValue - maxValueFromMetal).toFixed(2));
        }

        if (cashToPay > 0) {
            if (!wallet || wallet.balance < cashToPay) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. Need ₹${cashToPay.toFixed(2)} cash, but wallet has only ₹${(wallet?.balance || 0).toFixed(2)}.`,
                });
            }
        }

        // Deduct from Gold Balance if any
        if (gramsToDeduct > 0 && goldBal) {
            goldBal.totalGrams = parseFloat((goldBal.totalGrams - gramsToDeduct).toFixed(6));
            goldBal.investedAmt = parseFloat(Math.max(0, goldBal.investedAmt - (gramsToDeduct * rate) * 0.9).toFixed(2));
            await goldBal.save();
        }

        // Deduct from Wallet if any
        let walletTxnId = null;
        if (cashToPay > 0 && wallet) {
            const balanceBefore = wallet.balance;
            wallet.balance = parseFloat((wallet.balance - cashToPay).toFixed(2));
            await wallet.save();

            const wTxn = await WalletTxn.create({
                user: req.user._id,
                type: "coin_redeem",
                amount: cashToPay,
                balanceBefore,
                balanceAfter: wallet.balance,
                status: "success",
                note: `Cash part-payment for ${coin.name}`,
            });
            walletTxnId = wTxn._id;
        }

        let goldTxnId = null;
        if (gramsToDeduct > 0) {
            const goldTxn = await GoldTransaction.create({
                user: req.user._id, type: "redeem", grams: gramsToDeduct,
                ratePerGram: rate, goldValue: parseFloat((gramsToDeduct * rate).toFixed(2)),
                gstAmt: 0, totalAmt: parseFloat((gramsToDeduct * rate).toFixed(2)),
                status: "success", note: `Redeemed for ${coin.name}`,
            });
            goldTxnId = goldTxn._id;
        }

        const order = await CoinOrder.create({
            user: req.user._id, coinId: coin.id, coinName: coin.name, metal: coin.metal,
            grams: coin.grams, makingChargePct: coin.makingChargePct,
            goldValue, makingCharge, totalValue, ratePerGram: rate,
            goldTxnId, addressLine, pincode, phone,
            cashPaid: cashToPay, metalDeductedGrams: gramsToDeduct, walletTxnId,
        });

        res.json({
            success: true,
            message: `${coin.name} order placed! Deducted ${gramsToDeduct.toFixed(4)}g gold and ₹${cashToPay} cash.`,
            data: { order, remainingGrams: goldBal ? goldBal.totalGrams : 0 },
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