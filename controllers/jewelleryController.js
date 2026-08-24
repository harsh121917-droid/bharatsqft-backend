const Jewellery = require("../models/Jewellery");
const JewelleryCategory = require("../models/JewelleryCategory");
const JewelleryRedemption = require("../models/JewelleryRedemption");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");
const { uploadJewelleryImage, uploadJewelleryImages } = require("../middleware/uploadMiddleware");


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
    },
    {
        name: "1 Gram 24K Gold Coin",
        category: "Coins",
        metalType: "gold",
        purity: "24K Gold (999.9)",
        weightGrams: 1.0,
        makingCharges: 450,
        gstPercentage: 3,
        description: "999.9 pure certified physical gold coin with serial number tamper-proof packaging.",
        imageUrl: "",
        icon: "monetization_on_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "5 Gram 24K Gold Coin",
        category: "Coins",
        metalType: "gold",
        purity: "24K Gold (999.9)",
        weightGrams: 5.0,
        makingCharges: 1500,
        gstPercentage: 3,
        description: "999.9 pure certified physical gold coin with serial number tamper-proof packaging.",
        imageUrl: "",
        icon: "monetization_on_outlined",
        inStock: true,
        isPopular: false
    },
    {
        name: "10 Gram 999 Fine Silver Coin",
        category: "Coins",
        metalType: "silver",
        purity: "999 Silver",
        weightGrams: 10.0,
        makingCharges: 350,
        gstPercentage: 3,
        description: "999 pure certified physical silver coin in protective capsule.",
        imageUrl: "",
        icon: "monetization_on_outlined",
        inStock: true,
        isPopular: true
    },
    {
        name: "50 Gram 999 Fine Silver Coin",
        category: "Coins",
        metalType: "silver",
        purity: "999 Silver",
        weightGrams: 50.0,
        makingCharges: 1200,
        gstPercentage: 3,
        description: "999 pure certified physical silver coin in protective capsule.",
        imageUrl: "",
        icon: "monetization_on_outlined",
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

exports.getProducts = async (req, res, next) => {
    try {
        let count = await Jewellery.countDocuments();
        if (count === 0) {
            await Jewellery.insertMany(DEFAULT_PRODUCTS);
        }

        // Self-healing check for Coins migration
        const coinProductCount = await Jewellery.countDocuments({ category: "Coins" });
        if (coinProductCount === 0) {
            const Coin = require("../models/Coin");
            const existingCoins = await Coin.find();
            if (existingCoins.length > 0) {
                const migratedProducts = existingCoins.map(c => {
                    const estimatedMaking = c.grams * (c.metal === "gold" ? 450 : 35);
                    return {
                        name: c.name,
                        category: "Coins",
                        metalType: c.metal,
                        purity: c.metal === "gold" ? "24K Gold (999.9)" : "999 Silver",
                        weightGrams: c.grams,
                        makingCharges: estimatedMaking,
                        gstPercentage: 3,
                        description: `Certified physical ${c.metal} coin. Migrated from old coins catalog.`,
                        imageUrl: c.image || "",
                        icon: "monetization_on_outlined",
                        inStock: c.isActive !== false,
                        isPopular: false
                    };
                });
                await Jewellery.insertMany(migratedProducts);
            } else {
                const defaultCoins = DEFAULT_PRODUCTS.filter(p => p.category === "Coins");
                await Jewellery.insertMany(defaultCoins);
            }
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

// Helper: Generate Unique SKU for Jewellery
async function generateUniqueJewellerySku(metalType, category) {
    const metal = (metalType || "gold").toUpperCase();
    const cat = (category || "JEWEL").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "JWEL";
    const count = await Jewellery.countDocuments();
    let serial = count + 1;
    let sku = `VIKA-${metal}-${cat}-${String(serial).padStart(3, "0")}`;
    let exists = await Jewellery.findOne({ sku });
    while (exists) {
        serial++;
        sku = `VIKA-${metal}-${cat}-${String(serial).padStart(3, "0")}`;
        exists = await Jewellery.findOne({ sku });
    }
    return sku;
}

// ADD Product (Admin)
exports.addProduct = async (req, res, next) => {
    try {
        let { name, sku, category, metalType, purity, weightGrams, price, priceAdjustment, makingCharges, gstPercentage, description, imageUrl, images, availableQty, lowStockThreshold, inStock, isPopular } = req.body;
        if (!name || !category || !weightGrams) {
            return res.status(400).json({ success: false, message: "Name, category, and weight are required" });
        }

        // Handle or generate SKU
        if (sku && String(sku).trim()) {
            sku = String(sku).trim().toUpperCase();
            const existing = await Jewellery.findOne({ sku });
            if (existing) {
                return res.status(400).json({ success: false, message: `SKU "${sku}" is already in use by another product.` });
            }
        } else {
            sku = await generateUniqueJewellerySku(metalType, category);
        }

        const qty = availableQty !== undefined ? Number(availableQty) : 10;
        const lowThreshold = lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5;
        const sellingPrice = price !== undefined && Number(price) > 0 ? Number(price) : 0;
        const adjustment = priceAdjustment !== undefined ? Number(priceAdjustment) || 0 : 0;

        let imageList = [];
        if (Array.isArray(images) && images.length > 0) {
            imageList = images.map(img => String(img).trim()).filter(Boolean);
        } else if (imageUrl && String(imageUrl).trim()) {
            imageList = [String(imageUrl).trim()];
        }

        const primaryImage = imageList.length > 0 ? imageList[0] : (imageUrl || "");

        const product = await Jewellery.create({
            name,
            sku,
            category,
            metalType: metalType || "gold",
            purity: purity || "22K Gold",
            weightGrams: Number(weightGrams),
            price: sellingPrice,
            priceAdjustment: adjustment,
            makingCharges: Number(makingCharges || 1500),
            gstPercentage: Number(gstPercentage || 3),
            description: description || "",
            imageUrl: primaryImage,
            images: imageList,
            availableQty: qty,
            reservedQty: 0,
            soldQty: 0,
            lowStockThreshold: lowThreshold,
            inStock: qty > 0 && (inStock !== undefined ? inStock : true),
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
        let updateData = { ...req.body };
        if (updateData.sku) {
            updateData.sku = String(updateData.sku).trim().toUpperCase();
            const existing = await Jewellery.findOne({ sku: updateData.sku, _id: { $ne: req.params.id } });
            if (existing) {
                return res.status(400).json({ success: false, message: `SKU "${updateData.sku}" is already assigned to "${existing.name}".` });
            }
        }

        if (updateData.price !== undefined) {
            updateData.price = Math.max(0, Number(updateData.price) || 0);
        }

        if (updateData.priceAdjustment !== undefined) {
            updateData.priceAdjustment = Number(updateData.priceAdjustment) || 0;
        }

        if (updateData.availableQty !== undefined) {
            updateData.availableQty = Math.max(0, Number(updateData.availableQty));
            updateData.inStock = updateData.availableQty > 0;
        }

        if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = updateData.images.map(img => String(img).trim()).filter(Boolean);
            if (!updateData.imageUrl || !updateData.images.includes(updateData.imageUrl)) {
                updateData.imageUrl = updateData.images[0] || "";
            }
        } else if (updateData.imageUrl) {
            updateData.images = [updateData.imageUrl];
        }

        const updated = await Jewellery.findByIdAndUpdate(req.params.id, updateData, { new: true });
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

        // Stock check
        if (jewellery.availableQty <= 0 || jewellery.inStock === false) {
            return res.status(400).json({ success: false, message: "Sorry, this product is currently Out of Stock." });
        }

        const weightGrams = jewellery.weightGrams;
        const metalType = jewellery.metalType;

        // Perform balance check
        if (metalType === "gold") {
            const { GoldBalance } = require("../models/Gold");
            const balance = await GoldBalance.findOne({ user: req.user._id });
            const available = balance ? (balance.totalGrams - balance.lockedGrams) : 0;
            if (available < weightGrams) {
                return res.status(400).json({ success: false, message: `Insufficient gold balance. Required: ${weightGrams}g, Available: ${available.toFixed(4)}g` });
            }
        } else {
            const { SilverBalance } = require("../models/Silver");
            const balance = await SilverBalance.findOne({ user: req.user._id });
            const available = balance ? (balance.totalGrams - balance.lockedGrams) : 0;
            if (available < weightGrams) {
                return res.status(400).json({ success: false, message: `Insufficient silver balance. Required: ${weightGrams}g, Available: ${available.toFixed(4)}g` });
            }
        }

        const making = jewellery.makingCharges || 1500;
        const gst = Math.round((making * (jewellery.gstPercentage || 3)) / 100);
        const totalAmount = making + gst; // Total payable now via Razorpay

        if (paymentMethod === "wallet") {
            const user = await User.findById(req.user._id);
            if (!user || user.walletBalance < totalAmount) {
                return res.status(400).json({ success: false, message: `Insufficient wallet balance. Required: ₹${totalAmount}` });
            }

            // Deduct metal balance
            if (metalType === "gold") {
                const { GoldBalance, GoldTransaction } = require("../models/Gold");
                const { fetchLiveRates } = require("./goldController");
                const rates = await fetchLiveRates();
                const rate = rates.gold.buyRate;

                await GoldBalance.findOneAndUpdate(
                    { user: req.user._id },
                    { $inc: { totalGrams: -weightGrams } }
                );
                // Create a gold transaction for tracking
                await GoldTransaction.create({
                    user: req.user._id,
                    type: "redeem",
                    grams: weightGrams,
                    ratePerGram: rate,
                    goldValue: weightGrams * rate,
                    gstAmt: 0,
                    totalAmt: weightGrams * rate,
                    status: "success",
                    note: `Redeemed ${jewellery.name}`
                });
            } else {
                const { SilverBalance, SilverTransaction } = require("../models/Silver");
                const { fetchLiveRates } = require("./goldController");
                const rates = await fetchLiveRates();
                const rate = rates.silver.buyRate;

                await SilverBalance.findOneAndUpdate(
                    { user: req.user._id },
                    { $inc: { totalGrams: -weightGrams } }
                );
                // Create a silver transaction for tracking
                await SilverTransaction.create({
                    user: req.user._id,
                    type: "redeem",
                    grams: weightGrams,
                    ratePerGram: rate,
                    silverValue: weightGrams * rate,
                    gstAmt: 0,
                    totalAmt: weightGrams * rate,
                    status: "success",
                    note: `Redeemed ${jewellery.name}`
                });
            }

            // Deduct wallet balance
            user.walletBalance -= totalAmount;
            await user.save();

            // Auto-update Inventory: decrement availableQty, increment reservedQty
            jewellery.availableQty = Math.max(0, (jewellery.availableQty || 1) - 1);
            jewellery.reservedQty = (jewellery.reservedQty || 0) + 1;
            jewellery.inStock = jewellery.availableQty > 0;
            await jewellery.save();

            // Record redemption directly
            const redemption = await JewelleryRedemption.create({
                user: req.user._id,
                jewellery: jewellery._id,
                sku: jewellery.sku || "",
                jewelleryName: jewellery.name,
                metalType: jewellery.metalType,
                weightGrams: jewellery.weightGrams,
                quantity: 1,
                makingCharges: making,
                gstAmount: gst,
                totalPaid: totalAmount,
                paymentMethod: "wallet",
                status: "completed",
                deliveryStatus: "placed"
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

        // Auto-update Inventory: reserve item
        jewellery.availableQty = Math.max(0, (jewellery.availableQty || 1) - 1);
        jewellery.reservedQty = (jewellery.reservedQty || 0) + 1;
        jewellery.inStock = jewellery.availableQty > 0;
        await jewellery.save();

        // Save pending redemption with SKU
        const redemption = await JewelleryRedemption.create({
            user: req.user._id,
            jewellery: jewellery._id,
            sku: jewellery.sku || "",
            jewelleryName: jewellery.name,
            metalType: jewellery.metalType,
            weightGrams: jewellery.weightGrams,
            quantity: 1,
            makingCharges: making,
            gstAmount: gst,
            totalPaid: totalAmount,
            paymentMethod: "razorpay",
            razorpayOrderId: order.id,
            status: "pending",
            deliveryStatus: "placed"
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

        const jewellery = await Jewellery.findById(redemption.jewellery);
        if (!jewellery) return res.status(404).json({ success: false, message: "Product not found" });

        const weightGrams = jewellery.weightGrams;
        const metalType = jewellery.metalType;

        // Perform balance check & deduction
        if (metalType === "gold") {
            const { GoldBalance, GoldTransaction } = require("../models/Gold");
            const balance = await GoldBalance.findOne({ user: redemption.user });
            const available = balance ? (balance.totalGrams - balance.lockedGrams) : 0;
            if (available < weightGrams) {
                return res.status(400).json({ success: false, message: `Insufficient gold balance. Required: ${weightGrams}g, Available: ${available.toFixed(4)}g` });
            }

            const { fetchLiveRates } = require("./goldController");
            const rates = await fetchLiveRates();
            const rate = rates.gold.buyRate;

            const avgRate = balance.totalGrams > 0 ? (balance.investedAmt / balance.totalGrams) : 0;
            const costBasisOfRedeemedGrams = weightGrams * avgRate;
            
            balance.totalGrams = parseFloat((balance.totalGrams - weightGrams).toFixed(6));
            balance.investedAmt = parseFloat(Math.max(0, balance.investedAmt - costBasisOfRedeemedGrams).toFixed(2));
            await balance.save();
            // Create a gold transaction for tracking
            await GoldTransaction.create({
                user: redemption.user,
                type: "redeem",
                grams: weightGrams,
                ratePerGram: rate,
                goldValue: weightGrams * rate,
                gstAmt: 0,
                totalAmt: weightGrams * rate,
                status: "success",
                note: `Redeemed ${jewellery.name}`
            });
        } else {
            const { SilverBalance, SilverTransaction } = require("../models/Silver");
            const balance = await SilverBalance.findOne({ user: redemption.user });
            const available = balance ? (balance.totalGrams - balance.lockedGrams) : 0;
            if (available < weightGrams) {
                return res.status(400).json({ success: false, message: `Insufficient silver balance. Required: ${weightGrams}g, Available: ${available.toFixed(4)}g` });
            }

            const { fetchLiveRates } = require("./goldController");
            const rates = await fetchLiveRates();
            const rate = rates.silver.buyRate;

            const avgRate = balance.totalGrams > 0 ? (balance.investedAmt / balance.totalGrams) : 0;
            const costBasisOfRedeemedGrams = weightGrams * avgRate;

            balance.totalGrams = parseFloat((balance.totalGrams - weightGrams).toFixed(6));
            balance.investedAmt = parseFloat(Math.max(0, balance.investedAmt - costBasisOfRedeemedGrams).toFixed(2));
            await balance.save();
            // Create a silver transaction for tracking
            await SilverTransaction.create({
                user: redemption.user,
                type: "redeem",
                grams: weightGrams,
                ratePerGram: rate,
                silverValue: weightGrams * rate,
                gstAmt: 0,
                totalAmt: weightGrams * rate,
                status: "success",
                note: `Redeemed ${jewellery.name}`
            });
        }

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

// UPLOAD MULTIPLE PRODUCT IMAGES (Admin) — multipart/form-data, field name: "images"
exports.uploadMultipleImages = (req, res) => {
    uploadJewelleryImages(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || "Upload failed" });
        }
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, message: "No image files provided" });
            }

            const urls = req.files.map(f => f.path);
            res.json({ success: true, urls, message: "Images uploaded successfully" });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

// UPLOAD PRODUCT IMAGE (Admin) — multipart/form-data, field name: "image"
exports.uploadProductImage = (req, res) => {
    uploadJewelleryImage(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || "Upload failed" });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No image file provided" });
            }

            const imageUrl = req.file.path; // Cloudinary URL

            // Update the product's imageUrl
            const product = await Jewellery.findByIdAndUpdate(
                req.params.id,
                { imageUrl },
                { new: true }
            );

            if (!product) {
                return res.status(404).json({ success: false, message: "Product not found" });
            }

            res.json({ success: true, imageUrl, message: "Image uploaded successfully" });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
};

// GET MY ORDERS (User order history)
exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await JewelleryRedemption.find({ user: req.user._id })
            .populate("jewellery", "name category imageUrl purity weightGrams makingCharges gstPercentage description")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: orders
        });
    } catch (err) {
        next(err);
    }
};

// GET ORDER BY ID (Detailed order status & tracking)
exports.getOrderById = async (req, res, next) => {
    try {
        const order = await JewelleryRedemption.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate("jewellery", "name category imageUrl purity weightGrams makingCharges gstPercentage description");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({
            success: true,
            data: order
        });
    } catch (err) {
        next(err);
    }
};
