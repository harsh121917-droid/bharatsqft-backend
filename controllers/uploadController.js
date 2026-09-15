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

/* ── Upload Property Document (PDF) ── */
exports.uploadPropertyDocument = (req, res) => {
    uploadDoc(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || "Document upload failed" });
        try {
            const property = await Property.findById(req.params.id);
            if (!property) return res.status(404).json({ success: false, message: "Property not found" });

            if (!req.file) return res.status(400).json({ success: false, message: "No document file uploaded" });

            const title = req.body.title || req.file.originalname || "Property Document";
            const type = req.body.type || "legal";

            const newDoc = {
                url: req.file.path,
                title,
                type,
                uploadedAt: new Date()
            };

            property.documents.push(newDoc);
            await property.save();

            res.json({
                success: true,
                message: "Document uploaded successfully",
                documents: property.documents,
                document: newDoc
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

/* ── Delete Property Document ── */
exports.deletePropertyDocument = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        const doc = property.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

        if (property.valuationReportUrl === doc.url) {
            property.valuationReportUrl = "";
        }

        property.documents.pull(req.params.docId);
        await property.save();

        res.json({ success: true, message: "Document deleted", documents: property.documents });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

/* ── Upload Valuation Report PDF ── */
exports.uploadValuationReport = (req, res) => {
    uploadDoc(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || "Valuation report upload failed" });
        try {
            const property = await Property.findById(req.params.id);
            if (!property) return res.status(404).json({ success: false, message: "Property not found" });

            if (!req.file) return res.status(400).json({ success: false, message: "No document file uploaded" });

            property.valuationReportUrl = req.file.path;
            if (req.body.title) {
                property.valuationReportTitle = req.body.title;
            }

            // Also keep a copy in documents array
            const existingIdx = property.documents.findIndex(d => d.type === "valuation");
            const valuationDoc = {
                url: req.file.path,
                title: property.valuationReportTitle || "Valuation & Audit Report",
                type: "valuation",
                uploadedAt: new Date()
            };
            if (existingIdx !== -1) {
                property.documents[existingIdx] = valuationDoc;
            } else {
                property.documents.push(valuationDoc);
            }

            await property.save();

            res.json({
                success: true,
                message: "Valuation report uploaded successfully",
                valuationReportUrl: property.valuationReportUrl,
                valuationReportTitle: property.valuationReportTitle,
                documents: property.documents
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

/* ── Delete Valuation Report ── */
exports.deleteValuationReport = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ success: false, message: "Property not found" });

        property.valuationReportUrl = "";
        property.documents = property.documents.filter(d => d.type !== "valuation");
        await property.save();

        res.json({ success: true, message: "Valuation report removed", valuationReportUrl: "" });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};