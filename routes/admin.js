const express = require("express");
const router  = express.Router();
const {
  getAllUsers, getUserById, updateUser, deleteUser,
  getAllEnquiries, updateEnquiry, deleteEnquiry,
  getDashboard,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/dashboard",        getDashboard);
router.get("/users",            getAllUsers);
router.get("/users/:id",        getUserById);
router.patch("/users/:id",      updateUser);
router.delete("/users/:id",     deleteUser);
router.get("/enquiries",        getAllEnquiries);
router.patch("/enquiries/:id",  updateEnquiry);
router.delete("/enquiries/:id", deleteEnquiry);

module.exports = router;