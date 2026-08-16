const mongoose = require("mongoose");

const jewelleryRedemptionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jewellery: { type: mongoose.Schema.Types.ObjectId, ref: "Jewellery", required: true },
    jewelleryName: { type: String, required: true },
    metalType: { type: String, enum: ["gold", "silver"], required: true },
    weightGrams: { type: Number, required: true },
    makingCharges: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    totalPaid: { type: Number, required: true }, // Paid via Razorpay or Wallet
    paymentMethod: { type: String, enum: ["razorpay", "wallet"], default: "razorpay" },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    deliveryStatus: {
        type: String,
        enum: ["placed", "pending", "processing", "out_of_warehouse", "shipped", "out_for_delivery", "delivered", "cancelled"],
        default: "placed"
    },
    shippingAddress: { type: String, default: "" },
    trackingId: { type: String, default: "" },
    courierName: { type: String, default: "Vikaone Express Secure Logistics" },
    trackingUrl: { type: String, default: "" },
    estimatedDeliveryDate: { type: String, default: "" },
    statusNote: { type: String, default: "" },
    statusHistory: [
        {
            status: { type: String },
            title: { type: String },
            description: { type: String },
            date: { type: Date, default: Date.now }
        }
    ],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("JewelleryRedemption", jewelleryRedemptionSchema);
