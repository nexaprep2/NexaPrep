const express = require('express');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const ActivationCode = require('../models/ActivationCode');
const { studentAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/courses  -> list active courses with this student's activation status on each
router.get('/', studentAuth, async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ createdAt: 1 });
    const enrollments = await Enrollment.find({ student: req.studentId });
    const statusByCourse = {};
    enrollments.forEach(e => { statusByCourse[e.course.toString()] = e.activationStatus; });

    const payload = courses.map(c => ({
      id: c._id,
      name: c.name,
      code: c.code,
      description: c.description,
      activationStatus: statusByCourse[c._id.toString()] || 'inactive'
    }));

    res.json({ courses: payload });
  } catch (err) {
    console.error('List courses error:', err);
    res.status(500).json({ error: 'Could not load courses.' });
  }
});

// POST /api/courses/:courseId/activate  { code }
router.post('/:courseId/activate', studentAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Please enter an activation code.' });
    }

    const course = await Course.findById(courseId);
    if (!course || !course.isActive) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Already active? short-circuit.
    let enrollment = await Enrollment.findOne({ student: req.studentId, course: courseId });
    if (enrollment && enrollment.activationStatus === 'active') {
      return res.json({ message: 'This course is already active.', alreadyActive: true });
    }

    const normalizedCode = code.trim().toUpperCase();
    const activationCode = await ActivationCode.findOne({ code: normalizedCode, course: courseId });

    if (!activationCode) {
      return res.status(400).json({ error: 'Invalid activation code.' });
    }
    if (activationCode.status === 'used') {
      return res.status(400).json({ error: 'This activation code has already been used.' });
    }
    if (activationCode.status === 'disabled') {
      return res.status(400).json({ error: 'This activation code has been disabled.' });
    }
    if (activationCode.expiresAt && new Date(activationCode.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'This activation code has expired.' });
    }

    // Mark code used
    activationCode.status = 'used';
    activationCode.usedBy = req.studentId;
    activationCode.usedAt = new Date();
    await activationCode.save();

    // Create or update enrollment
    if (!enrollment) {
      enrollment = new Enrollment({ student: req.studentId, course: courseId });
    }
    enrollment.activationStatus = 'active';
    enrollment.activationCode = activationCode._id;
    enrollment.activatedAt = new Date();
    await enrollment.save();

    res.json({
      message: `Account activated successfully. Welcome to ${course.name}.`,
      courseId: course._id
    });
  } catch (err) {
    console.error('Activation error:', err);
    res.status(500).json({ error: 'Something went wrong during activation.' });
  }
});

module.exports = router;
