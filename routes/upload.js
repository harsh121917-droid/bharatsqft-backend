const express = require("express");
const router = express.Router();
const { uploadPropertyImages, deletePropertyImage, setCoverImage } = require("../controllers/uploadController");
const { uploadSingleImage } = require("../middleware/uploadMiddleware");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Single image upload
router.post("/single", uploadSingleImage, (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    res.json({ success: true, url: req.file.path });
});

// Property Images
router.post("/:id/images", uploadPropertyImages);
router.delete("/:id/images/:imageId", deletePropertyImage);
router.patch("/:id/images/cover", setCoverImage);

module.exports = router;