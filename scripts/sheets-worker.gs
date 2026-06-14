// Google Apps Script: sheets-worker.gs
// Deploy as a Web App (doPost) and set SCRIPT_SECRET in the environment.

const MASTER_SHEET_ID = "PUT_MASTER_SHEET_ID_HERE"; // replace with your sheet id
const SCRIPT_SECRET = "lg-web-project-tracker-2026";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    if (!body || body.secret !== SCRIPT_SECRET) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: "unauthorized" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    ensureIndexSheet(ss);

    const results = [];
    if (body.project) {
      results.push(syncSingleProject(ss, body.project));
    } else if (Array.isArray(body.projects)) {
      body.projects.forEach((p) => results.push(syncSingleProject(ss, p)));
    } else if (body.action === "delete" && body.projectId) {
      results.push(deleteProjectSheet(ss, body.projectId));
    } else if (body.action === "delete" && body.project && body.project.id) {
      results.push(deleteProjectSheet(ss, body.project.id));
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, results }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function ensureIndexSheet(ss) {
  let idx = ss.getSheetByName("__projects_index");
  if (!idx) {
    idx = ss.insertSheet("__projects_index");
    idx
      .getRange(1, 1, 1, 7)
      .setValues([
        [
          "project_id",
          "sheet_name",
          "project_name",
          "client",
          "last_synced_iso",
          "sync_status",
          "migrated_version",
        ],
      ]);
  }
}

function sanitizeTitle(t) {
  return t.replace(/[\\\\:\\\/\\?\\*\\[\\]]/g, " ").substring(0, 100);
}

function projectToAOA(p) {
  const rows = [];
  rows.push([
    "row_type",
    "task_id",
    "parent_id",
    "order",
    "name",
    "assignee",
    "stage",
    "start_date",
    "end_date",
    "duration_days",
    "progress_pct",
    "status",
    "notes",
  ]);
  rows.push([
    "meta",
    "project_id:" + p.id,
    "",
    "",
    "",
    "Project: " + (p.projectName || ""),
    "",
    "",
    "",
    "",
    "",
    "",
    "Client: " + (p.clientName || ""),
  ]);
  // tasks: here we use stages as main tasks and assume p.stages may contain subtasks under `subtasks` property
  if (Array.isArray(p.stages)) {
    p.stages.forEach((s, si) => {
      const mainId = `m-${si + 1}`;
      rows.push([
        "main",
        mainId,
        "",
        si + 1,
        s.name || "",
        s.assignee || "",
        s.name || "",
        s.startDate || "",
        s.endDate || "",
        s.startDate && s.endDate
          ? Math.round(
              (new Date(s.endDate) - new Date(s.startDate)) / 86400000,
            ) + 1
          : "",
        s.progress_pct || "",
        s.status || "",
        s.notes || "",
      ]);
      if (Array.isArray(s.subtasks)) {
        s.subtasks.forEach((t, ti) => {
          rows.push([
            "sub",
            t.task_id || `s-${si + 1}-${ti + 1}`,
            mainId,
            `${si + 1}.${ti + 1}`,
            t.name || "",
            t.assignee || "",
            s.name || "",
            t.startDate || "",
            t.endDate || "",
            t.startDate && t.endDate
              ? Math.round(
                  (new Date(t.endDate) - new Date(t.startDate)) / 86400000,
                ) + 1
              : "",
            t.progress_pct || "",
            t.status || "",
            t.notes || "",
          ]);
        });
      }
    });
  }
  return rows;
}

function syncSingleProject(ss, p) {
  const sheetName = sanitizeTitle(
    "Project — " + (p.slug || p.projectName || p.id),
  );
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const aoa = projectToAOA(p);
  sheet.clear();
  sheet.getRange(1, 1, aoa.length, aoa[0].length).setValues(aoa);

  // Optionally create row groups for each main task's subtasks using Advanced Sheets API
  // This requires enabling the Sheets API and using UrlFetch with OAuth. For simplicity we skip grouping here.

  updateIndexSheet(
    ss,
    p.id,
    sheetName,
    p.projectName || "",
    p.clientName || "",
    new Date().toISOString(),
    "ok",
    "v1",
  );
  return { projectId: p.id, sheet: sheetName };
}

function updateIndexSheet(
  ss,
  projectId,
  sheetName,
  projectName,
  client,
  iso,
  status,
  ver,
) {
  const idx = ss.getSheetByName("__projects_index");
  const data = idx.getDataRange().getValues();
  const header = data[0];
  let found = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) {
      found = i;
      break;
    }
  }
  const row = [
    projectId,
    sheetName,
    projectName,
    client,
    iso,
    status,
    ver || "v1",
  ];
  if (found >= 0) idx.getRange(found + 1, 1, 1, row.length).setValues([row]);
  else idx.appendRow(row);
}

function deleteProjectSheet(ss, projectId) {
  const idx = ss.getSheetByName("__projects_index");
  if (!idx) return { ok: false, reason: "index_missing" };
  const data = idx.getDataRange().getValues();
  let sheetName = null;
  let found = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === projectId) {
      sheetName = data[i][1];
      found = i;
      break;
    }
  }
  if (sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) ss.deleteSheet(sheet);
    idx.deleteRow(found + 1);
    return { ok: true, deleted: sheetName };
  }
  return { ok: false, reason: "not_found" };
}
