const express = require("express");
const router = express.Router();
const {
    getMySavings,
    createSaving,
    deposit,
    updateSaving,
    deleteSaving,
    getHistory,
} = require("../controllers/savingController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all savings routes require login

router.route("/")
    .get(getMySavings)
    .post(createSaving);

router.route("/:id")
    .patch(updateSaving)
    .delete(deleteSaving);

router.get("/:id/history", getHistory);
router.post("/:id/deposit", deposit);

module.exports = router;