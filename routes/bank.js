const express = require("express");
const router = express.Router();
const { getAccounts, addAccount, setDefault, deleteAccount, getIfscDetails, verifyBankAccount } = require("../controllers/bankController");
const { protect } = require("../middleware/authMiddleware");

// Public IFSC registry lookup
router.get("/ifsc/:code", getIfscDetails);

router.use(protect);
router.get("/", getAccounts);
router.post("/verify", verifyBankAccount);
router.post("/", addAccount);
router.put("/:id/default", setDefault);
router.delete("/:id", deleteAccount);

module.exports = router;
// Add to server.js: app.use("/api/bank", require("./routes/bank"));