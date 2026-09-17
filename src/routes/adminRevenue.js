const express = require('express');
const ActivationCode = require('../models/ActivationCode');
const PayoutSettings = require('../models/PayoutSettings');
const PayoutRecord = require('../models/PayoutRecord');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();
router.use(adminAuth);

// Revenue weeks run Friday 00:00 -> the following Friday 00:00, matching
// the weekly payout schedule. Uses the server's local time (Render runs
// in UTC by default).
function getWeekWindow(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay(); // 0=Sun ... 5=Fri ... 6=Sat
  const daysSinceFriday = (day - 5 + 7) % 7;
  const weekStart = new Date(d);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - daysSinceFriday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return { weekStart, weekEnd };
}

function shiftWeek({ weekStart, weekEnd }, weeksBack) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() - weeksBack * 7);
  const end = new Date(weekEnd);
  end.setDate(end.getDate() - weeksBack * 7);
  return { weekStart: start, weekEnd: end };
}

async function getShareSettings() {
  let settings = await PayoutSettings.findOne();
  if (!settings) settings = await PayoutSettings.create({ yourSharePercent: 100 });
  return settings;
}

// Pulls used activation codes in [weekStart, weekEnd) and totals up revenue
// from each course's configured price. Courses with no price set (price: 0
// or unset) simply contribute 0 — set a price on the course to have its
// sales count here.
async function computeWeekRevenue(weekStart, weekEnd) {
  const usedCodes = await ActivationCode.find({
    status: 'used',
    usedAt: { $gte: weekStart, $lt: weekEnd }
  })
    .populate('course', 'name price')
    .sort({ usedAt: -1 });

  let grossRevenue = 0;
  const sales = usedCodes.map(c => {
    const amount = c.course ? (c.course.price || 0) : 0;
    grossRevenue += amount;
    return {
      code: c.code,
      courseName: c.course ? c.course.name : 'Unknown course',
      amount,
      usedAt: c.usedAt
    };
  });

  return { grossRevenue, sales, saleCount: sales.length };
}

// GET /api/admin/revenue/settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await getShareSettings();
    res.json({ yourSharePercent: settings.yourSharePercent });
  } catch (err) {
    console.error('Get revenue settings error:', err);
    res.status(500).json({ error: 'Could not load revenue settings.' });
  }
});

// PATCH /api/admin/revenue/settings  { yourSharePercent }
router.patch('/settings', async (req, res) => {
  try {
    const pct = parseFloat(req.body.yourSharePercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'yourSharePercent must be a number between 0 and 100.' });
    }
    const settings = await getShareSettings();
    settings.yourSharePercent = pct;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ message: 'Revenue share updated.', yourSharePercent: settings.yourSharePercent });
  } catch (err) {
    console.error('Update revenue settings error:', err);
    res.status(500).json({ error: 'Could not update revenue settings.' });
  }
});

// GET /api/admin/revenue/current -> this week's (Friday-to-Friday) revenue, live
router.get('/current', async (req, res) => {
  try {
    const { weekStart, weekEnd } = getWeekWindow();
    const [{ grossRevenue, sales, saleCount }, settings, existingRecord] = await Promise.all([
      computeWeekRevenue(weekStart, weekEnd),
      getShareSettings(),
      PayoutRecord.findOne({ weekStart, weekEnd })
    ]);

    const yourShare = Math.round((grossRevenue * settings.yourSharePercent) / 100 * 100) / 100;
    const clientShare = Math.round((grossRevenue - yourShare) * 100) / 100;

    res.json({
      weekStart,
      weekEnd,
      grossRevenue,
      saleCount,
      yourSharePercent: settings.yourSharePercent,
      yourShare,
      clientShare,
      paid: !!existingRecord,
      sales
    });
  } catch (err) {
    console.error('Get current revenue error:', err);
    res.status(500).json({ error: 'Could not load this week\'s revenue.' });
  }
});

// GET /api/admin/revenue/history?weeks=8 -> past N weeks (most recent first), totals only
router.get('/history', async (req, res) => {
  try {
    const weeksRequested = Math.min(Math.max(parseInt(req.query.weeks, 10) || 8, 1), 52);
    const settings = await getShareSettings();
    const currentWindow = getWeekWindow();

    const weeks = [];
    for (let i = 0; i < weeksRequested; i++) {
      const { weekStart, weekEnd } = shiftWeek(currentWindow, i);
      const { grossRevenue, saleCount } = await computeWeekRevenue(weekStart, weekEnd);
      const yourShare = Math.round((grossRevenue * settings.yourSharePercent) / 100 * 100) / 100;
      const clientShare = Math.round((grossRevenue - yourShare) * 100) / 100;
      const record = await PayoutRecord.findOne({ weekStart, weekEnd });
      weeks.push({
        weekStart,
        weekEnd,
        grossRevenue,
        saleCount,
        yourShare,
        clientShare,
        paid: !!record,
        markedPaidAt: record ? record.markedPaidAt : null
      });
    }

    res.json({ weeks });
  } catch (err) {
    console.error('Get revenue history error:', err);
    res.status(500).json({ error: 'Could not load revenue history.' });
  }
});

// POST /api/admin/revenue/mark-paid  { weekStart, weekEnd, note? }
// Recomputes the totals server-side (never trusts client-sent amounts) and
// logs a permanent payout record for that week.
router.post('/mark-paid', async (req, res) => {
  try {
    const { weekStart, weekEnd, note } = req.body;
    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'weekStart and weekEnd are required.' });
    }
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'weekStart/weekEnd must be valid dates.' });
    }

    const existing = await PayoutRecord.findOne({ weekStart: start, weekEnd: end });
    if (existing) {
      return res.status(409).json({ error: 'This week has already been marked as paid.' });
    }

    const settings = await getShareSettings();
    const { grossRevenue } = await computeWeekRevenue(start, end);
    const yourShare = Math.round((grossRevenue * settings.yourSharePercent) / 100 * 100) / 100;
    const clientShare = Math.round((grossRevenue - yourShare) * 100) / 100;

    const record = await PayoutRecord.create({
      weekStart: start,
      weekEnd: end,
      grossRevenue,
      yourSharePercent: settings.yourSharePercent,
      yourShare,
      clientShare,
      note: (note || '').trim()
    });

    res.status(201).json({ message: 'Week marked as paid.', record });
  } catch (err) {
    console.error('Mark week paid error:', err);
    res.status(500).json({ error: 'Could not mark this week as paid.' });
  }
});

// GET /api/admin/revenue/payout-records -> full audit log, most recent first
router.get('/payout-records', async (req, res) => {
  try {
    const records = await PayoutRecord.find().sort({ weekStart: -1 }).limit(100);
    res.json({ records });
  } catch (err) {
    console.error('List payout records error:', err);
    res.status(500).json({ error: 'Could not load payout records.' });
  }
});

module.exports = router;
