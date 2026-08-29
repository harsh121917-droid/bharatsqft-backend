const express = require("express");
const router = express.Router();
const {
  getAllUsers, getUserById, updateUser, deleteUser, clearUserLocation,
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
} = require("../controllers/adminController");
const {
  getAllProperties, getPropertyById,
  createProperty, updateProperty,
  deleteProperty, toggleStatus,
} = require("../controllers/propertyController");
const { getAllInvestments } = require("../controllers/paymentController");
const { getAllKyc, getKycById, reviewKyc } = require("../controllers/kycController");
const { enrollmentDetail } = require("../controllers/schemeController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Dashboard
router.get("/dashboard", getDashboard);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.get("/users/:id/wallet-ledger", getUserWalletLedger);
router.post("/users/:id/add-money", addWalletMoney);
router.post("/users/:id/deduct-money", deductWalletMoney);
router.post("/users/:id/recalculate-vault", recalculateVaultBalance);
router.post("/users/:id/reset-vault", resetUserVault);
router.post("/users/:id/reset-wallet", resetUserWallet);
router.post("/users/:id/reset-rewards", resetUserRewards);
router.post("/users/:id/reset-all", resetAllUserData);
router.patch("/users/:id", updateUser);
router.delete("/users/:id/location", clearUserLocation);
router.delete("/users/:id", deleteUser);

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

// Investments
router.get("/investments", getAllInvestments);

// KYC
router.get("/kyc", getAllKyc);
router.get("/kyc/:id", getKycById);
router.patch("/kyc/:id", reviewKyc);

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

module.exports = router;