const express = require('express');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const ActivationCode = require('../models/ActivationCode');
const Course = require('../models/Course');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/dashboard -> global + per-course stats
router.get('/dashboard', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalCodes = await ActivationCode.countDocuments();
    const unusedCodes = await ActivationCode.countDocuments({ status: 'unused' });
    const usedCodes = await ActivationCode.countDocuments({ status: 'used' });

    const courses = await Course.find().sort({ createdAt: 1 });
    const perCourse = await Promise.all(courses.map(async c => {
      const active = await Enrollment.countDocuments({ course: c._id, activationStatus: 'active' });
      const inactive = totalStudents - active; // students who haven't activated this course
      const codes = await ActivationCode.countDocuments({ course: c._id });
      const codesUnused = await ActivationCode.countDocuments({ course: c._id, status: 'unused' });
      const codesUsed = await ActivationCode.countDocuments({ course: c._id, status: 'used' });
      return {
        id: c._id,
        name: c.name,
        code: c.code,
        activeStudents: active,
        inactiveStudents: inactive < 0 ? 0 : inactive,
        totalCodes: codes,
        unusedCodes: codesUnused,
        usedCodes: codesUsed
      };
    }));

    res.json({
      totalStudents,
      totalCourses,
      totalCodes,
      unusedCodes,
      usedCodes,
      perCourse
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Could not load dashboard stats.' });
  }
});

// GET /api/admin/students?search=&courseId= -> list + search students
router.get('/students', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const students = await Student.find(filter).sort({ createdAt: -1 }).limit(500);
    const studentIds = students.map(s => s._id);
    const enrollments = await Enrollment.find({ student: { $in: studentIds } }).populate('course', 'name code');

    const enrollmentsByStudent = {};
    enrollments.forEach(e => {
      const key = e.student.toString();
      if (!enrollmentsByStudent[key]) enrollmentsByStudent[key] = [];
      enrollmentsByStudent[key].push({
        courseId: e.course?._id,
        courseName: e.course?.name,
        activationStatus: e.activationStatus,
        activatedAt: e.activatedAt
      });
    });

    const payload = students.map(s => ({
      id: s._id,
      fullName: s.fullName,
      email: s.email,
      department: s.department,
      school: s.school,
      createdAt: s.createdAt,
      courses: enrollmentsByStudent[s._id.toString()] || []
    }));

    res.json({ students: payload });
  } catch (err) {
    console.error('Admin students error:', err);
    res.status(500).json({ error: 'Could not load students.' });
  }
});

// PATCH /api/admin/students/:studentId/courses/:courseId  { activationStatus }
// Manually activate/deactivate a student's access to a course.
router.patch('/students/:studentId/courses/:courseId', async (req, res) => {
  try {
    const { studentId, courseId } = req.params;
    const { activationStatus } = req.body;
    if (!['active', 'inactive'].includes(activationStatus)) {
      return res.status(400).json({ error: 'activationStatus must be "active" or "inactive".' });
    }

    let enrollment = await Enrollment.findOne({ student: studentId, course: courseId });
    if (!enrollment) {
      enrollment = new Enrollment({ student: studentId, course: courseId });
    }
    enrollment.activationStatus = activationStatus;
    enrollment.activatedAt = activationStatus === 'active' ? new Date() : enrollment.activatedAt;
    await enrollment.save();

    res.json({ message: 'Student course access updated.', enrollment });
  } catch (err) {
    console.error('Update enrollment error:', err);
    res.status(500).json({ error: 'Could not update student access.' });
  }
});

module.exports = router;
