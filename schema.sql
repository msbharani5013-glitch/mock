CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  test_date DATE NOT NULL,
  test_name TEXT NOT NULL,
  platform TEXT,
  exam TEXT,
  test_type TEXT,
  total_questions INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE tests ADD COLUMN IF NOT EXISTS marks_correct NUMERIC NOT NULL DEFAULT 2;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS marks_negative NUMERIC NOT NULL DEFAULT 0.5;

ALTER TABLE tests ADD COLUMN IF NOT EXISTS is_pyq BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_exam_category TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_standard TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_year INT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_shift TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_mode TEXT NOT NULL DEFAULT 'full';
ALTER TABLE tests ADD COLUMN IF NOT EXISTS pyq_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_tests_pyq ON tests(is_pyq, pyq_exam_category, pyq_year);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  q_number INT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  chapter TEXT,
  correct_wrong TEXT,
  reason TEXT,
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_tests_date ON tests(test_date);
