const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { consumeVerifiedOtp } = require("./otpController");
const RewardSettings = require("../models/RewardSettings");
const RewardTxn = require("../models/RewardTxn");

// Helper to generate a unique referral code
async function generateUniqueReferralCode() {
    let code = "";
    let exists = true;
    while (exists) {
        code = "VIKA-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const user = await User.findOne({ referralCode: code });
        if (!user) exists = false;
    }
    return code;
}

// Helper to handle registration points & referral rewards
async function processReferralAndRewards(user, enteredReferralCode) {
    // 1. Generate and assign a unique referral code to the new user
    user.referralCode = await generateUniqueReferralCode();
    
    // 2. Fetch active reward settings
    let settings = await RewardSettings.findOne({ isActive: true });
    const regPoints = settings ? settings.registrationPoints : 100;
    const refPoints = settings ? settings.referralPoints : 200;

    // 3. Process referral if code was provided
    if (enteredReferralCode) {
        const referrer = await User.findOne({ referralCode: enteredReferralCode.trim().toUpperCase() });
        if (referrer) {
            user.referredBy = referrer._id;
            
            // Credit referrer
            if (refPoints > 0) {
                referrer.rewardPoints = (referrer.rewardPoints || 0) + refPoints;
                await referrer.save();
                
                await RewardTxn.create({
                    user: referrer._id,
                    type: "referral",
                    points: refPoints,
                    description: `Referral bonus for inviting ${user.name || user.phone || user.email}`,
                    extra: { referredUserId: user._id }
                });
            }
        }
    }

    // 4. Credit registration bonus to the new user
    if (regPoints > 0) {
        user.rewardPoints = regPoints;
        await RewardTxn.create({
            user: user._id,
            type: "registration",
            points: regPoints,
            description: "Registration welcome bonus"
        });
    }

    await user.save();
}

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password, otpRecordId, referralCode } = req.body;
    if (!phone || !otpRecordId) {
      return res.status(400).json({ success: false, message: "Phone number and OTP verification required" });
    }
    const ok = await consumeVerifiedOtp(phone, "register", otpRecordId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "OTP not verified or expired — verify again" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: "Email already registered" });
    const existsPhone = await User.findOne({ phone });
    if (existsPhone) return res.status(400).json({ success: false, message: "Phone number already registered" });

    const user = await User.create({ name, email, phone, password });
    await processReferralAndRewards(user, referralCode);
    sendToken(user, 201, res);
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password))) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/verify-credentials — step 1 of login: check identifier
// (email OR phone) + password WITHOUT issuing a token yet. If valid, returns
// the user's registered phone so the client can send an OTP there next —
// even if the user typed their email as identifier, OTP always goes to the
// registered phone, never email.
// body: { identifier, password }
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyCredentials = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Email/phone and password required" });
    }
    const isEmail = identifier.includes("@");
    const user = await User.findOne(isEmail ? { email: identifier } : { phone: identifier }).select("+password");
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (!user.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });
    if (!user.phone) {
      return res.status(400).json({ success: false, message: "No phone number on file — contact support" });
    }
    res.json({ success: true, phone: user.phone });
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════════════════
// Phone + OTP register/login — additive, doesn't change the existing
// email/password flow above. Client must first call:
//   POST /api/otp/send    { phone, purpose: "register" | "login" }
//   POST /api/otp/verify  { phone, purpose, code }  → returns otpRecordId
// then pass that otpRecordId here.
// ══════════════════════════════════════════════════════════════════════════════

exports.registerWithOtp = async (req, res, next) => {
  try {
    const { name, email, phone, otpRecordId, referralCode } = req.body;
    if (!name || !phone || !otpRecordId) {
      return res.status(400).json({ success: false, message: "name, phone and otpRecordId are required" });
    }

    const ok = await consumeVerifiedOtp(phone, "register", otpRecordId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "OTP not verified or expired — verify again" });
    }

    const exists = await User.findOne({ phone });
    if (exists) return res.status(400).json({ success: false, message: "Phone already registered" });

    // No password needed for OTP-based accounts — generate a random one so
    // the schema's password requirement is still satisfied, but the user
    // will always log back in via OTP, never this random value.
    const randomPassword = require("crypto").randomBytes(16).toString("hex");
    const user = await User.create({ name, email, phone, password: randomPassword });
    await processReferralAndRewards(user, referralCode);
    sendToken(user, 201, res);
  } catch (err) { next(err); }
};

exports.loginWithOtp = async (req, res, next) => {
  try {
    const { phone, otpRecordId } = req.body;
    if (!phone || !otpRecordId) {
      return res.status(400).json({ success: false, message: "phone and otpRecordId are required" });
    }

    const ok = await consumeVerifiedOtp(phone, "login", otpRecordId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "OTP not verified or expired — verify again" });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ success: false, message: "No account found with this phone number" });
    if (!user.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });

    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");
    if (!(await user.matchPassword(currentPassword))) return res.status(400).json({ success: false, message: "Current password incorrect" });
    user.password = newPassword;
    await user.save();
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (name) user.name = name;
    if (email) {
      if (email.toLowerCase() !== user.email.toLowerCase()) {
        const emailExists = await User.findOne({ email: email.toLowerCase() });
        if (emailExists) {
          return res.status(400).json({ success: false, message: "Email already in use" });
        }
        user.email = email.toLowerCase();
      }
    }

    await user.save({ validateBeforeSave: false });
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};