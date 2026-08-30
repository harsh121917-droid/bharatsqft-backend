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

// ── Automated Daily Scheme & SIP Early Due Reminders (Runs Daily at 9:00 AM) ──
cron.schedule("0 9 * * *", async () => {
    try {
        console.log("⏰ [CRON] Starting Daily Scheme & SIP Due Reminders Sweep...");
        const { sendBulkSchemeReminders } = require("../controllers/schemeController");
        const { sendBulkSipReminders } = require("../controllers/sipController");

        // Mock req/res for cron execution
        const mockReq = { user: { name: "Payvika Automated Reminder System" } };
        const mockRes = { json: (data) => console.log("🔔 [CRON Sweep Result]:", data.message || data) };
        const mockNext = (err) => console.error("❌ [CRON Sweep Error]:", err);

        await sendBulkSchemeReminders(mockReq, mockRes, mockNext);
        await sendBulkSipReminders(mockReq, mockRes, mockNext);
        console.log("✅ [CRON] Daily Scheme & SIP reminders sweep completed successfully.");
    } catch (e) {
        console.error("❌ [CRON] Daily reminder error:", e.message);
    }
});

console.log("⏰ Crons started (withdrawal release · rate refresh · daily Scheme & SIP installment reminders)");