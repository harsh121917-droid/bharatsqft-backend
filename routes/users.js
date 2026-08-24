const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

// Helper to reverse geocode lat/lng if city/state is not provided
async function reverseGeocode(lat, lng) {
  try {
    const https = require("https");
    return new Promise((resolve) => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
      const options = {
        headers: { "User-Agent": "BharatSQFT-GoldVika-LocationService/1.0" },
        timeout: 3000
      };
      const req = https.get(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const addr = parsed.address || {};
            const city = addr.city || addr.town || addr.village || addr.county || addr.suburb || addr.district || "";
            const state = addr.state || "";
            const country = addr.country || "India";
            const pincode = addr.postcode || "";
            const display_name = parsed.display_name || "";
            resolve({ city, state, country, pincode, address: display_name });
          } catch (_) {
            resolve({});
          }
        });
      });
      req.on("error", () => resolve({}));
      req.on("timeout", () => { req.destroy(); resolve({}); });
    });
  } catch (_) {
    return {};
  }
}

router.patch("/profile", protect, async (req, res, next) => {
  try {
    const allowed = ["name", "phone"];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// POST /api/users/location — save user's one-time live GPS location
router.post("/location", protect, async (req, res, next) => {
  try {
    const { latitude, longitude, city, state, country, address, pincode } = req.body;
    if (latitude === undefined || longitude === undefined || isNaN(Number(latitude)) || isNaN(Number(longitude))) {
      return res.status(400).json({ success: false, message: "Valid latitude and longitude coordinates are required" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    let resolvedCity = city || "";
    let resolvedState = state || "";
    let resolvedCountry = country || "India";
    let resolvedPincode = pincode || "";
    let resolvedAddress = address || "";

    // If city or state is empty, attempt auto-reverse geocoding
    if (!resolvedCity || !resolvedState) {
      const geo = await reverseGeocode(lat, lng);
      if (geo.city && !resolvedCity) resolvedCity = geo.city;
      if (geo.state && !resolvedState) resolvedState = geo.state;
      if (geo.country && !resolvedCountry) resolvedCountry = geo.country;
      if (geo.pincode && !resolvedPincode) resolvedPincode = geo.pincode;
      if (geo.address && !resolvedAddress) resolvedAddress = geo.address;
    }

    const clientIp = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();

    const locationData = {
      latitude: lat,
      longitude: lng,
      city: resolvedCity,
      state: resolvedState,
      country: resolvedCountry,
      address: resolvedAddress,
      pincode: resolvedPincode,
      capturedAt: new Date(),
      ip: clientIp
    };

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { location: locationData },
      { new: true, runValidators: false }
    );

    res.json({
      success: true,
      message: "User location recorded successfully",
      data: {
        location: user.location,
        hasLocation: true
      }
    });
  } catch (err) { next(err); }
});

// GET /api/users/location — check if current user has location captured
router.get("/location", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("location");
    const loc = user?.location;
    const hasLocation = Boolean(loc && loc.latitude !== undefined && loc.longitude !== undefined);
    res.json({
      success: true,
      data: {
        hasLocation,
        location: loc || null
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;