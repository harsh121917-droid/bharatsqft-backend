const express = require("express");
const router = express.Router();
const {
    getGateways, upsertGateway, updateGateway, toggleGateway, deleteGateway, setDefaultGateway,
} = require("../controllers/paymentGatewayController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/", getGateways);
router.post("/", upsertGateway);
router.put("/:id", updateGateway);
router.patch("/:id/toggle", toggleGateway);
router.patch("/:id/set-default", setDefaultGateway);
router.delete("/:id", deleteGateway);

module.exports = router;
