const express = require("express");
const router = express.Router();
const {
  getAllUsers, getUserById, getUserTransactions, updateUser, deleteUser, clearUserLocation,
  getAllEnquiries, updateEnquiry, deleteEnquiry,
  getDashboard,
  getWithdrawals, completeWithdrawal,
  getSellApprovals, approveSellPayout,
  getSellSettings, updateSellSettings,
  getSchemeEnrollments,
  getRewardSettings,
  updateRewardSettings,
  runRewardExpiryCheck,
  getAllRewardHistory,
  getAdminReferrals,
  getAdminRewardsSummary,
  getAdminCoins, createCoin, updateCoin, deleteCoin, uploadCoinImage,
  getAppConfig, updateAppConfig,
  getJewelleryOrders, updateJewelleryOrder,
  getInventory, updateInventoryStock, backfillInventorySkus,
  addWalletMoney,
  deductWalletMoney,
  getWalletLedger,
  getUserWalletLedger,
  recalculateVaultBalance,
  resetUserVault,
  resetUserWallet,
  resetUserRewards,
  resetAllUserData,
  verifyTransactionWithGateway,
  manuallyApproveTransaction,
  manuallyRejectTransaction,
  syncUserPendingPayments,
} = require("../controllers/adminController");
const {
  getAllProperties, getPropertyById,
  createProperty, updateProperty,
  deleteProperty, toggleStatus,
} = require("../controllers/propertyController");
const { getAllInvestments } = require("../controllers/paymentController");
const { getAllKyc, getKycById, reviewKyc, reviewSoldierKyc } = require("../controllers/kycController");
const { enrollmentDetail } = require("../controllers/schemeController");
const {
  getAllHomeVideos,
  createHomeVideo,
  updateHomeVideo,
  deleteHomeVideo,
  reorderHomeVideos,
} = require("../controllers/homeVideosController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Dashboard
router.get("/dashboard", getDashboard);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.get("/users/:id/transactions", getUserTransactions);
router.get("/users/:id/wallet-ledger", getUserWalletLedger);
router.post("/users/:id/add-money", addWalletMoney);
router.post("/users/:id/deduct-money", deductWalletMoney);
router.post("/users/:id/recalculate-vault", recalculateVaultBalance);
router.post("/users/:id/reset-vault", resetUserVault);
router.post("/users/:id/reset-wallet", resetUserWallet);
router.post("/users/:id/reset-rewards", resetUserRewards);
router.post("/users/:id/reset-all", resetAllUserData);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Payment Resolution & Verification Routes
router.post("/users/:id/sync-payments", syncUserPendingPayments);
router.post("/transactions/:metal/:id/verify", verifyTransactionWithGateway);
router.post("/transactions/:metal/:id/approve", manuallyApproveTransaction);
router.post("/transactions/:metal/:id/reject", manuallyRejectTransaction);

// Wallet Transaction Ledger & Audit Trail
router.get("/wallet-ledger", getWalletLedger);

// Enquiries
router.get("/enquiries", getAllEnquiries);
router.patch("/enquiries/:id", updateEnquiry);
router.delete("/enquiries/:id", deleteEnquiry);

// Properties
router.get("/properties", getAllProperties);
router.get("/properties/:id", getPropertyById);
router.post("/properties", createProperty);
router.put("/properties/:id", updateProperty);
router.delete("/properties/:id", deleteProperty);
router.patch("/properties/:id/toggle", toggleStatus);

// Home YouTube Videos
router.get("/home-videos", getAllHomeVideos);
router.get("/home-videos/admin", getAllHomeVideos);
router.post("/home-videos", createHomeVideo);
router.post("/home-videos/admin", createHomeVideo);
router.put("/home-videos/reorder", reorderHomeVideos);
router.put("/home-videos/admin/reorder", reorderHomeVideos);
router.put("/home-videos/:id", updateHomeVideo);
router.put("/home-videos/admin/:id", updateHomeVideo);
router.delete("/home-videos/:id", deleteHomeVideo);
router.delete("/home-videos/admin/:id", deleteHomeVideo);

// Investments
router.get("/investments", getAllInvestments);

// KYC
router.get("/kyc", getAllKyc);
router.get("/kyc/:id", getKycById);
router.patch("/kyc/:id", reviewKyc);
router.patch("/kyc/:id/soldier-status", reviewSoldierKyc);

// Withdrawals
router.get("/withdrawals", getWithdrawals);
router.patch("/withdrawals/:id/complete", completeWithdrawal);

// Sell Payout Approvals (gold + silver + copper)
router.get("/sell-approvals", getSellApprovals);
router.patch("/sell-approvals/:id/approve", approveSellPayout);
router.get("/sell-settings", getSellSettings);
router.post("/sell-settings", updateSellSettings);

// Gold Scheme Enrollments
router.get("/schemes/enrollments", getSchemeEnrollments);
router.get("/schemes/enrollments/:id", enrollmentDetail);

// Reward Points & Referral System
router.get("/rewards/settings", getRewardSettings);
router.post("/rewards/settings", updateRewardSettings);
router.post("/rewards/run-expiry-check", runRewardExpiryCheck);
router.get("/rewards/history", getAllRewardHistory);
router.get("/rewards/summary", getAdminRewardsSummary);
router.get("/rewards/referrals", getAdminReferrals);
router.get("/referrals", getAdminReferrals);

// Coin Catalog Management
router.get("/coins", getAdminCoins);
router.post("/coins", createCoin);
router.post("/coins/:id/upload-image", uploadCoinImage);
router.put("/coins/:id", updateCoin);
router.delete("/coins/:id", deleteCoin);
// App Version Configuration Management
router.get("/app-config", getAppConfig);
router.post("/app-config", updateAppConfig);

// Jewellery Order Management
router.get("/jewellery-orders", getJewelleryOrders);
router.put("/jewellery-orders/:id", updateJewelleryOrder);

// Inventory & SKU Management
router.get("/inventory", getInventory);
router.put("/inventory/:type/:id", updateInventoryStock);
router.post("/inventory/backfill-skus", backfillInventorySkus);

// SIP Systematic Investment Plans & Milestones Management
const sipController = require("../controllers/sipController");
router.get("/sips", sipController.getAdminSips);
router.get("/sips/summary", sipController.getAdminSipsSummary);
router.get("/sips/:id", sipController.getSipDetail);
router.post("/sips/:id/status", sipController.adminUpdateSipStatus);
router.post("/sips/:id/record-installment", sipController.adminRecordInstallment);
router.post("/sips/:id/remind", sipController.sendSipReminder);
router.post("/sips/remind-all", sipController.sendBulkSipReminders);

// ── Mutual Funds Administration ──
const adminMfController = require("../controllers/adminMfController");
router.get("/mutual-funds/overview", adminMfController.getMfOverview);
router.get("/mutual-funds/users", adminMfController.getMfUsers);
router.get("/mutual-funds/sips", adminMfController.getMfSips);
router.get("/mutual-funds/orders", adminMfController.getMfOrders);
router.post("/mutual-funds/sips/:id/status", adminMfController.updateMfSipStatus);
router.post("/mutual-funds/orders/:id/verify", adminMfController.reconcileMfOrder);
router.delete("/mutual-funds/users/:userId/clean", adminMfController.cleanUserMfData);
router.post("/mutual-funds/users/:userId/clean", adminMfController.cleanUserMfData);
router.post("/mutual-funds/clean-all", adminMfController.cleanAllMfData);

// NSE MFSS Gateway Credentials & Health-Check
router.get("/mutual-funds/nse-config", adminMfController.getNseConfig);
router.post("/mutual-funds/nse-config", adminMfController.updateNseConfig);
router.post("/mutual-funds/nse-health-check", adminMfController.testNseConnection);

// Mandate (eNACH / AutoPay) Management
router.get("/mutual-funds/mandates", adminMfController.getMfMandates);
router.post("/mutual-funds/mandates/:id/status", adminMfController.updateMfMandateStatus);
router.post("/mutual-funds/mandates/:id/resend-link", adminMfController.resendMandateAuthLink);

// Live NSE Exchange Re-Query & Status Sync
router.post("/mutual-funds/orders/:id/sync-nse", adminMfController.syncOrderWithNse);
router.post("/mutual-funds/sips/:id/sync-nse", adminMfController.syncSipWithNse);

module.exports = router;