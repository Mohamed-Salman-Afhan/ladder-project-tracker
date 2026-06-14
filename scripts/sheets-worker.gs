// Google Apps Script: sheets-worker.gs
//
// Deploy as a Web App (Execute as: Me, Who has access: Anyone) and set the
// Web App URL + SCRIPT_SECRET as GOOGLE_SHEETS_URL / GOOGLE_SHEETS_SECRET in the
// app's environment (.env.local locally, Vercel project env in production).
//
// The app POSTs the full project list on every add / edit / delete:
//   { secret, projects: [ { id, projectName, clientName, website, status,
//                           tasks: [ { task_id, parent_id, row_type, order,
//                                      name, assignee, startDate, endDate,
//                                      status, notes } ] } ] }
// We rebuild three tabs from it: Website Project Tracker, Gantt chart, Timeline.

const MASTER_SHEET_ID = "1bgvc5kE8ELx_xg9APYfsHIY1_9bh7zl34lPJ-K-uQvM";
const SCRIPT_SECRET = "lg-web-project-tracker-2026";

const TAB_TRACKER = "Website Project Tracker";
const TAB_GANTT = "Gantt chart";
const TAB_TIMELINE = "Timeline";

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!body || body.secret !== SCRIPT_SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    const projects = Array.isArray(body.projects)
      ? body.projects
      : body.project
        ? [body.project]
        : [];

    buildTracker(ss, projects);
    buildGantt(ss, projects);
    buildTimeline(ss, projects);

    return json({ ok: true, synced: projects.length });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getTab(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function tasksOf(p) {
  if (Array.isArray(p.tasks)) return p.tasks;
  if (Array.isArray(p.stages)) return p.stages;
  return [];
}

function isSub(t) {
  return (t.row_type || "main") === "sub";
}

function pct(tasks) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "Completed").length;
  return Math.round((done / tasks.length) * 100);
}

function durationDays(start, end) {
  if (!start || !end) return "";
  const d = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return isNaN(d) ? "" : d;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Clear the tab and write a header + rows, with a styled, frozen header.
function writeTab(sheet, header, rows) {
  sheet.clear();
  const width = header.length;
  const padded = rows.map((r) => {
    const a = r.slice(0, width);
    while (a.length < width) a.push("");
    return a;
  });
  const all = [header].concat(padded);
  sheet.getRange(1, 1, all.length, width).setValues(all);
  sheet
    .getRange(1, 1, 1, width)
    .setFontWeight("bold")
    .setBackground("#1f2937")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

/* ── Website Project Tracker: one row per project ────────────────────── */

function buildTracker(ss, projects) {
  const header = [
    "Project",
    "Client",
    "Website",
    "Status",
    "Progress %",
    "Tasks Done",
    "Tasks Total",
    "Start",
    "End",
    "Last Updated",
  ];
  const today = fmtDate(new Date());
  const rows = projects.map((p) => {
    const ts = tasksOf(p);
    const dated = ts.filter((t) => t.startDate || t.endDate);
    const starts = dated
      .map((t) => new Date(t.startDate || t.endDate))
      .filter((d) => !isNaN(d));
    const ends = dated
      .map((t) => new Date(t.endDate || t.startDate))
      .filter((d) => !isNaN(d));
    return [
      p.projectName || "",
      p.clientName || "",
      p.website || "",
      p.status || "",
      pct(ts),
      ts.filter((t) => t.status === "Completed").length,
      ts.length,
      starts.length ? fmtDate(new Date(Math.min.apply(null, starts))) : "",
      ends.length ? fmtDate(new Date(Math.max.apply(null, ends))) : "",
      today,
    ];
  });
  writeTab(getTab(ss, TAB_TRACKER), header, rows);
}

/* ── Gantt chart: one row per task, subtasks nested under their parent ── */

function buildGantt(ss, projects) {
  const header = [
    "Project",
    "Task",
    "Type",
    "Assignee",
    "Start",
    "End",
    "Duration (days)",
    "Status",
    "Progress %",
  ];
  const rows = [];
  projects.forEach((p) => {
    const ts = tasksOf(p);
    const mains = ts
      .filter((t) => !isSub(t))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    mains.forEach((m) => {
      rows.push([
        p.projectName || "",
        m.name || "",
        "Main",
        m.assignee || "",
        fmtDate(m.startDate),
        fmtDate(m.endDate),
        durationDays(m.startDate, m.endDate),
        m.status || "",
        m.status === "Completed" ? 100 : "",
      ]);
      ts
        .filter((t) => isSub(t) && t.parent_id === m.task_id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((s) => {
          rows.push([
            p.projectName || "",
            "    ↳ " + (s.name || ""),
            "Sub",
            s.assignee || "",
            fmtDate(s.startDate),
            fmtDate(s.endDate),
            durationDays(s.startDate, s.endDate),
            s.status || "",
            s.status === "Completed" ? 100 : "",
          ]);
        });
    });
  });
  writeTab(getTab(ss, TAB_GANTT), header, rows);
}

/* ── Timeline: all dated tasks across projects, chronological ─────────── */

function buildTimeline(ss, projects) {
  const header = ["Start", "End", "Project", "Task", "Assignee", "Status"];
  const rows = [];
  projects.forEach((p) => {
    tasksOf(p).forEach((t) => {
      if (!t.startDate && !t.endDate) return;
      rows.push({
        sortKey: new Date(t.startDate || t.endDate).getTime() || 0,
        cells: [
          fmtDate(t.startDate),
          fmtDate(t.endDate),
          p.projectName || "",
          t.name || "",
          t.assignee || "",
          t.status || "",
        ],
      });
    });
  });
  rows.sort((a, b) => a.sortKey - b.sortKey);
  writeTab(
    getTab(ss, TAB_TIMELINE),
    header,
    rows.map((r) => r.cells),
  );
}
