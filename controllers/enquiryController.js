const Enquiry = require("../models/Enquiry");

exports.createEnquiry = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      subject,
      message,
      type,
      propertyRef,
      propertyTitle,
      propertyId,
      preferredDate,
      preferredTime,
      source
    } = req.body;

    const safeName = (name && name.trim()) || req.user?.name || "Interested Buyer";
    const safePhone = (phone && phone.trim()) || req.user?.phone || "";
    const safeEmail = (email && email.trim()) || req.user?.email || (safePhone ? `${safePhone.replace(/[^0-9]/g, '')}@vikadrx.com` : `lead_${Date.now()}@vikadrx.com`);
    const isLead = type === "full_ownership_lead" || (preferredDate && preferredTime);

    const enquiry = await Enquiry.create({
      name: safeName,
      email: safeEmail.toLowerCase(),
      phone: safePhone,
      subject: subject || (propertyTitle ? `Full Ownership Lead: ${propertyTitle}` : "Full Ownership Enquiry"),
      message: message || `Customer scheduled a call for ${propertyTitle || 'property'}${preferredDate ? ` on ${preferredDate}` : ''}${preferredTime ? ` at ${preferredTime}` : ''}.`,
      type: type || (isLead ? "full_ownership_lead" : "general"),
      propertyRef: propertyRef || propertyId || "",
      propertyTitle: propertyTitle || "",
      propertyId: propertyId || null,
      preferredDate: preferredDate || "",
      preferredTime: preferredTime || "",
      status: isLead ? "scheduled" : "new",
      source: source || "app",
      userId: req.user?._id || null,
    });

    res.status(201).json({
      success: true,
      message: isLead ? "Callback scheduled successfully. Our advisory team will reach out." : "Enquiry submitted successfully",
      data: enquiry
    });
  } catch (err) { next(err); }
};

exports.getMyEnquiries = async (req, res, next) => {
  try {
    const enquiries = await Enquiry.find({ userId: req.user._id }).sort("-createdAt");
    res.json({ success: true, count: enquiries.length, data: enquiries });
  } catch (err) { next(err); }
};