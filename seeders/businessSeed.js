require("dotenv").config();
const mongoose = require("mongoose");
const BusinessOpportunity = require("../models/BusinessOpportunity");

const SAMPLE_OPPORTUNITIES = [
  {
    title: "Delhi-NCR Cold Chain & Multi-Modal Logistics Hub",
    category: "Warehouses & Logistics",
    location: {
      address: "Sector 37D, Pataudi Road Industrial Corridor",
      city: "Gurugram",
      state: "Haryana",
      pincode: "122001",
    },
    description:
      "A state-of-the-art 1,50,000 sq.ft. Grade-A temperature-controlled cold chain and multi-modal logistics warehouse strategically situated on the Delhi-Mumbai Expressway feeder corridor. Fully leased to tier-1 quick-commerce and FMCG conglomerates with a 9-year pre-commit lock-in agreement. Features automated loading bays, 14m clear height, solar-powered refrigeration, and round-the-clock IoT thermal monitoring.",
    minInvestmentAmount: 100000,
    totalProjectCost: 185000000,
    investmentTenure: "5 Years",
    expectedReturns: "19.5% Target IRR",
    payoutFrequency: "Monthly",
    highlights: [
      "Grade-A Pre-Leased Asset with 9-Year Institutional Lock-in",
      "Prime proximity to Delhi-Mumbai Expressway & Western Dedicated Freight Corridor",
      "Triple Net Lease (NNN) — zero tenant maintenance overhead for investors",
      "Predictable 5% annual contractual rental escalation",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80",
        caption: "Front elevation of the logistics hub and automated bay network",
        isCover: true,
      },
      {
        url: "https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80",
        caption: "Internal high-bay storage racks with IoT thermal tracking",
        isCover: false,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Logistics Hub — Detailed Project Report & Tenant Lease Agreement",
        type: "dpr",
      },
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Title Due Diligence & Technical Audit Certificate",
        type: "legal",
      },
    ],
    spvName: "VIKAONE LOGISTICS SPV 001 LLP",
    status: "active",
    isActive: true,
    featured: true,
    order: 1,
  },
  {
    title: "NH-48 Automated Mega Petrol Pump & EV Hyper-Hub",
    category: "Petrol Pumps",
    location: {
      address: "Mile Marker 128, National Highway 48, Behror Corridor",
      city: "Kotputli-Behror",
      state: "Rajasthan",
      pincode: "301701",
    },
    description:
      "A marquee 1.8-acre automated retail fuel station, retail food court, and high-speed DC fast EV charging plaza operated in partnership with leading state-run oil marketing corporations. Located on India's heaviest freight corridor between Delhi and Jaipur with over 45,000 daily vehicle transits. Offers blended income streams from petroleum retail margins, CNG dispensing, commercial restaurant leases, and EV charging commissions.",
    minInvestmentAmount: 250000,
    totalProjectCost: 78000000,
    investmentTenure: "7 Years",
    expectedReturns: "22.0% p.a. Return",
    payoutFrequency: "Monthly",
    highlights: [
      "Operated with PSU Oil Major Dealer-Owned-Company-Operated (DOCO) agreement",
      "Guaranteed monthly throughput volume with high diesel & CNG fleet patronage",
      "Multiplying revenue streams: Fuel margins + Fast-Food food court + EV charging",
      "Full statutory clearances, explosive licenses, and NHAI direct access approvals",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1545459720-aac8509eb02c?auto=format&fit=crop&w=1200&q=80",
        caption: "Highway retail fueling concourse with multi-bay dispensing",
        isCover: true,
      },
      {
        url: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&w=1200&q=80",
        caption: "Dedicated EV fast charging bays and 24x7 traveler amenities",
        isCover: false,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Highway Retail Outlet Feasibility & Traffic Flow Audit",
        type: "dpr",
      },
    ],
    spvName: "VIKAONE HIGHWAY MOBILITY SPV LLP",
    status: "active",
    isActive: true,
    featured: true,
    order: 2,
  },
  {
    title: "Panchamrit Modern Automated Dairy & Milking Farm",
    category: "Dairy Farms",
    location: {
      address: "Moghar Agricultural Zone, Anand District",
      city: "Anand",
      state: "Gujarat",
      pincode: "388345",
    },
    description:
      "An advanced 35-acre commercial dairy farm housing 600 high-pedigree Holstein-Friesian & Murrah cross breeds. Equipped with Swedish DeLaval automated rotary milking parlors, IoT bovine health collars, precision nutrition feed management, and an on-site pasteurization packaging line. Long-term exclusive supply contracts with national cooperative dairy federations guarantee 100% daily milk off-take at regulated premium rates.",
    minInvestmentAmount: 50000,
    totalProjectCost: 45000000,
    investmentTenure: "3 Years",
    expectedReturns: "18.5% p.a. Projected",
    payoutFrequency: "Monthly",
    highlights: [
      "Assured 100% daily off-take with established cooperative dairy federations",
      "Automated Swedish rotary milking systems with zero human contact",
      "Biosecure herd management with individual RFID milk yield tracking",
      "Additional revenue from organic bio-compost and vermiculture sales",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?auto=format&fit=crop&w=1200&q=80",
        caption: "Commercial automated dairy farm barn and grazing paddock",
        isCover: true,
      },
      {
        url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1200&q=80",
        caption: "Rotary robotic milking parlor and chillers",
        isCover: false,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Dairy Farm Techno-Economic Feasibility Report",
        type: "dpr",
      },
    ],
    spvName: "VIKAONE AGRI TECH SPV LLP",
    status: "active",
    isActive: true,
    featured: false,
    order: 3,
  },
  {
    title: "Heritage Palace Boutique Hotel & Spa Resort",
    category: "Hotels & Hospitality",
    location: {
      address: "Fateh Sagar Lake Shore Road, Ambamata",
      city: "Udaipur",
      state: "Rajasthan",
      pincode: "313001",
    },
    description:
      "A 42-key heritage boutique palace luxury resort overlooking Lake Fateh Sagar in the world's most sought-after wedding destination. Features opulent Mewari architectural pavilions, rooftop infinity pool, multi-cuisine lakefront fine dining, and grand banquet lawns hosting high-profile destination weddings. Managed by a renowned luxury hospitality operator under an attractive management & revenue-share model.",
    minInvestmentAmount: 500000,
    totalProjectCost: 240000000,
    investmentTenure: "5 Years",
    expectedReturns: "21.0% Target IRR",
    payoutFrequency: "Quarterly",
    highlights: [
      "Consistent 82% average annual occupancy with peak destination wedding premiums",
      "Managed by an award-winning luxury boutique resort operator",
      "High Average Room Rate (ARR) of ₹16,500+ with 45% F&B and banquet revenue",
      "Direct lakefront freehold title with heritage conservation clearance",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
        caption: "Lakefront heritage palace resort facade and illuminated courtyard",
        isCover: true,
      },
      {
        url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
        caption: "Luxury heritage suite with private balcony facing the lake",
        isCover: false,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Hospitality Financial Model & Historical RevPAR Analysis",
        type: "financials",
      },
    ],
    spvName: "VIKAONE HOSPITALITY SPV 002 LLP",
    status: "active",
    isActive: true,
    featured: true,
    order: 4,
  },
  {
    title: "GreenEarth 15-TPD Bio-CNG / SATAT CBG Plant",
    category: "CBG (Compressed Biogas) Plants",
    location: {
      address: "Sanwer Industrial Area, Agro-Processing Cluster",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "453551",
    },
    description:
      "A cutting-edge 15 Tons Per Day (TPD) Compressed Biogas (CBG) manufacturing facility transforming agricultural biomass, paddy straw, and press mud into clean Bio-CNG. Registered under the Government of India's prestigious SATAT scheme with a binding 10-year Commercial Gas Off-take Agreement with a major public-sector natural gas distribution utility. Produces premium Fermented Organic Manure (FOM) as a high-margin co-product.",
    minInvestmentAmount: 100000,
    totalProjectCost: 145000000,
    investmentTenure: "6 Years",
    expectedReturns: "24.5% p.a. Projected",
    payoutFrequency: "Monthly",
    highlights: [
      "10-Year Binding Off-Take Agreement with Public Gas Utility under SATAT",
      "Central Government Capital Subsidy & Carbon Credit (VER) Monetization",
      "Dual Revenue Stream: 15 TPD Bio-CNG + 40 TPD Solid Organic Bio-Fertilizer",
      "Zero feedstock supply risk via tie-ups with 25 regional farmer producer organizations",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80",
        caption: "Bio-CNG anaerobic digester domes and gas purification towers",
        isCover: true,
      },
      {
        url: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=80",
        caption: "Automated gas compression and cascade cylinder dispensing station",
        isCover: false,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "SATAT Scheme Approval & Gas Sale Agreement (GSA)",
        type: "legal",
      },
    ],
    spvName: "VIKAONE BIO ENERGY SPV 003 LLP",
    status: "active",
    isActive: true,
    featured: true,
    order: 5,
  },
  {
    title: "Metro Hub Rooftop Solar Grid & Commercial Fleet Depot",
    category: "Other Business Opportunities",
    location: {
      address: "Bhiwandi Commercial Belt, Kalyan Corridor",
      city: "Thane",
      state: "Maharashtra",
      pincode: "421302",
    },
    description:
      "A combined 2.5 MW industrial rooftop solar power generation project integrated with a commercial electric delivery van fleet charging and maintenance terminal. Supplies clean solar energy to surrounding manufacturing hubs under a 15-year Power Purchase Agreement (PPA) while leasing depot parking, automated battery swapping, and overnight fast-charging infrastructure to nationwide logistics aggregators.",
    minInvestmentAmount: 150000,
    totalProjectCost: 92000000,
    investmentTenure: "5 Years",
    expectedReturns: "20.0% p.a. Return",
    payoutFrequency: "Monthly",
    highlights: [
      "15-Year Bankable Power Purchase Agreement (PPA) with A-rated industrial consumers",
      "Strategic logistics node with rising captive demand for fleet charging bays",
      "Accelerated depreciation benefits and net-metering grid injection parity",
      "Tier-1 Tiered Solar Modules with 25-year manufacturer performance warranty",
    ],
    images: [
      {
        url: "https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1200&q=80",
        caption: "Commercial rooftop solar installation and transmission array",
        isCover: true,
      },
    ],
    documents: [
      {
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        title: "Solar PPA Contract & DISCOM Grid Interconnection Sanction",
        type: "legal",
      },
    ],
    spvName: "VIKAONE CLEAN MOBILITY SPV LLP",
    status: "active",
    isActive: true,
    featured: false,
    order: 6,
  },
];

async function seedBusinessOpportunities() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("MONGO_URI not found in env!");
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Connected to MongoDB successfully.");

    const existingCount = await BusinessOpportunity.countDocuments();
    console.log(`Current BusinessOpportunity count in DB: ${existingCount}`);

    if (existingCount === 0) {
      console.log("Seeding initial 6 verified business opportunities...");
      const created = await BusinessOpportunity.insertMany(SAMPLE_OPPORTUNITIES);
      console.log(`Successfully seeded ${created.length} business opportunities.`);
    } else {
      console.log("Database already has business opportunities. Checking missing categories...");
      for (const item of SAMPLE_OPPORTUNITIES) {
        const exists = await BusinessOpportunity.findOne({ category: item.category });
        if (!exists) {
          await BusinessOpportunity.create(item);
          console.log(`Seeded missing category: ${item.category} -> "${item.title}"`);
        }
      }
    }

    const totalNow = await BusinessOpportunity.countDocuments();
    console.log(`Final BusinessOpportunity count: ${totalNow}`);
    process.exit(0);
  } catch (err) {
    console.error("Error seeding business opportunities:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  seedBusinessOpportunities();
}

module.exports = { seedBusinessOpportunities, SAMPLE_OPPORTUNITIES };
