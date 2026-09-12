const express = require('express');
const Question = require('../models/Question');
const Enrollment = require('../models/Enrollment');
const Result = require('../models/Result');
const Course = require('../models/Course');
const { studentAuth } = require('../middleware/auth');
const { shuffleArray } = require('../utils/shuffle');

const router = express.Router();

async function requireActiveEnrollment(req, res, next) {
  const { courseId } = req.params;
  const enrollment = await Enrollment.findOne({ student: req.studentId, course: courseId });
  if (!enrollment || enrollment.activationStatus !== 'active') {
    return res.status(403).json({ error: 'You must activate this course before accessing the CBT.' });
  }
  next();
}

// GET /api/cbt/:courseId/questions -> questions WITHOUT correct answers.
// Question order and each question's option order are independently
// randomized per request using a Fisher-Yates shuffle, so two students
// (or the same student on a retake) rarely see the same layout. Each
// option keeps its original index as `optionId` so submission scoring
// still works regardless of the shuffled display order.
router.get('/:courseId/questions', studentAuth, requireActiveEnrollment, async (req, res) => {
  try {
    const [questions, course] = await Promise.all([
      Question.find({ course: req.params.courseId }).sort({ createdAt: 1 }),
      Course.findById(req.params.courseId)
    ]);

    const shuffledQuestions = shuffleArray(questions);
    const safe = shuffledQuestions.map(q => {
      const optionsWithIds = q.options.map((text, optionId) => ({ optionId, text }));
      return {
        id: q._id,
        text: q.text,
        options: shuffleArray(optionsWithIds)
      };
    });

    res.json({
      questions: safe,
      durationMinutes: course ? course.durationMinutes : 30
    });
  } catch (err) {
    console.error('Fetch questions error:', err);
    res.status(500).json({ error: 'Could not load questions.' });
  }
});

// POST /api/cbt/:courseId/submit  { answers: { questionId: selectedIndex, ... } }
router.post('/:courseId/submit', studentAuth, requireActiveEnrollment, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { answers } = req.body; // object: { [questionId]: selectedIndex }

    const questions = await Question.find({ course: courseId });
    const totalQuestions = questions.length;

    let attempted = 0;
    let correct = 0;

    questions.forEach(q => {
      const given = answers ? answers[q._id.toString()] : undefined;
      if (given !== undefined && given !== null && given !== -1) {
        attempted += 1;
        if (Number(given) === q.correctIndex) correct += 1;
      }
    });

    const wrong = attempted - correct;
    const scorePercent = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

    const result = await Result.create({
      student: req.studentId,
      course: courseId,
      totalQuestions,
      attempted,
      correct,
      wrong,
      scorePercent
    });

    res.json({
      message: 'Examination submitted successfully.',
      result: {
        totalQuestions,
        attempted,
        correct,
        wrong,
        scorePercent,
        submittedAt: result.submittedAt
      }
    });
  } catch (err) {
    console.error('Submit exam error:', err);
    res.status(500).json({ error: 'Something went wrong while submitting the exam.' });
  }
});

// GET /api/cbt/:courseId/history -> this student's past attempts for the course
router.get('/:courseId/history', studentAuth, async (req, res) => {
  try {
    const results = await Result.find({ student: req.studentId, course: req.params.courseId })
      .sort({ submittedAt: -1 })
      .limit(20);
    res.json({ results });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Could not load progress history.' });
  }
});

module.exports = router;
