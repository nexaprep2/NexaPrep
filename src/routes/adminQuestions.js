const express = require('express');
const Question = require('../models/Question');
const Course = require('../models/Course');
const { adminAuth } = require('../middleware/auth');
const { parseCsv } = require('../utils/csv');

const router = express.Router();
router.use(adminAuth);

// Accepts either a letter (A-D, a-d) or a numeral (0-3 or 1-4) for the
// correct-answer column and normalizes it to a 0-based index.
function normalizeCorrectAnswer(raw) {
  const val = String(raw).trim();
  const letterMap = { A: 0, B: 1, C: 2, D: 3 };
  if (letterMap[val.toUpperCase()] !== undefined) return letterMap[val.toUpperCase()];

  const num = parseInt(val, 10);
  if (Number.isNaN(num)) return null;
  if (num >= 0 && num <= 3) return num; // 0-indexed
  if (num >= 1 && num <= 4) return num - 1; // 1-indexed
  return null;
}

// GET /api/admin/questions?courseId=
router.get('/', async (req, res) => {
  try {
    const { courseId } = req.query;
    const filter = {};
    if (courseId) filter.course = courseId;
    const questions = await Question.find(filter).sort({ createdAt: -1 });
    res.json({ questions });
  } catch (err) {
    console.error('List questions error:', err);
    res.status(500).json({ error: 'Could not load questions.' });
  }
});

function validateQuestionBody(body) {
  const { courseId, text, options, correctIndex } = body;
  if (!courseId || !text || !Array.isArray(options) || options.length !== 4) {
    return 'courseId, text, and exactly 4 options are required.';
  }
  if (options.some(o => !o || !String(o).trim())) {
    return 'All four options must be non-empty.';
  }
  const idx = parseInt(correctIndex, 10);
  if (Number.isNaN(idx) || idx < 0 || idx > 3) {
    return 'correctIndex must be 0, 1, 2, or 3.';
  }
  return null;
}

// POST /api/admin/questions  { courseId, text, options[4], correctIndex }
router.post('/', async (req, res) => {
  try {
    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { courseId, text, options, correctIndex } = req.body;
    const question = await Question.create({
      course: courseId,
      text: text.trim(),
      options: options.map(o => String(o).trim()),
      correctIndex: parseInt(correctIndex, 10)
    });

    res.status(201).json({ message: 'Question added.', question });
  } catch (err) {
    console.error('Create question error:', err);
    res.status(500).json({ error: 'Could not create question.' });
  }
});

// POST /api/admin/questions/bulk  { courseId, csvText }
// Expected CSV columns (header row optional, case-insensitive):
//   question, optionA, optionB, optionC, optionD, correctAnswer
// correctAnswer accepts a letter (A/B/C/D) or a number (0-3 or 1-4).
router.post('/bulk', async (req, res) => {
  try {
    const { courseId, csvText } = req.body;
    if (!courseId || !csvText || !csvText.trim()) {
      return res.status(400).json({ error: 'courseId and csvText are required.' });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    let rows;
    try {
      rows = parseCsv(csvText);
    } catch (parseErr) {
      return res.status(400).json({ error: 'Could not parse the CSV file.' });
    }
    if (!rows.length) {
      return res.status(400).json({ error: 'The CSV file appears to be empty.' });
    }

    // If the first row looks like a header (first cell isn't a real question,
    // and none of its cells parse as a valid answer letter/number on their own),
    // skip it. Simple heuristic: if the first cell case-insensitively matches
    // "question", treat row 1 as a header.
    let dataRows = rows;
    if (rows[0][0] && rows[0][0].trim().toLowerCase() === 'question') {
      dataRows = rows.slice(1);
    }

    const errors = [];
    const toInsert = [];

    dataRows.forEach((row, i) => {
      const rowNum = i + 1;
      const [text, optA, optB, optC, optD, correctRaw] = row.map(c => (c || '').trim());

      if (!text || !optA || !optB || !optC || !optD || correctRaw === undefined || correctRaw === '') {
        errors.push(`Row ${rowNum}: missing one or more required columns (question, 4 options, correct answer).`);
        return;
      }

      const correctIndex = normalizeCorrectAnswer(correctRaw);
      if (correctIndex === null) {
        errors.push(`Row ${rowNum}: correct answer "${correctRaw}" is not a valid A-D letter or 0-4 number.`);
        return;
      }

      toInsert.push({
        course: courseId,
        text,
        options: [optA, optB, optC, optD],
        correctIndex
      });
    });

    let inserted = [];
    if (toInsert.length) {
      inserted = await Question.insertMany(toInsert);
    }

    res.status(201).json({
      message: `${inserted.length} question(s) imported${errors.length ? `, ${errors.length} row(s) skipped` : ''}.`,
      insertedCount: inserted.length,
      skippedCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Bulk question upload error:', err);
    res.status(500).json({ error: 'Could not process the CSV upload.' });
  }
});

// PATCH /api/admin/questions/:id  { text?, options?, correctIndex? }
router.patch('/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const { text, options, correctIndex } = req.body;
    if (text !== undefined) question.text = text.trim();
    if (options !== undefined) {
      if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ error: 'options must be an array of exactly 4 items.' });
      }
      question.options = options.map(o => String(o).trim());
    }
    if (correctIndex !== undefined) {
      const idx = parseInt(correctIndex, 10);
      if (Number.isNaN(idx) || idx < 0 || idx > 3) {
        return res.status(400).json({ error: 'correctIndex must be 0, 1, 2, or 3.' });
      }
      question.correctIndex = idx;
    }

    await question.save();
    res.json({ message: 'Question updated.', question });
  } catch (err) {
    console.error('Update question error:', err);
    res.status(500).json({ error: 'Could not update question.' });
  }
});

// DELETE /api/admin/questions/:id
router.delete('/:id', async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    res.json({ message: 'Question deleted.' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ error: 'Could not delete question.' });
  }
});

module.exports = router;
