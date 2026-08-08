const Jewellery = require("../models/Jewellery");
const JewelleryCategory = require("../models/JewelleryCategory");
const JewelleryRedemption = require("../models/JewelleryRedemption");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_dummy",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "rzp_secret_dummy"
});

const DEFAULT_CATEGORIES = [
    { name: "Rings", icon: "fas fa-ring" },
    { name: "Necklaces", icon: "fas fa-gem" },
    { name: "Earrings", icon: "fas fa-sparkles" },
    { name: "Bracelets", icon: "fas fa-circle-notch" },
    { name: "Chains", icon: "fas fa-link" },
    { name: "Coins", icon: "fas fa-coins" },
    { name: "Kadas", icon: "fas fa-circle" },
    { name: "Bangles", icon: "fas fa-ring" }
];

const DEFAULT_PRODUCTS = [
    {
        name: "Premium 22K Gold Wedding Ring",
        category: "Rings",
        metalType: "gold",
        purity: "22K Gold",
        weightGrams: 5.5,
        makingCharges: 2500,
        gstPercentage: 3,
        description: "Exquisite 22K hallmarked gold wedding band crafted with elegance.",
        imageUrl: "",
        icon: "diamond_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "18K Diamond Solitaire Band",
        category: "Rings",
        metalType: "gold",
        purity: "18K Gold",
        weightGrams: 4.2,
        makingCharges: 4500,
        gstPercentage: 3,
        description: "Sparkling 18K gold band set with lab-certified diamonds.",
        imageUrl: "",
        icon: "diamond_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "22K Kundan Choker Necklace",
        category: "Necklaces",
        metalType: "gold",
        purity: "22K Gold",
        weightGrams: 28.4,
        makingCharges: 12000,
        gstPercentage: 3,
        description: "Royal royal Kundan choker handcrafted by master artisans.",
        imageUrl: "",
        icon: "filter_vintage_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "Traditional Gold Jhumka Earrings",
        category: "Earrings",
        metalType: "gold",
        purity: "22K Gold",
        weightGrams: 12.8,
        makingCharges: 3500,
        gstPercentage: 3,
        description: "Classic ethnic Indian Jhumkas in 22K yellow gold.",
        imageUrl: "",
        icon: "spa_outlined",
        inStock: true,
        isPopular: false
    },
    {
        name: "24K Designer Peacock Kada",
        category: "Kadas",
        metalType: "gold",
        purity: "24K Pure Gold",
        weightGrams: 22.0,
        makingCharges: 8500,
        gstPercentage: 3,
        description: "Intricately carved peacock design 24K pure gold Kada.",
        imageUrl: "",
        icon: "circle_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "999 Sterling Silver Premium Kada",
        category: "Bracelets",
        metalType: "silver",
        purity: "999 Fine Silver",
        weightGrams: 45.0,
        makingCharges: 950,
        gstPercentage: 3,
        description: "Heavy 999 fine silver cuff Kada for daily wear.",
        imageUrl: "",
        icon: "circle_outlined",
        inStock: true,
        isPopular: false
    }
];

// GET Categories
exports.getCategories = async (req, res, next) => {
    try {
        let count = await JewelleryCategory.countDocuments();
        if (count === 0) {
            await JewelleryCategory.insertMany(DEFAULT_CATEGORIES);
        }
        const categories = await JewelleryCategory.find().sort({ name: 1 });
        res.json({ success: true, data: categories });
    } catch (err) {
        next(err);
    }
};

// ADD Category (Admin)
exports.addCategory = async (req, res, next) => {
    try {
        const { name, icon, description } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "Category name required" });

        const existing = await JewelleryCategory.findOne({ name: name.trim() });
        if (existing) return res.status(400).json({ success: false, message: "Category already exists" });

        const category = await JewelleryCategory.create({
            name: name.trim(),
            icon: icon || "fas fa-gem",
            description: description || ""
        });
        res.json({ success: true, message: "Category created successfully", data: category });
    } catch (err) {
        next(err);
    }
};

// DELETE Category (Admin)
exports.deleteCategory = async (req, res, next) => {
    try {
        await JewelleryCategory.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Category deleted" });
    } catch (err) {
        next(err);
    }
};

// GET Products
exports.getProducts = async (req, res, next) => {
    try {
        let count = await Jewellery.countDocuments();
        if (count === 0) {
            await Jewellery.insertMany(DEFAULT_PRODUCTS);
        }

        const { category, metalType, search, sort } = req.query;
        let query = {};

        if (category && category !== "All") {
            query.category = category;
        }

        if (metalType && metalType !== "all") {
            query.metalType = metalType.toLowerCase();
        }

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        let sortOption = { createdAt: -1 };
        if (sort === "price_low_high") sortOption = { weightGrams: 1 };
        else if (sort === "price_high_low") sortOption = { weightGrams: -1 };
        else if (sort === "weight_low_high") sortOption = { weightGrams: 1 };
        else if (sort === "weight_high_low") sortOption = { weightGrams: -1 };
        else if (sort === "popular") sortOption = { isPopular: -1 };

        const products = await Jewellery.find(query).sort(sortOption);
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};

// ADD Product (Admin)
exports.addProduct = async (req, res, next) => {
    try {
        const { name, category, metalType, purity, weightGrams, makingCharges, gstPercentage, description, imageUrl, inStock, isPopular } = req.body;
        if (!name || !category || !weightGrams) {
            return res.status(400).json({ success: false, message: "Name, category, and weight are required" });
        }

        const product = await Jewellery.create({
            name,
            category,
            metalType: metalType || "gold",
            purity: purity || "22K Gold",
            weightGrams: Number(weightGrams),
            makingCharges: Number(makingCharges || 1500),
            gstPercentage: Number(gstPercentage || 3),
            description: description || "",
            imageUrl: imageUrl || "",
            inStock: inStock !== undefined ? inStock : true,
            isPopular: Boolean(isPopular)
        });

        res.json({ success: true, message: "Jewellery product added", data: product });
    } catch (err) {
        next(err);
    }
};

// UPDATE Product (Admin)
exports.updateProduct = async (req, res, next) => {
    try {
        const updated = await Jewellery.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, message: "Product updated", data: updated });
    } catch (err) {
        next(err);
    }
};

// DELETE Product (Admin)
exports.deleteProduct = async (req, res, next) => {
    try {
        await Jewellery.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Product deleted" });
    } catch (err) {
        next(err);
    }
};

// INITIATE REDEEM (Create Razorpay Order for Making Charges + GST)
exports.initiateRedeemOrder = async (req, res, next) => {
    try {
        const { jewelleryId, paymentMethod } = req.body;
        const jewellery = await Jewellery.findById(jewelleryId);

        if (!jewellery) return res.status(404).json({ success: false, message: "Product not found" });

        const making = jewellery.makingCharges || 1500;
        const gst = Math.round((making * (jewellery.gstPercentage || 3)) / 100);
        const totalAmount = making + gst; // Total payable now via Razorpay

        if (paymentMethod === "wallet") {
            const user = await User.findById(req.user._id);
            if (!user || user.walletBalance < totalAmount) {
                return res.status(400).json({ success: false, message: `Insufficient wallet balance. Required: ₹${totalAmount}` });
            }

            // Deduct wallet balance
            user.walletBalance -= totalAmount;
            await user.save();

            // Record redemption directly
            const redemption = await JewelleryRedemption.create({
                user: req.user._id,
                jewellery: jewellery._id,
                jewelleryName: jewellery.name,
                metalType: jewellery.metalType,
                weightGrams: jewellery.weightGrams,
                makingCharges: making,
                gstAmount: gst,
                totalPaid: totalAmount,
                paymentMethod: "wallet",
                status: "completed"
            });

            return res.json({
                success: true,
                paidViaWallet: true,
                message: "Redemption order placed successfully using wallet!",
                redemption
            });
        }

        // Default: Pay via Razorpay
        const options = {
            amount: totalAmount * 100, // in paise
            currency: "INR",
            receipt: `rcpt_jewel_${Date.now().toString().slice(-8)}`,
            notes: {
                userId: req.user._id.toString(),
                jewelleryId: jewellery._id.toString(),
                weightGrams: jewellery.weightGrams.toString(),
                metalType: jewellery.metalType
            }
        };

        const order = await razorpay.orders.create(options);

        // Save pending redemption
        const redemption = await JewelleryRedemption.create({
            user: req.user._id,
            jewellery: jewellery._id,
            jewelleryName: jewellery.name,
            metalType: jewellery.metalType,
            weightGrams: jewellery.weightGrams,
            makingCharges: making,
            gstAmount: gst,
            totalPaid: totalAmount,
            paymentMethod: "razorpay",
            razorpayOrderId: order.id,
            status: "pending"
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: totalAmount,
            keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_dummy",
            redemptionId: redemption._id,
            message: "Razorpay order created for redemption"
        });
    } catch (err) {
        next(err);
    }
};

// VERIFY REDEEM ORDER (Verify Razorpay signature & complete redemption)
exports.verifyRedeemOrder = async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, redemptionId } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "rzp_secret_dummy")
            .update(body.toString())
            .digest("hex");

        const isValid = expectedSignature === razorpay_signature;

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        const redemption = await JewelleryRedemption.findById(redemptionId);
        if (!redemption) return res.status(404).json({ success: false, message: "Redemption record not found" });

        redemption.status = "completed";
        redemption.razorpayPaymentId = razorpay_payment_id;
        await redemption.save();

        res.json({
            success: true,
            message: "Redemption payment verified! Your jewellery order is confirmed.",
            redemption
        });
    } catch (err) {
        next(err);
    }
};
