const express = require("express");
const router = express.Router();
const {
    uploadPropertyImages,
    deletePropertyImage,
    setCoverImage,
    uploadPropertyDocument,
    deletePropertyDocument,
    uploadValuationReport,
    deleteValuationReport,
} = require("../controllers/uploadController");
const { uploadSingleImage, uploadJewelleryImages, uploadDoc } = require("../middleware/uploadMiddleware");
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

// Standalone PDF/Document upload
router.post("/document", uploadDoc, (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No document file uploaded" });
    res.json({
        success: true,
        url: req.file.path,
        filename: req.file.originalname,
        size: req.file.size
    });
});

// Property Images
router.post("/:id/images", uploadPropertyImages);
router.delete("/:id/images/:imageId", deletePropertyImage);
router.patch("/:id/images/cover", setCoverImage);

// Property Documents & Valuation Report
router.post("/:id/documents", uploadPropertyDocument);
router.delete("/:id/documents/:docId", deletePropertyDocument);
router.post("/:id/valuation-report", uploadValuationReport);
router.delete("/:id/valuation-report", deleteValuationReport);

module.exports = router;