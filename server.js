require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));

const indexPath = path.join(__dirname, 'index.html');
const PASSCODE = process.env.APP_PASSCODE || '';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable.');
}

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

// ---- passcode check for all /api routes except /api/login ----
function requirePasscode(req, res, next) {
  if (!PASSCODE) return next(); // no passcode configured -> open access
  const supplied = req.get('x-app-passcode') || '';
  if (supplied === PASSCODE) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/login', (req, res) => {
  const { passcode } = req.body || {};
  if (!PASSCODE || passcode === PASSCODE) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Incorrect passcode' });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  requirePasscode(req, res, next);
});

// ---- data ----
app.get('/api/data', async (req, res) => {
  try {
    const tests = (await pool.query(
      `SELECT id, to_char(test_date,'YYYY-MM-DD') AS date, test_name AS "testName",
              platform, exam, test_type AS "testType", total_questions AS "totalQuestions",
              marks_correct AS "marksCorrect", marks_negative AS "marksNegative",
              is_pyq AS "isPyq", pyq_exam_category AS "pyqExamCategory", pyq_standard AS "pyqStandard",
              pyq_year AS "pyqYear", pyq_shift AS "pyqShift", pyq_mode AS "pyqMode", pyq_subject AS "pyqSubject"
       FROM tests ORDER BY test_date ASC, created_at ASC`
    )).rows;
    const questions = (await pool.query(
      `SELECT id, test_id AS "testId", q_number AS "qNumber", subject, topic, chapter,
              correct_wrong AS "correctWrong", reason, remarks
       FROM questions ORDER BY test_id, q_number ASC`
    )).rows;
    const byTest = {};
    for (const q of questions) {
      (byTest[q.testId] = byTest[q.testId] || []).push(q);
    }
    const out = tests.map(t => ({ ...t, questions: byTest[t.id] || [] }));
    res.json({ tests: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tests', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      date, testName, platform, exam, testType, totalQuestions, marksCorrect, marksNegative,
      isPyq, pyqExamCategory, pyqStandard, pyqYear, pyqShift, pyqMode, pyqSubject, questions
    } = req.body;
    if (!date || !testName || !totalQuestions) return res.status(400).json({ error: 'Missing required fields' });
    const id = uid();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO tests (id, test_date, test_name, platform, exam, test_type, total_questions, marks_correct, marks_negative,
                          is_pyq, pyq_exam_category, pyq_standard, pyq_year, pyq_shift, pyq_mode, pyq_subject)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, date, testName, platform || '', exam || '', testType || '', totalQuestions, marksCorrect || 0, marksNegative || 0,
       !!isPyq, pyqExamCategory || null, pyqStandard || null, pyqYear || null, pyqShift || null, pyqMode || 'full', pyqSubject || null]
    );
    for (const q of (questions || [])) {
      await client.query(
        'INSERT INTO questions (id, test_id, q_number, subject, topic, chapter, correct_wrong, reason, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [uid(), id, q.qNumber, q.subject || '', q.topic || '', q.chapter || '', q.correctWrong || '', q.reason || '', (q.remarks || '').slice(0, 1000)]
      );
    }
    await client.query('COMMIT');
    res.json({ id });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/health', (req, res) => res.send('ok'));

app.get('/app.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'app.js'));
});

app.get('/', (req, res) => {
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(500).send('index.html not found next to server.js');
});
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(500).send('index.html not found next to server.js');
});

const port = process.env.PORT || 3000;
ensureSchema()
  .then(() => app.listen(port, () => console.log('Scorecard server listening on port ' + port)))
  .catch(e => { console.error('Failed to initialize database:', e); process.exit(1); });
