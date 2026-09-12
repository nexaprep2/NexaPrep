const express = require('express');
const crypto = require('crypto');
const ActivationCode = require('../models/ActivationCode');
const Course = require('../models/Course');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

function randomSegment(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// GET /api/admin/activation-codes?courseId=&status=
router.get('/', async (req, res) => {
  try {
    const { courseId, status } = req.query;
    const filter = {};
    if (courseId) filter.course = courseId;
    if (status) filter.status = status;

    const codes = await ActivationCode.find(filter)
      .populate('course', 'name code')
      .populate('usedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(1000);

    res.json({ codes });
  } catch (err) {
    console.error('List codes error:', err);
    res.status(500).json({ error: 'Could not load activation codes.' });
  }
});

// POST /api/admin/activation-codes  { courseId, quantity, expiresAt? }
router.post('/', async (req, res) => {
  try {
    const { courseId, quantity, expiresAt } = req.body;
    if (!courseId) return res.status(400).json({ error: 'courseId is required.' });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 500);
    const prefix = course.code.replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'CODE';

    const docs = [];
    const seen = new Set();
    while (docs.length < qty) {
      const candidate = `${prefix}-${randomSegment(6)}`;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      docs.push({
        code: candidate,
        course: courseId,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });
    }

    // Insert one by one to gracefully skip any rare collision with existing codes
    const created = [];
    for (const doc of docs) {
      try {
        const saved = await ActivationCode.create(doc);
        created.push(saved);
      } catch (e) {
        if (e.code === 11000) continue; // duplicate, skip
        throw e;
      }
    }

    res.status(201).json({ message: `${created.length} activation code(s) generated.`, codes: created });
  } catch (err) {
    console.error('Generate codes error:', err);
    res.status(500).json({ error: 'Could not generate activation codes.' });
  }
});

// PATCH /api/admin/activation-codes/:codeId  { status: "disabled" }
// Only allows disabling an unused code.
router.patch('/:codeId', async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 'disabled') {
      return res.status(400).json({ error: 'Only disabling a code is supported here.' });
    }
    const code = await ActivationCode.findById(req.params.codeId);
    if (!code) return res.status(404).json({ error: 'Code not found.' });
    if (code.status === 'used') {
      return res.status(400).json({ error: 'Cannot disable a code that has already been used.' });
    }
    code.status = 'disabled';
    await code.save();
    res.json({ message: 'Code disabled.', code });
  } catch (err) {
    console.error('Disable code error:', err);
    res.status(500).json({ error: 'Could not disable code.' });
  }
});

module.exports = router;
