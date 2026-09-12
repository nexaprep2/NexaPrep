const mongoose = require('mongoose');

const activationCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['unused', 'used', 'disabled'], default: 'unused' },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivationCode', activationCodeSchema);
