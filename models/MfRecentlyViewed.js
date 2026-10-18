const mongoose = require('mongoose');

const MfRecentlyViewedSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: [
      {
        schemeCode: {
          type: String,
          required: true,
          trim: true,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfRecentlyViewed', MfRecentlyViewedSchema);
