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
  - **PYQ**: pick Exam Name, Test Year, Date, Shift, then **Full Test** or **Subject Test**:
    - *Full Test*: all 4 subjects, counts as one completed paper.
    - *Subject Test*: pick one subject (e.g. just English) — question count and marks for that section
      auto-fill from the bank. Doesn't count toward "papers completed" in Track by Count (it's a section,
      not a full paper), but still counts toward Track by Subjects' question tallies.
    - Either way, question counts, subject split, and marking scheme are pulled automatically from the
      built-in PYQ test bank. You only fill in Right/Wrong/Topic/Chapter/Reason/Remarks per question.
  - **Manual**: the original flow — name, platform, exam, test type, total questions, marks, per-subject
    question counts with a live total check.
  - Either way: a one-question-at-a-time wizard → an instant result summary (score, accuracy, strong/weak
    topics, improvement tips).
- **Test Count** (new, on the dashboard) — tracks PYQ papers/questions completed vs available. Two modes,
  switch anytime:
  - **Track by Count**: filter by Standard/Exam/Year (reactive, no button). Progress bars at whatever
    level you've filtered to — all exams → per-exam, per-exam → per-year, and for a specific exam+year a
    log of your logged attempts (date, shift, score).
  - **Track by Subjects**: a static summary at the top shows total PYQ questions available per subject
    across the *entire* bank. Below it, filter by Standard/Exam/Year/Subject and see a progress bar per
    subject (questions you've actually answered vs questions available) for whatever scope you've
    selected — narrows to a single subject's bar if you pick one.
  - Both modes include a built-in insight box: recommends what to attempt next (prioritising the most
    recent incomplete year) and estimates how long the remainder will take at your recent pace.
- **Dashboard** — the four sections (Entry, Progress, Test Count, Weightage by PYQ) now sit in a 2-column
  grid instead of a stacked list.
- **Weightage by PYQ** (on the dashboard) — built entirely from Topic/Chapter/Right-Wrong you've logged on
  PYQ entries (Full Test or Subject Test, either counts):
  - Filters for Exam, Year, Subject, Topic, Chapter, Date, Shift sit in one horizontal row as compact
    dropdown buttons. Tap one to open a small checklist, tick as many values as you like, and the results
    update immediately — the dropdown stays open while you check things off. Each filter only ever shows
    values that actually appear in your PYQ history, and picking a value in one filter narrows what's
    available in every other filter (faceted), live, no button needed.
  - Default view: chapters ranked by weightage (how many questions from that chapter appeared in your
    filtered scope), with a progress bar per chapter.
  - **Evaluate** button: adds your accuracy and a Strong/Average/Weak badge per chapter, plus a sort
    control (Most Asked / Weak to Strong / Strong to Weak) — so you can see which frequently-asked
    chapters you're actually weak on.
  - **COMPARE** button: splits into 2 independent panels (up to 4), each with its own filters and its own
    Evaluate toggle, so you can put e.g. CGL vs CHSL, or 2024 vs 2025, side by side.
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
Two more columns were added to the `tests` table: `pyq_mode` (`'full'` or `'subject'`) and `pyq_subject`.
Same as before, they're added automatically via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` the first time
the updated server starts. Every test you've already logged — PYQ or manual — keeps all its data exactly
as is and gets `pyq_mode = 'full'` by default (correct, since Subject Test mode didn't exist before this
update). No existing row is modified or deleted.

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
