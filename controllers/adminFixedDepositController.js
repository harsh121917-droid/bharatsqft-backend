const FixedDepositApplication = require("../models/FixedDepositApplication");
const User = require("../models/User");

// ── GET ALL FD APPLICATIONS (ADMIN) ──────────────────────────────────────────
exports.getAllFdApplications = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.company && req.query.company !== "ALL") {
            filter.company = req.query.company;
        }

        if (req.query.status && req.query.status !== "ALL") {
            filter.status = req.query.status;
        }

        if (req.query.search) {
            const queryRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { applicationId: queryRegex },
                { fullName: queryRegex },
                { panNumber: queryRegex },
                { mobileNumber: queryRegex },
                { email: queryRegex },
                { irisApplicationNumber: queryRegex },
                { irisFolioNumber: queryRegex }
            ];
        }

        const [applications, total, statsAgg] = await Promise.all([
            FixedDepositApplication.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("user", "name phone email")
                .populate("processedBy", "name email")
                .lean(),
            FixedDepositApplication.countDocuments(filter),
            FixedDepositApplication.aggregate([
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        bajajCount: { $sum: { $cond: [{ $eq: ["$company", "BAJAJ_FINANCE"] }, 1, 0] } },
                        shriramCount: { $sum: { $cond: [{ $eq: ["$company", "SHRIRAM_FINANCE"] }, 1, 0] } },
                        mahindraCount: { $sum: { $cond: [{ $eq: ["$company", "MAHINDRA_FINANCE"] }, 1, 0] } },
                        pendingIrisCount: { $sum: { $cond: [{ $eq: ["$status", "SUBMITTED"] }, 1, 0] } },
                        appliedIrisCount: { $sum: { $cond: [{ $eq: ["$status", "APPLIED_ON_IRIS"] }, 1, 0] } },
                        approvedCount: { $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0] } }
                    }
                }
            ])
        ]);

        const stats = statsAgg[0] || {
            totalAmount: 0,
            bajajCount: 0,
            shriramCount: 0,
            mahindraCount: 0,
            pendingIrisCount: 0,
            appliedIrisCount: 0,
            approvedCount: 0
        };

        return res.json({
            success: true,
            data: applications,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            },
            stats
        });
    } catch (err) {
        next(err);
    }
};

// ── GET FULL APPLICATION DETAILS ─────────────────────────────────────────────
exports.getFdApplicationDetails = async (req, res, next) => {
    try {
        const application = await FixedDepositApplication.findById(req.params.id)
            .populate("user", "name phone email kycStatus")
            .populate("processedBy", "name email")
            .lean();

        if (!application) {
            return res.status(404).json({ success: false, message: "Fixed deposit application not found." });
        }

        return res.json({
            success: true,
            data: application
        });
    } catch (err) {
        next(err);
    }
};

// ── UPDATE FD STATUS & IRIS DETAILS (ADMIN) ──────────────────────────────────
exports.updateFdApplicationStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            status,
            irisApplicationNumber,
            irisFolioNumber,
            irisFDRNo,
            adminRemarks
        } = req.body;

        const application = await FixedDepositApplication.findById(id);
        if (!application) {
            return res.status(404).json({ success: false, message: "Fixed deposit application not found." });
        }

        const prevStatus = application.status;
        if (status) application.status = status;
        if (irisApplicationNumber !== undefined) application.irisApplicationNumber = irisApplicationNumber.trim();
        if (irisFolioNumber !== undefined) application.irisFolioNumber = irisFolioNumber.trim();
        if (irisFDRNo !== undefined) application.irisFDRNo = irisFDRNo.trim();
        if (adminRemarks !== undefined) application.adminRemarks = adminRemarks.trim();

        if (status === "APPLIED_ON_IRIS" && prevStatus !== "APPLIED_ON_IRIS") {
            application.appliedAtIrisAt = new Date();
        }

        application.processedBy = req.user._id;
        application.processedAt = new Date();

        await application.save();

        // Send push / notification to customer regarding status update
        try {
            const NotificationLog = require("../models/NotificationLog");
            let notifTitle = "Fixed Deposit Update";
            let notifMsg = `Your FD Application (${application.applicationId}) status is now ${application.status}.`;

            if (application.status === "APPLIED_ON_IRIS") {
                notifTitle = "FD Submitted on IRIS Platform";
                notifMsg = `Your FD Application for ${application.companyName} has been submitted on the IRIS platform with Reference #${application.irisApplicationNumber || application.applicationId}.`;
            } else if (application.status === "APPROVED") {
                notifTitle = "Fixed Deposit Approved!";
                notifMsg = `Congratulations! Your FD with ${application.companyName} is approved (FDR No: ${application.irisFDRNo || application.irisFolioNumber || 'Active'}).`;
            }

            if (NotificationLog) {
                await NotificationLog.create({
                    user: application.user,
                    title: notifTitle,
                    message: notifMsg,
                    type: "FIXED_DEPOSIT",
                    metadata: {
                        applicationId: application.applicationId,
                        status: application.status,
                        irisRef: application.irisApplicationNumber
                    }
                });
            }
        } catch (_) {}

        return res.json({
            success: true,
            message: "Fixed Deposit application updated successfully!",
            data: application
        });
    } catch (err) {
        next(err);
    }
};

// ── EXPORT FD APPLICATIONS CSV FOR IRIS / RECORDS ────────────────────────────
exports.exportFdApplicationsCsv = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.company && req.query.company !== "ALL") filter.company = req.query.company;
        if (req.query.status && req.query.status !== "ALL") filter.status = req.query.status;

        const applications = await FixedDepositApplication.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        const headers = [
            "Application ID", "Status", "Date", "Company", "Scheme Name", "Deposit Type",
            "Amount (INR)", "Tenure (Months)", "Interest Rate (% p.a.)", "Senior Citizen",
            "Maturity Amount (INR)", "Periodic Payout (INR)", "Auto Renewal",
            "Full Legal Name", "PAN", "DOB", "Gender", "Marital Status", "Father/Spouse Name",
            "Mother Maiden Name", "Occupation", "Annual Income", "PEP", "Resident Status",
            "Mobile", "Email", "Address Line 1", "Address Line 2", "City", "State", "Pincode",
            "Bank Name", "Account Number", "IFSC", "Account Type", "Account Holder",
            "Nominee Name", "Nominee Relation", "Nominee DOB", "Form 15G/15H",
            "IRIS App Number", "IRIS Folio", "IRIS FDR No", "Admin Remarks"
        ];

        const escapeCsv = (val) => {
            if (val === undefined || val === null) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const rows = applications.map(app => [
            escapeCsv(app.applicationId),
            escapeCsv(app.status),
            escapeCsv(new Date(app.createdAt).toISOString().split('T')[0]),
            escapeCsv(app.companyName),
            escapeCsv(app.schemeName),
            escapeCsv(app.depositType),
            escapeCsv(app.amount),
            escapeCsv(app.tenureMonths),
            escapeCsv(app.interestRate),
            escapeCsv(app.seniorCitizen ? "YES" : "NO"),
            escapeCsv(app.maturityAmount),
            escapeCsv(app.periodicPayoutAmount),
            escapeCsv(app.autoRenewal),
            escapeCsv(app.fullName),
            escapeCsv(app.panNumber),
            escapeCsv(app.dob),
            escapeCsv(app.gender),
            escapeCsv(app.maritalStatus),
            escapeCsv(app.fatherOrSpouseName),
            escapeCsv(app.motherMaidenName),
            escapeCsv(app.occupation),
            escapeCsv(app.annualIncome),
            escapeCsv(app.isPep ? "YES" : "NO"),
            escapeCsv(app.residentStatus),
            escapeCsv(app.mobileNumber),
            escapeCsv(app.email),
            escapeCsv(app.addressLine1),
            escapeCsv(app.addressLine2),
            escapeCsv(app.city),
            escapeCsv(app.state),
            escapeCsv(app.pincode),
            escapeCsv(app.bankName),
            escapeCsv(app.accountNumber),
            escapeCsv(app.ifscCode),
            escapeCsv(app.accountType),
            escapeCsv(app.accountHolderName),
            escapeCsv(app.nomineeName),
            escapeCsv(app.nomineeRelation),
            escapeCsv(app.nomineeDob),
            escapeCsv(app.form15G15H ? "YES" : "NO"),
            escapeCsv(app.irisApplicationNumber),
            escapeCsv(app.irisFolioNumber),
            escapeCsv(app.irisFDRNo),
            escapeCsv(app.adminRemarks)
        ].join(","));

        const csvContent = [headers.join(","), ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=VikaOne_FD_Applications_${Date.now()}.csv`);
        return res.send(csvContent);
    } catch (err) {
        next(err);
    }
};
