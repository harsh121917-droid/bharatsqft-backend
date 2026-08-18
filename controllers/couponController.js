const Coupon = require("../models/Coupon");

// @desc    Create new coupon (Admin)
// @route   POST /api/coupons/create
// @access  Private (Admin)
exports.createCoupon = async (req, res, next) => {
    try {
        const {
            code,
            description,
            type,
            valueType,
            value,
            minPurchaseAmount,
            maxDiscountAmount,
            metalType,
            expiryDate,
            isPopular,
            isRandom,
            minRandomValue,
            isActive,
        } = req.body;

        if (!code || !description || !type || !valueType || !value) {
            return res.status(400).json({
                success: false,
                message: "Please fill in all required fields (code, description, type, valueType, value)",
            });
        }

        const uppercaseCode = code.toUpperCase().trim();

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: uppercaseCode });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: `Coupon with code '${uppercaseCode}' already exists`,
            });
        }

        const coupon = await Coupon.create({
            code: uppercaseCode,
            description,
            type,
            valueType,
            value,
            minPurchaseAmount: minPurchaseAmount || 0,
            maxDiscountAmount: maxDiscountAmount || 0,
            metalType: metalType || "both",
            expiryDate: expiryDate || null,
            isPopular: isPopular !== undefined ? isPopular : false,
            isRandom: isRandom !== undefined ? isRandom : false,
            minRandomValue: minRandomValue || 1,
            isActive: isActive !== undefined ? isActive : true,
        });

        res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            coupon,
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Get all coupons (Admin list)
// @route   GET /api/coupons/admin-list
// @access  Private (Admin)
exports.getCouponsAdmin = async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            count: coupons.length,
            coupons,
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Update coupon (Admin)
// @route   PUT /api/coupons/:id
// @access  Private (Admin)
exports.updateCoupon = async (req, res, next) => {
    try {
        const {
            code,
            description,
            type,
            valueType,
            value,
            minPurchaseAmount,
            maxDiscountAmount,
            metalType,
            expiryDate,
            isPopular,
            isRandom,
            minRandomValue,
            isActive,
        } = req.body;

        let coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        const updates = {};
        if (code) {
            const uppercaseCode = code.toUpperCase().trim();
            if (uppercaseCode !== coupon.code) {
                const codeExists = await Coupon.findOne({ code: uppercaseCode });
                if (codeExists) {
                    return res.status(400).json({
                        success: false,
                        message: `Coupon with code '${uppercaseCode}' already exists`,
                    });
                }
                updates.code = uppercaseCode;
            }
        }

        if (description !== undefined) updates.description = description;
        if (type !== undefined) updates.type = type;
        if (valueType !== undefined) updates.valueType = valueType;
        if (value !== undefined) updates.value = value;
        if (minPurchaseAmount !== undefined) updates.minPurchaseAmount = minPurchaseAmount;
        if (maxDiscountAmount !== undefined) updates.maxDiscountAmount = maxDiscountAmount;
        if (metalType !== undefined) updates.metalType = metalType;
        if (expiryDate !== undefined) updates.expiryDate = expiryDate || null;
        if (isPopular !== undefined) updates.isPopular = isPopular;
        if (isRandom !== undefined) updates.isRandom = isRandom;
        if (minRandomValue !== undefined) updates.minRandomValue = minRandomValue;
        if (isActive !== undefined) updates.isActive = isActive;

        coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true,
        });

        res.json({
            success: true,
            message: "Coupon updated successfully",
            coupon,
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Delete coupon (Admin)
// @route   DELETE /api/coupons/:id
// @access  Private (Admin)
exports.deleteCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        await coupon.deleteOne();

        res.json({
            success: true,
            message: "Coupon deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Get active, valid coupons for users
// @route   GET /api/coupons
// @access  Private (User)
exports.getCouponsUser = async (req, res, next) => {
    try {
        const now = new Date();
        const query = {
            isActive: true,
            $or: [
                { expiryDate: null },
                { expiryDate: { $gt: now } }
            ]
        };

        const coupons = await Coupon.find(query).sort({ isPopular: -1, createdAt: -1 });

        res.json({
            success: true,
            count: coupons.length,
            coupons,
        });
    } catch (err) {
        next(err);
    }
};

// @desc    Validate coupon code
// @route   POST /api/coupons/validate
// @access  Private (User)
exports.validateCoupon = async (req, res, next) => {
    try {
        const { code, purchaseAmount, metalType } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: "Coupon code is required" });
        }
        if (!purchaseAmount || isNaN(purchaseAmount) || purchaseAmount <= 0) {
            return res.status(400).json({ success: false, message: "Valid purchase amount is required" });
        }
        if (!metalType || !["gold", "silver"].includes(metalType)) {
            return res.status(400).json({ success: false, message: "Metal type is required ('gold' or 'silver')" });
        }

        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid coupon code" });
        }

        if (!coupon.isActive) {
            return res.status(400).json({ success: false, message: "This coupon is no longer active" });
        }

        const now = new Date();
        if (coupon.expiryDate && coupon.expiryDate < now) {
            return res.status(400).json({ success: false, message: "This coupon has expired" });
        }

        if (purchaseAmount < coupon.minPurchaseAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minPurchaseAmount} is required for this coupon`,
            });
        }

        if (coupon.metalType !== "both" && coupon.metalType !== metalType) {
            return res.status(400).json({
                success: false,
                message: `This coupon is only valid for ${coupon.metalType} purchases`,
            });
        }

        // Calculate benefit
        let benefitValue = 0;
        if (coupon.valueType === "percentage") {
            benefitValue = purchaseAmount * (coupon.value / 100);
            if (coupon.maxDiscountAmount > 0) {
                benefitValue = Math.min(benefitValue, coupon.maxDiscountAmount);
            }
        } else {
            // flat
            benefitValue = Math.min(coupon.value, purchaseAmount);
        }

        // Round to 2 decimal places
        benefitValue = parseFloat(benefitValue.toFixed(2));

        const result = {
            success: true,
            valid: true,
            code: coupon.code,
            type: coupon.type,
            valueType: coupon.valueType,
            value: coupon.value,
            benefitValue,
            isRandom: coupon.isRandom,
            minRandomValue: coupon.minRandomValue,
            description: coupon.description,
        };

        res.json(result);
    } catch (err) {
        next(err);
    }
};
