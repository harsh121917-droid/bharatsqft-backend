const mongoose = require('mongoose');

const MfAmcSchema = new mongoose.Schema(
  {
    amcCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    amcName: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    schemeCount: {
      type: Number,
      default: 0,
    },
    logoUrl: {
      type: String,
      default: '',
    },
    hiddenAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfAmc', MfAmcSchema);
