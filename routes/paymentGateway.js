const express = require("express");
const router = express.Router();
const {
    getGateways, upsertGateway, deleteGateway, setDefaultGateway,
} = require("../controllers/paymentGatewayController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/", getGateways);
router.post("/", upsertGateway);
router.delete("/:id", deleteGateway);
router.patch("/:id/set-default", setDefaultGateway);

module.exports = router;
// Add to server.js: app.use("/api/admin/payment-gateways", require("./routes/paymentGateway"));