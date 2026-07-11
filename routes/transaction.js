const express = require("express");
const router = express.Router();
const { getMyTransactions, getTransaction } = require("../controllers/transactionController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);
router.get("/", getMyTransactions);
router.get("/:id", getTransaction);

module.exports = router;
// Add to server.js: app.use("/api/transactions", require("./routes/transaction"));