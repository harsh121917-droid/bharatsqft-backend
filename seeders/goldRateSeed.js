// Run once: node seeders/goldRateSeed.js
// Sets the initial gold rate in DB

const mongoose = require("mongoose");
require("dotenv").config();

const { GoldRate } = require("../models/Gold");

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);
    await GoldRate.deleteMany({});
    await GoldRate.create({
        buyRate: 7309.00,
        sellRate: 7256.40,
        change24h: 96.00,
        changePct: 1.33,
        purity: "24K",
        source: "manual",
        isActive: true,
    });
    console.log("✅ Gold rate seeded: Buy ₹7309/g · Sell ₹7256.40/g");
    await mongoose.disconnect();
}
seed().catch(console.error);