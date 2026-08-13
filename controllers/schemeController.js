const { GoldScheme, SchemeEnrollment } = require("../models/Scheme");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { fetchLiveRates } = require("./goldController");
const { getOrCreateWallet } = require("./walletController");

const GST_PCT = 3;

// ══════════════════════════════════════════════════════════════════════════════
// ── ADMIN ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/schemes  (admin) — create a scheme plan, e.g. "11+1 Gold Scheme"
exports.createScheme = async (req, res, next) => {
    try {
        const { name, metal, description, durationMonths, bonusMonths, minAmount, maxAmount, benefits } = req.body;
        if (!name || !durationMonths || !minAmount) {
            return res.status(400).json({ success: false, message: "name, durationMonths, minAmount are required" });
        }
        const scheme = await GoldScheme.create({
            name, metal: metal === "silver" ? "silver" : "gold",
            description: description || "",
            durationMonths, bonusMonths: bonusMonths ?? 1,
            minAmount, maxAmount: maxAmount ?? 0,
            benefits: Array.isArray(benefits) ? benefits.filter(Boolean) : [],
            createdBy: req.user._id,
        });
        res.json({ success: true, data: scheme });
    } catch (err) { next(err); }
};

// PUT /api/schemes/:id  (admin)
exports.updateScheme = async (req, res, next) => {
    try {
        const scheme = await GoldScheme.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!scheme) return res.status(404).json({ success: false, message: "Scheme not found" });
        res.json({ success: true, data: scheme });
    } catch (err) { next(err); }
};

// DELETE /api/schemes/:id  (admin) — soft delete (deactivate), keeps existing enrollments intact
exports.deleteScheme = async (req, res, next) => {
    try {
        const scheme = await GoldScheme.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
        if (!scheme) return res.status(404).json({ success: false, message: "Scheme not found" });
        res.json({ success: true, message: "Scheme deactivated" });
    } catch (err) { next(err); }
};

// GET /api/schemes/admin/all  (admin) — includes inactive
exports.listAllSchemes = async (req, res, next) => {
    try {
        const schemes = await GoldScheme.find().sort({ createdAt: -1 });
        res.json({ success: true, data: schemes });
    } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ── CUSTOMER ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/schemes  — active schemes available to join
exports.listSchemes = async (req, res, next) => {
    try {
        const schemes = await GoldScheme.find({ active: true }).sort({ createdAt: -1 });
        res.json({ success: true, data: schemes });
    } catch (err) { next(err); }
};

async function payInstallment({ userId, enrollment, amount, isBonus = false }) {
    const metal = enrollment.metal === "silver" ? "silver" : "gold";
    const rates = await fetchLiveRates();
    const buyRate = metal === "silver" ? rates.silver.buyRate : rates.gold.buyRate;
    if (!buyRate || buyRate <= 0) {
        const err = new Error(`${metal === "silver" ? "Silver" : "Gold"} rate unavailable right now`);
        err.status = 400;
        throw err;
    }

    const Balance = metal === "silver" ? SilverBalance : GoldBalance;
    const Transaction = metal === "silver" ? SilverTransaction : GoldTransaction;
    const valueField = metal === "silver" ? "silverValue" : "goldValue";

    let grams, metalValue, gstAmt, totalDeduct;
    if (isBonus) {
        // Bonus metal is free — no wallet deduction, but still GST-accounted for records
        metalValue = amount;
        gstAmt = 0;
        totalDeduct = 0;
        grams = parseFloat((metalValue / buyRate).toFixed(6));
    } else {
        metalValue = amount;
        gstAmt = parseFloat((metalValue * GST_PCT / 100).toFixed(2));
        totalDeduct = parseFloat((metalValue + gstAmt).toFixed(2));
        grams = parseFloat((metalValue / buyRate).toFixed(6));

        const wallet = await getOrCreateWallet(userId);
        if (wallet.balance < totalDeduct) {
            const err = new Error(
                `Insufficient wallet balance. Have ₹${wallet.balance.toFixed(2)}, need ₹${totalDeduct.toFixed(2)}`
            );
            err.status = 400;
            throw err;
        }
        wallet.balance = parseFloat((wallet.balance - totalDeduct).toFixed(2));
        await wallet.save();
    }

    // Scheme gold/silver is tracked separately inside the enrollment document, not mixed with global DigiGold/Silver balance.
    // let bal = await Balance.findOne({ user: userId });
    // if (!bal) bal = await Balance.create({ user: userId });
    // bal.totalGrams = parseFloat((bal.totalGrams + grams).toFixed(6));
    // if (!isBonus) bal.investedAmt = parseFloat((bal.investedAmt + metalValue).toFixed(2));
    // await bal.save();

    const txnData = {
        user: userId, type: "sip_buy", grams,
        ratePerGram: buyRate, gstAmt, totalAmt: isBonus ? 0 : totalDeduct,
        status: "success",
        note: isBonus
            ? `Bonus ${metal} — ${enrollment.schemeName} maturity`
            : `Installment #${enrollment.installmentsPaid + 1} — ${enrollment.schemeName}`,
    };
    txnData[valueField] = metalValue;
    if (metal === "gold") txnData.sipPlanId = enrollment._id; // GoldTransaction-only field

    const txn = await Transaction.create(txnData);

    return { grams, ratePerGram: buyRate, goldTxnId: txn._id };
}

// POST /api/schemes/:id/enroll  — join a scheme by paying the FIRST installment
// body: { monthlyAmount }
exports.enrollScheme = async (req, res, next) => {
    try {
        const scheme = await GoldScheme.findById(req.params.id);
        if (!scheme || !scheme.active) {
            return res.status(404).json({ success: false, message: "Scheme not available" });
        }
        const { monthlyAmount } = req.body;
        if (!monthlyAmount || monthlyAmount < scheme.minAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum monthly amount is ₹${scheme.minAmount}`,
            });
        }
        if (scheme.maxAmount > 0 && monthlyAmount > scheme.maxAmount) {
            return res.status(400).json({
                success: false,
                message: `Maximum monthly amount is ₹${scheme.maxAmount}`,
            });
        }

        // Create enrollment as a placeholder first so the payment note can reference it
        const enrollment = await SchemeEnrollment.create({
            user: req.user._id,
            scheme: scheme._id,
            schemeName: scheme.name,
            metal: scheme.metal,
            monthlyAmount,
            durationMonths: scheme.durationMonths,
            bonusMonths: scheme.bonusMonths,
        });

        const { grams, ratePerGram, goldTxnId } = await payInstallment({
            userId: req.user._id, enrollment, amount: monthlyAmount,
        });

        enrollment.installmentsPaid = 1;
        enrollment.totalGoldGrams = grams;
        enrollment.totalInvested = monthlyAmount;
        enrollment.payments.push({
            installmentNo: 1, amount: monthlyAmount, ratePerGram, grams, goldTxnId,
        });
        const next30 = new Date();
        next30.setDate(next30.getDate() + 30);
        enrollment.nextDueAt = next30;
        await enrollment.save();

        res.json({
            success: true,
            message: `Enrolled! First installment paid — ${grams.toFixed(4)}g credited.`,
            data: enrollment,
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
};

// POST /api/schemes/enrollments/:id/pay  — pay the next installment
exports.payNextInstallment = async (req, res, next) => {
    try {
        const enrollment = await SchemeEnrollment.findOne({ _id: req.params.id, user: req.user._id });
        if (!enrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });
        if (enrollment.status !== "active") {
            return res.status(400).json({ success: false, message: `Scheme is ${enrollment.status}` });
        }
        if (enrollment.installmentsPaid >= enrollment.durationMonths) {
            return res.status(400).json({ success: false, message: "All installments already paid" });
        }

        const { grams, ratePerGram, goldTxnId } = await payInstallment({
            userId: req.user._id, enrollment, amount: enrollment.monthlyAmount,
        });

        enrollment.installmentsPaid += 1;
        enrollment.totalGoldGrams = parseFloat((enrollment.totalGoldGrams + grams).toFixed(6));
        enrollment.totalInvested = parseFloat((enrollment.totalInvested + enrollment.monthlyAmount).toFixed(2));
        enrollment.payments.push({
            installmentNo: enrollment.installmentsPaid,
            amount: enrollment.monthlyAmount, ratePerGram, grams, goldTxnId,
        });

        let bonusMsg = "";
        if (enrollment.installmentsPaid >= enrollment.durationMonths) {
            // Maturity reached — credit bonus gold (e.g. "+1" free installment worth)
            if (enrollment.bonusMonths > 0) {
                const bonusAmount = enrollment.monthlyAmount * enrollment.bonusMonths;
                const bonus = await payInstallment({
                    userId: req.user._id, enrollment, amount: bonusAmount, isBonus: true,
                });
                enrollment.totalGoldGrams = parseFloat((enrollment.totalGoldGrams + bonus.grams).toFixed(6));
                enrollment.payments.push({
                    installmentNo: enrollment.installmentsPaid + 1,
                    amount: bonusAmount, ratePerGram: bonus.ratePerGram,
                    grams: bonus.grams, isBonus: true, goldTxnId: bonus.goldTxnId,
                });
                bonusMsg = ` Bonus ${bonus.grams.toFixed(4)}g credited free!`;
            }
            enrollment.status = "completed";
            enrollment.completedAt = new Date();
            enrollment.nextDueAt = undefined;
        } else {
            const next30 = new Date();
            next30.setDate(next30.getDate() + 30);
            enrollment.nextDueAt = next30;
        }
        await enrollment.save();

        res.json({
            success: true,
            message: `Installment #${enrollment.installmentsPaid} paid — ${grams.toFixed(4)}g credited.${bonusMsg}`,
            data: enrollment,
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
        next(err);
    }
};

// GET /api/schemes/my  — customer's enrollments
exports.myEnrollments = async (req, res, next) => {
    try {
        const enrollments = await SchemeEnrollment.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, data: enrollments });
    } catch (err) { next(err); }
};

// GET /api/schemes/my/:id  — single enrollment detail (with full payment history)
exports.enrollmentDetail = async (req, res, next) => {
    try {
        const enrollment = await SchemeEnrollment.findOne({ _id: req.params.id, user: req.user._id });
        if (!enrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });
        res.json({ success: true, data: enrollment });
    } catch (err) { next(err); }
};

// POST /api/schemes/my/:id/cancel  — cancel an active scheme (gold already credited stays with user)
exports.cancelEnrollment = async (req, res, next) => {
    try {
        const enrollment = await SchemeEnrollment.findOne({ _id: req.params.id, user: req.user._id });
        if (!enrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });
        if (enrollment.status !== "active") {
            return res.status(400).json({ success: false, message: `Scheme is already ${enrollment.status}` });
        }
        enrollment.status = "cancelled";
        await enrollment.save();
        res.json({ success: true, message: "Scheme cancelled. Gold already credited remains in your account." });
    } catch (err) { next(err); }
};