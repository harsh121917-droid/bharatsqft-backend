const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/* ── Property Images ── */
const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/properties",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ width: 1200, height: 800, crop: "limit", quality: "auto" }],
    },
});

/* ── Property Videos ── */
const videoStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/videos",
        resource_type: "video",
        allowed_formats: ["mp4", "mov", "avi", "webm"],
    },
});

/* ── Property Documents (PDF) ── */
const docStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/documents",
        resource_type: "raw",
        allowed_formats: ["pdf", "doc", "docx"],
    },
});

const uploadImages = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
}).array("images", 20); // max 20 images

const uploadVideo = multer({
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
}).single("video");

const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).single("document");

module.exports = { uploadImages, uploadVideo, uploadDoc };