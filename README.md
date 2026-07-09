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
- **Entry** — Test Information (name, platform, exam, test type, total questions, per-subject question
  counts with a live total check) → a one-question-at-a-time wizard (Topic → Chapter → Right/Wrong →
  Reason → Remarks, numbered tabs to jump between questions) → an instant result summary (score, strong
  and weak topics, improvement tips).
- **Progress → Overall Performance** — filter by date range / exam / platform, see total tests, questions,
  correct/wrong, average accuracy, an accuracy-trend line chart, and a subject-accuracy donut chart.
- **Progress → Subject Wise Performance** — pick a subject (+ optional filters), see a topic-by-topic
  table with accuracy and a Strong/Average/Weak/New badge.
- Subjects, topics and chapters are the exact list you provided — pre-loaded, no editing screen (no
  "Modify" page, as requested). If you ever want to change the hierarchy, it lives in the `HIERARCHY`
  object at the top of `index.html` — editing it there and redeploying is the only way to change it now.

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
