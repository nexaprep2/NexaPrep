const mongoose = require('mongoose');

// One row per Friday-to-Friday week that's been settled/marked paid.
// Amounts are snapshotted at the time of marking, so later changes to
// course prices or the share percentage never rewrite payout history.
const payoutRecordSchema = new mongoose.Schema({
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  grossRevenue: { type: Number, required: true },
  yourSharePercent: { type: Number, required: true },
  yourShare: { type: Number, required: true },
  clientShare: { type: Number, required: true },
  note: { type: String, default: '' },
  markedPaidAt: { type: Date, default: Date.now }
});

// A given week should only be marked paid once.
payoutRecordSchema.index({ weekStart: 1, weekEnd: 1 }, { unique: true });

module.exports = mongoose.model('PayoutRecord', payoutRecordSchema);
