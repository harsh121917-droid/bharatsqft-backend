const mongoose = require("mongoose");

const jewelleryCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    icon: { type: String, default: "fas fa-gem" },
    description: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("JewelleryCategory", jewelleryCategorySchema);
