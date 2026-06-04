require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();
app.set('trust proxy', 1); // add this line

/* ---------- CORS ---------- */
app.use(cors({ origin: "*", credentials: true }));

/* ---------- Security ---------- */
app.use(helmet({ contentSecurityPolicy: false }));

/* ---------- Rate Limiting ---------- */
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many requests, try again later." },
}));

/* ---------- Body Parser ---------- */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------- Logger ---------- */
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

/* ---------- DB ---------- */
const connectDB = require("./config/db");
connectDB();

/* ---------- Admin Panel ---------- */
app.use("/admin", express.static(path.join(__dirname, "admin")));

/* ---------- API Routes ---------- */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/enquiries", require("./routes/enquiries"));
app.use("/api/properties", require("./routes/properties"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/admin", require("./routes/admin"));

/* ---------- Health Check ---------- */
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Bharat SQFT API running" });
});

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

/* ---------- Error Handler ---------- */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  if (process.env.NODE_ENV === "development") console.error(err.stack);
  res.status(statusCode).json({ success: false, message });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});