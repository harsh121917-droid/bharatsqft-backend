const mongoose = require("mongoose");

const EnquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
    },
    phone: {
      type: String,
    },
    subject: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      maxlength: [1000, "Message max 1000 chars"],
    },
    type: {
      type: String,
      enum: ["property", "full_ownership_lead", "mutual_fund", "general", "gold_silver", "other"],
      default: "general",
    },
    propertyRef: {
      type: String, // property ID or name (for future DB ref)
    },
    propertyTitle: {
      type: String,
      trim: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
    },
    preferredDate: {
      type: String, // e.g. "2026-10-10" or "Fri 09 OCT"
      trim: true,
    },
    preferredTime: {
      type: String, // e.g. "11:00 AM"
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "scheduled", "contacted", "deal_in_progress", "in_progress", "resolved", "closed"],
      default: "new",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin user
    },
    notes: {
      type: String, // admin internal notes
    },
    source: {
      type: String,
      enum: ["website", "app", "whatsapp", "phone", "other"],
      default: "website",
    },
    // Link to registered user if they're logged in
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Enquiry", EnquirySchema);