const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: [true, "Coupon code is required"],
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Coupon description is required"],
        },
        type: {
            type: String,
            enum: ["extra_gold", "discount"],
            required: [true, "Coupon type is required"],
        },
        valueType: {
            type: String,
            enum: ["percentage", "flat"],
            required: [true, "Coupon value type is required"],
        },
        value: {
            type: Number,
            required: [true, "Coupon value is required"],
        },
        minPurchaseAmount: {
            type: Number,
            default: 0,
        },
        maxDiscountAmount: {
            type: Number,
            default: 0, // 0 = no cap
        },
        metalType: {
            type: String,
            enum: ["gold", "silver", "both"],
            default: "both",
        },
        expiryDate: {
            type: Date,
        },
        isPopular: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Coupon", CouponSchema);
