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
