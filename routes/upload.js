const express = require("express");
const router = express.Router();
const { uploadPropertyImages, deletePropertyImage, setCoverImage } = require("../controllers/uploadController");
const { uploadSingleImage, uploadJewelleryImages } = require("../middleware/uploadMiddleware");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Multiple images upload (up to 10)
router.post("/multiple", uploadJewelleryImages, (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: "No files uploaded" });
    const urls = req.files.map(f => f.path);
    res.json({ success: true, urls });
});

// Single image upload
router.post("/single", uploadSingleImage, (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    res.json({ success: true, url: req.file.path });
});

// Alias for single image upload
router.post("/image", uploadSingleImage, (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    res.json({ success: true, url: req.file.path });
});

// Property Images
router.post("/:id/images", uploadPropertyImages);
router.delete("/:id/images/:imageId", deletePropertyImage);
router.patch("/:id/images/cover", setCoverImage);

module.exports = router;