const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

router.patch("/profile", protect, async (req, res, next) => {
  try {
    const allowed = ["name", "phone"];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

module.exports = router;