// The syllabus stays static; all student-owned progress is synchronized per account.
const CHAPTERS = {
  Physics: [
    "Physical World & Measurement", "Units and Measurements", "Motion in a Straight Line",
    "Motion in a Plane", "Laws of Motion", "Work, Energy and Power",
    "System of Particles and Rotational Motion", "Gravitation", "Mechanical Properties of Solids",
    "Mechanical Properties of Fluids", "Thermal Properties of Matter", "Thermodynamics",
    "Kinetic Theory", "Oscillations and Waves"
  ],
  Chemistry: [
    "Some Basic Concepts of Chemistry", "Structure of Atom", "Classification of Elements",
    "Chemical Bonding and Molecular Structure", "Chemical Thermodynamics", "Equilibrium",
    "Redox Reactions", "Organic Chemistry: Basic Principles", "Hydrocarbons",
    "States of Matter", "Hydrogen", "The s-Block Elements", "The p-Block Elements",
    "Environmental Chemistry"
  ],
  Mathematics: [
    "Sets", "Relations and Functions", "Trigonometric Functions", "Complex Numbers",
    "Linear Inequalities", "Permutations and Combinations", "Binomial Theorem",
    "Sequences and Series", "Straight Lines", "Conic Sections", "Introduction to 3D Geometry",
    "Limits and Derivatives", "Statistics", "Probability"
  ]
};

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
const SUBJECT_META = {
  Physics: { color: "#8db9ff", initial: "P" },
  Chemistry: { color: "#bf9bff", initial: "C" },
  Mathematics: { color: "#ffb26f", initial: "M" }
};
const STORAGE_KEY = "focus-jee-tracker-v1";
const TODAY = dateKey(new Date());
const JEE_DATE = new Date(2028, 3, 1);
let toastTimer;
let editingSessionId = null;
let editingTestId = null;
let editingTaskId = null;
let activeSubjectFilter = "All";
let activeTaskFilter = "today";
let state = createDefaultState();

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultState() {
  const chapters = {};
  for (const subject of SUBJECTS) {
    chapters[subject] = CHAPTERS[subject].map((name, index) => ({
      id: `${subject}-${index}`,
      name,
      status: "Not Started",
      progress: 0,
      lecture: false,
      notes: false,
      questions: 0,
      pyqs: false
    }));
  }
  return { dailyTarget: 8, weeklyTarget: 56, chapters, sessions: [], tests: [], tasks: [] };
}

function loadState(serialized) {
  const defaults = createDefaultState();
  try {
    const saved = serialized === undefined ? localStorage.getItem(STORAGE_KEY) : serialized;
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") throw new Error("Saved tracker data is not valid.");
    defaults.dailyTarget = validNumber(parsed.dailyTarget, 8, 0.5, 24);
    defaults.weeklyTarget = validNumber(parsed.weeklyTarget, defaults.dailyTarget * 7, 1, 168);
    for (const subject of SUBJECTS) {
      const savedChapters = Array.isArray(parsed.chapters?.[subject]) ? parsed.chapters[subject] : [];
      defaults.chapters[subject] = defaults.chapters[subject].map((chapter, index) => {
        const savedChapter = savedChapters.find(item => item && item.id === chapter.id) || savedChapters[index];
        if (!savedChapter || typeof savedChapter !== "object") return chapter;
        const progress = Math.round(validNumber(savedChapter.progress, 0, 0, 100));
        const status = ["Not Started", "In Progress", "Completed"].includes(savedChapter.status)
          ? savedChapter.status
          : progress === 100 ? "Completed" : progress > 0 ? "In Progress" : "Not Started";
        return {
          ...chapter,
          status,
          progress,
          lecture: savedChapter.lecture === true,
          notes: savedChapter.notes === true,
          questions: Math.floor(validNumber(savedChapter.questions, 0, 0, 1000000)),
          pyqs: savedChapter.pyqs === true
        };
      });
    }
    defaults.sessions = Array.isArray(parsed.sessions) ? parsed.sessions.filter(isValidSession) : [];
    defaults.tests = Array.isArray(parsed.tests) ? parsed.tests.filter(isValidTest) : [];
    defaults.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(isValidTask) : [];
    return defaults;
  } catch (error) {
    showToast(`Could not load saved data: ${error.message}`, true);
    return defaults;
  }
}

function validNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function isValidSession(session) {
  return session && typeof session.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(session.date)
    && SUBJECTS.includes(session.subject)
    && CHAPTERS[session.subject].includes(session.chapter)
    && Number.isFinite(session.duration) && session.duration > 0 && session.duration <= 24;
}

function isValidTest(test) {
  return test && typeof test.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(test.date)
    && [test.physics, test.chemistry, test.maths].every(score => Number.isInteger(score) && score >= 0 && score <= 100);
}

function isValidTask(task) {
  return task && typeof task.id === "string" && typeof task.title === "string"
    && task.title.trim().length > 0 && task.title.length <= 140
    && (!task.deadline || /^\d{4}-\d{2}-\d{2}$/.test(task.deadline))
    && ["General", ...SUBJECTS].includes(task.subject)
    && ["High", "Medium", "Low"].includes(task.priority)
    && typeof task.completed === "boolean"
    && typeof task.createdAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.createdAt);
}

function saveState() {
  return window.jeeAuth?.saveState(state) || false;
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function allChapters() {
  return SUBJECTS.flatMap(subject => state.chapters[subject].map(chapter => ({ ...chapter, subject })));
}

function hoursByDate() {
  return state.sessions.reduce((totals, session) => {
    totals[session.date] = (totals[session.date] || 0) + session.duration;
    return totals;
  }, {});
}

function formatHours(hours) {
  return Number(hours.toFixed(1)).toString();
}

function prettyDate(dateString, options = { month: "short", day: "numeric", year: "numeric" }) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderAll() {
  renderHeader();
  renderDashboard();
  renderSubjects();
  renderSessionFormOptions();
  renderSessions();
  renderWeeklyAnalysis();
  renderTests();
  renderTasks();
  renderResources();
  renderProfile();
}

function renderHeader() {
  document.getElementById("header-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric"
  });
  const days = Math.max(0, Math.ceil((JEE_DATE.getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000));
  document.getElementById("countdown-days").textContent = days.toLocaleString();
  document.getElementById("daily-target").value = formatHours(state.dailyTarget);
  document.getElementById("weekly-target-input").value = formatHours(state.weeklyTarget);
}

function renderDashboard() {
  const totals = hoursByDate();
  const todayHours = totals[TODAY] || 0;
  const totalHours = state.sessions.reduce((sum, session) => sum + session.duration, 0);
  const chapters = allChapters();
  const completed = chapters.filter(chapter => chapter.status === "Completed").length;
  const preparation = chapters.length ? Math.round(chapters.reduce((sum, chapter) => sum + chapter.progress, 0) / chapters.length) : 0;
  const productivity = Math.min(100, Math.round(todayHours / state.dailyTarget * 100));

  document.getElementById("today-hours").textContent = formatHours(todayHours);
  document.getElementById("today-minutes").textContent = todayHours > 0
    ? `${Math.floor(todayHours * 60)} min studied today`
    : "No study time logged yet";
  document.getElementById("total-hours").textContent = formatHours(totalHours);
  document.getElementById("prep-progress").textContent = preparation;
  document.getElementById("chapters-summary").textContent = `${completed} of ${chapters.length} chapters complete`;
  document.getElementById("today-progress-bar").style.width = `${productivity}%`;
  const user = window.jeeAuth?.user;
  document.getElementById("sidebar-user-name").textContent = user?.profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Student";
  document.getElementById("sidebar-user-email").textContent = user?.email || "Self-study · JEE 2028";
  const initial = (user?.profileName || user?.user_metadata?.full_name || user?.email || "S").trim().charAt(0).toUpperCase();
  document.getElementById("sidebar-avatar").textContent = initial;
  document.getElementById("profile-avatar").textContent = initial;
  document.getElementById("prep-progress-bar").style.width = `${preparation}%`;
  document.getElementById("productivity").textContent = `${productivity}%`;
  document.getElementById("goal-studied").textContent = formatHours(todayHours);
  document.getElementById("goal-target").textContent = formatHours(state.dailyTarget);
  document.getElementById("goal-ring").style.background = `conic-gradient(var(--accent) ${productivity}%, #272c34 ${productivity}%)`;
  document.getElementById("goal-message").textContent = productivity >= 100 ? "Daily target complete!" : todayHours > 0 ? "Nice work. Keep going!" : "Ready when you are";
  document.getElementById("goal-detail").textContent = productivity >= 100
    ? "You showed up for yourself today."
    : `${formatHours(Math.max(0, state.dailyTarget - todayHours))} hours left to reach your goal.`;
  document.getElementById("target-indicator").textContent = productivity >= 100
    ? "Daily study target completed — nicely done!"
    : `${formatHours(Math.max(0, state.dailyTarget - todayHours))} more hours to complete today's target`;
  renderStreak(totals);
  renderQuickSubjects();
}

function renderStreak(totals) {
  const studyDays = new Set(Object.keys(totals).filter(day => totals[day] > 0));
  const sortedDays = Array.from(studyDays).sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of sortedDays) {
    const date = new Date(`${day}T00:00:00`);
    const consecutive = previous && date.getTime() - previous.getTime() === 86400000;
    run = consecutive ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const todayDate = new Date(`${TODAY}T00:00:00`);
  const anchor = studyDays.has(TODAY) ? todayDate : new Date(todayDate.getTime() - 86400000);
  let current = 0;
  for (let cursor = anchor; studyDays.has(dateKey(cursor)); cursor = new Date(cursor.getTime() - 86400000)) current += 1;
  document.getElementById("current-streak").textContent = current;
  document.getElementById("longest-streak").textContent = longest;

  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
  document.getElementById("streak-week").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dateKey(date);
    const dayName = date.toLocaleDateString(undefined, { weekday: "narrow" });
    const classes = ["streak-day", studyDays.has(key) ? "studied" : "", key === TODAY ? "today" : ""].filter(Boolean).join(" ");
    const symbol = studyDays.has(key) ? "✓" : date.getDate();
    return `<div class="${classes}" title="${escapeHTML(prettyDate(key))}"><span>${symbol}</span>${dayName}</div>`;
  }).join("");
}

function renderQuickSubjects() {
  document.getElementById("quick-subjects").innerHTML = SUBJECTS.map(subject => {
    const chapters = state.chapters[subject];
    const progress = chapters.length ? Math.round(chapters.reduce((sum, chapter) => sum + chapter.progress, 0) / chapters.length) : 0;
    const complete = chapters.filter(chapter => chapter.status === "Completed").length;
    const className = subject.toLowerCase();
    return `<div class="quick-subject" style="--subject-color:${SUBJECT_META[subject].color}">
      <div class="quick-subject-top"><span class="subject-dot ${className}"></span><strong>${subject}</strong><small>${complete}/${chapters.length} done</small></div>
      <div class="mini-progress"><span style="width:${progress}%"></span></div>
    </div>`;
  }).join("");
}

function renderSubjects() {
  const subjects = activeSubjectFilter === "All" ? SUBJECTS : [activeSubjectFilter];
  document.getElementById("subject-groups").innerHTML = subjects.map(subject => {
    const chapters = state.chapters[subject];
    const completed = chapters.filter(chapter => chapter.status === "Completed").length;
    const subjectClass = subject.toLowerCase();
    const cards = chapters.map(chapter => `
      <article class="chapter-card" data-chapter-id="${escapeHTML(chapter.id)}">
        <div class="chapter-main">
          <div class="chapter-name"><strong>${escapeHTML(chapter.name)}</strong><small>${escapeHTML(subject)}</small></div>
          <select class="chapter-status" data-field="status" aria-label="${escapeHTML(chapter.name)} status">
            ${["Not Started", "In Progress", "Completed"].map(status => `<option${chapter.status === status ? " selected" : ""}>${status}</option>`).join("")}
          </select>
          <div class="progress-control"><input type="range" min="0" max="100" step="5" value="${chapter.progress}" data-field="progress" aria-label="${escapeHTML(chapter.name)} progress"><output>${chapter.progress}%</output></div>
          <div class="chapter-checks">
            <label class="check-label"><input type="checkbox" data-field="lecture"${chapter.lecture ? " checked" : ""}> Lecture</label>
            <label class="check-label"><input type="checkbox" data-field="notes"${chapter.notes ? " checked" : ""}> Notes</label>
            <label class="check-label"><input type="checkbox" data-field="pyqs"${chapter.pyqs ? " checked" : ""}> PYQs</label>
            <label class="questions-control">Questions <input type="number" min="0" max="1000000" value="${chapter.questions}" data-field="questions" aria-label="${escapeHTML(chapter.name)} questions practiced"></label>
          </div>
        </div>
      </article>`).join("");
    return `<div class="subject-group"><h3 class="subject-group-heading"><span class="subject-dot ${subjectClass}"></span>${subject}<small>${completed} of ${chapters.length} complete</small></h3><div class="chapter-list">${cards}</div></div>`;
  }).join("");
}

function chapterForCard(card) {
  const id = card.dataset.chapterId;
  for (const subject of SUBJECTS) {
    const chapter = state.chapters[subject].find(item => item.id === id);
    if (chapter) return chapter;
  }
  return null;
}

function renderSessionFormOptions() {
  const subjectSelect = document.getElementById("session-subject");
  const currentSubject = subjectSelect.value || SUBJECTS[0];
  subjectSelect.innerHTML = SUBJECTS.map(subject => `<option value="${subject}">${subject}</option>`).join("");
  subjectSelect.value = currentSubject;
  renderChapterOptions();
}

function renderChapterOptions(selectedChapter = "") {
  const subject = document.getElementById("session-subject").value;
  const chapterSelect = document.getElementById("session-chapter");
  chapterSelect.innerHTML = state.chapters[subject].map(chapter => `<option value="${escapeHTML(chapter.name)}">${escapeHTML(chapter.name)}</option>`).join("");
  if (state.chapters[subject].some(chapter => chapter.name === selectedChapter)) chapterSelect.value = selectedChapter;
}

function renderSessions() {
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  document.getElementById("history-count").textContent = `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;
  if (!sessions.length) {
    document.getElementById("session-list").innerHTML = '<div class="no-data">Your study history will show up here.</div>';
    return;
  }
  const days = new Map();
  for (const session of sessions) {
    if (!days.has(session.date)) days.set(session.date, []);
    days.get(session.date).push(session);
  }
  document.getElementById("session-list").innerHTML = Array.from(days, ([date, daySessions]) => {
    const dailyTotal = daySessions.reduce((sum, session) => sum + session.duration, 0);
    const label = date === TODAY ? "Today" : date === dateKey(new Date(Date.now() - 86400000)) ? "Yesterday" : prettyDate(date, { weekday: "short", month: "short", day: "numeric" });
    const rows = daySessions.map(session => {
      const meta = SUBJECT_META[session.subject];
      return `<div class="session-row">
        <span class="session-subject-mark ${session.subject.toLowerCase()}">${meta.initial}</span>
        <span class="session-info"><strong>${escapeHTML(session.chapter)}</strong><small>${escapeHTML(session.subject)} · ${prettyDate(session.date, { month: "short", day: "numeric" })}</small></span>
        <span class="session-duration">${formatHours(session.duration)} h</span>
        <span class="row-actions"><button class="icon-button" data-session-action="edit" data-id="${escapeHTML(session.id)}" aria-label="Edit session" title="Edit">✎</button><button class="icon-button delete" data-session-action="delete" data-id="${escapeHTML(session.id)}" aria-label="Delete session" title="Delete">×</button></span>
      </div>`;
    }).join("");
    return `<div class="session-day-heading"><span>${label}</span><span>${formatHours(dailyTotal)} h</span></div>${rows}`;
  }).join("");
}

function weekDates() {
  const today = new Date(`${TODAY}T00:00:00`);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dateKey(date);
  });
}

function renderWeeklyAnalysis() {
  const dates = weekDates();
  const totals = hoursByDate();
  const dailyValues = dates.map(date => date <= TODAY ? totals[date] || 0 : null);
  const actual = dailyValues.reduce((sum, hours) => sum + (hours || 0), 0);
  const studiedDays = dailyValues.filter(hours => hours !== null && hours > 0).length;
  const elapsedDays = dailyValues.filter(hours => hours !== null).length || 1;
  const targetPercent = Math.min(100, Math.round(actual / state.weeklyTarget * 100));
  const first = prettyDate(dates[0], { month: "short", day: "numeric" });
  const last = prettyDate(dates[6], { month: "short", day: "numeric" });
  document.getElementById("week-range").textContent = `${first} — ${last}`;
  document.getElementById("weekly-hours").textContent = formatHours(actual);
  document.getElementById("weekly-average").textContent = formatHours(actual / elapsedDays);
  document.getElementById("weekly-days").textContent = studiedDays;
  document.getElementById("weekly-target-label").textContent = `${formatHours(actual)} of ${formatHours(state.weeklyTarget)} target hours`;
  document.getElementById("weekly-progress-bar").style.width = `${targetPercent}%`;
  document.getElementById("weekly-actual").textContent = formatHours(actual);
  document.getElementById("weekly-target-badge").textContent = `${targetPercent}%`;
  document.getElementById("weekly-target-fill").style.width = `${targetPercent}%`;
  document.getElementById("weekly-footnote").textContent = targetPercent >= 100
    ? "Weekly target reached — excellent consistency."
    : `${formatHours(Math.max(0, state.weeklyTarget - actual))} hours left to reach this week's target.`;
  renderWeeklyChart(dates, dailyValues);
  renderSubjectTime();
}

function renderWeeklyChart(dates, values) {
  const productivity = values.map(hours => hours === null ? null : Math.min(100, Math.round(hours / state.dailyTarget * 100)));
  const width = 460;
  const height = 170;
  const left = 32;
  const top = 10;
  const chartHeight = 125;
  const chartWidth = width - left - 12;
  const slot = chartWidth / 7;
  const labels = dates.map(date => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }));
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily study target completion this week">`;
  for (let tick = 0; tick <= 4; tick++) {
    const y = top + chartHeight - (tick / 4) * chartHeight;
    const label = `${tick * 25}%`;
    svg += `<line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - 7}" y2="${y}"></line><text class="chart-small-label" x="${left - 7}" y="${y + 3}" text-anchor="end">${label}</text>`;
  }
  productivity.forEach((percent, index) => {
    const barWidth = Math.min(30, slot * .46);
    const x = left + slot * index + (slot - barWidth) / 2;
    const barHeight = percent === null ? 0 : Math.max(percent > 0 ? 3 : 0, percent / 100 * chartHeight);
    const y = top + chartHeight - barHeight;
    const classes = percent === null || percent === 0 ? "chart-bar-empty" : "chart-bar";
    const hours = values[index];
    svg += `<rect class="${classes}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"><title>${labels[index]}: ${percent === null ? "upcoming" : `${percent}% target complete · ${formatHours(hours)} hours`}</title></rect><text class="chart-label" x="${x + barWidth / 2}" y="${top + chartHeight + 20}" text-anchor="middle">${labels[index]}</text>`;
    if (percent !== null && percent > 0) svg += `<text class="chart-small-label" x="${x + barWidth / 2}" y="${Math.max(top + 8, y - 5)}" text-anchor="middle">${percent}%</text>`;
  });
  svg += "</svg>";
  document.getElementById("weekly-chart").innerHTML = svg;
}

function renderSubjectTime() {
  const totals = Object.fromEntries(SUBJECTS.map(subject => [subject, 0]));
  for (const session of state.sessions) {
    const date = session.date;
    if (weekDates()[0] <= date && date <= TODAY) totals[session.subject] += session.duration;
  }
  const max = Math.max(1, ...Object.values(totals));
  document.getElementById("subject-time-list").innerHTML = SUBJECTS.map(subject => {
    const color = SUBJECT_META[subject].color;
    return `<div class="subject-time-row" style="--subject-color:${color}">
      <div class="subject-time-top"><span class="subject-dot ${subject.toLowerCase()}"></span>${subject}<small>${formatHours(totals[subject])} hrs</small></div>
      <div class="mini-progress"><span style="width:${totals[subject] / max * 100}%"></span></div>
    </div>`;
  }).join("");
}

function scoreTotal(test) {
  return test.physics + test.chemistry + test.maths;
}

function renderTests() {
  const tests = [...state.tests].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  document.getElementById("test-count").textContent = `${tests.length} ${tests.length === 1 ? "test" : "tests"}`;
  document.getElementById("test-table-body").innerHTML = tests.length ? [...tests].reverse().map(test => `
    <tr>
      <td>${prettyDate(test.date, { month: "short", day: "numeric", year: "numeric" })}</td>
      <td>${test.physics}</td><td>${test.chemistry}</td><td>${test.maths}</td>
      <td class="total-score">${scoreTotal(test)} / 300</td>
      <td><span class="row-actions"><button class="icon-button" data-test-action="edit" data-id="${escapeHTML(test.id)}" aria-label="Edit mock test" title="Edit">✎</button><button class="icon-button delete" data-test-action="delete" data-id="${escapeHTML(test.id)}" aria-label="Delete mock test" title="Delete">×</button></span></td>
    </tr>`).join("") : '<tr><td colspan="6" class="no-data">Your test scores will appear here.</td></tr>';
  renderScoreChart(tests);
}

function isTaskForToday(task) {
  return task.deadline ? task.deadline === TODAY : task.createdAt === TODAY;
}

function renderTasks() {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const todayTasks = tasks.filter(isTaskForToday);
  const completedTasks = tasks.filter(task => task.completed);
  const todayCompleted = todayTasks.filter(task => task.completed).length;
  const completion = todayTasks.length ? Math.round(todayCompleted / todayTasks.length * 100) : 0;
  document.getElementById("task-completion").textContent = `${completion}%`;
  document.getElementById("task-progress-fill").style.width = `${completion}%`;
  document.getElementById("task-progress-caption").textContent = `${todayCompleted} of ${todayTasks.length} tasks completed today`;
  document.getElementById("today-task-count").textContent = todayTasks.length;
  document.getElementById("pending-task-count").textContent = tasks.filter(task => !task.completed).length;
  document.getElementById("completed-task-count").textContent = completedTasks.length;

  const filtered = tasks
    .filter(task => activeTaskFilter === "today" ? isTaskForToday(task)
      : activeTaskFilter === "pending" ? !task.completed : task.completed)
    .sort((a, b) => Number(a.completed) - Number(b.completed)
      || (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31")
      || a.title.localeCompare(b.title));
  const message = {
    today: "No tasks for today yet. Add one to get started.",
    pending: "You have no pending tasks. Enjoy the breathing room.",
    completed: "Completed tasks will show up here."
  }[activeTaskFilter];
  document.getElementById("task-list").innerHTML = filtered.length ? filtered.map(task => {
    const deadlineText = task.deadline ? prettyDate(task.deadline, { month: "short", day: "numeric" }) : "No deadline";
    const overdue = !task.completed && task.deadline && task.deadline < TODAY;
    return `<article class="task-item${task.completed ? " task-done" : ""}">
      <label class="task-toggle"><input type="checkbox" data-task-action="toggle" data-id="${escapeHTML(task.id)}"${task.completed ? " checked" : ""} aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}: ${escapeHTML(task.title)}"><span></span></label>
      <div class="task-content"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(task.subject)} · <span class="${overdue ? "task-overdue" : ""}">${overdue ? "Overdue · " : ""}${deadlineText}</span></span></div>
      <span class="priority-pill priority-${task.priority.toLowerCase()}">${escapeHTML(task.priority)}</span>
      <span class="row-actions"><button class="icon-button" data-task-action="edit" data-id="${escapeHTML(task.id)}" aria-label="Edit task">✎</button><button class="icon-button delete" data-task-action="delete" data-id="${escapeHTML(task.id)}" aria-label="Delete task">×</button></span>
    </article>`;
  }).join("") : `<div class="no-data">${message}</div>`;
}

function renderResources() {
  const resources = window.STUDY_RESOURCES;
  if (!Array.isArray(resources)) {
    document.getElementById("resource-grid").innerHTML = '<div class="no-data">Study resources could not be loaded. Refresh and try again.</div>';
    return;
  }
  document.getElementById("resource-grid").innerHTML = resources.map((resource, index) => `
    <article class="panel resource-card">
      <div class="resource-card-top"><span class="resource-number">${String(index + 1).padStart(2, "0")}</span><span class="resource-badge">${escapeHTML(resource.category)}</span></div>
      <p class="eyebrow">${escapeHTML(resource.subject)}</p>
      <h3>${escapeHTML(resource.title)}</h3>
      <p class="resource-chapter">${escapeHTML(resource.chapter)}</p>
      <p class="resource-description">${escapeHTML(resource.description)}</p>
      <a class="button button-resource" href="${escapeHTML(resource.url)}" target="_blank" rel="noopener noreferrer">Open free resource <span>↗</span></a>
    </article>`).join("");
}

function renderProfile() {
  const user = window.jeeAuth?.user;
  if (!user) return;
  document.getElementById("profile-name").value = user.profileName
    || user.user_metadata?.full_name || "";
  document.getElementById("profile-email").value = user.email || "";
}

function beginTaskEdit(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById("task-title").value = task.title;
  document.getElementById("task-deadline").value = task.deadline;
  document.getElementById("task-subject").value = task.subject;
  document.getElementById("task-priority").value = task.priority;
  document.getElementById("task-form-title").textContent = "Edit task";
  document.getElementById("task-submit").innerHTML = "Save changes <span>✓</span>";
  document.getElementById("task-cancel").classList.remove("hidden");
  document.getElementById("todo").scrollIntoView({ behavior: "smooth" });
}

function resetTaskForm() {
  editingTaskId = null;
  document.getElementById("task-form").reset();
  document.getElementById("task-form-title").textContent = "Add a task";
  document.getElementById("task-submit").innerHTML = "Add task <span>＋</span>";
  document.getElementById("task-cancel").classList.add("hidden");
}

function renderScoreChart(tests) {
  const container = document.getElementById("score-chart");
  const summary = document.getElementById("score-summary");
  if (!tests.length) {
    container.innerHTML = '<div class="no-data">Add your first mock test to see your score trend.</div>';
    summary.innerHTML = "";
    return;
  }
  const scores = tests.map(scoreTotal);
  const maxScore = 300;
  const width = 460;
  const height = 190;
  const left = 34;
  const right = 12;
  const top = 10;
  const bottom = 35;
  const chartHeight = height - top - bottom;
  const chartWidth = width - left - right;
  const xFor = index => tests.length === 1 ? left + chartWidth / 2 : left + index / (tests.length - 1) * chartWidth;
  const yFor = score => top + chartHeight - score / maxScore * chartHeight;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mock test total scores in date order">`;
  for (let tick = 0; tick <= 3; tick++) {
    const score = tick * 100;
    const y = yFor(score);
    svg += `<line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text class="chart-small-label" x="${left - 7}" y="${y + 3}" text-anchor="end">${score}</text>`;
  }
  const points = scores.map((score, index) => `${xFor(index)},${yFor(score)}`).join(" ");
  if (tests.length > 1) svg += `<polyline class="chart-line" points="${points}"></polyline>`;
  tests.forEach((test, index) => {
    const x = xFor(index);
    const y = yFor(scores[index]);
    svg += `<circle class="chart-point" cx="${x}" cy="${y}" r="4"><title>${prettyDate(test.date)}: ${scores[index]} / 300</title></circle>`;
    svg += `<text class="chart-small-label" x="${x}" y="${height - 10}" text-anchor="middle">${prettyDate(test.date, { month: "short", day: "numeric" })}</text>`;
  });
  svg += "</svg>";
  container.innerHTML = svg;
  if (tests.length > 1) {
    const change = scores[scores.length - 1] - scores[0];
    const sign = change > 0 ? "+" : "";
    summary.innerHTML = `<span>First <strong>${scores[0]}</strong></span><span>Latest <strong>${scores[scores.length - 1]}</strong></span><span>Change <strong>${sign}${change}</strong></span>`;
  } else {
    summary.innerHTML = `<span>Latest score <strong>${scores[0]} / 300</strong></span>`;
  }
}

function resetSessionForm() {
  editingSessionId = null;
  document.getElementById("session-form").reset();
  document.getElementById("session-date").value = TODAY;
  document.getElementById("session-subject").value = SUBJECTS[0];
  renderChapterOptions();
  document.getElementById("session-form-title").textContent = "Log a study session";
  document.getElementById("session-submit").innerHTML = "Add session <span>＋</span>";
  document.getElementById("session-cancel").classList.add("hidden");
}

function editSession(id) {
  const session = state.sessions.find(item => item.id === id);
  if (!session) return;
  editingSessionId = id;
  document.getElementById("session-date").value = session.date;
  document.getElementById("session-subject").value = session.subject;
  renderChapterOptions(session.chapter);
  document.getElementById("session-duration").value = session.duration;
  document.getElementById("session-form-title").textContent = "Edit study session";
  document.getElementById("session-submit").innerHTML = "Save changes <span>✓</span>";
  document.getElementById("session-cancel").classList.remove("hidden");
  document.getElementById("study").scrollIntoView({ behavior: "smooth" });
}

function resetTestForm() {
  editingTestId = null;
  document.getElementById("test-form").reset();
  document.getElementById("test-date").value = TODAY;
  document.getElementById("test-form-title").textContent = "Add a mock test";
  document.getElementById("test-submit").innerHTML = "Save test <span>↗</span>";
  document.getElementById("test-cancel").classList.add("hidden");
  updateTestPreview();
}

function updateTestPreview() {
  const scoreIds = ["physics-marks", "chemistry-marks", "maths-marks"];
  const total = scoreIds.reduce((sum, id) => sum + (Number(document.getElementById(id).value) || 0), 0);
  document.getElementById("test-total-preview").innerHTML = `${total} <small>/ 300</small>`;
}

function editTest(id) {
  const test = state.tests.find(item => item.id === id);
  if (!test) return;
  editingTestId = id;
  document.getElementById("test-date").value = test.date;
  document.getElementById("physics-marks").value = test.physics;
  document.getElementById("chemistry-marks").value = test.chemistry;
  document.getElementById("maths-marks").value = test.maths;
  document.getElementById("test-form-title").textContent = "Edit mock test";
  document.getElementById("test-submit").innerHTML = "Save changes <span>✓</span>";
  document.getElementById("test-cancel").classList.remove("hidden");
  updateTestPreview();
  document.getElementById("tests").scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  window.jeeTracker = {
    get state() { return state; },
    setState(nextState) { state = nextState; },
    storageKey: STORAGE_KEY,
    createDefaultState,
    loadState,
    renderAll,
    renderHeader,
    renderDashboard,
    renderTasks,
    renderProfile,
    showToast
  };
  renderResources();
  document.getElementById("session-date").value = TODAY;
  document.getElementById("test-date").value = TODAY;

  document.querySelectorAll(".subject-tab").forEach(tab => tab.addEventListener("click", () => {
    activeSubjectFilter = tab.dataset.subjectFilter;
    document.querySelectorAll(".subject-tab").forEach(item => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderSubjects();
  }));
  document.getElementById("subject-groups").addEventListener("change", event => {
    const control = event.target;
    const card = control.closest(".chapter-card");
    if (!card || !control.dataset.field) return;
    const chapter = chapterForCard(card);
    if (!chapter) return;
    const field = control.dataset.field;
    if (field === "status") {
      chapter.status = control.value;
      chapter.progress = control.value === "Completed" ? 100 : control.value === "Not Started" ? 0 : Math.max(5, Math.min(95, chapter.progress || 5));
      card.querySelector('[data-field="progress"]').value = chapter.progress;
      card.querySelector(".progress-control output").textContent = `${chapter.progress}%`;
    } else if (field === "lecture" || field === "notes" || field === "pyqs") {
      chapter[field] = control.checked;
    } else if (field === "questions") {
      chapter.questions = Math.floor(validNumber(control.value, 0, 0, 1000000));
      control.value = chapter.questions;
    }
    saveState();
    renderDashboard();
    renderSubjects();
  });
  document.getElementById("subject-groups").addEventListener("input", event => {
    const control = event.target;
    if (control.dataset.field !== "progress") return;
    const card = control.closest(".chapter-card");
    const chapter = card && chapterForCard(card);
    if (!chapter) return;
    chapter.progress = Number(control.value);
    chapter.status = chapter.progress === 100 ? "Completed" : chapter.progress === 0 ? "Not Started" : "In Progress";
    card.querySelector(".chapter-status").value = chapter.status;
    card.querySelector(".progress-control output").textContent = `${chapter.progress}%`;
    saveState();
    renderDashboard();
  });
  document.getElementById("daily-target").addEventListener("change", event => {
    const target = validNumber(event.target.value, state.dailyTarget, 0.5, 24);
    state.dailyTarget = target;
    event.target.value = formatHours(target);
    saveState();
    renderDashboard();
    renderWeeklyAnalysis();
  });
  document.getElementById("weekly-target-input").addEventListener("change", event => {
    const target = validNumber(event.target.value, state.weeklyTarget, 1, 168);
    state.weeklyTarget = target;
    event.target.value = formatHours(target);
    saveState();
    renderWeeklyAnalysis();
  });
  document.getElementById("session-subject").addEventListener("change", () => renderChapterOptions());
  document.getElementById("session-form").addEventListener("submit", event => {
    event.preventDefault();
    const duration = Number(document.getElementById("session-duration").value);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24) {
      showToast("Study duration must be greater than 0 and no more than 24 hours.", true);
      return;
    }
    const session = {
      id: editingSessionId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      date: document.getElementById("session-date").value,
      subject: document.getElementById("session-subject").value,
      chapter: document.getElementById("session-chapter").value,
      duration
    };
    if (!isValidSession(session)) {
      showToast("Choose a valid date, subject, chapter, and duration.", true);
      return;
    }
    if (editingSessionId) {
      state.sessions = state.sessions.map(item => item.id === editingSessionId ? session : item);
      showToast("Study session updated.");
    } else {
      state.sessions.push(session);
      showToast("Study session added.");
    }
    saveState();
    resetSessionForm();
    renderAll();
  });
  document.getElementById("session-cancel").addEventListener("click", resetSessionForm);
  document.getElementById("session-list").addEventListener("click", event => {
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.sessionAction === "edit") editSession(id);
    if (button.dataset.sessionAction === "delete") {
      const session = state.sessions.find(item => item.id === id);
      if (!session || !window.confirm(`Delete the ${session.chapter} study session?`)) return;
      state.sessions = state.sessions.filter(item => item.id !== id);
      if (editingSessionId === id) resetSessionForm();
      saveState();
      renderAll();
      showToast("Study session deleted.");
    }
  });
  ["physics-marks", "chemistry-marks", "maths-marks"].forEach(id => document.getElementById(id).addEventListener("input", updateTestPreview));
  document.getElementById("test-form").addEventListener("submit", event => {
    event.preventDefault();
    const test = {
      id: editingTestId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      date: document.getElementById("test-date").value,
      physics: Number(document.getElementById("physics-marks").value),
      chemistry: Number(document.getElementById("chemistry-marks").value),
      maths: Number(document.getElementById("maths-marks").value)
    };
    if (!isValidTest(test)) {
      showToast("Enter a valid test date and marks from 0 to 100 for each subject.", true);
      return;
    }
    if (editingTestId) {
      state.tests = state.tests.map(item => item.id === editingTestId ? test : item);
      showToast("Mock test updated.");
    } else {
      state.tests.push(test);
      showToast("Mock test saved.");
    }
    saveState();
    resetTestForm();
    renderTests();
  });
  document.getElementById("test-cancel").addEventListener("click", resetTestForm);
  document.getElementById("test-table-body").addEventListener("click", event => {
    const button = event.target.closest("[data-test-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.testAction === "edit") editTest(id);
    if (button.dataset.testAction === "delete") {
      const test = state.tests.find(item => item.id === id);
      if (!test || !window.confirm(`Delete the ${prettyDate(test.date)} mock test?`)) return;
      state.tests = state.tests.filter(item => item.id !== id);
      if (editingTestId === id) resetTestForm();
      saveState();
      renderTests();
      showToast("Mock test deleted.");
    }
  });
  document.querySelectorAll(".task-filter").forEach(tab => tab.addEventListener("click", () => {
    activeTaskFilter = tab.dataset.taskFilter;
    document.querySelectorAll(".task-filter").forEach(item => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderTasks();
  }));
  document.getElementById("task-form").addEventListener("submit", event => {
    event.preventDefault();
    const title = document.getElementById("task-title").value.trim();
    const existing = state.tasks.find(item => item.id === editingTaskId);
    const task = {
      id: existing?.id || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      title,
      deadline: document.getElementById("task-deadline").value,
      subject: document.getElementById("task-subject").value,
      priority: document.getElementById("task-priority").value,
      completed: existing?.completed || false,
      createdAt: existing?.createdAt || TODAY
    };
    if (!isValidTask(task)) {
      showToast("Enter a task title and choose a valid subject, deadline, and priority.", true);
      return;
    }
    if (existing) {
      state.tasks = state.tasks.map(item => item.id === existing.id ? task : item);
      showToast("Task updated.");
    } else {
      state.tasks.push(task);
      showToast("Task added.");
    }
    saveState();
    resetTaskForm();
    renderTasks();
  });
  document.getElementById("task-cancel").addEventListener("click", resetTaskForm);
  document.getElementById("task-list").addEventListener("change", event => {
    const control = event.target.closest('[data-task-action="toggle"]');
    if (!control) return;
    const task = state.tasks.find(item => item.id === control.dataset.id);
    if (!task) return;
    task.completed = control.checked;
    saveState();
    renderTasks();
  });
  document.getElementById("task-list").addEventListener("click", event => {
    const button = event.target.closest("[data-task-action]");
    if (!button || button.type === "checkbox") return;
    const task = state.tasks.find(item => item.id === button.dataset.id);
    if (!task) return;
    if (button.dataset.taskAction === "edit") beginTaskEdit(task.id);
    if (button.dataset.taskAction === "delete") {
      if (!window.confirm(`Delete “${task.title}”?`)) return;
      state.tasks = state.tasks.filter(item => item.id !== task.id);
      saveState();
      renderTasks();
      showToast("Task deleted.");
    }
  });
  resetTestForm();
});
