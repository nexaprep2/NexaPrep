const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // e.g. "Physics 108 Premium"
  code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g. "PHY108"
  description: { type: String, default: '' },
  durationMinutes: { type: Number, default: 30, min: 1, max: 300 }, // CBT time limit for this course
  isActive: { type: Boolean, default: true }, // whether visible to students
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', courseSchema);
