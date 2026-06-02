const express = require("express");
const router = express.Router();
const {
  getAllUsers, getUserById, updateUser, deleteUser,
  getAllEnquiries, updateEnquiry, deleteEnquiry,
  getDashboard,
} = require("../controllers/adminController");
const {
  getAllProperties, getPropertyById,
  createProperty, updateProperty,
  deleteProperty, toggleStatus,
} = require("../controllers/propertyController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

// Dashboard
router.get("/dashboard", getDashboard);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Enquiries
router.get("/enquiries", getAllEnquiries);
router.patch("/enquiries/:id", updateEnquiry);
router.delete("/enquiries/:id", deleteEnquiry);

// Properties
router.get("/properties", getAllProperties);
router.get("/properties/:id", getPropertyById);
router.post("/properties", createProperty);
router.put("/properties/:id", updateProperty);
router.delete("/properties/:id", deleteProperty);
router.patch("/properties/:id/toggle", toggleStatus);

module.exports = router;