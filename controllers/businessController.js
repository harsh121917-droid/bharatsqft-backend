const BusinessOpportunity = require("../models/BusinessOpportunity");
const Enquiry = require("../models/Enquiry");

const STANDARD_CATEGORIES = [
  "Warehouses & Logistics",
  "Petrol Pumps",
  "Dairy Farms",
  "Hotels & Hospitality",
  "CBG (Compressed Biogas) Plants",
  "Other Business Opportunities",
];

// Helper to sanitize payload fields
function sanitizeBusinessPayload(body) {
  const payload = {};

  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.category !== undefined) payload.category = String(body.category).trim();

  // Location
  if (body.location !== undefined) {
    payload.location = {
      address: body.location.address ? String(body.location.address).trim() : "",
      city: body.location.city ? String(body.location.city).trim() : "",
      state: body.location.state ? String(body.location.state).trim() : "",
      pincode: body.location.pincode ? String(body.location.pincode).trim() : "",
    };
  } else {
    payload.location = {
      address: body.address ? String(body.address).trim() : "",
      city: body.city ? String(body.city).trim() : "",
      state: body.state ? String(body.state).trim() : "",
      pincode: body.pincode ? String(body.pincode).trim() : "",
    };
  }

  if (body.description !== undefined) payload.description = String(body.description).trim();

  // Financials
  if (body.minInvestmentAmount !== undefined) payload.minInvestmentAmount = Number(body.minInvestmentAmount) || 0;
  if (body.totalProjectCost !== undefined) payload.totalProjectCost = Number(body.totalProjectCost) || 0;
  if (body.investmentTenure !== undefined) payload.investmentTenure = String(body.investmentTenure).trim();
  if (body.expectedReturns !== undefined) payload.expectedReturns = String(body.expectedReturns).trim();
  if (body.payoutFrequency !== undefined) payload.payoutFrequency = String(body.payoutFrequency).trim();

  // Highlights
  if (body.highlights !== undefined) {
    if (Array.isArray(body.highlights)) {
      payload.highlights = body.highlights.map((h) => String(h).trim()).filter(Boolean);
    } else if (typeof body.highlights === "string") {
      payload.highlights = body.highlights
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean);
    }
  }

  // Images
  if (body.images !== undefined && Array.isArray(body.images)) {
    payload.images = body.images.map((img) => ({
      url: typeof img === "string" ? img : img.url || "",
      caption: img.caption || "",
      isCover: Boolean(img.isCover),
    }));
    // If no cover is explicitly marked, make the first image the cover
    if (payload.images.length > 0 && !payload.images.some((img) => img.isCover)) {
      payload.images[0].isCover = true;
    }
  }

  // Documents
  if (body.documents !== undefined && Array.isArray(body.documents)) {
    payload.documents = body.documents.map((doc) => ({
      url: doc.url || "",
      title: doc.title || "Project Document",
      type: doc.type || "project_report",
      uploadedAt: doc.uploadedAt || new Date(),
    }));
  }

  if (body.spvName !== undefined) payload.spvName = String(body.spvName).trim();
  if (body.status !== undefined) payload.status = String(body.status).trim();
  if (body.isActive !== undefined) payload.isActive = Boolean(body.isActive);
  if (body.featured !== undefined) payload.featured = Boolean(body.featured);
  if (body.order !== undefined) payload.order = Number(body.order) || 0;

  // Contact
  if (body.contact !== undefined) {
    payload.contact = {
      name: body.contact.name || "Investment Desk",
      phone: body.contact.phone || "+91 98765 43210",
      email: body.contact.email || "invest@vikaone.com",
    };
  }

  return payload;
}

/* ==========================================================================
   PUBLIC API ENDPOINTS
   ========================================================================== */

/**
 * @route   GET /api/business
 * @desc    Get active business opportunities with optional category & search filter
 * @access  Public
 */
exports.getPublicBusinessOpportunities = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50, sort = "-createdAt" } = req.query;

    const query = { isActive: true, status: { $ne: "inactive" } };

    if (category && category !== "All" && category.trim() !== "") {
      query.category = category.trim();
    }

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { "location.city": regex },
        { "location.state": regex },
        { category: regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await BusinessOpportunity.countDocuments(query);
    const items = await BusinessOpportunity.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    return res.json({
      success: true,
      data: items,
      count: items.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[getPublicBusinessOpportunities] Error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching business opportunities" });
  }
};

/**
 * @route   GET /api/business/categories
 * @desc    Get list of all standard categories with live count of active listings
 * @access  Public
 */
exports.getBusinessCategories = async (req, res) => {
  try {
    const counts = await BusinessOpportunity.aggregate([
      { $match: { isActive: true, status: { $ne: "inactive" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id] = c.count;
    });

    const categoriesWithCount = STANDARD_CATEGORIES.map((cat) => ({
      name: cat,
      count: countMap[cat] || 0,
    }));

    const totalActive = await BusinessOpportunity.countDocuments({
      isActive: true,
      status: { $ne: "inactive" },
    });

    return res.json({
      success: true,
      data: {
        total: totalActive,
        categories: categoriesWithCount,
      },
    });
  } catch (err) {
    console.error("[getBusinessCategories] Error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching categories" });
  }
};

/**
 * @route   GET /api/business/:id
 * @desc    Get a single business opportunity by ID
 * @access  Public
 */
exports.getPublicBusinessOpportunityById = async (req, res) => {
  try {
    const item = await BusinessOpportunity.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }
    return res.json({ success: true, data: item });
  } catch (err) {
    console.error("[getPublicBusinessOpportunityById] Error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching business opportunity details" });
  }
};

/**
 * @route   POST /api/business/:id/enquire
 * @desc    Submit an enquiry / schedule callback for a business opportunity
 * @access  Public
 */
exports.submitBusinessLead = async (req, res) => {
  try {
    const biz = await BusinessOpportunity.findById(req.params.id);
    if (!biz) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }

    const {
      name,
      email,
      phone,
      message,
      preferredDate,
      preferredTime,
      source = "app",
      userId,
    } = req.body;

    if (!name || (!email && !phone)) {
      return res.status(400).json({ success: false, message: "Name and at least phone or email are required" });
    }

    const enquiry = await Enquiry.create({
      name: name.trim(),
      email: email ? email.trim() : (userId ? `investor_${userId}@vikaone.com` : "investor@vikaone.com"),
      phone: phone ? phone.trim() : "",
      subject: `Business Lead: ${biz.title} (${biz.category})`,
      message: message ? message.trim() : `Investor consultation scheduled for ${biz.title}`,
      type: "business_lead",
      businessTitle: biz.title,
      businessId: biz._id,
      preferredDate: preferredDate || "",
      preferredTime: preferredTime || "",
      status: preferredDate && preferredTime ? "scheduled" : "new",
      source,
      userId: userId || req.user?._id,
    });

    // Increment enquiries count on listing
    await BusinessOpportunity.findByIdAndUpdate(biz._id, { $inc: { enquiriesCount: 1 } });

    return res.status(201).json({
      success: true,
      message: "Consultation request submitted successfully",
      data: enquiry,
    });
  } catch (err) {
    console.error("[submitBusinessLead] Error:", err);
    return res.status(500).json({ success: false, message: "Server error submitting lead" });
  }
};

/* ==========================================================================
   ADMIN API ENDPOINTS
   ========================================================================== */

/**
 * @route   GET /api/admin/business
 * @desc    Get all business opportunities for admin with metrics & filters
 * @access  Private (Admin)
 */
exports.getAllBusinessForAdmin = async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 100 } = req.query;

    const query = {};

    if (category && category !== "All" && category.trim() !== "") {
      query.category = category.trim();
    }

    if (status && status !== "All" && status.trim() !== "") {
      if (status === "active") query.isActive = true;
      else if (status === "inactive") query.isActive = false;
      else query.status = status.trim();
    }

    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { "location.city": regex },
        { "location.state": regex },
        { category: regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await BusinessOpportunity.countDocuments(query);
    const items = await BusinessOpportunity.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate aggregated metrics
    const totalAll = await BusinessOpportunity.countDocuments();
    const activeCount = await BusinessOpportunity.countDocuments({ isActive: true });
    const inactiveCount = await BusinessOpportunity.countDocuments({ isActive: false });

    const totalValueAgg = await BusinessOpportunity.aggregate([
      { $group: { _id: null, totalValue: { $sum: "$totalProjectCost" }, totalEnquiries: { $sum: "$enquiriesCount" } } },
    ]);

    const totalProjectValue = totalValueAgg[0]?.totalValue || 0;
    const totalEnquiries = totalValueAgg[0]?.totalEnquiries || 0;

    return res.json({
      success: true,
      data: items,
      metrics: {
        totalAll,
        activeCount,
        inactiveCount,
        totalProjectValue,
        totalEnquiries,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[getAllBusinessForAdmin] Error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching admin listings" });
  }
};

/**
 * @route   GET /api/admin/business/:id
 * @desc    Get single listing for admin editing
 * @access  Private (Admin)
 */
exports.getBusinessByIdForAdmin = async (req, res) => {
  try {
    const item = await BusinessOpportunity.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }
    return res.json({ success: true, data: item });
  } catch (err) {
    console.error("[getBusinessByIdForAdmin] Error:", err);
    return res.status(500).json({ success: false, message: "Server error fetching listing" });
  }
};

/**
 * @route   POST /api/admin/business
 * @desc    Create a new business opportunity
 * @access  Private (Admin)
 */
exports.createBusinessOpportunity = async (req, res) => {
  try {
    const payload = sanitizeBusinessPayload(req.body);

    if (!payload.title || !payload.description || !payload.category) {
      return res.status(400).json({ success: false, message: "Title, category, and description are required" });
    }
    if (!payload.location?.city || !payload.location?.state) {
      return res.status(400).json({ success: false, message: "City and state are required" });
    }

    const item = await BusinessOpportunity.create(payload);
    return res.status(201).json({
      success: true,
      message: "Business opportunity created successfully",
      data: item,
    });
  } catch (err) {
    console.error("[createBusinessOpportunity] Error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to create business opportunity" });
  }
};

/**
 * @route   PUT /api/admin/business/:id
 * @desc    Update an existing business opportunity
 * @access  Private (Admin)
 */
exports.updateBusinessOpportunity = async (req, res) => {
  try {
    const item = await BusinessOpportunity.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }

    const payload = sanitizeBusinessPayload(req.body);

    const updated = await BusinessOpportunity.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Business opportunity updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("[updateBusinessOpportunity] Error:", err);
    return res.status(400).json({ success: false, message: err.message || "Failed to update business opportunity" });
  }
};

/**
 * @route   PATCH /api/admin/business/:id/toggle-status
 * @desc    Activate or deactivate a business opportunity
 * @access  Private (Admin)
 */
exports.toggleBusinessStatus = async (req, res) => {
  try {
    const item = await BusinessOpportunity.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }

    item.isActive = !item.isActive;
    item.status = item.isActive ? "active" : "inactive";
    await item.save();

    return res.json({
      success: true,
      message: `Business opportunity is now ${item.isActive ? "Active" : "Inactive"}`,
      data: { id: item._id, isActive: item.isActive, status: item.status },
    });
  } catch (err) {
    console.error("[toggleBusinessStatus] Error:", err);
    return res.status(500).json({ success: false, message: "Server error toggling status" });
  }
};

/**
 * @route   DELETE /api/admin/business/:id
 * @desc    Remove a business opportunity
 * @access  Private (Admin)
 */
exports.deleteBusinessOpportunity = async (req, res) => {
  try {
    const item = await BusinessOpportunity.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Business opportunity not found" });
    }

    await BusinessOpportunity.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: "Business opportunity removed successfully",
    });
  } catch (err) {
    console.error("[deleteBusinessOpportunity] Error:", err);
    return res.status(500).json({ success: false, message: "Server error deleting business opportunity" });
  }
};
