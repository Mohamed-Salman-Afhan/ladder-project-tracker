// ─── Ladder Global – Project Tracker Sync ───────────────────
// Deploy as Web App: Execute as → Me | Who has access → Anyone
// Re-deploy after any change: Deploy → Manage deployments → Edit → New version → Deploy
//
// Payload from the app (src/App.jsx → syncSheets):
//   { secret,
//     projects: [ { projectName, clientName, website, status, progress,
//                   stages:[{status,assignee}] } ],            // tracker tab
//     tree: [ { project, client, status, progress,
//               mains:[ { name, assignee, startDate, endDate, durationDays,
//                         status, notes, subs:[ {…same…} ] } ] } ] }  // Timeline + Gantt
//
// Timeline & Gantt group by project: the project name appears once as a header
// row, with its stages nested under it and sub-tasks nested one level deeper
// (native Google Sheets collapsible row groups).

const SECRET = "lg-web-project-tracker-2026";
const SPREADSHEET_ID = "1bgvc5kE8ELx_xg9APYfsHIY1_9bh7zl34lPJ-K-uQvM";
const PROJECTS_SHEET = "Website-Project-Tracker";
const TIMELINE_SHEET = "Timeline";
const GANTT_SHEET = "Gantt";

const NAVY = "#1E3A5F";
const MAIN_BG = "#EEF2F7";
const SUB_BG = "#F8FAFC";
const STAGE_COLORS = {
  "Questionnaire": "#FF5050",
  "Kickoff Meeting": "#3B82F6",
  "UI/UX Design": "#8B5CF6",
  "Development": "#22C55E",
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return json({ ok: false, error: "Unauthorized" });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const errors = [];
    const tree = Array.isArray(data.tree) ? data.tree : [];

    try { buildProjects(ss, data.projects || []); } catch (err) { errors.push("projects: " + err.message); }
    try { buildTimeline(ss, tree); } catch (err) { errors.push("timeline: " + err.message); }
    try { buildGantt(ss, tree); } catch (err) { errors.push("gantt: " + err.message); }

    return json(errors.length ? { ok: false, error: errors.join(" | ") } : { ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

/* ── helpers ─────────────────────────────────────────────────── */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getTab(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// Delete + recreate so old row groups / formatting don't accumulate.
function freshTab(ss, name) {
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  return ss.insertSheet(name);
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function statusBg(status) {
  switch ((status || "").toLowerCase()) {
    case "complete":
    case "completed": return "#DCFCE7";
    case "in progress": return "#DBEAFE";
    case "on hold":
    case "blocked": return "#FEE2E2";
    default: return null;
  }
}

/* ── Website Project Tracker: one row per project ────────────── */

function buildProjects(ss, projects) {
  const sh = getTab(ss, PROJECTS_SHEET);
  const header = [
    "Project", "Client", "Website", "Status", "Progress %",
    "Questionnaire", "Q Assignee", "Kickoff Meeting", "KM Assignee",
    "UI/UX Design", "UI Assignee", "Development", "Dev Assignee", "Last Updated",
  ];
  sh.clear();
  const now = new Date().toLocaleString();
  const rows = [header];
  projects.forEach((p) => {
    const s = p.stages || [];
    rows.push([
      p.projectName, p.clientName, p.website || "", p.status, (p.progress || 0) + "%",
      s[0] && s[0].status || "", s[0] && s[0].assignee || "",
      s[1] && s[1].status || "", s[1] && s[1].assignee || "",
      s[2] && s[2].status || "", s[2] && s[2].assignee || "",
      s[3] && s[3].status || "", s[3] && s[3].assignee || "",
      now,
    ]);
  });
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground(NAVY).setFontColor("#ffffff");
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);
}

/* ── Timeline: grouped by project, collapsible ───────────────── */

function buildTimeline(ss, tree) {
  const sh = freshTab(ss, TIMELINE_SHEET);
  const header = ["Project / Stage / Task", "Assignee", "Start", "End", "Duration (Days)", "Status", "Notes"];
  const W = header.length;

  const rows = [header];
  const blocks = [];        // { taskStart, taskEnd, subBlocks:[{start,end}] } (0-based row indexes)
  const projectRows = [];   // 0-based indexes of project header rows
  const statusCells = [];   // { row, status }

  tree.forEach((p) => {
    projectRows.push(rows.length);
    rows.push([p.project + (p.progress != null ? "   ·   " + p.progress + "%" : ""), "", "", "", "", p.status || "", ""]);
    const taskStart = rows.length;
    const subBlocks = [];
    (p.mains || []).forEach((m) => {
      rows.push(["    " + m.name, m.assignee, fmtDate(m.startDate), fmtDate(m.endDate), m.durationDays || "", m.status, m.notes]);
      statusCells.push({ row: rows.length - 1, status: m.status });
      if (m.subs && m.subs.length) {
        const start = rows.length;
        m.subs.forEach((s) => {
          rows.push(["        ↳ " + s.name, s.assignee, fmtDate(s.startDate), fmtDate(s.endDate), s.durationDays || "", s.status, s.notes]);
          statusCells.push({ row: rows.length - 1, status: s.status });
        });
        subBlocks.push({ start: start, end: rows.length - 1 });
      }
    });
    if (rows.length - 1 >= taskStart) blocks.push({ taskStart: taskStart, taskEnd: rows.length - 1, subBlocks: subBlocks });
  });

  sh.getRange(1, 1, rows.length, W).setValues(rows.map((r) => { const a = r.slice(); while (a.length < W) a.push(""); return a; }));
  sh.getRange(1, 1, 1, W).setFontWeight("bold").setBackground(NAVY).setFontColor("#ffffff");
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 300);
  for (let c = 2; c <= W; c++) sh.autoResizeColumn(c);

  // project header rows
  projectRows.forEach((r) => {
    sh.getRange(r + 1, 1, 1, W).setBackground(NAVY).setFontColor("#ffffff").setFontWeight("bold");
  });
  // status cell tint
  statusCells.forEach((sc) => { const bg = statusBg(sc.status); if (bg) sh.getRange(sc.row + 1, 6).setBackground(bg); });

  // collapsible groups: tasks under project, subs under their main
  blocks.forEach((b) => {
    sh.getRange(b.taskStart + 1, 1, b.taskEnd - b.taskStart + 1, 1).shiftRowGroupDepth(1);
    b.subBlocks.forEach((sb) => sh.getRange(sb.start + 1, 1, sb.end - sb.start + 1, 1).shiftRowGroupDepth(1));
  });
}

/* ── Gantt: grouped by project, day grid with colour-coded bars ─ */

function buildGantt(ss, tree) {
  const sh = freshTab(ss, GANTT_SHEET);
  const toDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  const dated = [];
  tree.forEach((p) => (p.mains || []).forEach((m) => {
    if (m.startDate && m.endDate) dated.push(toDay(m.startDate), toDay(m.endDate));
    (m.subs || []).forEach((s) => { if (s.startDate && s.endDate) dated.push(toDay(s.startDate), toDay(s.endDate)); });
  }));

  const LABELS = ["Project / Stage / Task", "Assignee", "Status"];
  if (!dated.length) {
    sh.getRange(1, 1, 1, LABELS.length).setValues([LABELS]).setFontWeight("bold").setBackground(NAVY).setFontColor("#ffffff");
    return;
  }

  const minDate = new Date(Math.min.apply(null, dated.map((d) => d.getTime())));
  const maxDate = new Date(Math.max.apply(null, dated.map((d) => d.getTime())));
  const totalDays = Math.min(Math.round((maxDate - minDate) / 86400000) + 1, 366);
  const W = LABELS.length + totalDays;

  // grow sheet (defaults to 26 cols / 1000 rows)
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());

  // header
  const header = LABELS.slice();
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate.getTime() + i * 86400000);
    header.push(Utilities.formatDate(d, Session.getScriptTimeZone(), "d-MMM"));
  }

  const rows = [header];
  const blocks = [];
  const projectRows = [];
  const bars = []; // { row, startOff, endOff, color }

  const offset = (d) => Math.round((toDay(d) - minDate) / 86400000);

  tree.forEach((p) => {
    projectRows.push(rows.length);
    const prow = [p.project + (p.progress != null ? "   ·   " + p.progress + "%" : ""), "", p.status || ""];
    while (prow.length < W) prow.push("");
    rows.push(prow);
    const taskStart = rows.length;
    const subBlocks = [];
    (p.mains || []).forEach((m) => {
      const r = ["    " + m.name, m.assignee, m.status];
      while (r.length < W) r.push("");
      rows.push(r);
      if (m.startDate && m.endDate) bars.push({ row: rows.length - 1, startOff: offset(m.startDate), endOff: offset(m.endDate), color: STAGE_COLORS[m.name] || "#60A5FA" });
      if (m.subs && m.subs.length) {
        const start = rows.length;
        m.subs.forEach((s) => {
          const sr = ["        ↳ " + s.name, s.assignee, s.status];
          while (sr.length < W) sr.push("");
          rows.push(sr);
          if (s.startDate && s.endDate) bars.push({ row: rows.length - 1, startOff: offset(s.startDate), endOff: offset(s.endDate), color: "#93C5FD" });
        });
        subBlocks.push({ start: start, end: rows.length - 1 });
      }
    });
    if (rows.length - 1 >= taskStart) blocks.push({ taskStart: taskStart, taskEnd: rows.length - 1, subBlocks: subBlocks });
  });

  // ensure rows
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());

  sh.getRange(1, 1, rows.length, W).setValues(rows);
  sh.getRange(1, 1, 1, W).setFontWeight("bold").setBackground(NAVY).setFontColor("#ffffff");
  sh.setFrozenRows(1);
  sh.setFrozenColumns(LABELS.length);
  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 100);
  for (let c = LABELS.length + 1; c <= W; c++) sh.setColumnWidth(c, 26);

  // project header rows
  projectRows.forEach((r) => sh.getRange(r + 1, 1, 1, W).setBackground(NAVY).setFontColor("#ffffff").setFontWeight("bold"));

  // bars
  bars.forEach((b) => {
    const s = Math.max(b.startOff, 0);
    const e = Math.min(b.endOff, totalDays - 1);
    if (s <= e) sh.getRange(b.row + 1, LABELS.length + 1 + s, 1, e - s + 1).setBackground(b.color);
  });

  // today marker (header cell)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tOff = Math.round((today - minDate) / 86400000);
  if (tOff >= 0 && tOff < totalDays) sh.getRange(1, LABELS.length + 1 + tOff).setBackground("#FF5050").setFontColor("#ffffff");

  // collapsible groups
  blocks.forEach((b) => {
    sh.getRange(b.taskStart + 1, 1, b.taskEnd - b.taskStart + 1, 1).shiftRowGroupDepth(1);
    b.subBlocks.forEach((sb) => sh.getRange(sb.start + 1, 1, sb.end - sb.start + 1, 1).shiftRowGroupDepth(1));
  });
}
