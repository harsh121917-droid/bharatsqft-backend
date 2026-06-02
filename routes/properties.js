const express = require("express");
const router = express.Router();
const {
    getPublicProperties,
    getPublicPropertyById,
} = require("../controllers/propertyController");

/* Public routes */
router.get("/", getPublicProperties);
router.get("/:id", getPublicPropertyById);

module.exports = router;