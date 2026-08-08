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
    } catch (err) {
        console.error(`❌ MongoDB connection error: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;