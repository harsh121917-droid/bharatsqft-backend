const Enquiry = require("../models/Enquiry");

exports.createEnquiry = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message, type, propertyRef } = req.body;
    const enquiry = await Enquiry.create({
      name, email, phone, subject, message,
      type: type || "general",
      propertyRef,
      userId: req.user?._id || null,
    });
    res.status(201).json({ success: true, message: "Enquiry submitted successfully", data: enquiry });
  } catch (err) { next(err); }
};

exports.getMyEnquiries = async (req, res, next) => {
  try {
    const enquiries = await Enquiry.find({ userId: req.user._id }).sort("-createdAt");
    res.json({ success: true, count: enquiries.length, data: enquiries });
  } catch (err) { next(err); }
};