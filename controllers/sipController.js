const Sip = require("../models/Sip");
const User = require("../models/User");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { CopperBalance, CopperTransaction } = require("../models/Copper");
const { fetchLiveRates } = require("./goldController");

// Helper to compute cycles count based on duration and frequency
function computeTotalCycles(durationMonths, frequency) {
    const m = parseInt(durationMonths, 10) || 12;
    switch (frequency) {
        case "daily": return m * 30;
        case "weekly": return m * 4;
        case "monthly": return m;
        case "quarterly": return Math.ceil(m / 3);
        case "yearly": return Math.ceil(m / 12);
        default: return m;
    }
}

// Helper to credit bullion grams into user vault
async function creditGramsToVault(userId, metal, grams, amount, buyRate, installmentNo) {
    const netGrams = parseFloat(grams.toFixed(6));
    const netAmt = parseFloat(amount.toFixed(2));

    if (metal === "gold") {
        let bal = await GoldBalance.findOne({ user: userId });
        if (!bal) bal = new GoldBalance({ user: userId, grams: 0 });
        bal.grams = parseFloat(((bal.grams || 0) + netGrams).toFixed(6));
        bal.totalPurchasedGrams = parseFloat(((bal.totalPurchasedGrams || 0) + netGrams).toFixed(6));
        bal.totalInvestedRupees = parseFloat(((bal.totalInvestedRupees || 0) + netAmt).toFixed(2));
        await bal.save();

        const GST_PCT = 3;
        const gstAmount = parseFloat((netAmt - (netAmt / (1 + GST_PCT / 100))).toFixed(2));
        const netExGst = parseFloat((netAmt - gstAmount).toFixed(2));

        const txn = await GoldTransaction.create({
            user: userId,
            type: "sip_buy",
            grams: netGrams,
            ratePerGram: buyRate,
            amount: netAmt,
            netAmount: netExGst,
            gstAmount: gstAmount,
            status: "completed",
            paymentMethod: "wallet",
            reference: `Gold SIP Installment #${installmentNo}`
        });
        return txn._id.toString();
    } else if (metal === "silver") {
        let bal = await SilverBalance.findOne({ user: userId });
        if (!bal) bal = new SilverBalance({ user: userId, grams: 0 });
        bal.grams = parseFloat(((bal.grams || 0) + netGrams).toFixed(6));
        bal.totalPurchasedGrams = parseFloat(((bal.totalPurchasedGrams || 0) + netGrams).toFixed(6));
        bal.totalInvestedRupees = parseFloat(((bal.totalInvestedRupees || 0) + netAmt).toFixed(2));
        await bal.save();

        const GST_PCT = 3;
        const gstAmount = parseFloat((netAmt - (netAmt / (1 + GST_PCT / 100))).toFixed(2));
        const netExGst = parseFloat((netAmt - gstAmount).toFixed(2));

        const txn = await SilverTransaction.create({
            user: userId,
            type: "sip_buy",
            grams: netGrams,
            ratePerGram: buyRate,
            amount: netAmt,
            netAmount: netExGst,
            gstAmount: gstAmount,
            status: "completed",
            paymentMethod: "wallet",
            reference: `Silver SIP Installment #${installmentNo}`
        });
        return txn._id.toString();
    } else if (metal === "copper") {
        let bal = await CopperBalance.findOne({ user: userId });
        if (!bal) bal = new CopperBalance({ user: userId, totalGrams: 0, investedAmt: 0 });
        bal.totalGrams = parseFloat(((bal.totalGrams || 0) + netGrams).toFixed(6));
        bal.investedAmt = parseFloat(((bal.investedAmt || 0) + netAmt).toFixed(2));
        await bal.save();

        const GST_PCT = 18;
        const gstAmount = parseFloat((netAmt - (netAmt / (1 + GST_PCT / 100))).toFixed(2));
        const netExGst = parseFloat((netAmt - gstAmount).toFixed(2));

        const txn = await CopperTransaction.create({
            user: userId,
            type: "sip_buy",
            grams: netGrams,
            ratePerGram: buyRate,
            amount: netAmt,
            netAmount: netExGst,
            gstAmount: gstAmount,
            status: "completed",
            paymentMethod: "wallet",
            reference: `Copper SIP Installment #${installmentNo}`
        });
        return txn._id.toString();
    }
    return "";
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. POST /api/sip/create — Start a new SIP & process first installment
// ══════════════════════════════════════════════════════════════════════════════
exports.createSip = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const {
            metal = "gold",
            frequency = "monthly",
            installmentAmount,
            durationMonths = 12,
            paymentMethod = "wallet",
        } = req.body;

        const amount = parseFloat(installmentAmount);
        if (!amount || isNaN(amount) || amount < 100) {
            return res.status(400).json({
                success: false,
                message: "Minimum SIP installment amount is ₹100.",
            });
        }

        const validMetals = ["gold", "silver", "copper"];
        if (!validMetals.includes(metal.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Metal must be gold, silver, or copper.",
            });
        }

        const validFreqs = ["daily", "weekly", "monthly", "quarterly", "yearly"];
        if (!validFreqs.includes(frequency.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Invalid frequency. Choose daily, weekly, monthly, quarterly, or yearly.",
            });
        }

        const totalCycles = computeTotalCycles(durationMonths, frequency);

        // Fetch live rates
        const rates = await fetchLiveRates();
        const metalKey = metal.toLowerCase();
        const metalRate = rates[metalKey]?.buyRate;
        if (!metalRate || metalRate <= 0) {
            return res.status(500).json({
                success: false,
                message: `Unable to fetch live ${metal} market rate. Please try again.`,
            });
        }

        const gstPct = metalKey === "copper" ? 18 : 3;
        const netExGst = amount / (1 + gstPct / 100);
        const gramsCredited = netExGst / metalRate;

        // Verify Wallet Balance & Deduct
        const wallet = await Wallet.findOne({ user: userId });
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Required: ₹${amount}, Available: ₹${wallet?.balance || 0}`,
            });
        }

        // Deduct from wallet
        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance - amount).toFixed(2));
        wallet.totalSpent = parseFloat(((wallet.totalSpent || 0) + amount).toFixed(2));
        await wallet.save();

        // Record Wallet Txn
        const walletTxnType = metalKey === "silver" ? "silver_buy" : metalKey === "copper" ? "copper_buy" : "gold_buy";
        await WalletTxn.create({
            user: userId,
            entryType: "debit",
            type: walletTxnType,
            amount,
            balanceBefore: balBefore,
            balanceAfter: wallet.balance,
            status: "success",
            reason: `${metal.toUpperCase()} SIP Installment #1`,
            note: `Started ${metal.toUpperCase()} SIP #${1} (${frequency})`,
        });

        // Credit bullion to vault
        const txnId = await creditGramsToVault(userId, metalKey, gramsCredited, amount, metalRate, 1);

        // Create SIP Document
        const sip = new Sip({
            user: userId,
            metal: metalKey,
            frequency: frequency.toLowerCase(),
            installmentAmount: amount,
            durationMonths: parseInt(durationMonths, 10) || 12,
            totalCycles,
            cyclesCompleted: 1,
            totalInvested: amount,
            totalGrams: parseFloat(gramsCredited.toFixed(6)),
            status: totalCycles <= 1 ? "completed" : "active",
            startDate: new Date(),
            completedAt: totalCycles <= 1 ? new Date() : null,
            nextDueDate: new Date(),
            installments: [
                {
                    installmentNo: 1,
                    amount,
                    ratePerGram: metalRate,
                    grams: parseFloat(gramsCredited.toFixed(6)),
                    paymentMethod: paymentMethod || "wallet",
                    txnId: txnId,
                    paidAt: new Date(),
                },
            ],
        });

        sip.nextDueDate = sip.calculateNextDueDate(new Date());
        await sip.save();

        res.status(201).json({
            success: true,
            message: `Congratulations! Your ${metal.toUpperCase()} SIP has started successfully.`,
            data: sip,
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. GET /api/sip/my — Get all active and completed SIPs + Portfolio Summary
// ══════════════════════════════════════════════════════════════════════════════
exports.getMySips = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const [sips, rates] = await Promise.all([
            Sip.find({ user: userId }).sort({ createdAt: -1 }).lean(),
            fetchLiveRates(),
        ]);

        let totalInvested = 0;
        let totalCurrentValue = 0;
        let totalGramsGold = 0;
        let totalGramsSilver = 0;
        let totalGramsCopper = 0;
        let activeCount = 0;

        const enrichedSips = sips.map((sip) => {
            const metal = sip.metal || "gold";
            const liveSellRate = rates[metal]?.sellRate || rates[metal]?.buyRate || 0;
            const currentValuation = parseFloat(((sip.totalGrams || 0) * liveSellRate).toFixed(2));
            const invested = parseFloat((sip.totalInvested || 0).toFixed(2));
            const returnsAmt = parseFloat((currentValuation - invested).toFixed(2));
            const returnsPct = invested > 0 ? parseFloat(((returnsAmt / invested) * 100).toFixed(2)) : 0;
            const progressPct = sip.totalCycles > 0 ? parseFloat(((sip.cyclesCompleted / sip.totalCycles) * 100).toFixed(1)) : 0;

            totalInvested += invested;
            totalCurrentValue += currentValuation;
            if (metal === "gold") totalGramsGold += sip.totalGrams || 0;
            if (metal === "silver") totalGramsSilver += sip.totalGrams || 0;
            if (metal === "copper") totalGramsCopper += sip.totalGrams || 0;
            if (sip.status === "active") activeCount++;

            return {
                ...sip,
                currentLiveRate: liveSellRate,
                currentValuation,
                returnsAmt,
                returnsPct,
                progressPct,
                isDue: sip.status === "active" && sip.nextDueDate && new Date(sip.nextDueDate) <= new Date(),
            };
        });

        const overallReturnsAmt = parseFloat((totalCurrentValue - totalInvested).toFixed(2));
        const overallReturnsPct = totalInvested > 0 ? parseFloat(((overallReturnsAmt / totalInvested) * 100).toFixed(2)) : 0;

        res.json({
            success: true,
            data: {
                portfolio: {
                    totalSipsCount: sips.length,
                    activeSipsCount: activeCount,
                    totalInvested: parseFloat(totalInvested.toFixed(2)),
                    totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
                    overallReturnsAmt,
                    overallReturnsPct,
                    totalGramsGold: parseFloat(totalGramsGold.toFixed(4)),
                    totalGramsSilver: parseFloat(totalGramsSilver.toFixed(4)),
                    totalGramsCopper: parseFloat(totalGramsCopper.toFixed(4)),
                },
                sips: enrichedSips,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. GET /api/sip/:id — Get full SIP details and Step-by-Step Journey Roadmap
// ══════════════════════════════════════════════════════════════════════════════
exports.getSipDetail = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const sip = await Sip.findOne({ _id: req.params.id, user: userId });
        if (!sip) {
            return res.status(404).json({ success: false, message: "SIP subscription not found." });
        }

        const rates = await fetchLiveRates();
        const metal = sip.metal || "gold";
        const liveSellRate = rates[metal]?.sellRate || rates[metal]?.buyRate || 0;
        const currentValuation = parseFloat(((sip.totalGrams || 0) * liveSellRate).toFixed(2));
        const invested = parseFloat((sip.totalInvested || 0).toFixed(2));
        const returnsAmt = parseFloat((currentValuation - invested).toFixed(2));
        const returnsPct = invested > 0 ? parseFloat(((returnsAmt / invested) * 100).toFixed(2)) : 0;
        const progressPct = sip.totalCycles > 0 ? parseFloat(((sip.cyclesCompleted / sip.totalCycles) * 100).toFixed(1)) : 0;

        // Build milestone journey
        const journey = [];
        const installmentsMap = new Map();
        (sip.installments || []).forEach((inst) => {
            installmentsMap.set(inst.installmentNo, inst);
        });

        let cyclePointerDate = new Date(sip.startDate);
        for (let i = 1; i <= sip.totalCycles; i++) {
            if (installmentsMap.has(i)) {
                const paid = installmentsMap.get(i);
                journey.push({
                    cycleNo: i,
                    status: "completed",
                    date: paid.paidAt,
                    amount: paid.amount,
                    ratePerGram: paid.ratePerGram,
                    grams: paid.grams,
                    paymentMethod: paid.paymentMethod,
                    txnId: paid.txnId,
                    label: `Cycle #${i} Paid`,
                });
                cyclePointerDate = new Date(paid.paidAt);
            } else if (i === sip.cyclesCompleted + 1 && sip.status === "active") {
                journey.push({
                    cycleNo: i,
                    status: "upcoming",
                    dueDate: sip.nextDueDate,
                    amount: sip.installmentAmount,
                    label: `Cycle #${i} Due`,
                });
            } else {
                journey.push({
                    cycleNo: i,
                    status: "future",
                    amount: sip.installmentAmount,
                    label: `Cycle #${i} Scheduled`,
                });
            }
        }

        res.json({
            success: true,
            data: {
                sip: {
                    ...sip.toObject(),
                    currentLiveRate: liveSellRate,
                    currentValuation,
                    returnsAmt,
                    returnsPct,
                    progressPct,
                },
                journey,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. POST /api/sip/:id/pay — Pay next upcoming installment from Wallet
// ══════════════════════════════════════════════════════════════════════════════
exports.payInstallment = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const sip = await Sip.findOne({ _id: req.params.id, user: userId });
        if (!sip) {
            return res.status(404).json({ success: false, message: "SIP subscription not found." });
        }

        if (sip.status === "completed") {
            return res.status(400).json({ success: false, message: "This SIP plan is already completed." });
        }
        if (sip.status === "cancelled") {
            return res.status(400).json({ success: false, message: "This SIP has been cancelled." });
        }

        const amount = sip.installmentAmount;
        const metal = sip.metal || "gold";

        // Check Wallet Balance
        const wallet = await Wallet.findOne({ user: userId });
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Required: ₹${amount}, Available: ₹${wallet?.balance || 0}`,
            });
        }

        // Fetch live rate
        const rates = await fetchLiveRates();
        const metalRate = rates[metal]?.buyRate;
        if (!metalRate || metalRate <= 0) {
            return res.status(500).json({ success: false, message: `Unable to fetch live ${metal} market rate.` });
        }

        const gstPct = metal === "copper" ? 18 : 3;
        const netExGst = amount / (1 + gstPct / 100);
        const gramsCredited = netExGst / metalRate;

        // Deduct from wallet
        const balBefore = wallet.balance;
        wallet.balance = parseFloat((wallet.balance - amount).toFixed(2));
        wallet.totalSpent = parseFloat(((wallet.totalSpent || 0) + amount).toFixed(2));
        await wallet.save();

        const nextCycleNo = sip.cyclesCompleted + 1;

        // Record Wallet Txn
        const walletTxnType = metal === "silver" ? "silver_buy" : metal === "copper" ? "copper_buy" : "gold_buy";
        await WalletTxn.create({
            user: userId,
            entryType: "debit",
            type: walletTxnType,
            amount,
            balanceBefore: balBefore,
            balanceAfter: wallet.balance,
            status: "success",
            reason: `${metal.toUpperCase()} SIP Installment #${nextCycleNo}`,
            note: `Paid ${metal.toUpperCase()} SIP Installment #${nextCycleNo}`,
        });

        // Credit to vault
        const txnId = await creditGramsToVault(userId, metal, gramsCredited, amount, metalRate, nextCycleNo);

        // Update SIP record
        sip.cyclesCompleted = nextCycleNo;
        sip.totalInvested = parseFloat(((sip.totalInvested || 0) + amount).toFixed(2));
        sip.totalGrams = parseFloat(((sip.totalGrams || 0) + gramsCredited).toFixed(6));
        sip.installments.push({
            installmentNo: nextCycleNo,
            amount,
            ratePerGram: metalRate,
            grams: parseFloat(gramsCredited.toFixed(6)),
            paymentMethod: "wallet",
            txnId,
            paidAt: new Date(),
        });

        if (sip.cyclesCompleted >= sip.totalCycles) {
            sip.status = "completed";
            sip.completedAt = new Date();
        } else {
            sip.nextDueDate = sip.calculateNextDueDate(new Date());
        }

        await sip.save();

        res.json({
            success: true,
            message: `Installment #${nextCycleNo} paid successfully! ${gramsCredited.toFixed(4)}g credited to your ${metal.toUpperCase()} vault.`,
            data: sip,
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. POST /api/sip/:id/toggle-status — Pause or Resume SIP
// ══════════════════════════════════════════════════════════════════════════════
exports.toggleSipStatus = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const sip = await Sip.findOne({ _id: req.params.id, user: userId });
        if (!sip) {
            return res.status(404).json({ success: false, message: "SIP subscription not found." });
        }

        if (sip.status === "completed" || sip.status === "cancelled") {
            return res.status(400).json({ success: false, message: `Cannot change status of a ${sip.status} SIP.` });
        }

        sip.status = sip.status === "active" ? "paused" : "active";
        if (sip.status === "active" && (!sip.nextDueDate || new Date(sip.nextDueDate) < new Date())) {
            sip.nextDueDate = sip.calculateNextDueDate(new Date());
        }
        await sip.save();

        res.json({
            success: true,
            message: `SIP status changed to ${sip.status.toUpperCase()}.`,
            data: sip,
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. POST /api/sip/:id/cancel — Cancel remaining SIP cycles
// ══════════════════════════════════════════════════════════════════════════════
exports.cancelSip = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const sip = await Sip.findOne({ _id: req.params.id, user: userId });
        if (!sip) {
            return res.status(404).json({ success: false, message: "SIP subscription not found." });
        }

        if (sip.status === "completed") {
            return res.status(400).json({ success: false, message: "Completed SIP cannot be cancelled." });
        }

        sip.status = "cancelled";
        await sip.save();

        res.json({
            success: true,
            message: `SIP has been cancelled. Your accumulated ${sip.totalGrams}g ${sip.metal.toUpperCase()} remains 100% safe in your vault.`,
            data: sip,
        });
    } catch (err) {
        next(err);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// 7. GET /api/admin/sips — Admin view all platform SIPs
// ══════════════════════════════════════════════════════════════════════════════
exports.getAdminSips = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
        if (req.query.metal && req.query.metal !== "all") filter.metal = req.query.metal;

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            const matchingUsers = await User.find({
                $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }],
            }).select("_id");
            filter.user = { $in: matchingUsers.map((u) => u._id) };
        }

        const [sips, total] = await Promise.all([
            Sip.find(filter)
                .populate("user", "name email phone referralCode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Sip.countDocuments(filter),
        ]);

        res.json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: sips,
        });
    } catch (err) {
        next(err);
    }
};
