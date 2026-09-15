const LegalPolicy = require("../models/LegalPolicy");

const DEFAULT_POLICIES = [
    {
        slug: "investor-agreement",
        title: "Framework Investor Agreement & LLP Partnership Terms",
        version: "v2.4 (2026 Edition)",
        content: `1. PREAMBLE & SPV PARTNERSHIP STRUCTURE
1.1 This Framework Investor Agreement ("Agreement") governs the fractional co-ownership of premium institutional-grade commercial and residential real estate assets curated by Vikaone Realty Private Limited ("Platform").
1.2 Each property asset listed on the Platform is held in a dedicated Special Purpose Vehicle ("SPV"), typically structured as a Limited Liability Partnership ("LLP") registered under the Ministry of Corporate Affairs ("MCA"), Government of India.
1.3 By subscribing to "Bricks" or purchasing fractional unit allocations, the Investor agrees to be admitted as a Designated Partner or Fractional Partner in the corresponding SPV LLP proportionate to their capital contribution.

2. CAPITAL CONTRIBUTIONS & BRICK ALLOCATION
2.1 Each fractional "Brick" represents a verified monetary unit of economic interest in the SPV asset.
2.2 Upon receipt of investment funds into the SEBI-regulated Custodian / Escrow Account, the investor is issued a digital Certificate of Beneficial Ownership and LLP partnership deed allotment.
2.3 The Platform shall ensure statutory filings of Form 3 and Form 4 with the Registrar of Companies (ROC) within thirty (30) days of closing the funding window.

3. RENTAL YIELDS & QUARTERLY DISTRIBUTIONS
3.1 Net rental income generated from lease agreements with anchor tenants shall be pooled and deposited directly into the SPV Escrow Account.
3.2 Distributions are disbursed quarterly on or before the 10th business day following the close of each financial quarter (Q1: July 10, Q2: October 10, Q3: January 10, Q4: April 10).
3.3 Statutory withholding taxes (TDS) shall be deducted in accordance with the Income Tax Act, 1961, and Form 16A certificates issued to investors annually.

4. CAPITAL PRESERVATION, CUSTODY & GOVERNANCE
4.1 The physical title deeds of the property are held in institutional escrow custody by an independent SEBI-registered Trustee (Universal Trusteeship Services / ICICI Escrow).
4.2 The property cannot be encumbered, mortgaged, pledged, or alienated without prior affirmative majority consent (>75% by capital share) of all beneficial unit holders.
4.3 Annual audits and statutory filings of the SPV accounts shall be conducted by certified chartered accountants and made available to partners on the dashboard.

5. EXIT HORIZONS & SECONDARY LIQUIDITY
5.1 Minimum Holding Period: An initial lock-in period of twelve (12) calendar months applies from the date of asset closing.
5.2 Secondary Market: Post-lock-in, investors may list their fractional Bricks for resale to verified KYC-cleared investors on the Vikaone Secondary Liquidity Window at appraised fair market value.
5.3 Asset Liquidation: In the event of a full asset buyout offer by an institutional purchaser, an asset liquidation vote shall be convened. If approved by >66% of partners, the asset shall be sold and net liquidation proceeds distributed pro-rata.

6. DISPUTE RESOLUTION & JURISDICTION
6.1 Any dispute arising under this Agreement shall be referred to binding arbitration in accordance with the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Mumbai, India.`,
        pdfUrl: ""
    },
    {
        slug: "privacy-policy",
        title: "Privacy & Data Protection Policy",
        version: "v2.1",
        content: `1. COMMITMENT TO DATA PRIVACY
Vikaone Realty Private Limited ("Vikaone", "we", "our", or "us") is dedicated to protecting the privacy, security, and confidentiality of all investors, registered users, and visitors. This Privacy Policy outlines how we collect, use, store, share, and safeguard personal and financial information in compliance with the Information Technology Act, 2000, and the Digital Personal Data Protection Act, 2023 (DPDP).

2. INFORMATION WE COLLECT
2.1 Personal Identity Information: Full legal name, date of birth, residential address, email address, mobile number, and government-issued identity documents (PAN Card, Aadhaar Card / C-KYC identifiers).
2.2 Financial & Banking Information: Bank account numbers, IFSC codes, UPI handles, source of wealth declarations, and transaction audit logs for Escrow / Razorpay settlement.
2.3 Technical & Usage Data: IP address, device telemetry, browser fingerprint, location metadata, and in-app interaction analytics.

3. PURPOSE OF DATA UTILIZATION
3.1 Execution of statutory KYC / AML checks as mandated by SEBI, RBI, and MCA guidelines.
3.2 Facilitating fractional ownership allocations, legal contract generation, and LLP partnership filings.
3.3 Processing wallet deposits, dividend payouts, and bank withdrawals.
3.4 Dispatching investment updates, ROC filing confirmations, and tax statements.

4. DATA STORAGE, ENCRYPTION & RETENTION
4.1 All sensitive identity proofs, PAN details, and banking credentials are encrypted using 256-bit AES cryptographic standards both at rest and in transit via TLS 1.3 protocols.
4.2 Data is hosted on high-security SOC2 / ISO 27001 compliant cloud servers situated within the territory of India.
4.3 KYC records are retained for a minimum statutory period of eight (8) years following the termination of customer accounts in accordance with PMLA regulations.

5. DISCLOSURE TO AUTHORIZED THIRD PARTIES
We never sell customer data to third-party advertisers. Information is shared strictly on a need-to-know basis with:
5.1 SEBI-registered Escrow Agents, Trustees, and Payment Gateways (Razorpay / ICICI).
5.2 Chartered Accountants, Legal Auditors, and ROC filing agencies for MCA partnership registrations.
5.3 Statutory law enforcement and regulatory authorities upon receipt of a valid legal order.

6. YOUR RIGHTS & CONTACT
Investors have the right to inspect their KYC records, request corrections of erroneous information, or request account closure. For privacy inquiries, contact our Data Protection Officer at privacy@vikaone.com.`,
        pdfUrl: ""
    },
    {
        slug: "terms-conditions",
        title: "Terms of Service & Platform Governance",
        version: "v3.0",
        content: `1. ACCEPTANCE OF TERMS
By accessing the Vikaone mobile application or website ("Platform"), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must refrain from using the Platform.

2. ELIGIBILITY CRITERIA
2.1 You must be at least 18 years of age and legally competent to enter into binding contracts under Indian law.
2.2 Non-Resident Indians (NRIs) and Overseas Citizens of India (OCIs) are permitted to invest subject to compliance with the Foreign Exchange Management Act (FEMA) and NRE/NRO banking guidelines.
2.3 Complete KYC verification (valid PAN and Aadhaar/Passport) is an mandatory prerequisite prior to executing any financial transaction.

3. PLATFORM SERVICES & NATURE OF INVESTMENTS
3.1 Vikaone operates as a financial technology platform facilitating co-investment and fractional ownership in SPVs holding commercial and residential real estate assets.
3.2 Past performance of properties and projected rental yields are calculated based on conservative industry estimates and do not guarantee future returns.
3.3 Investments in real estate assets are subject to market risks, tenant vacancies, macroeconomic fluctuations, and property liquidity cycles.

4. USER CONDUCT & SECURITY
4.1 You are responsible for maintaining the confidentiality of your account credentials, login OTPs, and security PINs.
4.2 Any unauthorized account access or suspicious activity must be reported immediately to security@vikaone.com.
4.3 Users agree not to engage in fraudulent transactions, automated scraping, or misuse of payment interfaces.

5. INTELLECTUAL PROPERTY
All logos, branding, user interfaces, proprietary algorithms, financial models, and valuation software belong exclusively to Vikaone Realty Private Limited and are protected by applicable intellectual property laws.

6. TERMINATION & MODIFICATIONS
Vikaone reserves the right to update these terms periodically. Continued use of the platform after updates constitutes acceptance of the revised Terms of Service.`,
        pdfUrl: ""
    },
    {
        slug: "refund-cancellation",
        title: "Refund, Cancellation & Liquidity Policy",
        version: "v1.8",
        content: `1. OVERVIEW & REGULATORY SCOPE
This Refund, Cancellation & Liquidity Policy outlines the terms governing order cancellations, transaction reversals, and secondary liquidity for investments made on the Vikaone Platform.

2. INVESTMENT ORDER CANCELLATIONS
2.1 48-Hour Cooling-off Window: Investors have an unconditional right to cancel a Brick purchase order within forty-eight (48) hours of initiating payment, provided the property funding tranche has not been officially closed and registered with the MCA.
2.2 Post Cooling-off: Once funds are committed to the designated SPV Escrow Account and the MCA LLP deed execution begins, orders cannot be unilaterally cancelled.

3. FAILED & DUPLICATE TRANSACTIONS
3.1 In the event of a failed transaction where money has been debited from your bank account or payment gateway (Razorpay) but not credited to the property order, the amount shall be automatically refunded to the source bank account within 3 to 5 business days (T+3).
3.2 Any double charge or duplicate transaction identified by our reconciliation team will be reversed to the investor's verified bank account without deduction of platform charges.

4. PROPERTY FUNDING UNSUCCESSFUL / CANCELLATION BY PLATFORM
4.1 If an asset fails to achieve the minimum required funding threshold (>90%) within the scheduled campaign window (typically 90 days), the campaign will be closed.
4.2 All investor capital held in the escrow account will be refunded in full (100%) to each investor's registered bank account within seven (7) banking days, with zero deductions.

5. SECONDARY LIQUIDITY & RESALE
5.1 After the completion of the 12-month initial holding period, investors may request to list their fractional Bricks on the secondary marketplace.
5.2 Transferred bricks are settled upon matched buyer completion and updated in the ROC partner register.

6. REFUND QUERIES
For refund escalations, please write to billing@vikaone.com with your Order ID and transaction reference number.`,
        pdfUrl: ""
    },
    {
        slug: "help-support",
        title: "Investor Help & Customer Support Center",
        version: "v1.0",
        supportEmail: "support@vikaone.com",
        supportPhone: "+91 80000 12345",
        supportWhatsapp: "+91 80000 12345",
        supportHours: "Monday - Saturday: 9:30 AM - 7:00 PM IST",
        officeAddress: "Vikaone Realty Private Limited, Nariman Point, Mumbai, Maharashtra 400021",
        content: "Our dedicated investor relations team is committed to assisting you with property due diligence, KYC compliance, rental payouts, and platform operations.",
        pdfUrl: "",
        faqs: [
            {
                question: "How does fractional real estate investment work on Vikaone?",
                answer: "Vikaone acquires high-yielding commercial and residential real estate assets through an asset-specific Special Purpose Vehicle (LLP). The asset is divided into accessible units called 'Bricks'. Investors own proportionate legal partnership in the LLP, earning quarterly rental income and long-term capital appreciation."
            },
            {
                question: "When and how are rental yields paid out to investors?",
                answer: "Rental yields are distributed quarterly directly into your verified bank account or Vikaone Wallet. Payouts are made on or before the 10th of the month following quarter-end (July, October, January, and April)."
            },
            {
                question: "Is my investment protected under the Ministry of Corporate Affairs (MCA)?",
                answer: "Yes, 100%. Every investor is legally inducted as a partner in the asset's LLP, and Form 3/Form 4 is filed directly with the ROC/MCA. You receive official MCA verification certificates."
            },
            {
                question: "How do I exit or sell my fractional Bricks?",
                answer: "After an initial 12-month lock-in period, you can list your Bricks on Vikaone's secondary liquidity window to be purchased by other verified investors, or participate in institutional asset buyout offers."
            },
            {
                question: "What documents do I need to complete my KYC verification?",
                answer: "You only need a valid PAN card and an Aadhaar card (or Passport) along with your active bank account details for dividend credit. KYC verification is typically completed within 15 minutes."
            }
        ]
    }
];

// Helper to seed defaults if not in DB
async function ensureDefaultPolicies() {
    for (const def of DEFAULT_POLICIES) {
        const exists = await LegalPolicy.findOne({ slug: def.slug });
        if (!exists) {
            await LegalPolicy.create(def);
        }
    }
}

// ── Public Endpoints ──────────────────────────────────────────
exports.getAllPolicies = async (req, res, next) => {
    try {
        await ensureDefaultPolicies();
        const policies = await LegalPolicy.find().sort("createdAt");
        res.json({
            success: true,
            count: policies.length,
            data: policies
        });
    } catch (err) {
        next(err);
    }
};

exports.getPolicyBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        let policy = await LegalPolicy.findOne({ slug });

        if (!policy) {
            const fallback = DEFAULT_POLICIES.find(p => p.slug === slug);
            if (fallback) {
                policy = await LegalPolicy.create(fallback);
            } else {
                return res.status(404).json({ success: false, message: `Policy '${slug}' not found` });
            }
        }

        res.json({
            success: true,
            data: policy
        });
    } catch (err) {
        next(err);
    }
};

// ── Admin Endpoints ───────────────────────────────────────────
exports.adminUpdatePolicy = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const {
            title,
            version,
            content,
            pdfUrl,
            supportEmail,
            supportPhone,
            supportWhatsapp,
            supportHours,
            officeAddress,
            faqs
        } = req.body;

        let policy = await LegalPolicy.findOne({ slug });
        if (!policy) {
            const fallback = DEFAULT_POLICIES.find(p => p.slug === slug) || { slug, title: slug };
            policy = new LegalPolicy(fallback);
        }

        if (title !== undefined) policy.title = title;
        if (version !== undefined) policy.version = version;
        if (content !== undefined) policy.content = content;
        if (pdfUrl !== undefined) policy.pdfUrl = pdfUrl;
        if (supportEmail !== undefined) policy.supportEmail = supportEmail;
        if (supportPhone !== undefined) policy.supportPhone = supportPhone;
        if (supportWhatsapp !== undefined) policy.supportWhatsapp = supportWhatsapp;
        if (supportHours !== undefined) policy.supportHours = supportHours;
        if (officeAddress !== undefined) policy.officeAddress = officeAddress;
        if (Array.isArray(faqs)) policy.faqs = faqs;

        policy.lastUpdated = new Date();
        if (req.user?._id) policy.updatedBy = req.user._id;

        await policy.save();

        res.json({
            success: true,
            message: `Policy '${policy.title}' updated successfully`,
            data: policy
        });
    } catch (err) {
        next(err);
    }
};

exports.adminUploadPolicyPdf = async (req, res, next) => {
    try {
        const { slug } = req.params;
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No PDF file uploaded" });
        }

        let policy = await LegalPolicy.findOne({ slug });
        if (!policy) {
            const fallback = DEFAULT_POLICIES.find(p => p.slug === slug) || { slug, title: slug };
            policy = new LegalPolicy(fallback);
        }

        const secureUrl = req.file.path || req.file.secure_url || req.file.url;
        policy.pdfUrl = secureUrl;
        policy.lastUpdated = new Date();
        if (req.user?._id) policy.updatedBy = req.user._id;

        await policy.save();

        res.json({
            success: true,
            message: "Policy PDF uploaded successfully",
            url: secureUrl,
            data: policy
        });
    } catch (err) {
        next(err);
    }
};
