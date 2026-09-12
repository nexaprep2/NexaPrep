const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');

const router = express.Router();

function signStudentToken(student) {
  return jwt.sign(
    { id: student._id, role: 'student' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, department, school } = req.body;

    if (!fullName || !email || !password || !department || !school) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await Student.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const student = await Student.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      department: department.trim(),
      school: school.trim()
    });

    const token = signStudentToken(student);
    res.status(201).json({
      message: 'Registration successful. Please log in.',
      token,
      student: {
        id: student._id,
        fullName: student.fullName,
        email: student.email,
        department: student.department,
        school: student.school
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Something went wrong during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const student = await Student.findOne({ email: String(email).toLowerCase().trim() });
    if (!student) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, student.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signStudentToken(student);
    res.json({
      message: 'Login successful.',
      token,
      student: {
        id: student._id,
        fullName: student.fullName,
        email: student.email,
        department: student.department,
        school: student.school
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong during login.' });
  }
});

module.exports = router;
