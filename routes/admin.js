const express = require("express");
const router = express.Router();
const {
  getAllUsers, getUserById, updateUser, deleteUser,
  getAllEnquiries, updateEnquiry, deleteEnquiry,
  getDashboard,
  getWithdrawals, completeWithdrawal,
  getSellApprovals, approveSellPayout,
  getSchemeEnrollments,
  getRewardSettings,
  updateRewardSettings,
  getAllRewardHistory,
  getAdminCoins, createCoin, updateCoin, deleteCoin,
  getAppConfig, updateAppConfig,
  getJewelleryOrders, updateJewelleryOrder,
  addWalletMoney,
  recalculateVaultBalance,
} = require("../controllers/adminController");
const {
  getAllProperties, getPropertyById,
  createProperty, updateProperty,
  deleteProperty, toggleStatus,
} = require("../controllers/propertyController");
const { getAllInvestments } = require("../controllers/paymentController");
const { getAllKyc, getKycById, reviewKyc } = require("../controllers/kycController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Dashboard
router.get("/dashboard", getDashboard);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.post("/users/:id/add-money", addWalletMoney);
router.post("/users/:id/recalculate-vault", recalculateVaultBalance);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

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

// Sell Payout Approvals (gold + silver)
router.get("/sell-approvals", getSellApprovals);
router.patch("/sell-approvals/:id/approve", approveSellPayout);

// Gold Scheme Enrollments
router.get("/schemes/enrollments", getSchemeEnrollments);

// Reward Points System
router.get("/rewards/settings", getRewardSettings);
router.post("/rewards/settings", updateRewardSettings);
router.get("/rewards/history", getAllRewardHistory);

// Coin Catalog Management
router.get("/coins", getAdminCoins);
router.post("/coins", createCoin);
router.put("/coins/:id", updateCoin);
router.delete("/coins/:id", deleteCoin);
// App Version Configuration Management
router.get("/app-config", getAppConfig);
router.post("/app-config", updateAppConfig);

// Jewellery Order Management
router.get("/jewellery-orders", getJewelleryOrders);
router.put("/jewellery-orders/:id", updateJewelleryOrder);

module.exports = router;