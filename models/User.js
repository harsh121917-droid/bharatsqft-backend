const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [80, "Name max 80 chars"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: {
      type: String,
      match: [/^[0-9+\-\s()]{7,15}$/, "Invalid phone number"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password min 6 chars"],
      select: false, // never return password in queries
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rewardPoints: {
      type: Number,
      default: 0,
    },
    referralBalance: {
      type: Number,
      default: 0,
    },
    kycStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "not_submitted"],
      default: "not_submitted",
    },
    plainPassword: {
      type: String,
      default: "",
    },
    fcmTokens: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

/* Hash password before save */
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/* Compare passwords */
UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", UserSchema);