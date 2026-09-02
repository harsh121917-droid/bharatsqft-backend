const mongoose = require("mongoose");

const AppConfigSchema = new mongoose.Schema(
    {
        latestVersion: { type: String, default: "0.15.0" },
        forceUpdate: { type: Boolean, default: false },
        playStoreUrl: { type: String, default: "https://play.google.com/store/apps/details?id=com.vikaone.app" },
        newUsersSellHoldingDays: { type: Number, default: 30, min: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AppConfig", AppConfigSchema);
