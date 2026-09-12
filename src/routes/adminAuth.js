const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const router = express.Router();

function signAdminToken(admin) {
  return jwt.sign(
    { id: admin._id, role: 'admin' },
    process.env.JWT_ADMIN_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/admin-auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = signAdminToken(admin);
    res.json({
      message: 'Login successful.',
      token,
      admin: { id: admin._id, fullName: admin.fullName, email: admin.email }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Something went wrong during login.' });
  }
});

// POST /api/admin-auth/setup  -> one-time bootstrap to create the first admin.
// Protected by ADMIN_SETUP_KEY from .env, not exposed in any UI link.
// Disable/remove this route (or rotate the key) after creating your admin account.
router.post('/setup', async (req, res) => {
  try {
    const { setupKey, fullName, email, password } = req.body;
    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ error: 'Invalid setup key.' });
    }
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingCount = await Admin.countDocuments();
    if (existingCount > 0) {
      return res.status(409).json({ error: 'An admin account already exists. Use the login page.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      fullName: fullName.trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash
    });

    res.status(201).json({ message: 'Admin account created. You can now log in.', adminId: admin._id });
  } catch (err) {
    console.error('Admin setup error:', err);
    res.status(500).json({ error: 'Something went wrong during setup.' });
  }
});

module.exports = router;
