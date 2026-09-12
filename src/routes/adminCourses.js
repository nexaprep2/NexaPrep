const express = require('express');
const Course = require('../models/Course');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// GET /api/admin/courses -> list all courses (active + inactive)
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: 1 });
    res.json({ courses });
  } catch (err) {
    console.error('List admin courses error:', err);
    res.status(500).json({ error: 'Could not load courses.' });
  }
});

// POST /api/admin/courses  { name, code, description }
// This is the "space for other courses later" — admin can add new courses
// (e.g. Chemistry 101, Math 201) at any time, each fully independent with
// its own questions and activation codes.
router.post('/', async (req, res) => {
  try {
    const { name, code, description, durationMinutes } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Course name and code are required.' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await Course.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(409).json({ error: 'A course with this code already exists.' });
    }

    let duration = parseInt(durationMinutes, 10);
    if (Number.isNaN(duration) || duration < 1) duration = 30;
    if (duration > 300) duration = 300;

    const course = await Course.create({
      name: name.trim(),
      code: normalizedCode,
      description: (description || '').trim(),
      durationMinutes: duration
    });

    res.status(201).json({ message: 'Course created.', course });
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Could not create course.' });
  }
});

// PATCH /api/admin/courses/:courseId  { name?, description?, isActive? }
router.patch('/:courseId', async (req, res) => {
  try {
    const { name, description, isActive, durationMinutes } = req.body;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    if (name !== undefined) course.name = name.trim();
    if (description !== undefined) course.description = description.trim();
    if (isActive !== undefined) course.isActive = !!isActive;
    if (durationMinutes !== undefined) {
      let duration = parseInt(durationMinutes, 10);
      if (!Number.isNaN(duration) && duration >= 1 && duration <= 300) {
        course.durationMinutes = duration;
      }
    }

    await course.save();
    res.json({ message: 'Course updated.', course });
  } catch (err) {
    console.error('Update course error:', err);
    res.status(500).json({ error: 'Could not update course.' });
  }
});

// DELETE /api/admin/courses/:courseId
// Soft-delete only (sets isActive=false) — keeps history/questions/codes intact.
router.delete('/:courseId', async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    course.isActive = false;
    await course.save();
    res.json({ message: 'Course archived (hidden from students).', course });
  } catch (err) {
    console.error('Archive course error:', err);
    res.status(500).json({ error: 'Could not archive course.' });
  }
});

module.exports = router;
