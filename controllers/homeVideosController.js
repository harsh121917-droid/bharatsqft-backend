const HomeVideo = require("../models/HomeVideo");

// ── GET /api/home-videos (Public for App) ────────────────────────────────────
exports.getActiveHomeVideos = async (req, res, next) => {
    try {
        const videos = await HomeVideo.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
        return res.json({
            success: true,
            count: videos.length,
            data: videos,
        });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/home-videos/admin (Admin Panel) ─────────────────────────────────
exports.getAllHomeVideos = async (req, res, next) => {
    try {
        const videos = await HomeVideo.find().sort({ order: 1, createdAt: -1 });
        return res.json({
            success: true,
            count: videos.length,
            data: videos,
        });
    } catch (err) {
        next(err);
    }
};

// ── POST /api/home-videos/admin (Create) ─────────────────────────────────────
exports.createHomeVideo = async (req, res, next) => {
    try {
        const { title, subtitle, youtubeUrl, thumbnailUrl, order, isActive } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: "Video title is required" });
        }
        if (!youtubeUrl || !youtubeUrl.trim()) {
            return res.status(400).json({ success: false, message: "YouTube URL or Video ID is required" });
        }

        const videoId = HomeVideo.extractVideoId(youtubeUrl);
        if (!videoId || videoId.length < 5) {
            return res.status(400).json({ success: false, message: "Invalid YouTube URL or Video ID" });
        }

        // Determine order
        let newOrder = Number(order);
        if (isNaN(newOrder)) {
            const last = await HomeVideo.findOne().sort({ order: -1 });
            newOrder = last ? (last.order || 0) + 1 : 0;
        }

        const thumb = (thumbnailUrl && thumbnailUrl.trim().length > 0)
            ? thumbnailUrl.trim()
            : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const video = await HomeVideo.create({
            title: title.trim(),
            subtitle: subtitle ? subtitle.trim() : "",
            youtubeUrl: youtubeUrl.trim(),
            youtubeVideoId: videoId,
            thumbnailUrl: thumb,
            order: newOrder,
            isActive: isActive !== false,
        });

        return res.status(201).json({
            success: true,
            message: "Home YouTube video added successfully",
            data: video,
        });
    } catch (err) {
        next(err);
    }
};

// ── PUT /api/home-videos/admin/:id (Update) ──────────────────────────────────
exports.updateHomeVideo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, subtitle, youtubeUrl, thumbnailUrl, order, isActive } = req.body;

        const video = await HomeVideo.findById(id);
        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found" });
        }

        if (title !== undefined) video.title = title.trim();
        if (subtitle !== undefined) video.subtitle = subtitle.trim();

        if (youtubeUrl !== undefined && youtubeUrl.trim().length > 0) {
            video.youtubeUrl = youtubeUrl.trim();
            video.youtubeVideoId = HomeVideo.extractVideoId(youtubeUrl);
        }

        if (thumbnailUrl !== undefined) {
            video.thumbnailUrl = thumbnailUrl.trim().length > 0
                ? thumbnailUrl.trim()
                : `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;
        }

        if (order !== undefined && !isNaN(Number(order))) {
            video.order = Number(order);
        }

        if (isActive !== undefined) {
            video.isActive = Boolean(isActive);
        }

        await video.save();

        return res.json({
            success: true,
            message: "Home YouTube video updated successfully",
            data: video,
        });
    } catch (err) {
        next(err);
    }
};

// ── DELETE /api/home-videos/admin/:id (Delete) ───────────────────────────────
exports.deleteHomeVideo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const video = await HomeVideo.findByIdAndDelete(id);
        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found" });
        }

        return res.json({
            success: true,
            message: "Home YouTube video deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};

// ── PUT /api/home-videos/admin/reorder (Batch Reorder) ────────────────────────
exports.reorderHomeVideos = async (req, res, next) => {
    try {
        const { orders } = req.body; // Array of { id, order }
        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ success: false, message: "orders array is required" });
        }

        const bulkOps = orders.map((item, idx) => ({
            updateOne: {
                filter: { _id: item.id },
                update: { order: item.order !== undefined ? Number(item.order) : idx },
            },
        }));

        await HomeVideo.bulkWrite(bulkOps);

        const updated = await HomeVideo.find().sort({ order: 1, createdAt: -1 });

        return res.json({
            success: true,
            message: "Videos reordered successfully",
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};
