# NexaPrep — CBT Platform (MVP)

A lightweight, multi-course-ready CBT platform. Physics 108 Premium ships as the
first course, and admins can create additional courses at any time from the
Admin Panel (each with its own questions and activation codes) — this is what
makes the platform "space for other courses later."

## Stack
- Node.js / Express
- MongoDB / Mongoose
- Vanilla HTML/CSS/JS frontend (no framework, no build step)
- JWT auth (separate secrets/tokens for students vs admins)
- bcrypt password hashing

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set MONGO_URI, JWT_SECRET, JWT_ADMIN_SECRET,
#            and ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD

npm start        # or: npm run dev (nodemon)
```

**Admin login is driven entirely by `.env`** — no seed script or API call
needed. On every server start, whatever `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
`ADMIN_NAME` you have set in `.env` gets synced into the database as the one
admin account (created if it doesn't exist, password re-hashed and updated
if it does). To rotate the admin password: change `ADMIN_PASSWORD` in `.env`
and restart the server — that's it.

If you'd rather seed some sample data (the Physics 108 course + 10 sample
questions) without touching the admin flow, `npm run seed` still does that
independently — it no longer creates its own separate admin account.

Visit:
- Students: `http://localhost:5000/`
- Admin: `http://localhost:5000/admin/login.html` (not linked from anywhere in
  the student UI, by design)

## How multi-course support works

- `Course` — one document per course (Physics 108, and any future course).
- `Enrollment` — one document per (student, course) pair, holding that
  student's `activationStatus` for *that specific course*. This is what lets
  a student be active on Physics 108 but inactive on a newly-added course.
- `ActivationCode` and `Question` both reference a `Course`, so each course
  has its own independent code pool and question bank.

To add a new course: Admin Panel → **Courses** tab → fill in name + code →
Create. It immediately appears on every student's dashboard as "Not
Activated" until they redeem a code generated for that course, or an admin
manually flips their access in the **Students** tab.

## Recent additions
- **Fisher-Yates shuffling** — question order and each question's option order
  are independently randomized per exam load (`src/utils/shuffle.js`), so
  retakes and different students rarely see the same layout. Options carry
  their original index (`optionId`) through the shuffle so server-side
  scoring is unaffected.
- **Per-course exam duration** — each `Course` has a `durationMinutes` field,
  set on creation or edited later from the Courses tab. The CBT timer reads
  this instead of a hardcoded 30 minutes.
- **CSV bulk question upload** — Admin Panel → Questions tab → Bulk Upload.
  Expects columns `question, optionA, optionB, optionC, optionD,
  correctAnswer` (header optional; `correctAnswer` accepts A–D or 0–4). A
  sample template is downloadable from the same panel. Parsing is done with
  a small dependency-free CSV parser (`src/utils/csv.js`) that handles quoted
  fields and embedded commas.
- **iOS-style UI pass** — sticky frosted-glass top bar, segmented-control
  tabs, native-feeling toggle switches for course visibility and per-course
  student activation, spring-eased button/card press animations, and
  safe-area padding for notched devices.

## Project structure

```
server.js
src/
  config/db.js        Mongo connection
  config/seed.js       one-time seed (course + sample questions + admin)
  models/               Student, Admin, Course, Enrollment, ActivationCode, Question, Result
  middleware/auth.js    studentAuth / adminAuth JWT guards
  routes/
    studentAuth.js       register / login
    courses.js           list courses + activate a course (student-facing)
    cbt.js               fetch questions, submit exam, view history
    adminAuth.js          admin login + one-time setup
    adminDashboard.js    stats + student list/search + manual activation
    adminCourses.js      create/list/hide courses
    adminActivationCodes.js  generate/list/disable codes
    adminQuestions.js    add/edit/delete questions
public/
  index.html, register.html, login.html, dashboard.html,
  activate.html, course.html, cbt.html
  admin/login.html, admin/dashboard.html
  css/style.css, js/api.js
```

## Bulk-uploading questions

CSV format (header row optional):

```csv
question,optionA,optionB,optionC,optionD,correctAnswer
What is the SI unit of force?,Joule,Newton,Watt,Pascal,B
```

`correctAnswer` accepts a letter (`A`–`D`, case-insensitive) or a number
(`0`–`3` zero-indexed, or `1`–`4` one-indexed). Rows missing a field or with
an unrecognized correct-answer value are skipped and reported back in the
upload result — nothing partial gets silently inserted.

## Notes on security choices for the MVP
- Activation codes are never sent to the client except one-at-a-time on
  validation; the full list only exists server-side and in the admin panel
  (which requires a separate admin JWT).
- Admin and student auth use different JWT secrets so an admin token can
  never be replayed against student routes or vice versa.
- Passwords are hashed with bcrypt (cost factor 10); nothing is stored in
  plain text.
- A code can only move `unused → used` once, enforced server-side, so it
  cannot be redeemed twice even under concurrent requests to the same code.
- CBT questions are served to students without their `correctIndex`; scoring
  happens entirely server-side on submit.

## Deploying
Works as-is on Railway or Render (free tier): point `MONGO_URI` at MongoDB
Atlas's free cluster, set the JWT secrets, and deploy. No other services or
dependencies are required.
