const express = require("express");
const router = express.Router();
const { getAccounts, addAccount, setDefault, deleteAccount } = require("../controllers/bankController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);
router.get("/", getAccounts);
router.post("/", addAccount);
router.put("/:id/default", setDefault);
router.delete("/:id", deleteAccount);

module.exports = router;
// Add to server.js: app.use("/api/bank", require("./routes/bank"));