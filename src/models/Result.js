const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  totalQuestions: { type: Number, required: true },
  attempted: { type: Number, required: true },
  correct: { type: Number, required: true },
  wrong: { type: Number, required: true },
  scorePercent: { type: Number, required: true },
  // Per-question record of what the student picked, so the exact attempt
  // can be reviewed later (with corrections/explanations) even after the
  // session ends. `selected` is -1/undefined-equivalent when unattempted.
  answers: [{
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selected: { type: Number, default: null }
  }],
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);
