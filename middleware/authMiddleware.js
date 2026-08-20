const jwt = require("jsonwebtoken");
const User = require("../models/User");

/* Verify JWT token */
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User not found or deactivated" });
    }

    // Dynamic backfill/fallback check for KYC status
    if (user.kycStatus !== "approved") {
      const Kyc = require("../models/Kyc");
      const kyc = await Kyc.findOne({ user: user._id });
      if (kyc && kyc.status !== user.kycStatus) {
        user.kycStatus = kyc.status;
        await user.save().catch(() => {});
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

/* Role-based access: pass allowed roles as args
   e.g. authorize("admin") or authorize("admin", "superadmin") */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' not allowed to access this route`,
      });
    }
    next();
  };
};
/* Optional JWT Auth (does not fail if no token) */
exports.optionalProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (err) {}
  }
  next();
};
