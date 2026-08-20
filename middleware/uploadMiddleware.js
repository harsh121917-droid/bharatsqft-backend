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

/* ── KYC Documents (PAN / Aadhaar images) ── */
const kycStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/kyc",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
        transformation: [{ width: 1600, height: 1600, crop: "limit", quality: "auto" }],
    },
});

/* ── Jewellery / Coin Product Images ── */
const jewelleryImageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/jewellery",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto:best" }],
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

/* KYC upload — expects 3 files: panImage, aadhaarFront, aadhaarBack */
const uploadKycDocs = multer({
    storage: kycStorage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
}).fields([
    { name: "panImage", maxCount: 1 },
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack", maxCount: 1 },
]);

/* ── General Single Image Upload (useful for coins, avatars, etc) ── */
const singleImageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "bharatsqft/uploads",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ width: 1000, height: 1000, crop: "limit", quality: "auto" }],
    },
});

const uploadSingleImage = multer({
    storage: singleImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("image");

/* ── Jewellery / Coin Product Image Upload ── */
const uploadJewelleryImage = multer({
    storage: jewelleryImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("image");

const uploadJewelleryImages = multer({
    storage: jewelleryImageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).array("images", 10); // allow up to 10 images

module.exports = {
    uploadJewelleryImages, uploadImages, uploadVideo, uploadDoc, uploadKycDocs, uploadSingleImage, uploadJewelleryImage };