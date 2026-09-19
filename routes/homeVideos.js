const express = require("express");
const router = express.Router();
const {
    getActiveHomeVideos,
    getAllHomeVideos,
    createHomeVideo,
    updateHomeVideo,
    deleteHomeVideo,
    reorderHomeVideos,
} = require("../controllers/homeVideosController");
const { protect, authorize } = require("../middleware/authMiddleware");

// ── Public Routes (Mobile App) ──────────────────────────────────────────────
router.get("/", getActiveHomeVideos);

// ── Admin Routes (Support both /admin and direct paths) ──────────────────────
router.get("/admin", protect, authorize("admin"), getAllHomeVideos);
router.get("/all", protect, authorize("admin"), getAllHomeVideos);

router.post("/admin", protect, authorize("admin"), createHomeVideo);
router.post("/", protect, authorize("admin"), createHomeVideo);

router.put("/admin/reorder", protect, authorize("admin"), reorderHomeVideos);
router.put("/reorder", protect, authorize("admin"), reorderHomeVideos);

router.put("/admin/:id", protect, authorize("admin"), updateHomeVideo);
router.put("/:id", protect, authorize("admin"), updateHomeVideo);

router.delete("/admin/:id", protect, authorize("admin"), deleteHomeVideo);
router.delete("/:id", protect, authorize("admin"), deleteHomeVideo);

module.exports = router;
