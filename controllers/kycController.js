const Kyc = require("../models/Kyc");

/* ─────────────────────────────────────────
   POST /api/kyc/submit
   User submits/resubmits KYC (multipart form)
   Fields: fullName, dob, address.line1, address.city, address.state,
           address.pincode, panNumber, aadhaarNumber,
           bankDetails.accountHolderName, bankDetails.accountNumber,
           bankDetails.ifscCode, bankDetails.bankName
   Files:  panImage, aadhaarFront, aadhaarBack
───────────────────────────────────────── */
exports.submitKyc = async (req, res, next) => {
    try {
        const {
            fullName, dob,
            "address.line1": line1, "address.city": city,
            "address.state": state, "address.pincode": pincode,
            panNumber, aadhaarNumber,
            "bankDetails.accountHolderName": accountHolderName,
            "bankDetails.accountNumber": accountNumber,
            "bankDetails.ifscCode": ifscCode,
            "bankDetails.bankName": bankName,
        } = req.body;

        if (!fullName || !dob || !line1 || !city || !state || !pincode || !panNumber || !aadhaarNumber) {
            return res.status(400).json({ success: false, message: "All required fields must be filled" });
        }

        const files = req.files || {};
        if (!files.panImage || !files.aadhaarFront || !files.aadhaarBack) {
            return res.status(400).json({ success: false, message: "PAN image, Aadhaar front and back are required" });
        }

        let kyc = await Kyc.findOne({ user: req.user._id });

        const payload = {
            user: req.user._id,
            fullName, dob,
            address: { line1, city, state, pincode },
            panNumber: panNumber.toUpperCase(),
            aadhaarNumber,
            panImage: { url: files.panImage[0].path, uploadedAt: new Date() },
            aadhaarFront: { url: files.aadhaarFront[0].path, uploadedAt: new Date() },
            aadhaarBack: { url: files.aadhaarBack[0].path, uploadedAt: new Date() },
            bankDetails: { accountHolderName, accountNumber, ifscCode, bankName },
            status: "pending",
            rejectionReason: undefined,
            reviewedBy: undefined,
            reviewedAt: undefined,
            submittedAt: new Date(),
        };

        if (kyc) {
            Object.assign(kyc, payload);
            await kyc.save();
        } else {
            kyc = await Kyc.create(payload);
        }

        res.json({ success: true, message: "KYC submitted successfully. Pending review.", data: kyc });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "KYC already exists for this user" });
        }
        next(err);
    }
};

/* ─────────────────────────────────────────
   GET /api/kyc/me
   Get current user's KYC status
───────────────────────────────────────── */
exports.getMyKyc = async (req, res, next) => {
    try {
        const kyc = await Kyc.findOne({ user: req.user._id });
        if (!kyc) {
            return res.json({ success: true, data: null, status: "not_submitted" });
        }
        res.json({ success: true, data: kyc, status: kyc.status });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   GET /api/admin/kyc
   Admin: list all KYC submissions (filter by status)
───────────────────────────────────────── */
exports.getAllKyc = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const [items, total] = await Promise.all([
            Kyc.find(filter)
                .populate("user", "name email phone")
                .select("+aadhaarNumber")
                .sort("-submittedAt")
                .skip(skip).limit(limit),
            Kyc.countDocuments(filter),
        ]);

        const pendingCount = await Kyc.countDocuments({ status: "pending" });

        res.json({
            success: true, total, page,
            pages: Math.ceil(total / limit),
            pendingCount,
            data: items,
        });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   GET /api/admin/kyc/:id
───────────────────────────────────────── */
exports.getKycById = async (req, res, next) => {
    try {
        const kyc = await Kyc.findById(req.params.id)
            .populate("user", "name email phone")
            .select("+aadhaarNumber");
        if (!kyc) return res.status(404).json({ success: false, message: "KYC not found" });
        res.json({ success: true, data: kyc });
    } catch (err) { next(err); }
};

/* ─────────────────────────────────────────
   PATCH /api/admin/kyc/:id
   Body: { status: "approved" | "rejected", rejectionReason? }
───────────────────────────────────────── */
exports.reviewKyc = async (req, res, next) => {
    try {
        const { status, rejectionReason } = req.body;

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'" });
        }
        if (status === "rejected" && !rejectionReason) {
            return res.status(400).json({ success: false, message: "Rejection reason is required" });
        }

        const kyc = await Kyc.findByIdAndUpdate(
            req.params.id,
            {
                status,
                rejectionReason: status === "rejected" ? rejectionReason : undefined,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
            { new: true }
        ).populate("user", "name email phone");

        if (!kyc) return res.status(404).json({ success: false, message: "KYC not found" });

        res.json({ success: true, message: `KYC ${status}`, data: kyc });
    } catch (err) { next(err); }
};