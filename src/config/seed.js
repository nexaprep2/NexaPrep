// Seeds the database with:
// - The Physics 108 Premium course
// - A handful of sample/placeholder Physics 108 questions
//
// Admin login is NOT handled here — it's synced from .env
// (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME) automatically every time the
// server starts. See src/config/ensureAdmin.js.
//
// Run with: npm run seed
require('dotenv').config();
const connectDB = require('./db');
const Course = require('../models/Course');
const Question = require('../models/Question');

const SAMPLE_QUESTIONS = [
  {
    text: 'What is the SI unit of force?',
    options: ['Joule', 'Newton', 'Watt', 'Pascal'],
    correctIndex: 1
  },
  {
    text: 'A body moving with constant velocity has:',
    options: ['Zero acceleration', 'Increasing acceleration', 'Decreasing acceleration', 'Constant non-zero acceleration'],
    correctIndex: 0
  },
  {
    text: 'Which law states that for every action there is an equal and opposite reaction?',
    options: ["Newton's First Law", "Newton's Second Law", "Newton's Third Law", "Law of Conservation of Energy"],
    correctIndex: 2
  },
  {
    text: 'The work done by a force is given by:',
    options: ['Force x Time', 'Force x Displacement', 'Mass x Acceleration', 'Mass x Velocity'],
    correctIndex: 1
  },
  {
    text: 'Which of these is a vector quantity?',
    options: ['Speed', 'Distance', 'Displacement', 'Energy'],
    correctIndex: 2
  },
  {
    text: 'The acceleration due to gravity on Earth is approximately:',
    options: ['8.9 m/s²', '9.8 m/s²', '10.8 m/s²', '7.8 m/s²'],
    correctIndex: 1
  },
  {
    text: 'Kinetic energy is given by the formula:',
    options: ['mgh', '½mv²', 'Fd', 'mv'],
    correctIndex: 1
  },
  {
    text: 'The principle of conservation of momentum applies to:',
    options: ['Only elastic collisions', 'Only inelastic collisions', 'All collisions in an isolated system', 'No collisions'],
    correctIndex: 2
  },
  {
    text: 'Which quantity is measured in Pascals?',
    options: ['Force', 'Pressure', 'Energy', 'Power'],
    correctIndex: 1
  },
  {
    text: 'A scalar quantity has:',
    options: ['Magnitude and direction', 'Only direction', 'Only magnitude', 'Neither magnitude nor direction'],
    correctIndex: 2
  }
];

async function seed() {
  await connectDB();

  // Course
  let course = await Course.findOne({ code: 'PHY108' });
  if (!course) {
    course = await Course.create({
      name: 'Physics 108 Premium',
      code: 'PHY108',
      description: 'Physics 108 Premium CBT — practice exams, notes, and formula sheet.'
    });
    console.log('Created course: Physics 108 Premium');
  } else {
    console.log('Course PHY108 already exists, skipping.');
  }

  // Sample questions (only add if this course currently has none)
  const existingQuestionCount = await Question.countDocuments({ course: course._id });
  if (existingQuestionCount === 0) {
    const docs = SAMPLE_QUESTIONS.map(q => ({ ...q, course: course._id }));
    await Question.insertMany(docs);
    console.log(`Inserted ${docs.length} sample Physics 108 questions.`);
  } else {
    console.log(`Course already has ${existingQuestionCount} questions, skipping sample insert.`);
  }

  console.log('Seed complete. Admin login is handled separately via .env — see ensureAdmin.js.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
