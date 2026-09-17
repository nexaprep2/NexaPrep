const mongoose = require('mongoose');

// Singleton document — there is only ever one PayoutSettings row.
// yourSharePercent is the percentage of gross activation-code revenue
// that goes to Goodnews; the remainder goes to the course owner/client.
const payoutSettingsSchema = new mongoose.Schema({
  yourSharePercent: { type: Number, default: 100, min: 0, max: 100 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PayoutSettings', payoutSettingsSchema);
