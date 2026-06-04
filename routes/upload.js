const express = require("express");
const router = express.Router();
const { uploadPropertyImages, deletePropertyImage, setCoverImage } = require("../controllers/uploadController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Images
router.post("/:id/images", uploadPropertyImages);
router.delete("/:id/images/:imageId", deletePropertyImage);
router.patch("/:id/images/cover", setCoverImage);

module.exports = router;