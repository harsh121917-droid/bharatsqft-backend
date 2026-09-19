const mongoose = require("mongoose");

const HomeVideoSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Video title is required"],
            trim: true,
            maxlength: [150, "Title max 150 chars"],
        },
        subtitle: {
            type: String,
            trim: true,
            default: "",
            maxlength: [250, "Subtitle max 250 chars"],
        },
        youtubeUrl: {
            type: String,
            required: [true, "YouTube URL or Video ID is required"],
            trim: true,
        },
        youtubeVideoId: {
            type: String,
            required: [true, "YouTube Video ID is required"],
            trim: true,
        },
        thumbnailUrl: {
            type: String,
            trim: true,
            default: "",
        },
        order: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Helper to extract YouTube Video ID from any standard URL or ID
HomeVideoSchema.statics.extractVideoId = function (urlOrId) {
    if (!urlOrId || typeof urlOrId !== "string") return "";
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = trimmed.match(regExp);
    return (match && match[2].length === 11) ? match[2] : trimmed;
};

module.exports = mongoose.model("HomeVideo", HomeVideoSchema);
