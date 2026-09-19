const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);

        // Seed default coins if collection is empty
        const Coin = require("../models/Coin");
        const count = await Coin.countDocuments();
        if (count === 0) {
            console.log("Seeding default coins to DB...");
            await Coin.insertMany([
                { name: "1g Gold Coin (24K)", metal: "gold", grams: 1, makingChargePct: 8 },
                { name: "2g Gold Coin (24K)", metal: "gold", grams: 2, makingChargePct: 7 },
                { name: "5g Gold Coin (24K)", metal: "gold", grams: 5, makingChargePct: 6 },
                { name: "10g Gold Coin (24K)", metal: "gold", grams: 10, makingChargePct: 5 },
                { name: "10g Silver Coin (999)", metal: "silver", grams: 10, makingChargePct: 10 },
                { name: "50g Silver Coin (999)", metal: "silver", grams: 50, makingChargePct: 8 },
            ]);
            console.log("✅ Default coins seeded successfully!");
        }

        // Auto-heal & publish any properties stuck in draft/unpublished
        try {
            const Property = require("../models/Property");
            const props = await Property.find({});
            for (const p of props) {
                let changed = false;
                const update = {};
                if (p.status !== "published") {
                    update.status = "published";
                    changed = true;
                }
                if (!p.featured) {
                    update.featured = true;
                    changed = true;
                }
                if (!p.investmentEnabled) {
                    update.investmentEnabled = true;
                    changed = true;
                }
                if (!p.price?.amount && (p.totalInvestmentRequired || (p.brickPrice && p.totalBricks))) {
                    update["price.amount"] = p.totalInvestmentRequired || (p.brickPrice * p.totalBricks);
                    update["price.currency"] = "INR";
                    update["price.label"] = "onwards";
                    changed = true;
                }
                if (!p.totalInvestmentRequired && p.price?.amount) {
                    update.totalInvestmentRequired = p.price.amount;
                    changed = true;
                }
                if (changed) {
                    await Property.findByIdAndUpdate(p._id, { $set: update });
                    console.log(`✅ Auto-synced property: "${p.title}" (${p._id}) -> published & featured`);
                }
            }
        } catch (propErr) {
            console.warn("⚠️ Property sync non-fatal error:", propErr.message);
        }

        // Seed default Home YouTube videos if collection is empty
        try {
            const HomeVideo = require("../models/HomeVideo");
            const videoCount = await HomeVideo.countDocuments();
            if (videoCount === 0) {
                console.log("Seeding default Home YouTube videos to DB...");
                await HomeVideo.insertMany([
                    {
                        title: "Vika DRX Luxury Residence Tour",
                        subtitle: "Experience luxury living & institutional architecture",
                        youtubeUrl: "https://www.youtube.com/watch?v=xBNULnZNZg0",
                        youtubeVideoId: "xBNULnZNZg0",
                        thumbnailUrl: "https://img.youtube.com/vi/xBNULnZNZg0/hqdefault.jpg",
                        order: 0,
                        isActive: true,
                    },
                    {
                        title: "Modern Architectural Villa Walkthrough",
                        subtitle: "Take an in-depth walkthrough of our prime residential assets",
                        youtubeUrl: "https://www.youtube.com/watch?v=Yw6u6YkTgQ4",
                        youtubeVideoId: "Yw6u6YkTgQ4",
                        thumbnailUrl: "https://img.youtube.com/vi/Yw6u6YkTgQ4/hqdefault.jpg",
                        order: 1,
                        isActive: true,
                    },
                    {
                        title: "Commercial Hub & Office Suites Tour",
                        subtitle: "High-yield commercial spaces curated for fractional ownership",
                        youtubeUrl: "https://www.youtube.com/watch?v=4T7HwL2v_dQ",
                        youtubeVideoId: "4T7HwL2v_dQ",
                        thumbnailUrl: "https://img.youtube.com/vi/4T7HwL2v_dQ/hqdefault.jpg",
                        order: 2,
                        isActive: true,
                    },
                ]);
                console.log("✅ Default Home YouTube videos seeded successfully!");
            }
        } catch (vidErr) {
            console.warn("⚠️ HomeVideo seed non-fatal error:", vidErr.message);
        }
    } catch (err) {
        console.error(`❌ MongoDB connection error: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;