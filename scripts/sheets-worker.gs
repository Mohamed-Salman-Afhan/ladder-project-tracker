// ─── Ladder Global – Project Tracker Sync ───────────────────
// Deploy as Web App: Execute as → Me | Who has access → Anyone
// Re-deploy after any change: Deploy → Manage deployments → Edit → New version → Deploy
//
// Payload sent by the app (src/App.jsx → syncSheets):
//   { secret, projects: [ { projectName, clientName, website, status, progress,
//                           stages: [ { status, assignee }, …4 ] } ],
//            timeline: [ { project, client, stage, assignee, startDate, endDate,
//                          durationDays, status, notes } ] }
// ────────────────────────────────────────────────────────────

const SECRET = "lg-web-project-tracker-2026";
const SPREADSHEET_ID = "1bgvc5kE8ELx_xg9APYfsHIY1_9bh7zl34lPJ-K-uQvM";
const PROJECTS_SHEET = "Website-Project-Tracker";
const TIMELINE_SHEET = "Timeline";
const GANTT_SHEET    = "Gantt";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.secret !== SECRET) {
      return json({ ok: false, error: "Unauthorized" });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── Projects sheet ──────────────────────────────────────
    let pSheet = getOrCreate(ss, PROJECTS_SHEET);
    const pHeaders = [
      "Project", "Client", "Website", "Status", "Progress %",
      "Questionnaire", "Q Assignee",
      "Kickoff Meeting", "KM Assignee",
      "UI/UX Design", "UI Assignee",
      "Development", "Dev Assignee", "Last Updated"
    ];
    pSheet.clear();
    pSheet.appendRow(pHeaders);
    styleHeader(pSheet, pHeaders.length, "FF5050");

    (data.projects || []).forEach(p => {
      const s = p.stages || [];
      pSheet.appendRow([
        p.projectName, p.clientName, p.website || "", p.status, (p.progress || 0) + "%",
        s[0]?.status || "", s[0]?.assignee || "",
        s[1]?.status || "", s[1]?.assignee || "",
        s[2]?.status || "", s[2]?.assignee || "",
        s[3]?.status || "", s[3]?.assignee || "",
        new Date().toLocaleString()
      ]);
    });
    pSheet.autoResizeColumns(1, pHeaders.length);

    // ── Timeline sheet ──────────────────────────────────────
    const timelineRows = data.timeline || [];
    let tSheet = getOrCreate(ss, TIMELINE_SHEET);
    const tHeaders = [
      "Project", "Client", "Stage", "Assignee",
      "Start Date", "End Date", "Duration (Days)", "Status", "Notes"
    ];
    tSheet.clear(); // clear() (not clearContents) so stale status colours are wiped
    tSheet.appendRow(tHeaders);
    styleHeader(tSheet, tHeaders.length, "1E3A5F");

    timelineRows.forEach(r => {
      tSheet.appendRow([
        r.project || "", r.client || "", r.stage || "", r.assignee || "",
        r.startDate || "", r.endDate || "",
        r.durationDays != null && r.durationDays !== "" ? Number(r.durationDays) : "",
        r.status || "", r.notes || ""
      ]);
    });

    // Colour-code Status column (col 8)
    timelineRows.forEach((r, i) => {
      const bg = statusColor(r.status);
      if (bg) tSheet.getRange(i + 2, 8).setBackground(bg).setFontColor("#ffffff");
    });
    tSheet.autoResizeColumns(1, tHeaders.length);

    // ── Gantt sheet ─────────────────────────────────────────
    const dated = timelineRows.filter(r => r.startDate && r.endDate);
    if (dated.length > 0) {
      buildGanttSheet(ss, dated);
    } else {
      // No dated stages — clear any stale chart so it doesn't show old bars
      const g = ss.getSheetByName(GANTT_SHEET);
      if (g) { g.clearContents(); g.clearFormats(); }
    }

    return json({ ok: true });

  } catch (err) {
    return json({ ok: false, error: err.toString() });
  }
}

// ── Gantt builder ────────────────────────────────────────────

function buildGanttSheet(ss, rows) {
  const STAGE_COLORS = {
    "Questionnaire":   "#FF5050",
    "Kickoff Meeting": "#3B82F6",
    "UI/UX Design":    "#8B5CF6",
    "Development":     "#22C55E"
  };

  const tz = Session.getScriptTimeZone();
  const toDay = str => { const d = new Date(str); d.setHours(0,0,0,0); return d; };

  const allDates = rows.flatMap(r => [toDay(r.startDate), toDay(r.endDate)]);
  const minDate  = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate  = new Date(Math.max(...allDates.map(d => d.getTime())));
  const totalDays = Math.min(Math.round((maxDate - minDate) / 86400000) + 1, 365);

  let gSheet = ss.getSheetByName(GANTT_SHEET);
  if (!gSheet) gSheet = ss.insertSheet(GANTT_SHEET);
  gSheet.clearContents();
  gSheet.clearFormats();

  // A sheet defaults to 26 columns / 1000 rows. The day grid needs one column
  // per day (up to 365) plus 4 label columns — grow the sheet first, otherwise
  // setColumnWidth/setValues throw "out of bounds" for wide date ranges.
  const neededCols = 4 + totalDays;
  if (gSheet.getMaxColumns() < neededCols) {
    gSheet.insertColumnsAfter(gSheet.getMaxColumns(), neededCols - gSheet.getMaxColumns());
  }
  const neededRows = rows.length + 1;
  if (gSheet.getMaxRows() < neededRows) {
    gSheet.insertRowsAfter(gSheet.getMaxRows(), neededRows - gSheet.getMaxRows());
  }

  // Fixed column widths
  gSheet.setColumnWidth(1, 150);  // Project
  gSheet.setColumnWidth(2, 130);  // Stage
  gSheet.setColumnWidth(3, 110);  // Assignee
  gSheet.setColumnWidth(4, 100);  // Status
  for (let c = 5; c <= 4 + totalDays; c++) gSheet.setColumnWidth(c, 28);

  // Header row
  const headerVals = [["Project", "Stage", "Assignee", "Status"]];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate.getTime() + i * 86400000);
    headerVals[0].push(Utilities.formatDate(d, tz, "d-MMM"));
  }
  gSheet.getRange(1, 1, 1, headerVals[0].length).setValues(headerVals);
  styleHeader(gSheet, headerVals[0].length, "1E3A5F");

  // Today marker
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOff = Math.round((today - minDate) / 86400000);
  if (todayOff >= 0 && todayOff < totalDays) {
    gSheet.getRange(1, 5 + todayOff)
      .setBackground("#FF5050")
      .setFontColor("#FFFFFF");
  }

  // Data rows + bars
  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    gSheet.getRange(rowNum, 1, 1, 4).setValues([[
      r.project || "", r.stage || "", r.assignee || "", r.status || ""
    ]]);

    const start = toDay(r.startDate);
    const end   = toDay(r.endDate);
    const startOff = Math.round((start - minDate) / 86400000);
    const endOff   = Math.round((end   - minDate) / 86400000);
    const clampedEnd = Math.min(endOff, totalDays - 1);

    if (startOff <= clampedEnd && startOff < totalDays) {
      const color = STAGE_COLORS[r.stage] || "#60A5FA";
      gSheet.getRange(rowNum, 5 + startOff, 1, clampedEnd - startOff + 1)
        .setBackground(color);
    }
  });

  // Alternate row shading for readability
  rows.forEach((_, idx) => {
    if (idx % 2 === 1) {
      gSheet.getRange(idx + 2, 1, 1, 4)
        .setBackground("#F8F9FA");
    }
  });

  gSheet.setFrozenRows(1);
  gSheet.setFrozenColumns(4);
}

// ── Helpers ──────────────────────────────────────────────────

function getOrCreate(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function styleHeader(sheet, colCount, hexBg) {
  sheet.getRange(1, 1, 1, colCount)
    .setFontWeight("bold")
    .setBackground("#" + hexBg)
    .setFontColor("#FFFFFF");
}

function statusColor(status) {
  switch ((status || "").toLowerCase()) {
    case "complete":
    case "completed":    return "#16A34A";
    case "in progress":  return "#2563EB";
    case "not started":  return "#6B7280";
    case "blocked":
    case "on hold":      return "#DC2626";
    default:             return null;
  }
}
