const mongoose = require("mongoose");

const NotificationLogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    body: {
      type: String,
      required: [true, "Notification body is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    deepLink: {
      type: String,
      default: "home",
    },
    app: {
      type: String,
      enum: ["vikadrx", "digigold", "all"],
      default: "vikadrx",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["all", "user", "kyc_verified"],
      default: "all",
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sentBy: {
      type: String,
      default: "Admin",
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["sent", "failed", "simulated"],
      default: "sent",
    },
    eventKey: {
      type: String,
      default: "",
      index: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NotificationLog", NotificationLogSchema);
