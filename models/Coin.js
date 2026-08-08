const mongoose = require("mongoose");

const CoinSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        metal: { type: String, enum: ["gold", "silver"], required: true },
        grams: { type: Number, required: true },
        makingChargePct: { type: Number, required: true, default: 5 },
        image: { type: String }, // Cloudinary URL
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Coin", CoinSchema);
