const mongoose = require('mongoose');

const MfClientUccSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    clientCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    pan: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
      default: '',
    },
    holdingNature: {
      type: String,
      default: 'SI', // SI: Single, JO: Joint, AS: Anyone or Survivor
    },
    taxStatus: {
      type: String,
      default: '01', // 01: Individual
    },
    occupationCode: {
      type: String,
      default: '01', // 01: Business, 02: Services, 03: Professional
    },
    gender: {
      type: String,
      enum: ['M', 'F', 'O'],
      default: 'M',
    },
    dob: {
      type: String, // DD/MM/YYYY
    },
    primaryBank: {
      accountNo: { type: String, required: true },
      ifsc: { type: String, required: true },
      bankName: { type: String, default: '' },
      accountType: { type: String, default: 'SB' }, // SB: Saving Bank, CB: Current
    },
    nominee: {
      name: { type: String, default: '' },
      relation: { type: String, default: '01' },
      percentage: { type: Number, default: 100 },
      pan: { type: String, default: '' },
    },
    address: {
      address1: { type: String, default: '' },
      address2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'INDIA' },
    },
    nseStatus: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'REJECTED'],
      default: 'ACTIVE',
    },
    nseRegistrationDate: {
      type: Date,
      default: Date.now,
    },
    fatcaUploaded: {
      type: Boolean,
      default: true,
    },
    defaultMandateId: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MfClientUcc', MfClientUccSchema);
