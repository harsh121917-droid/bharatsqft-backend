const crypto = require("crypto");
const Saving = require("../models/Saving");
const paymentGatewayService = require("../services/paymentGatewayService");

// ── POST /api/savings/:id/pay/initiate ────────────────────────────────────────
exports.initiateFirstPayment = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });
        if (saving.firstPaymentDone) {
            return res.status(400).json({ success: false, message: "First payment already completed" });
        }

        const { order, keyId } = await paymentGatewayService.createRazorpayOrder({
            amount: saving.amountPerCycle,
            purpose: "sip_scheme",
            notes: {
                savingId: saving._id.toString(),
                userId: req.user._id.toString(),
                type: "investment",
            },
        });

        // store order id on saving for verification
        saving.razorpayOrderId = order.id;
        await saving.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: saving.amountPerCycle * 100, // paise
            currency: "INR",
            keyId: keyId,
            savingId: saving._id,
            planType: saving.type,
            amountPerCycle: saving.amountPerCycle,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/savings/:id/pay/verify ─────────────────────────────────────────
// Called after Razorpay payment sheet closes successfully on the app.
exports.verifyFirstPayment = async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Missing payment fields" });
        }

        const keySecret = await paymentGatewayService.getRazorpayKeySecret(undefined, { purpose: "sip_scheme" });
        const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            keySecret,
            purpose: "sip_scheme",
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });

        // record first cycle deposit
        saving.savedAmount += saving.amountPerCycle;
        saving.firstPaymentDone = true;
        saving.razorpayPaymentId = razorpay_payment_id;
        saving.lastCycleDate = new Date();
        saving.cycles.push({
            date: new Date(),
            amount: saving.amountPerCycle,
            note: `First installment completed`,
        });
        await saving.save();

        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/savings/:id/pay/cycle/initiate ──────────────────────────────────
// Creates a Razorpay order for any subsequent cycle (after first payment done)
exports.initiateCyclePayment = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });
        if (!saving.firstPaymentDone) {
            return res.status(400).json({ success: false, message: "Complete first payment before adding more" });
        }
        if (!saving.isActive) {
            return res.status(400).json({ success: false, message: "Plan is paused" });
        }

        // allow custom amount (e.g. user typed different value) or default to amountPerCycle
        const cycleAmount = req.body.amount
            ? parseInt(req.body.amount, 10)
            : saving.amountPerCycle;

        const { order, keyId } = await paymentGatewayService.createRazorpayOrder({
            amount: cycleAmount,
            purpose: "sip_scheme",
            notes: {
                savingId: saving._id.toString(),
                userId: req.user._id.toString(),
                type: "investment",
            },
        });

        saving.razorpayOrderId = order.id;
        await saving.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: cycleAmount * 100, // paise
            currency: "INR",
            keyId: keyId,
            savingId: saving._id,
            planType: saving.type,
            cycleAmount,
        });
    } catch (err) {
        console.error("ERROR:", err);
        next(err);
    }
};

// ── POST /api/savings/:id/pay/cycle/verify ────────────────────────────────────
exports.verifyCyclePayment = async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Missing payment fields" });
        }

        const keySecret = await paymentGatewayService.getRazorpayKeySecret(undefined, { purpose: "sip_scheme" });
        const isValid = await paymentGatewayService.verifyRazorpaySignatureWithFallback({
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            keySecret,
            purpose: "sip_scheme",
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Not found" });

        const cycleAmount = amount ? parseInt(amount, 10) : saving.amountPerCycle;

        saving.savedAmount += cycleAmount;
        saving.razorpayPaymentId = razorpay_payment_id;
        saving.lastCycleDate = new Date();
        saving.cycles.push({
            date: new Date(),
            amount: cycleAmount,
            note: `Cycle payment via Razorpay (${config.mode})`,
        });
        await saving.save();

        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};