const mongoose = require("mongoose");

const CoinSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true }, // e.g. VIKA-GOLD-COIN-001
        metal: { type: String, enum: ["gold", "silver"], required: true },
        purity: { type: String, default: "24K 999 Purity" },
        category: { type: String, default: "Coins & Bars" },
        grams: { type: Number, required: true },
        price: { type: Number, default: 0 }, // Optional Direct Selling / Retail Price in ₹
        priceAdjustment: { type: Number, default: 0 }, // Admin Price Adjustment in ₹ (+/- or 0)
        makingChargePct: { type: Number, required: true, default: 5 },
        image: { type: String, default: "" }, // Cloudinary URL
        imageUrl: { type: String, default: "" }, // Primary image URL compatibility
        images: { type: [String], default: [] }, // Multi-image gallery
        
        // Inventory & Stock Tracking
        availableQty: { type: Number, default: 50, min: 0 },
        reservedQty: { type: Number, default: 0, min: 0 },
        soldQty: { type: Number, default: 0, min: 0 },
        lowStockThreshold: { type: Number, default: 10, min: 0 },
        
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Coin", CoinSchema);
