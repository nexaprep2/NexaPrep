const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  text: { type: String, required: true },
  options: {
    type: [String],
    required: true,
    validate: v => Array.isArray(v) && v.length === 4
  },
  correctIndex: { type: Number, required: true, min: 0, max: 3 },
  explanation: { type: String, default: '' }, // shown to students who get this question wrong
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);
