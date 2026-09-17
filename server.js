require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/db');
const ensureAdminFromEnv = require('./src/config/ensureAdmin');

const studentAuthRoutes = require('./src/routes/studentAuth');
const courseRoutes = require('./src/routes/courses');
const cbtRoutes = require('./src/routes/cbt');
const adminAuthRoutes = require('./src/routes/adminAuth');
const adminDashboardRoutes = require('./src/routes/adminDashboard');
const adminCourseRoutes = require('./src/routes/adminCourses');
const adminActivationCodeRoutes = require('./src/routes/adminActivationCodes');
const adminQuestionRoutes = require('./src/routes/adminQuestions');
const adminRevenueRoutes = require('./src/routes/adminRevenue');

const app = express();

app.use(cors());
app.use(express.json());

// ---- API routes ----
app.use('/api/auth', studentAuthRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/cbt', cbtRoutes);
app.use('/api/admin-auth', adminAuthRoutes);
app.use('/api/admin', adminDashboardRoutes); // exposes /api/admin/dashboard and /api/admin/students
app.use('/api/admin/courses', adminCourseRoutes);
app.use('/api/admin/activation-codes', adminActivationCodeRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/admin/revenue', adminRevenueRoutes);

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

// Fallback 404 for unmatched API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await ensureAdminFromEnv();
  app.listen(PORT, () => {
    console.log(`NexaPrep running on http://localhost:${PORT}`);
    startSelfPing();
  });
});

// ---- Self-ping keep-alive ----
// Free-tier Render (and similar) spin down after a period of inactivity.
// This pings the app's own public URL at a randomized interval (0–7 min)
// so it never sits idle long enough to cool down. Set SELF_URL (or Render's
// auto-provided RENDER_EXTERNAL_URL) in your environment for this to work;
// it's a no-op locally if neither is set.
function startSelfPing() {
  const selfUrl = process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) {
    console.log('Self-ping disabled: set SELF_URL (or RENDER_EXTERNAL_URL) to enable it.');
    return;
  }

  const MIN_MS = 0;
  const MAX_MS = 7 * 60 * 1000;

  function scheduleNextPing() {
    const delay = Math.floor(Math.random() * (MAX_MS - MIN_MS + 1)) + MIN_MS;
    setTimeout(async () => {
      try {
        await fetch(selfUrl);
        console.log(`Self-ping sent to ${selfUrl}`);
      } catch (err) {
        console.error('Self-ping failed:', err.message);
      }
      scheduleNextPing();
    }, delay);
  }

  scheduleNextPing();
}
