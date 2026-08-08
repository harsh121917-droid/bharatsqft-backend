const express = require("express");
const router = express.Router();
const jewelleryController = require("../controllers/jewelleryController");
const { protect } = require("../middleware/authMiddleware");

// Public / User routes
router.get("/categories", jewelleryController.getCategories);
router.get("/products", jewelleryController.getProducts);

// Redeem routes (Requires Auth)
router.post("/redeem/initiate", protect, jewelleryController.initiateRedeemOrder);
router.post("/redeem/verify", protect, jewelleryController.verifyRedeemOrder);

// Admin routes
router.post("/categories", protect, jewelleryController.addCategory);
router.delete("/categories/:id", protect, jewelleryController.deleteCategory);
router.post("/products", protect, jewelleryController.addProduct);
router.put("/products/:id", protect, jewelleryController.updateProduct);
router.delete("/products/:id", protect, jewelleryController.deleteProduct);

module.exports = router;
