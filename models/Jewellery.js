const mongoose = require("mongoose");

const jewellerySchema = new mongoose.Schema({
    name: { type: String, required: true },
    sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true }, // e.g. VIKA-GOLD-RING-001
    category: { type: String, required: true }, // Rings, Necklaces, Earrings, Bracelets, etc.
    metalType: { type: String, enum: ["gold", "silver"], default: "gold" },
    purity: { type: String, default: "22K Gold" }, // 24K Gold, 22K Gold, 18K Gold, 999 Silver
    weightGrams: { type: Number, required: true }, // Weight in grams
    price: { type: Number, default: 0 }, // Optional Direct Selling / Retail Price in ₹ (0 = auto-calculate from live rate)
    makingCharges: { type: Number, default: 1500 }, // Making charges in ₹
    gstPercentage: { type: Number, default: 3 }, // 3% GST
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    images: { type: [String], default: [] },
    icon: { type: String, default: "diamond_outlined" },
    
    // Inventory & Stock Tracking
    availableQty: { type: Number, default: 10, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
    soldQty: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    
    inStock: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Auto-sync inStock based on availableQty before save
jewellerySchema.pre("save", function(next) {
    if (this.availableQty !== undefined) {
        this.inStock = this.availableQty > 0;
    }
    next();
});

module.exports = mongoose.model("Jewellery", jewellerySchema);
