const express = require("express");
const router = express.Router();
const jewelleryController = require("../controllers/jewelleryController");
const auth = require("../middleware/auth");

// Public / User routes
router.get("/categories", jewelleryController.getCategories);
router.get("/products", jewelleryController.getProducts);

// Redeem routes (Requires Auth)
router.post("/redeem/initiate", auth, jewelleryController.initiateRedeemOrder);
router.post("/redeem/verify", auth, jewelleryController.verifyRedeemOrder);

// Admin routes
router.post("/categories", auth, jewelleryController.addCategory);
router.delete("/categories/:id", auth, jewelleryController.deleteCategory);
router.post("/products", auth, jewelleryController.addProduct);
router.put("/products/:id", auth, jewelleryController.updateProduct);
router.delete("/products/:id", auth, jewelleryController.deleteProduct);

module.exports = router;
