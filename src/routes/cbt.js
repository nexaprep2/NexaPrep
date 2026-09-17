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

// GET /api/cbt/:courseId/meta -> lightweight info needed before starting: how
// many questions exist in the bank and the CBT time limit, so the student can
// choose how many questions they want (10/20/30/all) before the exam loads.
router.get('/:courseId/meta', studentAuth, requireActiveEnrollment, async (req, res) => {
  try {
    const [totalQuestions, course] = await Promise.all([
      Question.countDocuments({ course: req.params.courseId }),
      Course.findById(req.params.courseId)
    ]);
    res.json({
      totalQuestions,
      durationMinutes: course ? course.durationMinutes : 30
    });
  } catch (err) {
    console.error('Fetch CBT meta error:', err);
    res.status(500).json({ error: 'Could not load exam info.' });
  }
});

// GET /api/cbt/:courseId/questions?count=N -> questions WITHOUT correct answers.
// Question order and each question's option order are independently
// randomized per request using a Fisher-Yates shuffle, so two students
// (or the same student on a retake) rarely see the same layout. Each
// option keeps its original index as `optionId` so submission scoring
// still works regardless of the shuffled display order.
// `count` lets the student take a random subset of the question bank
// (e.g. 10/20/30) instead of every question; omit it, or pass a number
// >= the bank size, to get everything.
router.get('/:courseId/questions', studentAuth, requireActiveEnrollment, async (req, res) => {
  try {
    const [questions, course] = await Promise.all([
      Question.find({ course: req.params.courseId }).sort({ createdAt: 1 }),
      Course.findById(req.params.courseId)
    ]);

    let shuffledQuestions = shuffleArray(questions);

    const requestedCount = parseInt(req.query.count, 10);
    if (!Number.isNaN(requestedCount) && requestedCount > 0 && requestedCount < shuffledQuestions.length) {
      shuffledQuestions = shuffledQuestions.slice(0, requestedCount);
    }

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

// POST /api/cbt/:courseId/submit  { answers: { questionId: selectedIndex, ... }, questionIds: [ids presented in this attempt] }
// Grading is scoped to `questionIds` (the exact subset the student was given,
// e.g. a random 10/20/30 selection) rather than the whole course bank, so a
// student who chose a shorter exam is scored out of that shorter count.
router.post('/:courseId/submit', studentAuth, requireActiveEnrollment, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { answers, questionIds } = req.body; // answers: { [questionId]: selectedIndex }

    let questions;
    if (Array.isArray(questionIds) && questionIds.length) {
      questions = await Question.find({ _id: { $in: questionIds }, course: courseId });
    } else {
      // Fallback for older clients that don't send questionIds: grade the full bank.
      questions = await Question.find({ course: courseId });
    }
    const totalQuestions = questions.length;

    let attempted = 0;
    let correct = 0;
    const answerLog = [];
    const breakdown = [];

    questions.forEach(q => {
      const given = answers ? answers[q._id.toString()] : undefined;
      const hasAnswer = given !== undefined && given !== null && given !== -1;
      const selected = hasAnswer ? Number(given) : null;
      const isCorrect = hasAnswer && selected === q.correctIndex;

      if (hasAnswer) {
        attempted += 1;
        if (isCorrect) correct += 1;
      }

      answerLog.push({ question: q._id, selected });
      breakdown.push({
        questionId: q._id,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        selected,
        isCorrect,
        explanation: q.explanation || ''
      });
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
      scorePercent,
      answers: answerLog
    });

    res.json({
      message: 'Examination submitted successfully.',
      result: {
        id: result._id,
        totalQuestions,
        attempted,
        correct,
        wrong,
        scorePercent,
        submittedAt: result.submittedAt
      },
      breakdown
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

// GET /api/cbt/results/:resultId/review -> full per-question breakdown (with
// corrections/explanations) for a past attempt, so students can revisit
// what they got wrong even after the exam session ends.
router.get('/results/:resultId/review', studentAuth, async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId).populate('answers.question');
    if (!result) return res.status(404).json({ error: 'Result not found.' });
    if (result.student.toString() !== req.studentId.toString()) {
      return res.status(403).json({ error: 'You do not have access to this result.' });
    }

    const breakdown = result.answers
      .filter(a => a.question) // guard against a question that was later deleted
      .map(a => ({
        questionId: a.question._id,
        text: a.question.text,
        options: a.question.options,
        correctIndex: a.question.correctIndex,
        selected: a.selected,
        isCorrect: a.selected !== null && a.selected === a.question.correctIndex,
        explanation: a.question.explanation || ''
      }));

    res.json({
      result: {
        id: result._id,
        totalQuestions: result.totalQuestions,
        attempted: result.attempted,
        correct: result.correct,
        wrong: result.wrong,
        scorePercent: result.scorePercent,
        submittedAt: result.submittedAt
      },
      breakdown
    });
  } catch (err) {
    console.error('Review result error:', err);
    res.status(500).json({ error: 'Could not load the review for this result.' });
  }
});

module.exports = router;
