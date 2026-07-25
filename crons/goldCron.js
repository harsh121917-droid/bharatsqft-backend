// goldCron.js — place in /crons/goldCron.js
// Run: npm install node-cron  then require this in server.js
// server.js: require("./crons/goldCron");

const cron = require("node-cron");
const { Wallet, WalletTxn } = require("../models/Wallet");
const { GoldBalance, GoldTransaction } = require("../models/Gold");
const { SilverBalance, SilverTransaction } = require("../models/Silver");

// ── Release pending sell payouts every 5 minutes ─────────────────────────────
// Finds gold sells older than 24h still in "processing" → credits wallet
cron.schedule("*/5 * * * *", async () => {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

        const pendingSells = await GoldTransaction.find({
            type: "sell",
            status: "processing",
            createdAt: { $lte: cutoff },
        });

        for (const txn of pendingSells) {
            try {
                const [goldBal, wallet] = await Promise.all([
                    GoldBalance.findOne({ user: txn.user }),
                    Wallet.findOne({ user: txn.user }),
                ]);
                if (!goldBal || !wallet) continue;

                // Deduct gold
                goldBal.totalGrams = parseFloat((goldBal.totalGrams - txn.grams).toFixed(6));
                goldBal.lockedGrams = parseFloat((goldBal.lockedGrams - txn.grams).toFixed(6));
                goldBal.investedAmt = parseFloat(Math.max(0, goldBal.investedAmt - txn.goldValue * 0.9).toFixed(2));
                await goldBal.save();

                // Move pendingCredit → balance (this was never held from balance,
                // it's the sell payout finally landing)
                const balBefore = wallet.balance;
                wallet.balance = parseFloat((wallet.balance + txn.totalAmt).toFixed(2));
                wallet.pendingCredit = parseFloat((wallet.pendingCredit - txn.totalAmt).toFixed(2));
                await wallet.save();

                // Mark gold txn success
                txn.status = "success";
                txn.payoutStatus = "wallet_credited";
                await txn.save();

                // Update wallet txn record
                await WalletTxn.findOneAndUpdate(
                    { goldTxnId: txn._id },
                    {
                        status: "success", balanceAfter: wallet.balance,
                        note: `₹${txn.totalAmt} credited to wallet from gold sale`
                    }
                );

                console.log(`✅ [CRON] Gold sell released: ${txn.grams}g → ₹${txn.totalAmt} for user ${txn.user}`);
            } catch (e) {
                console.error(`❌ [CRON] Gold sell release error for txn ${txn._id}:`, e.message);
            }
        }
    } catch (e) {
        console.error("❌ [CRON] goldCron error:", e.message);
    }
});

// ── Release pending SILVER sell payouts every 5 minutes ──────────────────────
cron.schedule("*/5 * * * *", async () => {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const pendingSells = await SilverTransaction.find({
            type: "sell",
            status: "processing",
            createdAt: { $lte: cutoff },
        });

        for (const txn of pendingSells) {
            try {
                const [silverBal, wallet] = await Promise.all([
                    SilverBalance.findOne({ user: txn.user }),
                    Wallet.findOne({ user: txn.user }),
                ]);
                if (!silverBal || !wallet) continue;

                silverBal.totalGrams = parseFloat((silverBal.totalGrams - txn.grams).toFixed(6));
                silverBal.lockedGrams = parseFloat((silverBal.lockedGrams - txn.grams).toFixed(6));
                silverBal.investedAmt = parseFloat(Math.max(0, silverBal.investedAmt - txn.silverValue * 0.9).toFixed(2));
                await silverBal.save();

                const balBefore = wallet.balance;
                wallet.balance = parseFloat((wallet.balance + txn.totalAmt).toFixed(2));
                wallet.pendingCredit = parseFloat((wallet.pendingCredit - txn.totalAmt).toFixed(2));
                await wallet.save();

                txn.status = "success";
                await txn.save();

                await WalletTxn.findOneAndUpdate(
                    { silverTxnId: txn._id },
                    {
                        status: "success", balanceAfter: wallet.balance,
                        note: `₹${txn.totalAmt} credited to wallet from silver sale`
                    }
                );

                console.log(`✅ [CRON] Silver sell released: ${txn.grams}g → ₹${txn.totalAmt} for user ${txn.user}`);
            } catch (e) {
                console.error(`❌ [CRON] Silver sell release error for txn ${txn._id}:`, e.message);
            }
        }
    } catch (e) {
        console.error("❌ [CRON] silverCron error:", e.message);
    }
});

// ── Release pending withdrawals every 5 minutes ───────────────────────────────
cron.schedule("*/5 * * * *", async () => {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const pendingWithdrawals = await WalletTxn.find({
            type: "withdraw",
            status: "pending",
            createdAt: { $lte: cutoff },
        });

        for (const wtxn of pendingWithdrawals) {
            try {
                const wallet = await Wallet.findOne({ user: wtxn.user });
                if (!wallet) continue;

                const balBefore = wallet.balance;
                wallet.balance = parseFloat((wallet.balance - wtxn.amount).toFixed(2));
                wallet.lockedBalance = parseFloat((wallet.lockedBalance - wtxn.amount).toFixed(2));
                wallet.totalWithdrawn = parseFloat((wallet.totalWithdrawn + wtxn.amount).toFixed(2));
                await wallet.save();

                wtxn.status = "success";
                wtxn.balanceAfter = wallet.balance;
                wtxn.note = `₹${wtxn.amount} withdrawn to bank`;
                await wtxn.save();

                console.log(`✅ [CRON] Withdrawal released: ₹${wtxn.amount} for user ${wtxn.user}`);
            } catch (e) {
                console.error(`❌ [CRON] Withdrawal error for ${wtxn._id}:`, e.message);
            }
        }
    } catch (e) {
        console.error("❌ [CRON] withdrawalCron error:", e.message);
    }
});

// ── Refresh gold rate cache every 10 minutes ──────────────────────────────────
cron.schedule("*/10 * * * *", async () => {
    try {
        const { fetchLiveRates } = require("../controllers/goldController");
        await fetchLiveRates();
        console.log("🔄 [CRON] Gold rate refreshed");
    } catch (e) {
        console.error("❌ [CRON] Rate refresh error:", e.message);
    }
});

console.log("⏰ Gold crons started (sell release · withdrawal · rate refresh)");