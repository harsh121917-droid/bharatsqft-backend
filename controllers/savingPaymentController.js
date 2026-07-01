const Razorpay = require("razorpay");
const crypto = require("crypto");
const Saving = require("../models/Saving");
const Kyc = require("../models/Kyc");

function getRazorpay() {
    if (!process.env.RAZORPAY_KEY_ID) throw new Error("RAZORPAY_KEY_ID missing");
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

// ── POST /api/savings/:id/pay/initiate ────────────────────────────────────────
// Creates a Razorpay order for the FIRST cycle payment.
// Subsequent cycles are auto-debited by the backend scheduler (not in scope here).
exports.initiateFirstPayment = async (req, res, next) => {
    try {
        const saving = await Saving.findOne({ _id: req.params.id, user: req.user._id });
        if (!saving) return res.status(404).json({ success: false, message: "Saving plan not found" });
        if (saving.firstPaymentDone) {
            return res.status(400).json({ success: false, message: "First payment already completed" });
        }

        // KYC check
        const kyc = await Kyc.findOne({ user: req.user._id });
        if (!kyc || kyc.status !== "approved") {
            return res.status(403).json({
                success: false,
                code: "KYC_REQUIRED",
                kycStatus: kyc?.status || "not_submitted",
                message: kyc?.status === "pending"
                    ? "Your KYC is under review. Please wait before activating savings."
                    : "Please complete KYC before activating your saving plan.",
            });
        }

        const amountPaise = saving.amountPerCycle * 100; // ₹ to paise

        const rz = getRazorpay();
        const order = await rz.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: `saving_${saving._id}_first`,
            notes: {
                savingId: saving._id.toString(),
                userId: req.user._id.toString(),
                type: saving.type,
                amountPerCycle: saving.amountPerCycle,
            },
        });

        // store order id on saving for verification
        saving.razorpayOrderId = order.id;
        await saving.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: amountPaise,
            currency: "INR",
            keyId: process.env.RAZORPAY_KEY_ID,
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

        // verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expected !== razorpay_signature) {
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
            note: "First payment via Razorpay",
        });
        await saving.save();

        res.json({ success: true, data: saving });
    } catch (err) {
        next(err);
    }
};