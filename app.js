/* ============================== STATE ============================== */
let route = { page: "login" };
let db = { tests: [] };
let loadError = null;
let draft = null; // in-progress test entry

function getPasscode() { return sessionStorage.getItem("app_passcode") || ""; }
function setPasscode(p) { sessionStorage.setItem("app_passcode", p); }

async function apiGet(path) {
  const r = await fetch(path, { headers: { "x-app-passcode": getPasscode() } });
  if (r.status === 401) { route = { page: "login" }; render(); throw new Error("Session expired"); }
  if (!r.ok) throw new Error("Request failed");
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-passcode": getPasscode() },
    body: JSON.stringify(body || {})
  });
  if (r.status === 401) { route = { page: "login" }; render(); throw new Error("Session expired"); }
  if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.error || "Request failed"); }
  return r.json();
}

async function loadData() {
  const data = await apiGet("/api/data");
  db.tests = data.tests;
}

function go(page, extra) { route = { page, ...extra }; render(); window.scrollTo(0, 0); }
function toast(msg) {
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ============================== HELPERS ============================== */
function el(html) {
  const s = html.trim();
  if (/^<tr[\s>]/i.test(s)) {
    const t = document.createElement("table");
    t.innerHTML = "<tbody>" + s + "</tbody>";
    return t.querySelector("tr");
  }
  if (/^<(td|th)[\s>]/i.test(s)) {
    const t = document.createElement("table");
    t.innerHTML = "<tbody><tr>" + s + "</tr></tbody>";
    return t.querySelector("tr").firstElementChild;
  }
  if (/^<option[\s>]/i.test(s)) {
    const sel = document.createElement("select");
    sel.innerHTML = s;
    return sel.firstElementChild;
  }
  const d = document.createElement("div");
  d.innerHTML = s;
  return d.firstElementChild;
}
function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function pct(n) { return (n * 100).toFixed(1) + "%"; }

function classify(accuracy, attempted) {
  if (!attempted) return "new";
  if (accuracy >= 0.75) return "strong";
  if (accuracy < 0.5) return "weak";
  return "average";
}
function badgeLabel(c) { return { strong: "Strong", weak: "Weak", average: "Average", new: "New" }[c]; }

function topicsOf(subject) { return subject && HIERARCHY[subject] ? Object.keys(HIERARCHY[subject]) : []; }
function chaptersOf(subject, topic) {
  if (!subject || !topic || !HIERARCHY[subject]) return [];
  return HIERARCHY[subject][topic] || [];
}

function allQuestionsFlat() {
  const out = [];
  for (const t of db.tests) {
    for (const q of t.questions) {
      out.push({ ...q, testId: t.id, date: t.date, platform: t.platform, exam: t.exam, testType: t.testType, testName: t.testName });
    }
  }
  return out;
}

function filterTests(tests, f) {
  return tests.filter(t => {
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (f.exam && f.exam !== "All Exams" && t.exam !== f.exam) return false;
    if (f.platform && f.platform !== "All Platforms" && t.platform !== f.platform) return false;
    if (f.testType && f.testType !== "All Types" && t.testType !== f.testType) return false;
    return true;
  });
}

/* ============================== ROOT RENDER ============================== */
function render() {
  const root = document.getElementById("root");
  root.innerHTML = "";

  if (route.page === "login") { root.appendChild(pageLogin()); return; }

  root.appendChild(el(`
    <div class="topbar">
      <div class="brand">SSC MOCK ANALYSIS</div>
      <div class="menu" title="Menu">&#9776;</div>
    </div>
  `));
  const app = el(`<div class="app"></div>`);
  root.appendChild(app);

  if (loadError) { app.appendChild(el(`<div class="empty">Couldn't reach the server: ${esc(loadError)}</div>`)); return; }

  const pages = {
    dashboard: pageDashboard,
    entry_info: pageEntryInfo,
    entry_questions: pageEntryQuestions,
    entry_result: pageEntryResult,
    progress: pageProgress,
  };
  const fn = pages[route.page] || pageDashboard;
  try {
    app.appendChild(fn());
  } catch (e) {
    console.error("Render error on page", route.page, e);
    app.appendChild(el(`<div class="empty">Something went wrong showing this page (${esc(e.message)}). Try going back and opening it again.</div>`));
    const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
    back.onclick = () => go("dashboard");
    app.appendChild(back);
  }
}

/* ============================== LOGIN ============================== */
function pageLogin() {
  const wrap = el(`
    <div class="loginwrap">
      <div class="logo">&#128203;</div>
      <h1>SSC MOCK ANALYSIS</h1>
      <p>Enter the passcode to continue</p>
      <div class="field"><input type="password" id="pw" placeholder="Enter the passcode" autofocus></div>
      <button id="unlock" style="width:100%;">Unlock</button>
      <div class="loginerr" id="loginerr"></div>
      <div class="footnote">This is a private space. Unauthorized access is not allowed.</div>
    </div>
  `);
  const doLogin = async () => {
    const pw = wrap.querySelector("#pw").value;
    const errBox = wrap.querySelector("#loginerr");
    const btn = wrap.querySelector("#unlock");
    btn.disabled = true; btn.textContent = "Checking...";
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: pw }) });
      const data = await res.json();
      if (data.ok) {
        setPasscode(pw);
        loadError = null;
        go("dashboard");
        loadData().then(render).catch(e => { loadError = e.message; render(); });
      } else {
        errBox.textContent = "Try again";
        btn.disabled = false; btn.textContent = "Unlock";
      }
    } catch (e) {
      errBox.textContent = "Couldn't reach the server";
      btn.disabled = false; btn.textContent = "Unlock";
    }
  };
  wrap.querySelector("#unlock").onclick = doLogin;
  wrap.querySelector("#pw").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  return wrap;
}

/* ============================== DASHBOARD ============================== */
function pageDashboard() {
  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h1>Dashboard</h1><p class="lead">Welcome back!</p>`));
  const entryTile = el(`
    <button class="tile blue">
      <div class="icon">&#9998;</div>
      <div><h3>Entry</h3><p>Enter new mock test analysis</p></div>
    </button>`);
  entryTile.onclick = () => { draft = null; go("entry_info"); };
  const progTile = el(`
    <button class="tile green">
      <div class="icon">&#128200;</div>
      <div><h3>Progress</h3><p>View your performance &amp; stats</p></div>
    </button>`);
  progTile.onclick = () => go("progress");
  wrap.appendChild(entryTile);
  wrap.appendChild(progTile);

  if (db.tests.length) {
    const recent = [...db.tests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    const card = el(`<div class="card"><span style="font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;">Recent tests</span></div>`);
    const table = el(`<table style="margin-top:8px;"><thead><tr><th>Date</th><th>Test</th><th>Score</th></tr></thead><tbody></tbody></table>`);
    recent.forEach(t => {
      const c = t.questions.filter(q => q.correctWrong === "Correct").length;
      const w = t.questions.filter(q => q.correctWrong === "Wrong").length;
      const mc = t.marksCorrect != null ? +t.marksCorrect : 2;
      const mw = t.marksNegative != null ? +t.marksNegative : 0.5;
      const score = +(c * mc - w * mw).toFixed(2);
      table.querySelector("tbody").appendChild(el(`<tr><td>${t.date}</td><td>${esc(t.testName)}</td><td>${c}/${t.totalQuestions} (${score})</td></tr>`));
    });
    card.appendChild(table);
    wrap.appendChild(card);
  }
  wrap.appendChild(el(`<p class="footnote">Stay consistent. Keep improving. &#11088;</p>`));
  return wrap;
}

/* ============================== ENTRY: TEST INFO ============================== */
function pageEntryInfo() {
  draft = draft || {
    date: todayStr(), testName: "", platform: "", exam: "", testType: "", totalQuestions: "",
    marksCorrect: 2, marksNegative: 0.5,
    subjects: Object.fromEntries(SUBJECTS.map(s => [s, { included: true, count: 0 }]))
  };
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => { draft = null; go("dashboard"); };
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Test Information</h1><p class="lead">Step 1 of 2</p>`));

  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="field"><label>Test Name</label><input id="f_name" maxlength="200" value="${esc(draft.testName)}" placeholder="Enter test name (max 200 characters)"></div>`));

  const g2 = el(`<div class="grid2"></div>`);
  g2.appendChild(el(`<div class="field"><label>Date</label><input type="date" id="f_date" value="${draft.date}"></div>`));
  g2.appendChild(el(`<div class="field"><label>Platform</label><select id="f_platform"><option value="">Select Platform</option>${PLATFORMS.map(p => `<option ${p === draft.platform ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>`));
  card.appendChild(g2);

  const g2b = el(`<div class="grid2"></div>`);
  g2b.appendChild(el(`<div class="field"><label>Exam Name</label><select id="f_exam"><option value="">Select Exam</option>${EXAMS.map(x => `<option ${x === draft.exam ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  g2b.appendChild(el(`<div class="field"><label>Test Type</label><select id="f_ttype"><option value="">Select Test Type</option>${TEST_TYPES.map(x => `<option ${x === draft.testType ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  card.appendChild(g2b);

  card.appendChild(el(`<div class="field"><label>Total Questions</label><input type="number" id="f_total" min="1" max="500" value="${draft.totalQuestions}" placeholder="Enter total questions (1-500)"></div>`));

  const g2c = el(`<div class="grid2"></div>`);
  g2c.appendChild(el(`<div class="field"><label>Marks for Correct Answer</label><input type="number" id="f_mcorrect" min="0" step="0.01" value="${draft.marksCorrect}"></div>`));
  g2c.appendChild(el(`<div class="field"><label>Negative Marks for Wrong Answer</label><input type="number" id="f_mwrong" min="0" step="0.01" value="${draft.marksNegative}"></div>`));
  card.appendChild(g2c);
  wrap.appendChild(card);

  const subjCard = el(`<div class="card"><label>Subjects &amp; Question Count</label></div>`);
  const subjBody = el(`<div></div>`);
  subjCard.appendChild(subjBody);
  const totalBar = el(`<div class="totalbar"></div>`);
  subjCard.appendChild(totalBar);
  wrap.appendChild(subjCard);

  function currentTotalTarget() { return parseInt(card.querySelector("#f_total").value || "0", 10); }
  function sumCounts() { return SUBJECTS.reduce((s, subj) => s + (draft.subjects[subj].included ? draft.subjects[subj].count : 0), 0); }

  function redrawSubjects() {
    subjBody.innerHTML = "";
    SUBJECTS.forEach(subj => {
      const s = draft.subjects[subj];
      const sc = el(`
        <div class="subjectcard ${s.included ? "" : "disabled"}">
          <div class="top">
            <span class="chip ${s.included ? "active" : ""}">${esc(subj)}</span>
            <div class="stepper">
              <button type="button" class="dec">&minus;</button>
              <span class="val">${s.count}</span>
              <button type="button" class="inc">&plus;</button>
            </div>
          </div>
        </div>`);
      sc.querySelector(".chip").onclick = () => { s.included = !s.included; if (!s.included) s.count = 0; redrawSubjects(); };
      sc.querySelector(".dec").onclick = () => { if (s.included && s.count > 0) { s.count--; redrawSubjects(); } };
      sc.querySelector(".inc").onclick = () => { if (s.included) { s.count++; redrawSubjects(); } };
      subjBody.appendChild(sc);
    });
    const target = currentTotalTarget();
    const sum = sumCounts();
    totalBar.textContent = `Total: ${sum} / ${target || 0}`;
    totalBar.className = "totalbar " + (target > 0 && sum === target ? "ok" : "bad");
    nextBtn.disabled = !(target > 0 && sum === target);
  }

  card.querySelector("#f_total").addEventListener("input", redrawSubjects);

  const btnrow = el(`<div class="btnrow"><button id="next">Next: Enter Analysis &rarr;</button></div>`);
  const nextBtn = btnrow.querySelector("#next");
  wrap.appendChild(btnrow);
  redrawSubjects();

  nextBtn.onclick = () => {
    draft.testName = card.querySelector("#f_name").value.trim() || "Untitled Test";
    draft.date = card.querySelector("#f_date").value || todayStr();
    draft.platform = card.querySelector("#f_platform").value;
    draft.exam = card.querySelector("#f_exam").value;
    draft.testType = card.querySelector("#f_ttype").value;
    draft.totalQuestions = currentTotalTarget();
    draft.marksCorrect = parseFloat(card.querySelector("#f_mcorrect").value || "0");
    draft.marksNegative = parseFloat(card.querySelector("#f_mwrong").value || "0");
    // build question slots in subject order
    const questions = [];
    let qn = 1;
    SUBJECTS.forEach(subj => {
      const s = draft.subjects[subj];
      if (s.included) {
        for (let i = 0; i < s.count; i++) {
          questions.push({ qNumber: qn++, subject: subj, topic: "", chapter: "", correctWrong: "", reason: "", remarks: "" });
        }
      }
    });
    draft.questions = questions;
    draft.currentIndex = 0;
    go("entry_questions");
  };
  return wrap;
}

/* ============================== ENTRY: QUESTION WIZARD ============================== */
function pageEntryQuestions() {
  if (!draft || !draft.questions || !draft.questions.length) { go("entry_info"); return el("<div></div>"); }
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to test info</button>`);
  back.onclick = () => go("entry_info");
  wrap.appendChild(back);

  const idx = draft.currentIndex;
  const q = draft.questions[idx];

  wrap.appendChild(el(`<h1>${esc(draft.testName)}</h1>`));
  wrap.appendChild(el(`<div class="qmeta"><span>Subject: <strong>${esc(q.subject)}</strong></span><span>Question ${idx + 1} of ${draft.questions.length}</span></div>`));

  const tabs = el(`<div class="qtabs"></div>`);
  draft.questions.forEach((qq, i) => {
    let cls = "qtab";
    if (i === idx) cls += " current";
    else if (qq.correctWrong === "Correct") cls += " done";
    else if (qq.correctWrong === "Wrong") cls += " done wrong";
    const t = el(`<div class="${cls}">${i + 1}</div>`);
    t.onclick = () => { draft.currentIndex = i; go("entry_questions"); };
    tabs.appendChild(t);
  });
  wrap.appendChild(tabs);

  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="field"><label>Topic</label>
    <select id="q_topic"><option value="">Select Topic</option>${topicsOf(q.subject).map(t => `<option ${t === q.topic ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`));
  card.appendChild(el(`<div class="field"><label>Chapter</label>
    <select id="q_chapter"><option value="">Select Chapter</option>${chaptersOf(q.subject, q.topic).map(c => `<option ${c === q.chapter ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>`));

  card.querySelector("#q_topic").addEventListener("change", e => {
    q.topic = e.target.value; q.chapter = "";
    go("entry_questions");
  });
  card.querySelector("#q_chapter").addEventListener("change", e => { q.chapter = e.target.value; });

  card.appendChild(el(`<label>Right or Wrong</label>`));
  const rwRow = el(`<div class="rw-row">
      <div class="rw-btn right ${q.correctWrong === "Correct" ? "active" : ""}">&#10003; Right</div>
      <div class="rw-btn wrong ${q.correctWrong === "Wrong" ? "active" : ""}">&#10007; Wrong</div>
    </div>`);
  rwRow.querySelector(".right").onclick = () => { q.correctWrong = "Correct"; q.reason = ""; go("entry_questions"); };
  rwRow.querySelector(".wrong").onclick = () => { q.correctWrong = "Wrong"; q.reason = ""; go("entry_questions"); };
  card.appendChild(rwRow);

  const reasonOpts = q.correctWrong === "Correct" ? REASONS_CORRECT : q.correctWrong === "Wrong" ? REASONS_WRONG : [];
  card.appendChild(el(`<div class="field"><label>Reason</label>
    <select id="q_reason" ${reasonOpts.length ? "" : "disabled"}><option value="">Select Reason</option>${reasonOpts.map(r => `<option ${r === q.reason ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></div>`));
  card.querySelector("#q_reason").addEventListener("change", e => { q.reason = e.target.value; });

  const remField = el(`<div class="field"><label>Remarks (max 1000 characters)</label><textarea id="q_remarks" maxlength="1000" placeholder="Enter your remarks here...">${esc(q.remarks)}</textarea><div class="charcount"><span class="cc">${q.remarks.length}</span> / 1000</div></div>`);
  remField.querySelector("#q_remarks").addEventListener("input", e => { q.remarks = e.target.value; remField.querySelector(".cc").textContent = e.target.value.length; });
  card.appendChild(remField);

  wrap.appendChild(card);

  const nav = el(`<div class="btnrow spread"></div>`);
  const prevBtn = el(`<button class="secondary">&larr; Previous Question</button>`);
  prevBtn.disabled = idx === 0;
  prevBtn.onclick = () => { draft.currentIndex = Math.max(0, idx - 1); go("entry_questions"); };
  nav.appendChild(prevBtn);

  if (idx < draft.questions.length - 1) {
    const nextBtn = el(`<button>Next Question &rarr;</button>`);
    nextBtn.onclick = () => { draft.currentIndex = idx + 1; go("entry_questions"); };
    nav.appendChild(nextBtn);
  } else {
    const submitBtn = el(`<button id="submitTest">Submit Test</button>`);
    submitBtn.onclick = async () => {
      const unanswered = draft.questions.filter(qq => !qq.correctWrong).length;
      if (unanswered > 0 && !confirm(`${unanswered} question(s) don't have Right/Wrong marked. Submit anyway?`)) return;
      submitBtn.disabled = true; submitBtn.textContent = "Saving...";
      try {
        const payload = {
          date: draft.date, testName: draft.testName, platform: draft.platform, exam: draft.exam,
          testType: draft.testType, totalQuestions: draft.totalQuestions,
          marksCorrect: draft.marksCorrect, marksNegative: draft.marksNegative, questions: draft.questions
        };
        await apiPost("/api/tests", payload);
        await loadData();
        go("entry_result", { resultDraft: draft });
        draft = null;
      } catch (e) {
        toast("Couldn't save: " + e.message);
        submitBtn.disabled = false; submitBtn.textContent = "Submit Test";
      }
    };
    nav.appendChild(submitBtn);
  }
  wrap.appendChild(nav);
  return wrap;
}

/* ============================== ENTRY: RESULT SUMMARY ============================== */
function pageEntryResult() {
  const t = route.resultDraft;
  const wrap = el(`<div></div>`);
  if (!t) { wrap.appendChild(el(`<div class="empty">No result to show.</div>`)); return wrap; }

  const correct = t.questions.filter(q => q.correctWrong === "Correct").length;
  const wrong = t.questions.filter(q => q.correctWrong === "Wrong").length;
  const total = t.questions.length;
  const accuracy = total ? correct / total : 0;
  const marksCorrect = t.marksCorrect != null ? +t.marksCorrect : 2;
  const marksNegative = t.marksNegative != null ? +t.marksNegative : 0.5;
  const score = +(correct * marksCorrect - wrong * marksNegative).toFixed(2);
  const maxScore = +(total * marksCorrect).toFixed(2);

  wrap.appendChild(el(`<div style="text-align:center;margin-bottom:10px;"><span style="font-size:1.6rem;">&#9989;</span></div>`));
  wrap.appendChild(el(`<h1 style="text-align:center;">Test Submitted Successfully!</h1><p class="lead" style="text-align:center;">Here is your analysis summary</p>`));

  const stats = el(`<div class="statgrid four"></div>`);
  stats.appendChild(el(`<div class="statcard"><div class="n">${total}</div><div class="l">Total Questions</div></div>`));
  stats.appendChild(el(`<div class="statcard correct"><div class="n">${correct}</div><div class="l">Correct</div></div>`));
  stats.appendChild(el(`<div class="statcard wrong"><div class="n">${wrong}</div><div class="l">Wrong</div></div>`));
  stats.appendChild(el(`<div class="statcard"><div class="n">${pct(accuracy)}</div><div class="l">Accuracy</div></div>`));
  wrap.appendChild(stats);
  wrap.appendChild(el(`<div class="statcard" style="margin-bottom:14px;"><div class="n">${score} / ${maxScore}</div><div class="l">Score (+${marksCorrect} correct, &minus;${marksNegative} wrong)</div></div>`));

  // topic-level stats for this test
  const topicMap = {};
  t.questions.forEach(q => {
    if (!q.topic) return;
    const key = q.subject + " — " + q.topic;
    if (!topicMap[key]) topicMap[key] = { correct: 0, total: 0 };
    topicMap[key].total++;
    if (q.correctWrong === "Correct") topicMap[key].correct++;
  });
  const topicRows = Object.entries(topicMap).map(([name, v]) => ({ name, acc: v.correct / v.total, total: v.total }));
  const strong = topicRows.filter(r => r.acc >= 0.75).sort((a, b) => b.acc - a.acc).slice(0, 6);
  const weak = topicRows.filter(r => r.acc < 0.5).sort((a, b) => a.acc - b.acc).slice(0, 6);

  const g2 = el(`<div class="grid2"></div>`);
  const strongBox = el(`<div class="box green"><h3>Strong Topics</h3></div>`);
  const sUl = el(`<ul></ul>`);
  (strong.length ? strong : [{ name: "None yet", acc: null }]).forEach(r => sUl.appendChild(el(`<li>&#10003; ${esc(r.name)}${r.acc != null ? " — " + pct(r.acc) : ""}</li>`)));
  strongBox.appendChild(sUl);
  const weakBox = el(`<div class="box red"><h3>Weak Topics</h3></div>`);
  const wUl = el(`<ul></ul>`);
  (weak.length ? weak : [{ name: "None", acc: null }]).forEach(r => wUl.appendChild(el(`<li>&#10007; ${esc(r.name)}${r.acc != null ? " — " + pct(r.acc) : ""}</li>`)));
  weakBox.appendChild(wUl);
  g2.appendChild(strongBox); g2.appendChild(weakBox);
  wrap.appendChild(g2);

  const reasonCounts = {};
  t.questions.forEach(q => { if (q.correctWrong === "Wrong" && q.reason) reasonCounts[q.reason] = (reasonCounts[q.reason] || 0) + 1; });
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

  const suggestions = [];
  weak.slice(0, 3).forEach(r => suggestions.push(`Revise ${r.name} — accuracy ${pct(r.acc)}`));
  if (topReason) suggestions.push(`Most common mistake reason: ${topReason[0]} (${topReason[1]} question${topReason[1] > 1 ? "s" : ""})`);
  if (accuracy < 0.6) suggestions.push("Overall accuracy is below 60% — slow down and prioritise accuracy over speed.");
  if (!suggestions.length) suggestions.push("Solid performance — keep up periodic revision to stay sharp.");

  const impBox = el(`<div class="box yellow"><h3>What Needs Improvement?</h3></div>`);
  const iUl = el(`<ul></ul>`);
  suggestions.forEach(s => iUl.appendChild(el(`<li>${esc(s)}</li>`)));
  impBox.appendChild(iUl);
  wrap.appendChild(impBox);

  const btn = el(`<div class="btnrow"><button style="width:100%;">Go to Dashboard</button></div>`);
  btn.querySelector("button").onclick = () => go("dashboard");
  wrap.appendChild(btn);
  return wrap;
}

/* ============================== PROGRESS (unified, reactive) ============================== */
let progressFilters = { subject: "", topic: "", chapter: "", sort: "weak" };

function chaptersForScope(subject, topic) {
  // returns [{value, label}] — value is "Topic|||Chapter" so same-named chapters under
  // different topics (e.g. "Miscellaneous") never collide.
  const out = [];
  const topics = topic ? [topic] : topicsOf(subject);
  topics.forEach(tp => {
    chaptersOf(subject, tp).forEach(ch => out.push({ value: tp + "|||" + ch, topic: tp, chapter: ch, label: topic ? ch : (tp + " — " + ch) }));
  });
  return out;
}

function pageProgress() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => go("dashboard");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Progress</h1><p class="lead">Pick a subject, topic or chapter to see strong and weak spots. Updates instantly.</p>`));

  // ---- overall snapshot (always all tests, unfiltered) ----
  const allQ = allQuestionsFlat();
  const totalQ = allQ.length;
  const totalC = allQ.filter(q => q.correctWrong === "Correct").length;
  const totalW = allQ.filter(q => q.correctWrong === "Wrong").length;
  const snap = el(`<div class="statgrid four" style="margin-bottom:14px;"></div>`);
  snap.appendChild(el(`<div class="statcard"><div class="n">${db.tests.length}</div><div class="l">Total Tests</div></div>`));
  snap.appendChild(el(`<div class="statcard"><div class="n">${totalQ}</div><div class="l">Questions</div></div>`));
  snap.appendChild(el(`<div class="statcard correct"><div class="n">${totalC}</div><div class="l">Correct</div></div>`));
  snap.appendChild(el(`<div class="statcard wrong"><div class="n">${totalW}</div><div class="l">Wrong</div></div>`));
  wrap.appendChild(snap);

  // ---- filter row ----
  const filterCard = el(`<div class="card"></div>`);
  const g3 = el(`<div class="grid3"></div>`);
  g3.appendChild(el(`<div class="field"><label>Subject</label><select id="pf_subject"><option value="">All Subjects</option>${SUBJECTS.map(s => `<option value="${esc(s)}" ${s === progressFilters.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  g3.appendChild(el(`<div class="field"><label>Topic</label><select id="pf_topic"><option value="">All Topics</option></select></div>`));
  g3.appendChild(el(`<div class="field"><label>Chapter</label><select id="pf_chapter"><option value="">All Chapters</option></select></div>`));
  filterCard.appendChild(g3);
  filterCard.appendChild(el(`<div class="field"><label>Sort</label>
    <select id="pf_sort">
      <option value="weak" ${progressFilters.sort === "weak" ? "selected" : ""}>Weak to Strong</option>
      <option value="strong" ${progressFilters.sort === "strong" ? "selected" : ""}>Strong to Weak</option>
    </select></div>`));
  wrap.appendChild(filterCard);

  const resultsHost = el(`<div></div>`);
  wrap.appendChild(resultsHost);

  const subjectSel = filterCard.querySelector("#pf_subject");
  const topicSel = filterCard.querySelector("#pf_topic");
  const chapterSel = filterCard.querySelector("#pf_chapter");
  const sortSel = filterCard.querySelector("#pf_sort");

  function fillTopicOptions() {
    const subj = subjectSel.value;
    topicSel.innerHTML = `<option value="">All Topics</option>` + (subj ? topicsOf(subj).map(t => `<option value="${esc(t)}" ${t === progressFilters.topic ? "selected" : ""}>${esc(t)}</option>`).join("") : "");
    topicSel.disabled = !subj;
  }
  function fillChapterOptions() {
    const subj = subjectSel.value;
    const topic = topicSel.value;
    const opts = subj ? chaptersForScope(subj, topic || null) : [];
    chapterSel.innerHTML = `<option value="">All Chapters</option>` + opts.map(o => `<option value="${esc(o.value)}" ${o.value === progressFilters.chapter ? "selected" : ""}>${esc(o.label)}</option>`).join("");
    chapterSel.disabled = !subj;
  }

  fillTopicOptions();
  fillChapterOptions();

  subjectSel.addEventListener("change", () => {
    progressFilters.subject = subjectSel.value;
    progressFilters.topic = ""; progressFilters.chapter = "";
    fillTopicOptions(); fillChapterOptions();
    renderProgressResults(resultsHost);
  });
  topicSel.addEventListener("change", () => {
    progressFilters.topic = topicSel.value;
    progressFilters.chapter = "";
    fillChapterOptions();
    renderProgressResults(resultsHost);
  });
  chapterSel.addEventListener("change", () => {
    progressFilters.chapter = chapterSel.value;
    renderProgressResults(resultsHost);
  });
  sortSel.addEventListener("change", () => {
    progressFilters.sort = sortSel.value;
    renderProgressResults(resultsHost);
  });

  renderProgressResults(resultsHost);
  return wrap;
}

function sortRows(rows, sortMode) {
  const attempted = rows.filter(r => r.total > 0);
  const unattempted = rows.filter(r => r.total === 0);
  attempted.sort((a, b) => sortMode === "weak" ? a.acc - b.acc : b.acc - a.acc);
  return attempted.concat(unattempted);
}

function renderProgressResults(host) {
  host.innerHTML = "";
  const f = progressFilters;

  // ---- All Subjects: subject-level table ----
  if (!f.subject) {
    const rows = SUBJECTS.map(subj => {
      const qs = allQuestionsFlat().filter(q => q.subject === subj);
      const c = qs.filter(q => q.correctWrong === "Correct").length;
      const total = qs.length;
      const acc = total ? c / total : 0;
      return { name: subj, total, correct: c, wrong: total - c, acc, cls: classify(acc, total) };
    });
    const sorted = sortRows(rows, f.sort);
    const card = el(`<div class="card"></div>`);
    const table = el(`<table><thead><tr><th>Subject</th><th>Total</th><th>Correct</th><th>Wrong</th><th>Accuracy</th><th>Strength</th></tr></thead><tbody></tbody></table>`);
    sorted.forEach(r => {
      table.querySelector("tbody").appendChild(el(`
        <tr>
          <td>${esc(r.name)}</td>
          <td>${r.total}</td>
          <td>${r.correct}</td>
          <td>${r.wrong}</td>
          <td>${r.total ? pct(r.acc) : "—"}</td>
          <td><span class="pill-badge ${r.cls}">${badgeLabel(r.cls)}</span></td>
        </tr>`));
    });
    card.appendChild(table);
    host.appendChild(card);
    return;
  }

  // ---- Specific chapter chosen: deep-dive view ----
  if (f.chapter) {
    const [topic, chapter] = f.chapter.split("|||");
    let correct = 0, total = 0;
    const remarksList = [];
    db.tests.forEach(t => t.questions.forEach(q => {
      if (q.subject !== f.subject || q.topic !== topic || q.chapter !== chapter) return;
      total++;
      if (q.correctWrong === "Correct") correct++;
      if (q.remarks) remarksList.push({ date: t.date, testName: t.testName, remarks: q.remarks, correctWrong: q.correctWrong });
    }));
    if (!total) { host.appendChild(el(`<div class="empty">No questions logged yet for ${esc(topic)} — ${esc(chapter)}.</div>`)); return; }
    const acc = correct / total;
    const cls = classify(acc, total);
    const card = el(`<div class="card"></div>`);
    card.appendChild(el(`<h2>${esc(topic)} — ${esc(chapter)}</h2>`));
    const stats = el(`<div class="statgrid four"></div>`);
    stats.appendChild(el(`<div class="statcard"><div class="n">${total}</div><div class="l">Total</div></div>`));
    stats.appendChild(el(`<div class="statcard correct"><div class="n">${correct}</div><div class="l">Correct</div></div>`));
    stats.appendChild(el(`<div class="statcard wrong"><div class="n">${total - correct}</div><div class="l">Wrong</div></div>`));
    stats.appendChild(el(`<div class="statcard"><div class="n">${pct(acc)}</div><div class="l">Accuracy</div></div>`));
    card.appendChild(stats);
    card.appendChild(el(`<span class="pill-badge ${cls}">${badgeLabel(cls)}</span>`));
    host.appendChild(card);

    if (remarksList.length) {
      const remCard = el(`<div class="card"><h2>Remarks on this chapter</h2></div>`);
      remarksList.slice().reverse().forEach(r => {
        remCard.appendChild(el(`<div style="margin-bottom:10px;"><strong>${r.date} — ${esc(r.testName)}</strong> <span class="pill-badge ${r.correctWrong === "Correct" ? "strong" : "weak"}">${r.correctWrong}</span><div style="color:var(--muted);font-size:.85rem;">${esc(r.remarks)}</div></div>`));
      });
      host.appendChild(remCard);
    }
    return;
  }

  // ---- Subject chosen (+ optionally Topic), Chapter = All: chapter-level table ----
  const scopeChapters = chaptersForScope(f.subject, f.topic || null);
  const rows = scopeChapters.map(o => {
    let correct = 0, total = 0;
    db.tests.forEach(t => t.questions.forEach(q => {
      if (q.subject !== f.subject || q.topic !== o.topic || q.chapter !== o.chapter) return;
      total++;
      if (q.correctWrong === "Correct") correct++;
    }));
    const acc = total ? correct / total : 0;
    return { name: o.label, total, correct, wrong: total - correct, acc, cls: classify(acc, total) };
  });
  const sorted = sortRows(rows, f.sort);

  if (!sorted.length) { host.appendChild(el(`<div class="empty">No chapters found.</div>`)); return; }

  const card = el(`<div class="card"></div>`);
  const table = el(`<table><thead><tr><th>Chapter</th><th>Total</th><th>Correct</th><th>Wrong</th><th>Accuracy</th><th>Strength</th></tr></thead><tbody></tbody></table>`);
  sorted.forEach(r => {
    table.querySelector("tbody").appendChild(el(`
      <tr>
        <td>${esc(r.name)}</td>
        <td>${r.total}</td>
        <td>${r.correct}</td>
        <td>${r.wrong}</td>
        <td>${r.total ? pct(r.acc) : "—"}</td>
        <td><span class="pill-badge ${r.cls}">${badgeLabel(r.cls)}</span></td>
      </tr>`));
  });
  card.appendChild(table);
  host.appendChild(card);
}

/* ============================== BOOT ============================== */
if (getPasscode()) {
  route = { page: "dashboard" };
  render();
  loadData().then(render).catch(e => { loadError = e.message; render(); });
} else {
  render();
}
