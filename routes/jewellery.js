const express = require("express");
const router = express.Router();
const jewelleryController = require("../controllers/jewelleryController");
const { protect } = require("../middleware/authMiddleware");

// Public / User routes
router.get("/categories", jewelleryController.getCategories);
router.get("/products", jewelleryController.getProducts);

// Redeem & Order routes (Requires Auth)
router.post("/redeem/initiate", protect, jewelleryController.initiateRedeemOrder);
router.post("/redeem/verify", protect, jewelleryController.verifyRedeemOrder);
router.get("/my-orders", protect, jewelleryController.getMyOrders);
router.get("/my-orders/:id", protect, jewelleryController.getOrderById);

// Admin routes
router.post("/categories", protect, jewelleryController.addCategory);
router.delete("/categories/:id", protect, jewelleryController.deleteCategory);
router.post("/products", protect, jewelleryController.addProduct);
router.put("/products/:id", protect, jewelleryController.updateProduct);
router.delete("/products/:id", protect, jewelleryController.deleteProduct);

// Image upload route (multipart/form-data, field: "image")
router.post("/products/:id/upload-image", protect, jewelleryController.uploadProductImage);
router.post("/upload-images", protect, jewelleryController.uploadMultipleImages);

module.exports = router;

