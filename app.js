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
    test_bank: pageTestBank,
    weightage: pageWeightage,
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
  const bankTile = el(`
    <button class="tile" style="border-color:var(--line);">
      <div class="icon" style="background:var(--yellow-bg);">&#128196;</div>
      <div><h3>Test Count</h3><p>Track PYQ papers completed vs available</p></div>
    </button>`);
  bankTile.onclick = () => go("test_bank");
  const weightTile = el(`
    <button class="tile" style="border-color:var(--line);">
      <div class="icon" style="background:#F1E9FB;">&#128202;</div>
      <div><h3>Weightage by PYQ</h3><p>See topic &amp; chapter weightage from your PYQ history</p></div>
    </button>`);
  weightTile.onclick = () => go("weightage");
  wrap.appendChild(entryTile);
  wrap.appendChild(progTile);
  wrap.appendChild(bankTile);
  wrap.appendChild(weightTile);

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
    mode: "manual",
    date: todayStr(), testName: "", platform: "", exam: "", testType: "", totalQuestions: "",
    marksCorrect: 2, marksNegative: 0.5,
    isPyq: false, pyqExamCategory: "", pyqYear: "", pyqShift: "",
    subjects: Object.fromEntries(SUBJECTS.map(s => [s, { included: true, count: 0 }]))
  };
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => { draft = null; go("dashboard"); };
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Test Information</h1><p class="lead">Step 1 of 2</p>`));

  const modeRow = el(`<div class="chip-toggle" style="margin-bottom:14px;">
    <div class="chip ${draft.mode === "pyq" ? "active" : ""}" id="mode_pyq">PYQ (Previous Year Paper)</div>
    <div class="chip ${draft.mode === "manual" ? "active" : ""}" id="mode_manual">Manual Entry</div>
  </div>`);
  modeRow.querySelector("#mode_pyq").onclick = () => { draft.mode = "pyq"; go("entry_info"); };
  modeRow.querySelector("#mode_manual").onclick = () => { draft.mode = "manual"; go("entry_info"); };
  wrap.appendChild(modeRow);

  if (draft.mode === "pyq") return renderPyqEntryInfo(wrap, draft);
  return renderManualEntryInfo(wrap, draft);
}

function renderManualEntryInfo(wrap, draft) {
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
    draft.isPyq = false;
    draft.pyqExamCategory = ""; draft.pyqStandard = ""; draft.pyqYear = ""; draft.pyqShift = "";
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

function renderPyqEntryInfo(wrap, draft) {
  const examNames = Object.keys(TEST_BANK);
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="field"><label>Exam Name</label>
    <select id="p_exam"><option value="">Select Exam</option>${examNames.map(x => `<option ${x === draft.pyqExamCategory ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`));
  const standardBadge = el(`<div class="field" id="p_standard_wrap" style="display:none;"><label>Standard</label><span class="pill-badge average" id="p_standard_badge"></span></div>`);
  card.appendChild(standardBadge);

  const g2 = el(`<div class="grid2"></div>`);
  g2.appendChild(el(`<div class="field"><label>Test Year</label><select id="p_year"><option value="">Select Year</option></select></div>`));
  g2.appendChild(el(`<div class="field"><label>Shift</label><select id="p_shift"><option value="">Select Shift</option>${SHIFTS.map(s => `<option ${s === draft.pyqShift ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  card.appendChild(g2);

  card.appendChild(el(`<div class="field"><label>Date</label><input type="date" id="p_date" value="${draft.date}"></div>`));

  const pyqModeRow = el(`<div class="field"><label>Test Coverage</label>
    <div class="chip-toggle">
      <div class="chip active" id="p_mode_full">Full Test</div>
      <div class="chip" id="p_mode_subject">Subject Test</div>
    </div></div>`);
  card.appendChild(pyqModeRow);

  const subjectPickWrap = el(`<div class="field" id="p_subject_wrap" style="display:none;"><label>Subject</label><select id="p_subject"></select></div>`);
  card.appendChild(subjectPickWrap);

  wrap.appendChild(card);

  const infoCard = el(`<div class="card" id="p_info" style="display:none;"><label>Auto-filled from Test Bank</label></div>`);
  wrap.appendChild(infoCard);

  const examSel = card.querySelector("#p_exam");
  const yearSel = card.querySelector("#p_year");
  const subjectSel = subjectPickWrap.querySelector("#p_subject");
  let pyqMode = "full"; // "full" | "subject"

  function fillYears() {
    const exam = examSel.value;
    const bankExam = TEST_BANK[exam];
    if (bankExam) {
      standardBadge.style.display = "";
      standardBadge.querySelector("#p_standard_badge").textContent = bankExam.standard;
      const years = Object.keys(bankExam.years).sort((a, b) => b - a);
      yearSel.innerHTML = `<option value="">Select Year</option>` + years.map(y => `<option ${y === String(draft.pyqYear) ? "selected" : ""}>${y}</option>`).join("");
    } else {
      standardBadge.style.display = "none";
      yearSel.innerHTML = `<option value="">Select Year</option>`;
    }
    fillSubjectOptions();
    updateInfoCard();
  }

  function fillSubjectOptions() {
    const exam = examSel.value, year = yearSel.value;
    const bankYear = exam && year && TEST_BANK[exam] ? TEST_BANK[exam].years[year] : null;
    if (!bankYear) { subjectSel.innerHTML = ""; return; }
    const available = SUBJECTS.filter((s, i) => bankYear.subjects[i] > 0);
    subjectSel.innerHTML = available.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }

  function updateInfoCard() {
    const exam = examSel.value, year = yearSel.value;
    const bankYear = exam && year && TEST_BANK[exam] ? TEST_BANK[exam].years[year] : null;
    if (!bankYear) { infoCard.style.display = "none"; nextBtn.disabled = true; return; }
    infoCard.style.display = "";
    const total = bankYear.subjects.reduce((a, b) => a + b, 0);
    let questionInfo;
    if (pyqMode === "subject" && subjectSel.value) {
      const idx = SUBJECTS.indexOf(subjectSel.value);
      questionInfo = `<div><span class="section-tag" style="display:block;color:var(--muted);font-size:.72rem;">Questions (${esc(subjectSel.value)} only)</span><strong>${bankYear.subjects[idx]}</strong></div>`;
    } else {
      questionInfo = `<div><span class="section-tag" style="display:block;color:var(--muted);font-size:.72rem;">Total Questions</span><strong>${total}</strong></div>`;
    }
    infoCard.innerHTML = `<label>Auto-filled from Test Bank</label>
      <div class="grid3" style="margin-top:6px;">
        ${questionInfo}
        <div><span class="section-tag" style="display:block;color:var(--muted);font-size:.72rem;">Marks</span><strong>+${bankYear.marksCorrect} / -${bankYear.marksNegative}</strong></div>
        <div><span class="section-tag" style="display:block;color:var(--muted);font-size:.72rem;">Papers this year</span><strong>${bankYear.count}</strong></div>
      </div>
      <div style="margin-top:8px;font-size:.85rem;color:var(--muted);">
        English ${bankYear.subjects[0]} &nbsp;|&nbsp; Maths ${bankYear.subjects[1]} &nbsp;|&nbsp; Reasoning ${bankYear.subjects[2]} &nbsp;|&nbsp; General Studies ${bankYear.subjects[3]}
      </div>`;
    checkReady();
  }

  function checkReady() {
    let ready = examSel.value && yearSel.value && card.querySelector("#p_shift").value && card.querySelector("#p_date").value;
    if (pyqMode === "subject") ready = ready && subjectSel.value;
    nextBtn.disabled = !ready;
  }

  examSel.addEventListener("change", fillYears);
  yearSel.addEventListener("change", () => { fillSubjectOptions(); updateInfoCard(); });
  subjectSel.addEventListener("change", () => { updateInfoCard(); });
  card.querySelector("#p_shift").addEventListener("change", checkReady);
  card.querySelector("#p_date").addEventListener("change", checkReady);

  pyqModeRow.querySelector("#p_mode_full").onclick = () => {
    pyqMode = "full";
    pyqModeRow.querySelector("#p_mode_full").classList.add("active");
    pyqModeRow.querySelector("#p_mode_subject").classList.remove("active");
    subjectPickWrap.style.display = "none";
    updateInfoCard();
  };
  pyqModeRow.querySelector("#p_mode_subject").onclick = () => {
    pyqMode = "subject";
    pyqModeRow.querySelector("#p_mode_subject").classList.add("active");
    pyqModeRow.querySelector("#p_mode_full").classList.remove("active");
    subjectPickWrap.style.display = "";
    fillSubjectOptions();
    updateInfoCard();
  };

  const btnrow = el(`<div class="btnrow"><button id="next" disabled>Next: Enter Analysis &rarr;</button></div>`);
  const nextBtn = btnrow.querySelector("#next");
  wrap.appendChild(btnrow);

  fillYears();

  nextBtn.onclick = () => {
    const exam = examSel.value, year = yearSel.value, shift = card.querySelector("#p_shift").value, date = card.querySelector("#p_date").value;
    const bankYear = TEST_BANK[exam].years[year];
    const standard = TEST_BANK[exam].standard;
    draft.isPyq = true;
    draft.pyqExamCategory = exam; draft.pyqStandard = standard; draft.pyqYear = parseInt(year, 10); draft.pyqShift = shift;
    draft.date = date;
    draft.marksCorrect = bankYear.marksCorrect; draft.marksNegative = bankYear.marksNegative;
    draft.platform = ""; draft.exam = exam; draft.testType = "PYQ";

    const questions = [];
    let qn = 1;
    if (pyqMode === "subject") {
      const chosenSubject = subjectSel.value;
      const idx = SUBJECTS.indexOf(chosenSubject);
      const count = bankYear.subjects[idx] || 0;
      for (let k = 0; k < count; k++) {
        questions.push({ qNumber: qn++, subject: chosenSubject, topic: "", chapter: "", correctWrong: "", reason: "", remarks: "" });
      }
      draft.pyqMode = "subject";
      draft.pyqSubject = chosenSubject;
      draft.testName = `${exam} — ${year} — ${shift} — ${chosenSubject} Only`;
      draft.totalQuestions = count;
    } else {
      SUBJECTS.forEach((subj, i) => {
        const count = bankYear.subjects[i] || 0;
        for (let k = 0; k < count; k++) {
          questions.push({ qNumber: qn++, subject: subj, topic: "", chapter: "", correctWrong: "", reason: "", remarks: "" });
        }
      });
      draft.pyqMode = "full";
      draft.pyqSubject = "";
      draft.testName = `${exam} — ${year} — ${shift}`;
      draft.totalQuestions = bankYear.subjects.reduce((a, b) => a + b, 0);
    }
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
          marksCorrect: draft.marksCorrect, marksNegative: draft.marksNegative, questions: draft.questions,
          isPyq: !!draft.isPyq, pyqExamCategory: draft.pyqExamCategory || "", pyqStandard: draft.pyqStandard || "",
          pyqYear: draft.pyqYear || null, pyqShift: draft.pyqShift || "",
          pyqMode: draft.pyqMode || "full", pyqSubject: draft.pyqSubject || ""
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
  if (t.isPyq) {
    const coverageLabel = t.pyqMode === "subject" ? esc(t.pyqSubject) + " Only" : "Full Test";
    wrap.appendChild(el(`<p style="text-align:center;margin-top:-10px;"><span class="pill-badge average">PYQ &middot; ${esc(t.pyqExamCategory)} &middot; ${esc(String(t.pyqYear))} &middot; ${esc(t.pyqShift)} &middot; ${coverageLabel}</span></p>`));
  }

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

/* ============================== TEST BANK (PYQ progress tracker) ============================== */
let bankMode = "count"; // "count" | "subject"
let bankFilters = { standard: "", exam: "", year: "" };
let bankSubjectFilters = { standard: "", exam: "", year: "", subject: "" };

function pyqTestsInScope(exam, year, fullOnly) {
  return db.tests.filter(t => t.isPyq && t.pyqExamCategory === exam && (year == null || String(t.pyqYear) === String(year))
    && (!fullOnly || t.pyqMode !== "subject"));
}

function pageTestBank() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => go("dashboard");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Test Count</h1><p class="lead">PYQ papers completed vs available. Updates instantly.</p>`));

  const modeRow = el(`<div class="chip-toggle" style="margin-bottom:14px;">
    <div class="chip ${bankMode === "count" ? "active" : ""}" id="bm_count">Track by Count</div>
    <div class="chip ${bankMode === "subject" ? "active" : ""}" id="bm_subject">Track by Subjects</div>
  </div>`);
  modeRow.querySelector("#bm_count").onclick = () => { bankMode = "count"; go("test_bank"); };
  modeRow.querySelector("#bm_subject").onclick = () => { bankMode = "subject"; go("test_bank"); };
  wrap.appendChild(modeRow);

  if (bankMode === "subject") return renderTrackBySubject(wrap);
  return renderTrackByCount(wrap);
}

function progressBarRow(label, completed, total, extra) {
  const p = total ? Math.min(100, (completed / total) * 100) : 0;
  const color = p >= 100 ? "var(--green)" : p >= 50 ? "var(--accent)" : "var(--yellow)";
  const row = el(`<div class="progressrow">
    <div class="toprow"><strong>${esc(label)}</strong><span class="count">${completed} / ${total}${extra ? " &middot; " + extra : ""}</span></div>
    <div class="progressbar-outer"><div class="progressbar-inner" style="width:${p}%;background:${color};"></div></div>
  </div>`);
  return row;
}

/* ---- Track by Count (existing view, minus the shift breakdown) ---- */
function renderTrackByCount(wrap) {
  const standards = [...new Set(Object.values(TEST_BANK).map(e => e.standard))];
  const filterCard = el(`<div class="card"></div>`);
  const g3 = el(`<div class="grid3"></div>`);
  g3.appendChild(el(`<div class="field"><label>Standard</label><select id="bf_standard"><option value="">All</option>${standards.map(s => `<option value="${esc(s)}" ${s === bankFilters.standard ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  g3.appendChild(el(`<div class="field"><label>Exam Name</label><select id="bf_exam"><option value="">All Exams</option></select></div>`));
  g3.appendChild(el(`<div class="field"><label>Year</label><select id="bf_year"><option value="">All Years</option></select></div>`));
  filterCard.appendChild(g3);
  wrap.appendChild(filterCard);

  const resultsHost = el(`<div></div>`);
  wrap.appendChild(resultsHost);

  const standardSel = filterCard.querySelector("#bf_standard");
  const examSel = filterCard.querySelector("#bf_exam");
  const yearSel = filterCard.querySelector("#bf_year");

  function examsInScope() {
    return Object.keys(TEST_BANK).filter(e => !standardSel.value || TEST_BANK[e].standard === standardSel.value);
  }
  function fillExamOptions() {
    const exams = examsInScope();
    examSel.innerHTML = `<option value="">All Exams</option>` + exams.map(e => `<option value="${esc(e)}" ${e === bankFilters.exam ? "selected" : ""}>${esc(e)}</option>`).join("");
    if (!exams.includes(bankFilters.exam)) bankFilters.exam = "";
    fillYearOptions();
  }
  function fillYearOptions() {
    const exam = examSel.value;
    const years = exam && TEST_BANK[exam] ? Object.keys(TEST_BANK[exam].years).sort((a, b) => b - a) : [];
    yearSel.innerHTML = `<option value="">All Years</option>` + years.map(y => `<option ${y === bankFilters.year ? "selected" : ""}>${y}</option>`).join("");
    yearSel.disabled = !exam;
  }

  fillExamOptions();

  standardSel.addEventListener("change", () => { bankFilters.standard = standardSel.value; bankFilters.exam = ""; bankFilters.year = ""; fillExamOptions(); renderBankResults(resultsHost); });
  examSel.addEventListener("change", () => { bankFilters.exam = examSel.value; bankFilters.year = ""; fillYearOptions(); renderBankResults(resultsHost); });
  yearSel.addEventListener("change", () => { bankFilters.year = yearSel.value; renderBankResults(resultsHost); });

  renderBankResults(resultsHost);
  return wrap;
}

function renderBankResults(host) {
  host.innerHTML = "";
  const f = bankFilters;
  const exams = Object.keys(TEST_BANK).filter(e => !f.standard || TEST_BANK[e].standard === f.standard);

  // ---- scope totals + insight (papers only — "Subject Test" PYQ attempts don't count as a full paper) ----
  let scopeTotal = 0, scopeCompleted = 0;
  const rows = []; // {label, completed, total, examKey, year}
  if (f.exam && f.year) {
    const bankYear = TEST_BANK[f.exam].years[f.year];
    scopeTotal = bankYear.count;
    scopeCompleted = pyqTestsInScope(f.exam, f.year, true).length;
  } else if (f.exam) {
    Object.keys(TEST_BANK[f.exam].years).forEach(y => {
      const total = TEST_BANK[f.exam].years[y].count;
      const completed = pyqTestsInScope(f.exam, y, true).length;
      scopeTotal += total; scopeCompleted += completed;
      rows.push({ label: y, completed, total, examKey: f.exam, year: y });
    });
    rows.sort((a, b) => b.year - a.year);
  } else {
    exams.forEach(e => {
      let total = 0, completed = 0;
      Object.keys(TEST_BANK[e].years).forEach(y => {
        total += TEST_BANK[e].years[y].count;
        completed += pyqTestsInScope(e, y, true).length;
      });
      scopeTotal += total; scopeCompleted += completed;
      rows.push({ label: e, completed, total, examKey: e, year: null });
    });
    rows.sort((a, b) => (a.total ? a.completed / a.total : 0) - (b.total ? b.completed / b.total : 0));
  }

  // ---- insight box: recommendation + pace ----
  let recommendation = "";
  const remainingCombos = [];
  exams.forEach(e => {
    Object.keys(TEST_BANK[e].years).forEach(y => {
      if (f.year && (e !== f.exam || y !== f.year)) return;
      if (f.exam && e !== f.exam) return;
      const total = TEST_BANK[e].years[y].count;
      const completed = pyqTestsInScope(e, y, true).length;
      if (completed < total) remainingCombos.push({ exam: e, year: y, remaining: total - completed });
    });
  });
  remainingCombos.sort((a, b) => b.year - a.year || b.remaining - a.remaining);
  if (remainingCombos.length) {
    const r = remainingCombos[0];
    recommendation = `Try <b>${esc(r.exam)} ${r.year}</b> next &mdash; ${r.remaining} paper${r.remaining > 1 ? "s" : ""} left.`;
  } else if (scopeTotal > 0) {
    recommendation = `All papers in this view are done. Great work!`;
  }

  const recentCutoff = new Date(); recentCutoff.setDate(recentCutoff.getDate() - 14);
  const recentPyqCount = db.tests.filter(t => t.isPyq && t.pyqMode !== "subject" && new Date(t.date) >= recentCutoff).length;
  const ratePerWeek = recentPyqCount / 2;
  let paceMsg = "";
  const remainingInScope = scopeTotal - scopeCompleted;
  if (ratePerWeek > 0 && remainingInScope > 0) {
    const weeks = Math.ceil(remainingInScope / ratePerWeek);
    paceMsg = `At your recent pace (~${ratePerWeek.toFixed(1)}/week), you'd clear the remaining ${remainingInScope} in about ${weeks} week${weeks > 1 ? "s" : ""}.`;
  }

  const insight = el(`<div class="insightbox"></div>`);
  insight.innerHTML = [recommendation, paceMsg].filter(Boolean).join("<br>") || "Start logging PYQ tests to see insights here.";
  host.appendChild(insight);

  // ---- overall scope progress bar ----
  const card = el(`<div class="card"></div>`);
  card.appendChild(progressBarRow(f.exam && f.year ? `${f.exam} — ${f.year}` : f.exam || "All Selected Exams", scopeCompleted, scopeTotal, "full papers"));
  host.appendChild(card);

  // ---- breakdown ----
  if (f.exam && f.year) {
    const attempts = pyqTestsInScope(f.exam, f.year, false).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (attempts.length) {
      const listCard = el(`<div class="card"><h2>Attempts logged</h2></div>`);
      const table = el(`<table><thead><tr><th>Date</th><th>Shift</th><th>Coverage</th><th>Score</th></tr></thead><tbody></tbody></table>`);
      attempts.forEach(t => {
        const c = t.questions.filter(q => q.correctWrong === "Correct").length;
        const w = t.questions.filter(q => q.correctWrong === "Wrong").length;
        const score = +(c * (+t.marksCorrect) - w * (+t.marksNegative)).toFixed(2);
        const coverage = t.pyqMode === "subject" ? esc(t.pyqSubject) + " only" : "Full test";
        table.querySelector("tbody").appendChild(el(`<tr><td>${t.date}</td><td>${esc(t.pyqShift)}</td><td>${coverage}</td><td>${score}</td></tr>`));
      });
      listCard.appendChild(table);
      host.appendChild(listCard);
    }
  } else if (rows.length) {
    const card2 = el(`<div class="card"></div>`);
    rows.forEach(r => card2.appendChild(progressBarRow(r.label, r.completed, r.total)));
    host.appendChild(card2);
  }
}

/* ---- Track by Subject (new) ---- */
function bankSubjectTotals(examsInScope, year) {
  const totals = [0, 0, 0, 0];
  examsInScope.forEach(e => {
    const years = year ? [year] : Object.keys(TEST_BANK[e].years);
    years.forEach(y => {
      const by = TEST_BANK[e].years[y];
      if (!by) return;
      by.subjects.forEach((c, i) => { totals[i] += c * by.count; });
    });
  });
  return totals;
}

function completedSubjectTotals(examsInScope, year) {
  const totals = [0, 0, 0, 0];
  db.tests.forEach(t => {
    if (!t.isPyq || !examsInScope.includes(t.pyqExamCategory)) return;
    if (year && String(t.pyqYear) !== String(year)) return;
    t.questions.forEach(q => {
      const idx = SUBJECTS.indexOf(q.subject);
      if (idx >= 0) totals[idx]++;
    });
  });
  return totals;
}

function renderTrackBySubject(wrap) {
  // ---- static, unfiltered totals across the whole bank ----
  const allExams = Object.keys(TEST_BANK);
  const grandTotals = bankSubjectTotals(allExams, null);
  const staticCard = el(`<div class="card"><label>Total PYQ Questions in the Bank (all exams, all years)</label></div>`);
  const staticGrid = el(`<div class="grid3" style="margin-top:8px;"></div>`);
  SUBJECTS.forEach((s, i) => {
    staticGrid.appendChild(el(`<div class="statcard"><div class="n">${grandTotals[i]}</div><div class="l">${esc(s)}</div></div>`));
  });
  staticCard.appendChild(staticGrid);
  wrap.appendChild(staticCard);

  // ---- filters ----
  const standards = [...new Set(Object.values(TEST_BANK).map(e => e.standard))];
  const filterCard = el(`<div class="card"></div>`);
  const g3a = el(`<div class="grid3"></div>`);
  g3a.appendChild(el(`<div class="field"><label>Standard</label><select id="sf_standard"><option value="">All</option>${standards.map(s => `<option value="${esc(s)}" ${s === bankSubjectFilters.standard ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  g3a.appendChild(el(`<div class="field"><label>Exam</label><select id="sf_exam"><option value="">All Exams</option></select></div>`));
  g3a.appendChild(el(`<div class="field"><label>Year</label><select id="sf_year"><option value="">All Years</option></select></div>`));
  filterCard.appendChild(g3a);
  filterCard.appendChild(el(`<div class="field"><label>Subject</label><select id="sf_subject"><option value="">All Subjects</option>${SUBJECTS.map(s => `<option value="${esc(s)}" ${s === bankSubjectFilters.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`));
  wrap.appendChild(filterCard);

  const resultsHost = el(`<div></div>`);
  wrap.appendChild(resultsHost);

  const standardSel = filterCard.querySelector("#sf_standard");
  const examSel = filterCard.querySelector("#sf_exam");
  const yearSel = filterCard.querySelector("#sf_year");
  const subjectSel = filterCard.querySelector("#sf_subject");

  function examsInScope() {
    return Object.keys(TEST_BANK).filter(e => !standardSel.value || TEST_BANK[e].standard === standardSel.value);
  }
  function fillExamOptions() {
    const exams = examsInScope();
    examSel.innerHTML = `<option value="">All Exams</option>` + exams.map(e => `<option value="${esc(e)}" ${e === bankSubjectFilters.exam ? "selected" : ""}>${esc(e)}</option>`).join("");
    if (!exams.includes(bankSubjectFilters.exam)) bankSubjectFilters.exam = "";
    fillYearOptions();
  }
  function fillYearOptions() {
    const exam = examSel.value;
    const years = exam && TEST_BANK[exam] ? Object.keys(TEST_BANK[exam].years).sort((a, b) => b - a) : [];
    yearSel.innerHTML = `<option value="">All Years</option>` + years.map(y => `<option ${y === bankSubjectFilters.year ? "selected" : ""}>${y}</option>`).join("");
    yearSel.disabled = !exam;
  }
  fillExamOptions();

  function apply() {
    bankSubjectFilters.standard = standardSel.value;
    bankSubjectFilters.exam = examSel.value;
    bankSubjectFilters.year = yearSel.value;
    bankSubjectFilters.subject = subjectSel.value;
    renderSubjectScopeResults(resultsHost);
  }
  standardSel.addEventListener("change", () => { bankSubjectFilters.exam = ""; bankSubjectFilters.year = ""; fillExamOptions(); apply(); });
  examSel.addEventListener("change", () => { bankSubjectFilters.year = ""; fillYearOptions(); apply(); });
  yearSel.addEventListener("change", apply);
  subjectSel.addEventListener("change", apply);

  renderSubjectScopeResults(resultsHost);
  return wrap;
}

function renderSubjectScopeResults(host) {
  host.innerHTML = "";
  const f = bankSubjectFilters;
  const examsInScope = Object.keys(TEST_BANK).filter(e =>
    (!f.standard || TEST_BANK[e].standard === f.standard) && (!f.exam || e === f.exam));

  if (!examsInScope.length) { host.appendChild(el(`<div class="empty">No exams match this filter.</div>`)); return; }

  const totals = bankSubjectTotals(examsInScope, f.year || null);
  const completed = completedSubjectTotals(examsInScope, f.year || null);

  const card = el(`<div class="card"></div>`);
  const subjectsToShow = f.subject ? [f.subject] : SUBJECTS;
  subjectsToShow.forEach(s => {
    const i = SUBJECTS.indexOf(s);
    card.appendChild(progressBarRow(s, completed[i], totals[i]));
  });
  host.appendChild(card);

  const grandTotal = totals.reduce((a, b) => a + b, 0);
  const grandCompleted = completed.reduce((a, b) => a + b, 0);
  if (!f.subject && grandTotal > 0) {
    const summary = el(`<div class="insightbox"></div>`);
    const weakestIdx = SUBJECTS.map((s, i) => ({ s, i, total: totals[i], pct: totals[i] ? completed[i] / totals[i] : 1 }))
      .filter(x => x.total > 0).sort((a, b) => a.pct - b.pct)[0];
    let msg = `Overall: <b>${grandCompleted} / ${grandTotal}</b> questions practiced in this scope.`;
    if (weakestIdx && weakestIdx.pct < 1) {
      msg += `<br>Least practiced subject here: <b>${esc(weakestIdx.s)}</b> (${Math.round(weakestIdx.pct * 100)}% covered).`;
    }
    summary.innerHTML = msg;
    host.insertBefore(summary, host.firstChild);
  }
}


/* ============================== WEIGHTAGE BY PYQ ============================== */
const WEIGHT_KEYS = ["exam", "year", "subject", "topic", "chapter", "date", "shift"];
const WEIGHT_LABELS = { exam: "Exam", year: "Year", subject: "Subject", topic: "Topic", chapter: "Chapter", date: "Date", shift: "Shift" };

function flatPyqQuestions() {
  const out = [];
  db.tests.forEach(t => {
    if (!t.isPyq) return;
    t.questions.forEach(q => {
      if (!q.correctWrong) return;
      out.push({
        exam: t.pyqExamCategory || "", year: t.pyqYear != null ? String(t.pyqYear) : "", shift: t.pyqShift || "",
        date: t.date, subject: q.subject || "", topic: q.topic || "", chapter: q.chapter || "",
        correctWrong: q.correctWrong
      });
    });
  });
  return out;
}

function emptyWeightageFilters() {
  const f = {};
  WEIGHT_KEYS.forEach(k => { f[k] = new Set(); });
  return f;
}
function cloneWeightageFilters(f) {
  const c = {};
  WEIGHT_KEYS.forEach(k => { c[k] = new Set(f[k]); });
  return c;
}
function matchesWeightageFilters(record, filters, excludeKey) {
  for (const key of WEIGHT_KEYS) {
    if (key === excludeKey) continue;
    const set = filters[key];
    if (!set || set.size === 0) continue;
    if (!set.has(String(record[key]))) return false;
  }
  return true;
}
function weightageOptionsFor(allRecords, filters, key) {
  const pool = allRecords.filter(r => matchesWeightageFilters(r, filters, key) && r[key]);
  const vals = [...new Set(pool.map(r => String(r[key])))];
  if (key === "year") vals.sort((a, b) => b - a);
  else vals.sort();
  return vals;
}
function weightageFilteredRecords(allRecords, filters) {
  return allRecords.filter(r => matchesWeightageFilters(r, filters, null));
}

function computeWeightageRows(records) {
  const groups = {};
  records.forEach(r => {
    if (!r.chapter) return;
    const key = r.subject + "|||" + r.topic + "|||" + r.chapter;
    if (!groups[key]) groups[key] = { subject: r.subject, topic: r.topic, chapter: r.chapter, count: 0, correct: 0, wrong: 0 };
    const g = groups[key];
    g.count++;
    if (r.correctWrong === "Correct") g.correct++;
    if (r.correctWrong === "Wrong") g.wrong++;
  });
  const totalCount = records.length || 1;
  return Object.values(groups).map(g => ({
    ...g, weightagePct: (g.count / totalCount) * 100,
    acc: (g.correct + g.wrong) ? g.correct / (g.correct + g.wrong) : 0,
    cls: classify((g.correct + g.wrong) ? g.correct / (g.correct + g.wrong) : 0, g.correct + g.wrong)
  }));
}

let weightagePanels = [{ filters: emptyWeightageFilters(), evaluateOn: false, sortMode: "weightage" }];
let weightageCompareMode = false;

function pageWeightage() {
  const wrap = el(`<div></div>`);
  const back = el(`<button class="backlink">&larr; Back to dashboard</button>`);
  back.onclick = () => go("dashboard");
  wrap.appendChild(back);
  wrap.appendChild(el(`<h1>Weightage by PYQ</h1><p class="lead">Built entirely from the Topic/Chapter/Right-Wrong you logged on PYQ entries.</p>`));

  const allRecords = flatPyqQuestions();
  if (!allRecords.length) {
    wrap.appendChild(el(`<div class="empty">No PYQ tests logged yet. Log a PYQ test on the Entry page (Topic + Chapter filled in) to see weightage here.</div>`));
    return wrap;
  }

  const topBtnRow = el(`<div class="btnrow" style="margin-bottom:6px;"></div>`);
  const compareBtn = el(`<button class="${weightageCompareMode ? "" : "secondary"}">${weightageCompareMode ? "Exit Compare" : "COMPARE"}</button>`);
  compareBtn.onclick = () => {
    if (weightageCompareMode) {
      weightageCompareMode = false;
      weightagePanels = [weightagePanels[0]];
    } else {
      weightageCompareMode = true;
      if (weightagePanels.length < 2) weightagePanels.push({ filters: emptyWeightageFilters(), evaluateOn: false, sortMode: "weightage" });
    }
    go("weightage");
  };
  topBtnRow.appendChild(compareBtn);
  if (weightageCompareMode && weightagePanels.length < 4) {
    const addBtn = el(`<button class="secondary">+ Add panel</button>`);
    addBtn.onclick = () => { weightagePanels.push({ filters: emptyWeightageFilters(), evaluateOn: false, sortMode: "weightage" }); go("weightage"); };
    topBtnRow.appendChild(addBtn);
  }
  wrap.appendChild(topBtnRow);

  if (!weightageCompareMode) {
    const host = el(`<div></div>`);
    wrap.appendChild(host);
    renderWeightagePanel(host, weightagePanels[0], allRecords, false, null);
  } else {
    const cols = weightagePanels.length;
    const grid = el(`<div class="comparegrid cols-${cols}"></div>`);
    weightagePanels.forEach((panel, idx) => {
      const panelEl = el(`<div class="comparepanel"></div>`);
      const head = el(`<div class="panelhead"><h3>Panel ${idx + 1}</h3></div>`);
      if (weightagePanels.length > 2) {
        const rmBtn = el(`<button class="iconbtn danger" style="padding:3px 8px;">Remove</button>`);
        rmBtn.onclick = () => { weightagePanels.splice(idx, 1); go("weightage"); };
        head.appendChild(rmBtn);
      }
      panelEl.appendChild(head);
      renderWeightagePanel(panelEl, panel, allRecords, true, idx);
      grid.appendChild(panelEl);
    });
    wrap.appendChild(grid);
  }

  return wrap;
}

function renderWeightagePanel(host, panelState, allRecords, compact, panelIdx) {
  const filterWrap = el(`<div class="${compact ? "" : "card"}"></div>`);
  WEIGHT_KEYS.forEach(key => {
    const options = weightageOptionsFor(allRecords, panelState.filters, key);
    const group = el(`<div class="filtergroup">
      <div class="fg-label"><label>${WEIGHT_LABELS[key]}</label>${panelState.filters[key].size ? `<button class="clearlink">Clear</button>` : ""}</div>
      <div class="chip-toggle" id="wf_${key}"></div>
    </div>`);
    const chipRow = group.querySelector(`#wf_${key}`);
    if (!options.length) {
      chipRow.appendChild(el(`<span style="color:var(--muted);font-size:.8rem;">No data</span>`));
    }
    options.forEach(opt => {
      const active = panelState.filters[key].has(opt);
      const chip = el(`<div class="chip ${compact ? "small" : ""} ${active ? "active" : ""}">${esc(opt)}</div>`);
      chip.onclick = () => {
        if (panelState.filters[key].has(opt)) panelState.filters[key].delete(opt);
        else panelState.filters[key].add(opt);
        go(weightageCompareMode ? "weightage" : "weightage");
      };
      chipRow.appendChild(chip);
    });
    const clearBtn = group.querySelector(".clearlink");
    if (clearBtn) clearBtn.onclick = () => { panelState.filters[key].clear(); go("weightage"); };
    filterWrap.appendChild(group);
  });
  host.appendChild(filterWrap);

  const records = weightageFilteredRecords(allRecords, panelState.filters);
  const actionRow = el(`<div class="btnrow" style="margin:10px 0;"></div>`);
  const evalBtn = el(`<button class="${panelState.evaluateOn ? "" : "secondary"}">${panelState.evaluateOn ? "Evaluating: ON" : "Evaluate"}</button>`);
  evalBtn.onclick = () => { panelState.evaluateOn = !panelState.evaluateOn; go("weightage"); };
  actionRow.appendChild(evalBtn);
  if (panelState.evaluateOn) {
    const sortSel = el(`<select style="max-width:220px;">
      <option value="weightage" ${panelState.sortMode === "weightage" ? "selected" : ""}>Sort: Most Asked First</option>
      <option value="weak" ${panelState.sortMode === "weak" ? "selected" : ""}>Sort: Weak to Strong</option>
      <option value="strong" ${panelState.sortMode === "strong" ? "selected" : ""}>Sort: Strong to Weak</option>
    </select>`);
    sortSel.addEventListener("change", () => { panelState.sortMode = sortSel.value; go("weightage"); });
    actionRow.appendChild(sortSel);
  }
  host.appendChild(actionRow);

  let rows = computeWeightageRows(records);
  if (panelState.evaluateOn) {
    if (panelState.sortMode === "weak") rows.sort((a, b) => a.acc - b.acc);
    else if (panelState.sortMode === "strong") rows.sort((a, b) => b.acc - a.acc);
    else rows.sort((a, b) => b.count - a.count);
  } else {
    rows.sort((a, b) => b.count - a.count);
  }

  if (!rows.length) {
    host.appendChild(el(`<div class="empty">No chapters match this filter.</div>`));
    return;
  }

  const resultsCard = el(`<div class="${compact ? "" : "card"}"></div>`);
  rows.forEach(r => {
    const row = el(`<div class="weightrow"></div>`);
    const top = el(`<div class="wtop"><span class="name">${esc(r.chapter)}</span><span class="sub">${esc(r.subject)} &middot; ${esc(r.topic)}</span></div>`);
    row.appendChild(top);
    const bar = el(`<div class="progressbar-outer"><div class="progressbar-inner" style="width:${Math.max(2, r.weightagePct)}%;background:var(--accent);"></div></div>`);
    row.appendChild(bar);
    const meta = el(`<div class="wmeta"><span>${r.count} question${r.count > 1 ? "s" : ""} &middot; ${r.weightagePct.toFixed(1)}% weightage</span></div>`);
    if (panelState.evaluateOn) {
      meta.appendChild(el(`<span class="pill-badge ${r.cls}">${badgeLabel(r.cls)} &middot; ${pct(r.acc)}</span>`));
    }
    row.appendChild(meta);
    resultsCard.appendChild(row);
  });
  host.appendChild(resultsCard);
}


/* ============================== BOOT ============================== */
if (getPasscode()) {
  route = { page: "dashboard" };
  render();
  loadData().then(render).catch(e => { loadError = e.message; render(); });
} else {
  render();
}
