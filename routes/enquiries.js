const express = require("express");
const router  = express.Router();
const { createEnquiry, getMyEnquiries } = require("../controllers/enquiryController");
const { protect } = require("../middleware/authMiddleware");

router.post("/",  createEnquiry);
router.get("/my", protect, getMyEnquiries);

module.exports = router;