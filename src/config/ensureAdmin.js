// Keeps exactly one admin account in sync with .env, on every server boot.
// No seed script, no setup-key API call — just set ADMIN_EMAIL and
// ADMIN_PASSWORD in .env and restart the server.
//
// Behavior:
// - If no admin exists with that email, it's created.
// - If one already exists, its password is re-hashed and updated to match
//   whatever is currently in .env — so changing ADMIN_PASSWORD and
//   restarting always takes effect, no manual DB cleanup needed.
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function ensureAdminFromEnv() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME || 'Platform Admin';

  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin sync. Admin login will not work until these are set.');
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await Admin.findOne({ email: normalizedEmail });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.fullName = fullName;
    await existing.save();
    console.log(`Admin account synced from .env: ${normalizedEmail}`);
  } else {
    await Admin.create({ fullName, email: normalizedEmail, passwordHash });
    console.log(`Admin account created from .env: ${normalizedEmail}`);
  }
}

module.exports = ensureAdminFromEnv;
