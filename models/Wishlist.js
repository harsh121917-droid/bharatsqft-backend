const mongoose = require("mongoose");

const WishlistSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    },
    { timestamps: true }
);

// one entry per user+property pair
WishlistSchema.index({ user: 1, property: 1 }, { unique: true });

module.exports = mongoose.model("Wishlist", WishlistSchema);