const User = require("../models/User");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");
const { CopperBalance, CopperTransaction } = require("../models/Copper");
const Investment = require("../models/Investment");
const Property = require("../models/Property");
const { Wallet, WalletTxn } = require("../models/Wallet");

/**
 * Centrally and safely credits user balance and transitions any pending transaction to success.
 * Fully idempotent: if transaction was already completed/paid, it will safely return without double-crediting.
 */
async function creditAndCompleteTransaction(metalType, txnId, { paymentId = null, verifiedBy = "admin" } = {}) {
    const normType = String(metalType || "").toLowerCase();

    if (normType === "gold") {
        const txn = await GoldTransaction.findById(txnId);
        if (!txn) throw new Error("Gold transaction not found: " + txnId);
        if (txn.status === "success") {
            return { success: true, alreadyCompleted: true, txn, message: "Transaction already marked as success." };
        }

        let bal = await GoldBalance.findOne({ user: txn.user });
        if (!bal) {
            bal = await GoldBalance.create({ user: txn.user, totalGrams: 0, investedAmt: 0 });
        }
        bal.totalGrams = parseFloat((bal.totalGrams + (txn.grams || 0)).toFixed(6));
        bal.investedAmt = parseFloat((bal.investedAmt + (txn.totalAmt || txn.goldValue || 0)).toFixed(2));
        await bal.save();

        if (txn.isReferralRedeemed) {
            const user = await User.findById(txn.user);
            if (user) {
                user.referralBalance = Math.max(0, (user.referralBalance || 0) - 50);
                await user.save();
            }
        }

        txn.status = "success";
        if (paymentId) txn.razorpayPaymentId = paymentId;
        const auditTag = verifiedBy === "gateway"
            ? "Verified via Gateway"
            : verifiedBy === "webhook"
                ? "Auto-credited via Razorpay Webhook"
                : "Approved & Credited by Admin";
        txn.note = txn.note ? `${txn.note} • ${auditTag}` : auditTag;
        await txn.save();

        return {
            success: true,
            txn,
            metal: "Gold",
            creditedGrams: txn.grams,
            newBalance: bal.totalGrams,
            message: `${txn.grams}g Gold credited successfully!`
        };
    }

    if (normType === "silver") {
        const txn = await SilverTransaction.findById(txnId);
        if (!txn) throw new Error("Silver transaction not found: " + txnId);
        if (txn.status === "success") {
            return { success: true, alreadyCompleted: true, txn, message: "Transaction already marked as success." };
        }

        let bal = await SilverBalance.findOne({ user: txn.user });
        if (!bal) {
            bal = await SilverBalance.create({ user: txn.user, totalGrams: 0, investedAmt: 0 });
        }
        bal.totalGrams = parseFloat((bal.totalGrams + (txn.grams || 0)).toFixed(6));
        bal.investedAmt = parseFloat((bal.investedAmt + (txn.totalAmt || txn.silverValue || 0)).toFixed(2));
        await bal.save();

        txn.status = "success";
        if (paymentId) txn.razorpayPaymentId = paymentId;
        const auditTag = verifiedBy === "gateway"
            ? "Verified via Gateway"
            : verifiedBy === "webhook"
                ? "Auto-credited via Razorpay Webhook"
                : "Approved & Credited by Admin";
        txn.note = txn.note ? `${txn.note} • ${auditTag}` : auditTag;
        await txn.save();

        return {
            success: true,
            txn,
            metal: "Silver",
            creditedGrams: txn.grams,
            newBalance: bal.totalGrams,
            message: `${txn.grams}g Silver credited successfully!`
        };
    }

    if (normType === "copper") {
        const txn = await CopperTransaction.findById(txnId);
        if (!txn) throw new Error("Copper transaction not found: " + txnId);
        if (txn.status === "success") {
            return { success: true, alreadyCompleted: true, txn, message: "Transaction already marked as success." };
        }

        let bal = await CopperBalance.findOne({ user: txn.user });
        if (!bal) {
            bal = await CopperBalance.create({ user: txn.user, totalGrams: 0, investedAmt: 0 });
        }
        bal.totalGrams = parseFloat((bal.totalGrams + (txn.grams || 0)).toFixed(6));
        bal.investedAmt = parseFloat((bal.investedAmt + (txn.totalAmt || txn.copperValue || 0)).toFixed(2));
        await bal.save();

        txn.status = "success";
        if (paymentId) txn.razorpayPaymentId = paymentId;
        const auditTag = verifiedBy === "gateway"
            ? "Verified via Gateway"
            : verifiedBy === "webhook"
                ? "Auto-credited via Razorpay Webhook"
                : "Approved & Credited by Admin";
        txn.note = txn.note ? `${txn.note} • ${auditTag}` : auditTag;
        await txn.save();

        return {
            success: true,
            txn,
            metal: "Copper",
            creditedGrams: txn.grams,
            newBalance: bal.totalGrams,
            message: `${txn.grams}g Copper credited successfully!`
        };
    }

    if (normType === "property" || normType === "brick" || normType === "brick_purchase") {
        const inv = await Investment.findById(txnId);
        if (!inv) throw new Error("Property investment not found: " + txnId);
        if (inv.status === "paid") {
            return { success: true, alreadyCompleted: true, inv, message: "Investment already marked as paid." };
        }

        inv.status = "paid";
        if (paymentId) inv.razorpayPaymentId = paymentId;
        await inv.save();

        const prop = await Property.findById(inv.property);
        if (prop) {
            prop.soldBricks = (prop.soldBricks || 0) + (inv.bricks || 0);
            await prop.save();
        }

        return {
            success: true,
            inv,
            metal: "Property",
            creditedBricks: inv.bricks,
            message: `${inv.bricks} Bricks allocated successfully!`
        };
    }

    if (normType === "wallet" || normType === "wallet_topup") {
        const txn = await WalletTxn.findById(txnId);
        if (!txn) throw new Error("Wallet transaction not found: " + txnId);
        if (txn.status === "success") {
            return { success: true, alreadyCompleted: true, txn, message: "Wallet transaction already marked as success." };
        }

        let wallet = await Wallet.findOne({ user: txn.user });
        if (!wallet) wallet = await Wallet.create({ user: txn.user });
        wallet.balance = parseFloat((wallet.balance + (txn.amount || 0)).toFixed(2));
        wallet.totalAdded = parseFloat((wallet.totalAdded + (txn.amount || 0)).toFixed(2));
        await wallet.save();

        txn.status = "success";
        if (paymentId) txn.razorpayPaymentId = paymentId;
        const auditTag = verifiedBy === "gateway"
            ? "Verified via Gateway"
            : verifiedBy === "webhook"
                ? "Auto-credited via Razorpay Webhook"
                : "Approved & Credited by Admin";
        txn.note = txn.note ? `${txn.note} • ${auditTag}` : auditTag;
        await txn.save();

        return {
            success: true,
            txn,
            metal: "Wallet",
            creditedAmount: txn.amount,
            newBalance: wallet.balance,
            message: `₹${txn.amount} credited to wallet!`
        };
    }

    throw new Error("Unknown asset or metal type: " + metalType);
}

/**
 * Searches across all collections for a transaction matching a given Razorpay Order ID,
 * and automatically completes & credits it.
 */
async function resolveTransactionByRazorpayOrder(orderId, paymentId, verifiedBy = "gateway") {
    if (!orderId) return null;

    // 1. Check Gold
    const goldTxn = await GoldTransaction.findOne({ razorpayOrderId: orderId });
    if (goldTxn) {
        return creditAndCompleteTransaction("Gold", goldTxn._id, { paymentId, verifiedBy });
    }

    // 2. Check Silver
    const silverTxn = await SilverTransaction.findOne({ razorpayOrderId: orderId });
    if (silverTxn) {
        return creditAndCompleteTransaction("Silver", silverTxn._id, { paymentId, verifiedBy });
    }

    // 3. Check Copper
    const copperTxn = await CopperTransaction.findOne({ razorpayOrderId: orderId });
    if (copperTxn) {
        return creditAndCompleteTransaction("Copper", copperTxn._id, { paymentId, verifiedBy });
    }

    // 4. Check Property Investment
    const inv = await Investment.findOne({ razorpayOrderId: orderId });
    if (inv) {
        return creditAndCompleteTransaction("Property", inv._id, { paymentId, verifiedBy });
    }

    // 5. Check Wallet
    const walletTxn = await WalletTxn.findOne({ razorpayOrderId: orderId });
    if (walletTxn) {
        return creditAndCompleteTransaction("Wallet", walletTxn._id, { paymentId, verifiedBy });
    }

    return null;
}

module.exports = {
    creditAndCompleteTransaction,
    resolveTransactionByRazorpayOrder,
};
