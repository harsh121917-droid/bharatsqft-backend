const mongoose = require("mongoose");

const AppConfigSchema = new mongoose.Schema(
    {
        latestVersion: { type: String, default: "0.9.0" },
        forceUpdate: { type: Boolean, default: false },
        playStoreUrl: { type: String, default: "https://play.google.com/store/apps/details?id=com.vikaone.app" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AppConfig", AppConfigSchema);
