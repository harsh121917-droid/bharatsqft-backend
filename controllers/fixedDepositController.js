const FixedDepositApplication = require("../models/FixedDepositApplication");
const User = require("../models/User");
const Kyc = require("../models/Kyc");

// ── FD COMPANIES & MASTER DATA ───────────────────────────────────────────────
const FD_COMPANIES = [
    {
        id: "BAJAJ_FINANCE",
        code: "BAJAJ_FINANCE",
        name: "Bajaj Finance Limited",
        shortName: "Bajaj Finance",
        rating: "CRISIL AAA / ICRA AAA",
        ratingAgency: "CRISIL & ICRA",
        ratingDescription: "Highest Safety • Zero Default Track Record",
        logo: "assets/images/fd/bajaj_finance.png",
        minAmount: 15000,
        maxRate: 8.85,
        baseRate: 8.45,
        seniorCitizenExtra: 0.40,
        womenExtra: 0.0,
        specialTenureMonths: 44,
        availableTenures: [12, 15, 18, 24, 30, 36, 44, 60],
        schemes: [
            {
                name: "Bajaj Finance Cumulative Scheme",
                type: "CUMULATIVE",
                tenureMonths: 44,
                baseRate: 8.45,
                seniorRate: 8.85,
                payoutFrequency: "AT_MATURITY",
                description: "Interest compounded annually & paid at maturity for maximum wealth multiplication."
            },
            {
                name: "Bajaj Finance Non-Cumulative Scheme",
                type: "NON_CUMULATIVE",
                tenureMonths: 36,
                baseRate: 8.15,
                seniorRate: 8.55,
                payoutFrequency: "MONTHLY",
                description: "Regular predictable monthly income credited straight to your bank account."
            },
            {
                name: "Bajaj Finance Special 15M Scheme",
                type: "CUMULATIVE",
                tenureMonths: 15,
                baseRate: 7.80,
                seniorRate: 8.20,
                payoutFrequency: "AT_MATURITY",
                description: "Short term high liquidity deposit with attractive yields."
            }
        ],
        highlights: [
            "CRISIL AAA & ICRA AAA Highest Safety Rating",
            "Highest return of 8.85% p.a. for senior citizens",
            "Loan against FD facility available up to 75%",
            "Direct digital application processed on IRIS platform"
        ],
        color: "#0284C7",
        badgeBg: "rgba(2, 132, 199, 0.15)"
    },
    {
        id: "SHRIRAM_FINANCE",
        code: "SHRIRAM_FINANCE",
        name: "Shriram Finance Limited",
        shortName: "Shriram Finance",
        rating: "CRISIL AA+ / ICRA AAA",
        ratingAgency: "CRISIL & ICRA",
        ratingDescription: "High Stability • 50+ Years of Financial Excellence",
        logo: "assets/images/fd/shriram_finance.png",
        minAmount: 5000,
        maxRate: 9.20,
        baseRate: 8.60,
        seniorCitizenExtra: 0.50,
        womenExtra: 0.10,
        specialTenureMonths: 50,
        availableTenures: [12, 18, 24, 30, 36, 48, 50, 60],
        schemes: [
            {
                name: "Shriram Unnati Cumulative FD",
                type: "CUMULATIVE",
                tenureMonths: 50,
                baseRate: 8.60,
                seniorRate: 9.10,
                womenRate: 8.70,
                seniorWomenRate: 9.20,
                payoutFrequency: "AT_MATURITY",
                description: "Market-leading yield up to 9.20% p.a. for maximum long-term growth."
            },
            {
                name: "Shriram Regular Income Monthly FD",
                type: "NON_CUMULATIVE",
                tenureMonths: 36,
                baseRate: 8.25,
                seniorRate: 8.75,
                womenRate: 8.35,
                seniorWomenRate: 8.85,
                payoutFrequency: "MONTHLY",
                description: "High monthly cashflow for retired individuals and households."
            },
            {
                name: "Shriram Short Term 12M Deposit",
                type: "CUMULATIVE",
                tenureMonths: 12,
                baseRate: 7.85,
                seniorRate: 8.35,
                womenRate: 7.95,
                payoutFrequency: "AT_MATURITY",
                description: "Quick 1-year lock-in with minimum investment of just ₹5,000."
            }
        ],
        highlights: [
            "Industry-leading interest rate up to 9.20% p.a.",
            "Extra 0.50% for Senior Citizens & 0.10% for Women",
            "Low ₹5,000 minimum deposit makes it accessible for everyone",
            "Ranked among India's largest retail asset financing NBFCs"
        ],
        color: "#D97706",
        badgeBg: "rgba(217, 119, 6, 0.15)"
    },
    {
        id: "MAHINDRA_FINANCE",
        code: "MAHINDRA_FINANCE",
        name: "Mahindra & Mahindra Financial Services Limited",
        shortName: "Mahindra Finance",
        rating: "CRISIL AAA / India Ratings AAA",
        ratingAgency: "CRISIL & IND",
        ratingDescription: "Highest Safety • Trust of Mahindra Group Legacy",
        logo: "assets/images/fd/mahindra_finance.png",
        minAmount: 10000,
        maxRate: 8.10,
        baseRate: 7.75,
        seniorCitizenExtra: 0.35,
        womenExtra: 0.0,
        specialTenureMonths: 42,
        availableTenures: [12, 24, 30, 42, 60],
        schemes: [
            {
                name: "Mahindra Dhanvruddhi Cumulative Scheme",
                type: "CUMULATIVE",
                tenureMonths: 42,
                baseRate: 7.75,
                seniorRate: 8.10,
                payoutFrequency: "AT_MATURITY",
                description: "Special high-yield scheme from Mahindra Group with compounded returns."
            },
            {
                name: "Mahindra Samruddhi Non-Cumulative Scheme",
                type: "NON_CUMULATIVE",
                tenureMonths: 30,
                baseRate: 7.50,
                seniorRate: 7.85,
                payoutFrequency: "QUARTERLY",
                description: "Dependable quarterly payouts for steady interest liquidity."
            },
            {
                name: "Mahindra Flexi 24M Deposit",
                type: "CUMULATIVE",
                tenureMonths: 24,
                baseRate: 7.60,
                seniorRate: 7.95,
                payoutFrequency: "AT_MATURITY",
                description: "Balanced medium-term capital security with premier AAA safety."
            }
        ],
        highlights: [
            "Backed by the trusted legacy of the Mahindra Conglomerate",
            "CRISIL AAA rating for supreme safety of principal & interest",
            "Flexible interest frequency: Monthly, Quarterly, Half-Yearly, Yearly",
            "Prompt electronic payouts directly to verified bank account"
        ],
        color: "#DC2626",
        badgeBg: "rgba(220, 38, 38, 0.15)"
    },
    {
        id: "PNB_HOUSING",
        code: "PNB_HOUSING",
        name: "PNB Housing Finance Limited",
        shortName: "PNB Housing",
        rating: "CRISIL AA+ / CARE AA+",
        ratingAgency: "CRISIL & CARE",
        ratingDescription: "High Safety • Subsidiary of Punjab National Bank",
        logo: "assets/images/fd/pnb_housing.png",
        minAmount: 10000,
        maxRate: 7.95,
        baseRate: 7.70,
        seniorCitizenExtra: 0.25,
        womenExtra: 0.0,
        specialTenureMonths: 36,
        availableTenures: [12, 24, 36, 48, 60],
        schemes: [
            {
                name: "PNB Housing Cumulative Scheme",
                type: "CUMULATIVE",
                tenureMonths: 36,
                baseRate: 7.70,
                seniorRate: 7.95,
                payoutFrequency: "AT_MATURITY",
                description: "Annual compounding deposit from one of India's largest housing finance companies."
            },
            {
                name: "PNB Housing Regular Monthly Payout",
                type: "NON_CUMULATIVE",
                tenureMonths: 24,
                baseRate: 7.35,
                seniorRate: 7.60,
                payoutFrequency: "MONTHLY",
                description: "Dependable monthly interest directly to your account for retired individuals."
            }
        ],
        highlights: [
            "Promoted by Punjab National Bank with 35+ years of excellence",
            "CRISIL AA+ Stable rating guaranteeing high safety",
            "Flexible compounding and payout options from 1 to 5 years",
            "Full electronic lifecycle through IRIS platform"
        ],
        color: "#991B1B",
        badgeBg: "rgba(153, 27, 27, 0.15)"
    },
    {
        id: "LIC_HOUSING",
        code: "LIC_HOUSING",
        name: "LIC Housing Finance Limited",
        shortName: "LIC Housing",
        rating: "CRISIL AAA / CARE AAA",
        ratingAgency: "CRISIL & CARE",
        ratingDescription: "Highest Safety • Sovereign Trust of Life Insurance Corp",
        logo: "assets/images/fd/lic_housing.png",
        minAmount: 20000,
        maxRate: 8.00,
        baseRate: 7.75,
        seniorCitizenExtra: 0.25,
        womenExtra: 0.0,
        specialTenureMonths: 60,
        availableTenures: [12, 18, 24, 36, 60],
        schemes: [
            {
                name: "LIC HFL Sanchay Cumulative Scheme",
                type: "CUMULATIVE",
                tenureMonths: 60,
                baseRate: 7.75,
                seniorRate: 8.00,
                payoutFrequency: "AT_MATURITY",
                description: "Highest safety AAA deposit with capital growth backed by LIC brand equity."
            },
            {
                name: "LIC HFL Sanchay Monthly Payout",
                type: "NON_CUMULATIVE",
                tenureMonths: 36,
                baseRate: 7.45,
                seniorRate: 7.70,
                payoutFrequency: "MONTHLY",
                description: "Monthly interest payout ideal for senior citizens and steady income seekers."
            }
        ],
        highlights: [
            "Backed by Life Insurance Corporation of India (LIC)",
            "CRISIL AAA rating signifying maximum degree of safety",
            "Seamless electronic renewal and direct credit to bank account",
            "Zero market risk with guaranteed compounded interest"
        ],
        color: "#1E3A8A",
        badgeBg: "rgba(30, 58, 138, 0.15)"
    }
];

// Helper to calculate interest rate and maturity values
function calculateFdMaturity(companyCode, amount, tenureMonths, isSenior, isWomen, isCumulative) {
    const amt = Number(amount) || 10000;
    const tenure = Number(tenureMonths) || 12;

    let baseRate = 7.50;
    let seniorExtra = 0.35;
    let womenExtra = 0.0;

    const company = FD_COMPANIES.find(c => c.code === companyCode) || FD_COMPANIES[0];
    baseRate = company.baseRate;
    seniorExtra = company.seniorCitizenExtra;
    womenExtra = company.womenExtra;

    // Adjust rate for tenure tiers
    if (tenure >= 42) {
        baseRate = company.baseRate;
    } else if (tenure >= 24) {
        baseRate = Math.max(7.20, company.baseRate - 0.25);
    } else {
        baseRate = Math.max(7.00, company.baseRate - 0.50);
    }

    let finalRate = baseRate;
    if (isSenior) finalRate += seniorExtra;
    if (isWomen && womenExtra > 0) finalRate += womenExtra;

    finalRate = Math.round(finalRate * 100) / 100;

    let maturityAmount = amt;
    let periodicPayout = 0;

    if (isCumulative) {
        // Compound interest: A = P * (1 + r/100)^(tenure/12)
        const years = tenure / 12;
        maturityAmount = Math.round(amt * Math.pow(1 + (finalRate / 100), years));
    } else {
        // Simple periodic payout: monthly = P * (r/100) / 12
        periodicPayout = Math.round((amt * (finalRate / 100)) / 12);
        maturityAmount = amt;
    }

    return {
        interestRate: finalRate,
        maturityAmount,
        periodicPayout,
        totalInterest: maturityAmount - amt,
    };
}

// ── GET COMPANIES & SCHEMES MASTER ───────────────────────────────────────────
exports.getCompaniesAndSchemes = async (req, res, next) => {
    try {
        // Fetch user's existing KYC / Bank details if logged in to pre-fill form
        let prefillData = null;
        if (req.user && req.user._id) {
            const [user, kyc] = await Promise.all([
                User.findById(req.user._id).select("name phone email panNumber location"),
                Kyc.findOne({ user: req.user._id })
            ]);

            prefillData = {
                fullName: kyc?.fullName || user?.name || "",
                panNumber: kyc?.panNumber || user?.panNumber || "",
                dob: kyc?.dob ? kyc.dob.toISOString().split("T")[0] : "",
                gender: kyc?.gender || "Male",
                mobileNumber: user?.phone || "",
                email: user?.email || "",
                addressLine1: kyc?.address?.line1 || user?.location?.address || "",
                city: kyc?.address?.city || user?.location?.city || "",
                state: kyc?.address?.state || user?.location?.state || "",
                pincode: kyc?.address?.pincode || user?.location?.pincode || "",
                bankName: kyc?.bankDetails?.bankName || "",
                accountNumber: kyc?.bankDetails?.accountNumber || "",
                ifscCode: kyc?.bankDetails?.ifscCode || "",
                accountHolderName: kyc?.bankDetails?.accountHolderName || user?.name || "",
            };
        }

        return res.json({
            success: true,
            companies: FD_COMPANIES,
            prefillData,
            bondsConfig: {
                websiteUrl: "https://www.vikaone.com/bonds",
                title: "VikaOne Bonds Market",
                subtitle: "Invest in Sovereign Gold Bonds, PSU & High Yield Corporate Bonds",
            }
        });
    } catch (err) {
        next(err);
    }
};

// ── SUBMIT FIXED DEPOSIT APPLICATION (IRIS PLATFORM) ─────────────────────────
exports.submitFdApplication = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const b = req.body;

        // Validation for mandatory fields
        if (!b.company || !b.amount || !b.tenureMonths) {
            return res.status(400).json({ success: false, message: "Company, deposit amount, and tenure are required." });
        }
        if (!b.fullName || !b.panNumber || !b.dob || !b.mobileNumber) {
            return res.status(400).json({ success: false, message: "Full Name, PAN Number, Date of Birth, and Mobile Number are required." });
        }
        if (!b.bankName || !b.accountNumber || !b.ifscCode) {
            return res.status(400).json({ success: false, message: "Complete bank details (Bank Name, Account Number, IFSC) are required for interest payouts." });
        }

        const companyInfo = FD_COMPANIES.find(c => c.code === b.company) || FD_COMPANIES[0];

        if (Number(b.amount) < companyInfo.minAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum deposit for ${companyInfo.name} is ₹${companyInfo.minAmount.toLocaleString("en-IN")}.`
            });
        }

        // Calculation of interest rate and maturity values
        const calc = calculateFdMaturity(
            b.company,
            b.amount,
            b.tenureMonths,
            Boolean(b.seniorCitizen),
            Boolean(b.womenInvestor),
            b.depositType === "CUMULATIVE"
        );

        // Generate clean unique application ID: FD-YYYYMM-XXXXX
        const datePrefix = new Date().toISOString().slice(0, 7).replace("-", "");
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const applicationId = `FD-${datePrefix}-${randomNum}`;

        const application = await FixedDepositApplication.create({
            applicationId,
            user: userId,
            company: b.company,
            companyName: companyInfo.name,
            schemeName: b.schemeName || `${companyInfo.shortName} ${b.depositType === 'CUMULATIVE' ? 'Cumulative' : 'Non-Cumulative'} FD`,
            depositType: b.depositType || "CUMULATIVE",
            payoutFrequency: b.payoutFrequency || (b.depositType === "CUMULATIVE" ? "AT_MATURITY" : "MONTHLY"),
            amount: Number(b.amount),
            tenureMonths: Number(b.tenureMonths),
            interestRate: calc.interestRate,
            seniorCitizen: Boolean(b.seniorCitizen),
            womenInvestor: Boolean(b.womenInvestor),
            maturityAmount: calc.maturityAmount,
            periodicPayoutAmount: calc.periodicPayout,
            autoRenewal: b.autoRenewal || "NO_RENEWAL",

            // Personal
            fullName: b.fullName.trim(),
            panNumber: b.panNumber.trim().toUpperCase(),
            dob: b.dob,
            gender: b.gender || "Male",
            maritalStatus: b.maritalStatus || "Married",
            fatherOrSpouseName: b.fatherOrSpouseName ? b.fatherOrSpouseName.trim() : "Not Specified",
            motherMaidenName: b.motherMaidenName ? b.motherMaidenName.trim() : "",
            occupation: b.occupation || "Salaried",
            annualIncome: b.annualIncome || "5 - 10 Lakhs",
            isPep: Boolean(b.isPep),
            residentStatus: b.residentStatus || "Resident Individual",

            // Contact & Address
            mobileNumber: b.mobileNumber.trim(),
            email: (b.email || req.user.email || "").trim().toLowerCase(),
            addressLine1: b.addressLine1.trim(),
            addressLine2: b.addressLine2 ? b.addressLine2.trim() : "",
            landmark: b.landmark ? b.landmark.trim() : "",
            city: b.city.trim(),
            state: b.state.trim(),
            pincode: b.pincode.trim(),
            samePermanentAddress: b.samePermanentAddress !== false,
            permanentAddressLine1: b.permanentAddressLine1 || "",
            permanentCity: b.permanentCity || "",
            permanentState: b.permanentState || "",
            permanentPincode: b.permanentPincode || "",

            // Bank
            bankName: b.bankName.trim(),
            accountNumber: b.accountNumber.trim(),
            ifscCode: b.ifscCode.trim().toUpperCase(),
            branchName: b.branchName ? b.branchName.trim() : "",
            accountType: b.accountType || "Savings",
            accountHolderName: (b.accountHolderName || b.fullName).trim(),

            // Nominee
            hasNominee: b.hasNominee !== false,
            nomineeName: b.nomineeName ? b.nomineeName.trim() : "",
            nomineeRelation: b.nomineeRelation ? b.nomineeRelation.trim() : "",
            nomineeDob: b.nomineeDob || "",
            isNomineeMinor: Boolean(b.isNomineeMinor),
            guardianName: b.guardianName ? b.guardianName.trim() : "",
            guardianRelation: b.guardianRelation ? b.guardianRelation.trim() : "",
            guardianAddress: b.guardianAddress ? b.guardianAddress.trim() : "",
            nomineeAddress: b.nomineeAddress ? b.nomineeAddress.trim() : "",

            // Tax & Declarations
            form15G15H: Boolean(b.form15G15H),
            declarationAccepted: true,
            customerNotes: b.customerNotes ? b.customerNotes.trim() : "",

            status: "SUBMITTED"
        });

        // Trigger notification log
        try {
            const NotificationLog = require("../models/NotificationLog");
            if (NotificationLog) {
                await NotificationLog.create({
                    user: userId,
                    title: "Fixed Deposit Application Submitted",
                    message: `Your FD application (${applicationId}) for ₹${Number(b.amount).toLocaleString('en-IN')} with ${companyInfo.shortName} has been received. Our team will verify and submit your application on the IRIS platform.`,
                    type: "FIXED_DEPOSIT",
                    metadata: { applicationId, company: b.company, amount: b.amount }
                });
            }
        } catch (_) {}

        return res.status(201).json({
            success: true,
            message: "Fixed Deposit application submitted successfully! Our team is processing it on IRIS.",
            data: application
        });
    } catch (err) {
        next(err);
    }
};

// ── GET USER'S FD APPLICATIONS ───────────────────────────────────────────────
exports.getMyFdApplications = async (req, res, next) => {
    try {
        const applications = await FixedDepositApplication.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: applications,
            count: applications.length
        });
    } catch (err) {
        next(err);
    }
};

// ── GET SINGLE FD APPLICATION BY ID ──────────────────────────────────────────
exports.getFdApplicationById = async (req, res, next) => {
    try {
        const application = await FixedDepositApplication.findOne({
            _id: req.params.id,
            user: req.user._id
        }).lean();

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

// ── BONDS CONFIGURATION & INFORMATION ────────────────────────────────────────
exports.getBondsConfig = async (req, res, next) => {
    try {
        const websiteUrl = process.env.BONDS_WEBSITE_URL || "https://www.bondbazaar.com/open-trading-account/?param=UlZTMTM%3D";

        const bondCategories = [
            {
                title: "Sovereign Gold Bonds (SGB)",
                tag: "Government Backed",
                yield: "2.50% p.a. + Gold Returns",
                rating: "Sovereign (RBI)",
                taxBenefit: "100% Tax-Free at Maturity",
                minInvestment: "1 Gram Gold",
                description: "Issued by the Reserve Bank of India. Earn 2.50% annual interest paid half-yearly plus complete gold price upside, with zero capital gains tax at 8-year maturity."
            },
            {
                title: "AAA Rated Corporate Bonds",
                tag: "High Yield Corporate",
                yield: "8.50% - 11.20% p.a.",
                rating: "CRISIL / ICRA AAA",
                taxBenefit: "Regular Predictable Payouts",
                minInvestment: "₹10,000",
                description: "Invest in top public sector undertakings (PSUs) and bluechip corporate debt instruments with supreme credit ratings and significantly higher returns than bank savings."
            },
            {
                title: "54EC Capital Gain Exemption Bonds",
                tag: "Section 54EC",
                yield: "5.25% p.a. Guaranteed",
                rating: "AAA / Sovereign",
                taxBenefit: "100% LTCG Tax Exemption",
                minInvestment: "₹10,000 (Max ₹50 Lakhs)",
                description: "Issued by REC, PFC, and NHAI. Invest long-term capital gains from property sales within 6 months to enjoy complete tax exemption under Section 54EC of the IT Act."
            },
            {
                title: "Tax-Free Infrastructure Bonds",
                tag: "100% Tax-Free Interest",
                yield: "6.80% - 7.50% Tax-Free",
                rating: "CRISIL AAA",
                taxBenefit: "Zero Tax on Interest Earned",
                minInvestment: "₹50,000",
                description: "Tax-free interest credited directly to your bank account with zero TDS deduction, ideal for investors in higher income tax brackets."
            }
        ];

        return res.json({
            success: true,
            websiteUrl,
            bonds: bondCategories,
            features: [
                "Direct electronic execution on official secondary bond market",
                "Demat credit straight to your CDSL / NSDL account",
                "Higher guaranteed yield than traditional bank deposits",
                "Backed by premier credit rating agencies: CRISIL, ICRA, and CARE"
            ]
        });
    } catch (err) {
        next(err);
    }
};
