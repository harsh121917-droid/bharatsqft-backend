require("dotenv").config();

/* ============================================================
   Bharat SQFT — Server Entry Point
   ============================================================ */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();
app.set('trust proxy', 1); // Railway runs behind a proxy

/* ---------- Security Middleware ---------- */
app.use(helmet({
  contentSecurityPolicy: false, // disabled — admin panel uses inline scripts
}));
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // handle preflight

/* ---------- Rate Limiting ---------- */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // increased for testing
  message: { success: false, message: "Too many requests, try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

/* ---------- Body Parser ---------- */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------- Logger (dev only) ---------- */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* ---------- DB Connection ---------- */
const connectDB = require("./config/db");
connectDB();

/* ---------- Routes ---------- */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/enquiries", require("./routes/enquiries"));
app.use("/api/properties", require("./routes/properties"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/kyc", require("./routes/kyc"));
app.use("/smc", require("./routes/smc"));  // SMC test — remove in production
app.use("/api/admin", require("./routes/admin"));

/* ---------- Admin Panel (static) ---------- */
const path = require("path");
app.use("/admin", express.static(path.join(__dirname, "admin")));

/* ---------- Health Check ---------- */
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Bharat SQFT API running", env: process.env.NODE_ENV });
});

/* ---------- 404 Handler ---------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

/* ---------- Global Error Handler ---------- */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (process.env.NODE_ENV === "development") console.error(err.stack);
  res.status(statusCode).json({ success: false, message, ...(process.env.NODE_ENV === "development" && { stack: err.stack }) });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});