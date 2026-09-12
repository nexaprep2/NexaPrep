const mongoose = require('mongoose');

// One document per (student, course) pair.
// This is what makes the platform support multiple courses: each course
// has its own activation status per student instead of a single global flag.
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  activationStatus: { type: String, enum: ['inactive', 'active'], default: 'inactive' },
  activationCode: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivationCode', default: null },
  activatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
