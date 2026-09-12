const jwt = require('jsonwebtoken');

function studentAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'student') throw new Error('Wrong role');
    req.studentId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
    if (payload.role !== 'admin') throw new Error('Wrong role');
    req.adminId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin session. Please log in again.' });
  }
}

module.exports = { studentAuth, adminAuth };
