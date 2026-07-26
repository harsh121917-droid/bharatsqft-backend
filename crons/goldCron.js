// goldCron.js — place in /crons/goldCron.js
// Run: npm install node-cron  then require this in server.js
// server.js: require("./crons/goldCron");

const cron = require("node-cron");
const { Wallet, WalletTxn } = require("../models/Wallet");

// NOTE: Gold/Silver sell payouts are NO LONGER auto-released by a cron job.
// They now require manual admin approval (see adminController.approveSellPayout)
// before the pendingCredit becomes available balance. See routes/admin.js
// → GET /api/admin/sell-approvals, PATCH /api/admin/sell-approvals/:id/approve

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

console.log("⏰ Crons started (withdrawal release · rate refresh) — sell payouts now require manual admin approval");