# SSC Mock Analysis — deploy guide (100% free, email only, no card)

Two free services, both need only an email:
- **Neon** — free Postgres database (your real, permanent data store)
- **Render** — free web hosting for the app

All files sit flat in one folder — no subfolders, so however GitHub's uploader
arranges things it will still work.

## 1. Create the database (Neon)
1. Go to neon.tech → sign up (email or GitHub).
2. Create a project (any name).
3. Open **Connection Details** and copy the string starting with `postgresql://...`. Keep it handy.

## 2. Put the code on GitHub
1. Go to github.com → sign up (email only).
2. **+** → New repository → name it `ssc-mock-analysis` → Public → Create.
3. "uploading an existing file" → drag in every file: `server.js`, `app.js`, `index.html`,
   `package.json`, `package-lock.json`, `schema.sql`, `.gitignore`, `.env.example`. They all go
   straight into the repo root.
4. Commit.

## 3. Deploy on Render
1. render.com → sign up (email only, no card for free tier).
2. Dashboard → **New +** → **Web Service** → connect GitHub → pick the repo.
3. Fill in:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
4. Environment tab → add two variables:
   - **Name**: `DATABASE_URL` — **Value**: your Neon connection string
   - **Name**: `APP_PASSCODE` — **Value**: any passcode you want to protect the app with (e.g. `1234` or a word). This is what you'll type on the lock-screen.
5. Create Web Service.

Wait for the Logs tab to say "Scorecard server listening on port...". Open the URL Render gives you,
enter your passcode, and you're in.

## What's in this version
- **Login** — simple passcode gate (set via `APP_PASSCODE`). Leave that variable blank/unset to disable it.
- **Entry** — choose **PYQ** or **Manual** at the top:
  - **PYQ**: pick Exam Name, Test Year, Date, Shift — question counts, subject split, and marking scheme
    are pulled automatically from the built-in PYQ test bank (SSC CGL/CHSL/MTS/Selection Post/GD/Steno/CPO/
    Delhi Police/JHT, year-wise). You only fill in Right/Wrong/Topic/Chapter/Reason/Remarks per question.
  - **Manual**: the original flow — name, platform, exam, test type, total questions, marks, per-subject
    question counts with a live total check.
  - Either way: a one-question-at-a-time wizard → an instant result summary (score, accuracy, strong/weak
    topics, improvement tips).
- **Test Count** (new, on the dashboard) — tracks PYQ papers completed vs available:
  - Filter by Standard (10th/12th/Degree), Exam Name, Year — fully reactive, no filter button.
  - Progress bars at whatever level you've filtered to (all exams → per-exam, per-exam → per-year,
    per-year → per-shift breakdown + a log of your attempts for that paper).
  - A built-in insight box recommends what to attempt next (prioritising the most recent incomplete year)
    and estimates how long the remaining papers will take at your recent pace.
- **Progress** — one page, fully reactive (no Filter button — every dropdown updates results instantly):
  - Snapshot cards at the top (all tests, all time): total tests, questions, correct, wrong.
  - **Subject** filter (default "All Subjects") → shows every subject's accuracy, weakest or strongest
    first depending on the **Sort** dropdown.
  - Pick a **Subject** → shows every chapter in that subject (across all its topics), weak/strong sorted.
  - Add a **Topic** → narrows the chapter list to just that topic's chapters.
  - Pick a specific **Chapter** → a focused view: totals, accuracy, and every remark you wrote for
    questions in that chapter.
- Subjects, topics and chapters are the exact list you provided — pre-loaded, no editing screen (no
  "Modify" page). The PYQ test bank (exam/year/question-count/marking scheme) is similarly pre-loaded.
  Both live in `index.html` (`HIERARCHY` and `TEST_BANK` constants near the top) if you ever want to
  edit them — editing there and redeploying is the only way to change them now.

## This update's database change (safe — nothing of yours is touched)
Five new columns were added to the `tests` table to track PYQ attempts: `is_pyq`, `pyq_exam_category`,
`pyq_standard`, `pyq_year`, `pyq_shift`. They're added automatically the first time the updated server
starts (via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, which Postgres only applies if the column isn't
already there). Every test you've already logged keeps all its data exactly as is and simply gets
`is_pyq = false` by default, since it wasn't a PYQ entry. No existing row is modified or deleted.

## Troubleshooting
- **"Cannot GET /"**: check Render's Logs tab. If it says `index.html not found next to server.js`,
  confirm `index.html` is visible in the GitHub repo root, next to `server.js`.
- **Login says "Couldn't reach the server"**: the free instance may be waking up from sleep (free tier
  sleeps after ~15 minutes idle, takes ~30-60 seconds to wake). Wait and retry.
- **Charts don't show**: they load from a CDN (cdnjs) — check your internet connection; nothing to
  configure on your end.
- Visit `/health` on your app URL — if it says `ok`, the server and DB connection are fine.

## Notes
- Data is real and permanent — stored in Neon Postgres, not the browser. Works across devices, survives
  restarts/redeploys.
- Free tier sleep: first visit after 15+ minutes idle takes ~30-60 seconds to wake up. Your data is
  unaffected.
- Local testing (optional, needs Node.js + a local Postgres, or just point `DATABASE_URL` at Neon):
  copy `.env.example` to `.env`, fill in `DATABASE_URL` and `APP_PASSCODE`, then `npm install && npm start`,
  open `http://localhost:3000`.
