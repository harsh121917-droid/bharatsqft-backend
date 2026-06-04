const Property = require("../models/Property");
const cloudinary = require("../config/cloudinary");
const { uploadImages, uploadVideo, uploadDoc } = require("../middleware/uploadMiddleware");

/* ── Upload Images ── */
exports.uploadPropertyImages = (req, res) => {
    uploadImages(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        if (err) {
            console.error('Upload error:', err); // add this
            return res.status(400).json({ success: false, message: err.message || err.toString() });
        }
        try {
            const property = await Property.findById(req.params.id);
            if (!property) return res.status(404).json({ success: false, message: "Property not found" });

            const newImages = req.files.map(f => ({
                url: f.path,
                caption: req.body.caption || "",
            }));

            property.images.push(...newImages);
            await property.save();

            res.json({ success: true, images: property.images, message: `${req.files.length} image(s) uploaded` });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

/* ── Delete Image ── */
exports.deletePropertyImage = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        const image = property.images.id(req.params.imageId);
        if (!image) return res.status(404).json({ success: false, message: "Image not found" });

        // delete from cloudinary
        const publicId = image.url.split("/").slice(-2).join("/").split(".")[0];
        await cloudinary.uploader.destroy(`bharatsqft/properties/${publicId.split("/").pop()}`);

        property.images.pull(req.params.imageId);
        await property.save();

        res.json({ success: true, message: "Image deleted", images: property.images });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

/* ── Set Cover Image ── */
exports.setCoverImage = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        const { imageId } = req.body;
        const idx = property.images.findIndex(i => i._id.toString() === imageId);
        if (idx === -1) return res.status(404).json({ success: false, message: "Image not found" });

        // move selected image to index 0 (cover)
        const [cover] = property.images.splice(idx, 1);
        property.images.unshift(cover);
        await property.save();

        res.json({ success: true, message: "Cover image set", images: property.images });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });

    }
};