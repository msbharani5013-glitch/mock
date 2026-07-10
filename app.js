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
    progress: pageProgressHome,
    progress_overall: pageProgressOverall,
    progress_subject: pageProgressSubject,
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
      table.querySelector("tbody").appendChild(el(`<tr><td>${t.date}</td><td>${esc(t.testName)}</td><td>${c}/${t.totalQuestions}</td></tr>`));
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
          testType: draft.testType, totalQuestions: draft.totalQuestions, questions: draft.questions
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

  wrap.appendChild(el(`<div style="text-align:center;margin-bottom:10px;"><span style="font-size:1.6rem;">&#9989;</span></div>`));
  wrap.appendChild(el(`<h1 style="text-align:center;">Test Submitted Successfully!</h1><p class="lead" style="text-align:center;">Here is your analysis summary</p>`));

  const stats = el(`<div class="statgrid four"></div>`);
  stats.appendChild(el(`<div class="statcard"><div class="n">${total}</div><div class="l">Total Questions</div></div>`));
  stats.appendChild(el(`<div class="statcard correct"><div class="n">${correct}</div><div class="l">Correct</div></div>`));
  stats.appendChild(el(`<div class="statcard wrong"><div class="n">${wrong}</div><div class="l">Wrong</div></div>`));
  stats.appendChild(el(`<div class="statcard"><div class="n">${pct(accuracy)}</div><div class="l">Accuracy</div></div>`));
  wrap.appendChild(stats);

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

/* ============================== PROGRESS HOME ============================== */
function pageProgressHome() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => go("dashboard");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Progress</h1>`));
  const a = el(`<button class="tile blue"><div class="icon">&#128202;</div><div><h3>Overall Performance</h3><p>View overall stats and performance summary</p></div></button>`);
  a.onclick = () => go("progress_overall");
  const b = el(`<button class="tile green"><div class="icon">&#128201;</div><div><h3>Subject Wise Performance</h3><p>Analyze performance subject by subject</p></div></button>`);
  b.onclick = () => go("progress_subject");
  wrap.appendChild(a); wrap.appendChild(b);
  return wrap;
}

/* ============================== PROGRESS: OVERALL ============================== */
let overallFilters = { dateFrom: "", dateTo: "", exam: "All Exams", platform: "All Platforms" };
let overallCharts = [];
function pageProgressOverall() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to progress</button>`);
  back.onclick = () => go("progress");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Overall Performance</h1>`));

  const filterCard = el(`<div class="card"></div>`);
  const g3 = el(`<div class="grid3"></div>`);
  g3.appendChild(el(`<div class="field"><label>Date From</label><input type="date" id="ff_from" value="${overallFilters.dateFrom}"></div>`));
  g3.appendChild(el(`<div class="field"><label>Date To</label><input type="date" id="ff_to" value="${overallFilters.dateTo}"></div>`));
  g3.appendChild(el(`<div class="field"><label>Exam</label><select id="ff_exam"><option>All Exams</option>${EXAMS.map(x => `<option ${x === overallFilters.exam ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  filterCard.appendChild(g3);
  const g1 = el(`<div class="field"><label>Platform</label><select id="ff_platform" style="max-width:240px;"><option>All Platforms</option>${PLATFORMS.map(x => `<option ${x === overallFilters.platform ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`);
  filterCard.appendChild(g1);
  const filterBtn = el(`<div class="btnrow"><button id="apply">Filter</button></div>`);
  filterCard.appendChild(filterBtn);
  wrap.appendChild(filterCard);

  const resultsHost = el(`<div></div>`);
  wrap.appendChild(resultsHost);

  function applyAndRender() {
    overallFilters = {
      dateFrom: filterCard.querySelector("#ff_from").value,
      dateTo: filterCard.querySelector("#ff_to").value,
      exam: filterCard.querySelector("#ff_exam").value,
      platform: filterCard.querySelector("#ff_platform").value,
    };
    renderOverallResults(resultsHost);
  }
  filterBtn.querySelector("#apply").onclick = applyAndRender;
  renderOverallResults(resultsHost);
  return wrap;
}

function renderOverallResults(host) {
  host.innerHTML = "";
  overallCharts.forEach(c => c.destroy());
  overallCharts = [];

  const tests = filterTests(db.tests, overallFilters).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!tests.length) { host.appendChild(el(`<div class="empty">No tests match this filter.</div>`)); return; }

  let totalQ = 0, totalC = 0, totalW = 0;
  tests.forEach(t => { t.questions.forEach(q => { totalQ++; if (q.correctWrong === "Correct") totalC++; if (q.correctWrong === "Wrong") totalW++; }); });
  const avgAcc = totalQ ? totalC / totalQ : 0;

  const stats = el(`<div class="statgrid four"></div>`);
  stats.appendChild(el(`<div class="statcard"><div class="n">${tests.length}</div><div class="l">Total Tests</div></div>`));
  stats.appendChild(el(`<div class="statcard"><div class="n">${totalQ}</div><div class="l">Total Questions</div></div>`));
  stats.appendChild(el(`<div class="statcard correct"><div class="n">${totalC}</div><div class="l">Correct</div></div>`));
  stats.appendChild(el(`<div class="statcard wrong"><div class="n">${totalW}</div><div class="l">Wrong</div></div>`));
  host.appendChild(stats);
  host.appendChild(el(`<div class="statcard" style="margin-bottom:14px;"><div class="n">${pct(avgAcc)}</div><div class="l">Average Accuracy</div></div>`));

  const trendCard = el(`<div class="card"><h2>Accuracy Trend</h2><div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>`);
  host.appendChild(trendCard);
  const donutCard = el(`<div class="card"><h2>Subject Wise Accuracy</h2><div class="chart-wrap"><canvas id="subjChart"></canvas></div></div>`);
  host.appendChild(donutCard);

  if (typeof Chart === "undefined") {
    trendCard.querySelector(".chart-wrap").outerHTML = '<div class="empty">Chart library failed to load (check your internet connection) — the stats above are still accurate.</div>';
    donutCard.querySelector(".chart-wrap").outerHTML = '<div class="empty">Chart library failed to load (check your internet connection) — the stats above are still accurate.</div>';
    return;
  }

  try {
    const labels = tests.map((t, i) => "T" + (i + 1));
    const accData = tests.map(t => {
      const c = t.questions.filter(q => q.correctWrong === "Correct").length;
      return t.questions.length ? +(c / t.questions.length * 100).toFixed(1) : 0;
    });
    const trendCtx = trendCard.querySelector("#trendChart").getContext("2d");
    overallCharts.push(new Chart(trendCtx, {
      type: "line",
      data: { labels, datasets: [{ label: "Accuracy %", data: accData, borderColor: "#2A5CAA", backgroundColor: "rgba(42,92,170,.12)", tension: .3, fill: true, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + "%" } } }, plugins: { legend: { display: false } } }
    }));
  } catch (e) {
    console.error("Trend chart failed", e);
    trendCard.querySelector(".chart-wrap").outerHTML = '<div class="empty">Couldn\'t draw this chart.</div>';
  }

  try {
    const subjAcc = {};
    SUBJECTS.forEach(s => subjAcc[s] = { c: 0, t: 0 });
    tests.forEach(t => t.questions.forEach(q => {
      if (!subjAcc[q.subject]) return;
      subjAcc[q.subject].t++;
      if (q.correctWrong === "Correct") subjAcc[q.subject].c++;
    }));
    const subjLabels = SUBJECTS.filter(s => subjAcc[s].t > 0);
    const subjData = subjLabels.map(s => +(subjAcc[s].c / subjAcc[s].t * 100).toFixed(1));
    const colors = ["#6C63FF", "#2A9D8F", "#E9A23B", "#B23A2E", "#2A5CAA"];
    if (subjLabels.length) {
      const donutCtx = donutCard.querySelector("#subjChart").getContext("2d");
      overallCharts.push(new Chart(donutCtx, {
        type: "doughnut",
        data: { labels: subjLabels, datasets: [{ data: subjData, backgroundColor: subjLabels.map((_, i) => colors[i % colors.length]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
      }));
    } else {
      donutCard.querySelector(".chart-wrap").outerHTML = '<div class="empty">No subject data yet.</div>';
    }
  } catch (e) {
    console.error("Donut chart failed", e);
    donutCard.querySelector(".chart-wrap").outerHTML = '<div class="empty">Couldn\'t draw this chart.</div>';
  }
}

/* ============================== PROGRESS: SUBJECT-WISE ============================== */
let subjectFilters = { subject: SUBJECTS[0], chapter: "", dateFrom: "", dateTo: "", platform: "All Platforms", testType: "All Types" };

function chapterOptionsFor(subject) {
  const opts = [];
  topicsOf(subject).forEach(topic => {
    chaptersOf(subject, topic).forEach(chap => opts.push({ value: topic + "|||" + chap, label: topic + " — " + chap }));
  });
  return opts;
}

function pageProgressSubject() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to progress</button>`);
  back.onclick = () => go("progress");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Subject Wise Performance</h1>`));

  const filterCard = el(`<div class="card"></div>`);
  const g3a = el(`<div class="grid3"></div>`);
  g3a.appendChild(el(`<div class="field"><label>Select Subject</label><select id="sf_subject">${SUBJECTS.map(s => `<option ${s === subjectFilters.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  const chapField = el(`<div class="field"><label>Chapter</label><select id="sf_chapter"></select></div>`);
  g3a.appendChild(chapField);
  g3a.appendChild(el(`<div class="field"><label>Date From</label><input type="date" id="sf_from" value="${subjectFilters.dateFrom}"></div>`));
  filterCard.appendChild(g3a);
  const g2b = el(`<div class="grid2"></div>`);
  g2b.appendChild(el(`<div class="field"><label>Date To</label><input type="date" id="sf_to" value="${subjectFilters.dateTo}"></div>`));
  g2b.appendChild(el(`<div class="field"><label>Platform</label><select id="sf_platform"><option>All Platforms</option>${PLATFORMS.map(x => `<option ${x === subjectFilters.platform ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  filterCard.appendChild(g2b);
  filterCard.appendChild(el(`<div class="field"><label>Test Type</label><select id="sf_ttype"><option>All Types</option>${TEST_TYPES.map(x => `<option ${x === subjectFilters.testType ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  const filterBtn = el(`<div class="btnrow"><button id="apply">Filter</button></div>`);
  filterCard.appendChild(filterBtn);
  wrap.appendChild(filterCard);

  function fillChapterOptions(selectedSubject, selectedChapterValue) {
    const sel = filterCard.querySelector("#sf_chapter");
    const opts = chapterOptionsFor(selectedSubject);
    sel.innerHTML = `<option value="">All Chapters</option>` + opts.map(o => `<option value="${esc(o.value)}" ${o.value === selectedChapterValue ? "selected" : ""}>${esc(o.label)}</option>`).join("");
  }
  filterCard.querySelector("#sf_subject").addEventListener("change", e => fillChapterOptions(e.target.value, ""));
  fillChapterOptions(subjectFilters.subject, subjectFilters.chapter);

  const resultsHost = el(`<div></div>`);
  wrap.appendChild(resultsHost);

  function applyAndRender() {
    subjectFilters = {
      subject: filterCard.querySelector("#sf_subject").value,
      chapter: filterCard.querySelector("#sf_chapter").value,
      dateFrom: filterCard.querySelector("#sf_from").value,
      dateTo: filterCard.querySelector("#sf_to").value,
      platform: filterCard.querySelector("#sf_platform").value,
      testType: filterCard.querySelector("#sf_ttype").value,
    };
    renderSubjectResults(resultsHost);
  }
  filterBtn.querySelector("#apply").onclick = applyAndRender;
  renderSubjectResults(resultsHost);
  return wrap;
}

function renderSubjectResults(host) {
  host.innerHTML = "";
  const tests = filterTests(db.tests, subjectFilters);

  if (subjectFilters.chapter) {
    // single-chapter focused view
    const [topic, chapter] = subjectFilters.chapter.split("|||");
    let correct = 0, total = 0;
    const remarksList = [];
    tests.forEach(t => t.questions.forEach(q => {
      if (q.subject !== subjectFilters.subject || q.topic !== topic || q.chapter !== chapter) return;
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

  // All Chapters -> topic-level breakdown
  const topicMap = {};
  topicsOf(subjectFilters.subject).forEach(t => { topicMap[t] = { correct: 0, total: 0 }; });
  tests.forEach(t => t.questions.forEach(q => {
    if (q.subject !== subjectFilters.subject || !q.topic) return;
    if (!topicMap[q.topic]) topicMap[q.topic] = { correct: 0, total: 0 };
    topicMap[q.topic].total++;
    if (q.correctWrong === "Correct") topicMap[q.topic].correct++;
  }));

  const rows = Object.entries(topicMap).map(([topic, v]) => ({
    topic, total: v.total, correct: v.correct, wrong: v.total - v.correct,
    acc: v.total ? v.correct / v.total : 0, cls: classify(v.total ? v.correct / v.total : 0, v.total)
  })).sort((a, b) => a.acc - b.acc);

  if (!rows.length) { host.appendChild(el(`<div class="empty">No topics found for ${esc(subjectFilters.subject)}.</div>`)); return; }

  const card = el(`<div class="card"></div>`);
  const table = el(`<table><thead><tr><th>Topic</th><th>Total</th><th>Correct</th><th>Wrong</th><th>Accuracy</th><th>Strength</th></tr></thead><tbody></tbody></table>`);
  rows.forEach(r => {
    table.querySelector("tbody").appendChild(el(`
      <tr>
        <td>${esc(r.topic)}</td>
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
