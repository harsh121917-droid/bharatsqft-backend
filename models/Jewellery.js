const mongoose = require("mongoose");

const jewellerySchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true }, // Rings, Necklaces, Earrings, Bracelets, etc.
    metalType: { type: String, enum: ["gold", "silver"], default: "gold" },
    purity: { type: String, default: "22K Gold" }, // 24K Gold, 22K Gold, 18K Gold, 999 Silver
    weightGrams: { type: Number, required: true }, // Weight in grams
    makingCharges: { type: Number, default: 1500 }, // Making charges in ₹
    gstPercentage: { type: Number, default: 3 }, // 3% GST
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    icon: { type: String, default: "diamond_outlined" },
    inStock: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Jewellery", jewellerySchema);
