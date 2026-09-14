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

// Parses one JSON question object into a normalized { text, options, correctIndex }
// shape, or returns a string error describing what's wrong with it.
// Accepted shapes for a single question:
//   { question|text, optionA, optionB, optionC, optionD, correctAnswer }
//   { question|text, options: [4 strings], correctAnswer|correctIndex }
function normalizeJsonQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return 'Each question must be a JSON object.';
  }

  const text = String(raw.question ?? raw.text ?? '').trim();
  if (!text) return 'Missing "question" (or "text") field.';

  let options;
  if (Array.isArray(raw.options)) {
    options = raw.options.map(o => String(o ?? '').trim());
  } else {
    options = [raw.optionA, raw.optionB, raw.optionC, raw.optionD].map(o => String(o ?? '').trim());
  }

  if (options.length !== 4 || options.some(o => !o)) {
    return 'Exactly 4 non-empty options are required (via "options" array or optionA-optionD).';
  }

  const correctRaw = raw.correctAnswer ?? raw.correctIndex;
  if (correctRaw === undefined || correctRaw === null || correctRaw === '') {
    return 'Missing "correctAnswer" (or "correctIndex") field.';
  }
  const correctIndex = normalizeCorrectAnswer(correctRaw);
  if (correctIndex === null) {
    return `correct answer "${correctRaw}" is not a valid A-D letter or 0-4 number.`;
  }

  return { text, options, correctIndex };
}

// POST /api/admin/questions/bulk  { courseId, csvText }  OR  { courseId, jsonText }  OR  { courseId, questions: [...] }
// CSV columns (header row optional, case-insensitive):
//   question, optionA, optionB, optionC, optionD, correctAnswer
// JSON: either a raw string (jsonText) or an already-parsed array (questions) of objects shaped like:
//   { "question": "...", "optionA": "...", "optionB": "...", "optionC": "...", "optionD": "...", "correctAnswer": "B" }
//   or { "question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "B" }
// correctAnswer accepts a letter (A/B/C/D) or a number (0-3 or 1-4).
router.post('/bulk', async (req, res) => {
  try {
    const { courseId, csvText, jsonText, questions: questionsBody } = req.body;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required.' });
    }

    const hasCsv = csvText && csvText.trim();
    const hasJsonText = jsonText && jsonText.trim();
    const hasQuestionsArray = Array.isArray(questionsBody);

    if (!hasCsv && !hasJsonText && !hasQuestionsArray) {
      return res.status(400).json({ error: 'Provide csvText, jsonText, or a questions array.' });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const errors = [];
    const toInsert = [];

    if (hasCsv) {
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

        toInsert.push({ course: courseId, text, options: [optA, optB, optC, optD], correctIndex });
      });
    } else {
      // JSON path: either an already-parsed array, or a raw string to parse.
      let items = questionsBody;
      if (!hasQuestionsArray) {
        try {
          const parsed = JSON.parse(jsonText);
          // Allow either a bare array, or an object with a "questions" array inside it.
          items = Array.isArray(parsed) ? parsed : parsed.questions;
        } catch (parseErr) {
          return res.status(400).json({ error: 'Could not parse the JSON. Make sure it is a valid JSON array of questions.' });
        }
      }

      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'JSON must be an array of question objects (or an object with a "questions" array).' });
      }
      if (!items.length) {
        return res.status(400).json({ error: 'The JSON file appears to be empty.' });
      }

      items.forEach((item, i) => {
        const rowNum = i + 1;
        const result = normalizeJsonQuestion(item);
        if (typeof result === 'string') {
          errors.push(`Item ${rowNum}: ${result}`);
          return;
        }
        toInsert.push({ course: courseId, ...result });
      });
    }

    let inserted = [];
    if (toInsert.length) {
      inserted = await Question.insertMany(toInsert);
    }

    res.status(201).json({
      message: `${inserted.length} question(s) imported${errors.length ? `, ${errors.length} item(s) skipped` : ''}.`,
      insertedCount: inserted.length,
      skippedCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Bulk question upload error:', err);
    res.status(500).json({ error: 'Could not process the bulk upload.' });
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

// DELETE /api/admin/questions/bulk-delete  { ids: [id1, id2, ...] }
// Must be declared before the /:id route below so "bulk-delete" isn't
// swallowed as an :id param.
router.delete('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids must be a non-empty array of question IDs.' });
    }

    const result = await Question.deleteMany({ _id: { $in: ids } });
    res.json({
      message: `${result.deletedCount} question(s) deleted.`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error('Bulk delete questions error:', err);
    res.status(500).json({ error: 'Could not delete the selected questions.' });
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
