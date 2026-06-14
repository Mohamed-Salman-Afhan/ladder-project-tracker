# Sheets Integration Spec

Overview

- Single master spreadsheet with one tab per project (title: `Project — <slug-or-id>`).
- `__projects_index` tab tracks project_id → sheet_name → last_synced_iso → sync_status.
- Per-tab compact schema (A..M) avoids wide per-day columns; timeline computed client-side.

Index sheet (`__projects_index`) columns

- project_id, sheet_name, project_name, client, last_synced_iso, sync_status, migrated_version

Per-project sheet schema (columns A–M)

- row_type, task_id, parent_id, order, name, assignee, stage, start_date, end_date, duration_days, progress_pct, status, notes

Sample array-of-arrays (AOA) for a project
[
["row_type","task_id","parent_id","order","name","assignee","stage","start_date","end_date","duration_days","progress_pct","status","notes"],
["meta","project_id:<uuid>","","","","Project Name: Website Redesign","","2026-05-01","2026-06-30","","","","client:Acme Ltd"],
["main","m-1","","1","Discovery","Alice","Questionnaire","2026-05-01","2026-05-05","4","100","Completed","Summary notes..."],
["sub","s-1","m-1","1.1","Survey setup","Bob","Questionnaire","2026-05-01","2026-05-02","1","100","Completed",""]
]

Sheets API payload examples

1. addSheet (create tab)
   {
   "requests": [
   { "addSheet": { "properties": { "title": "Project — website-redesign-123", "gridProperties": { "rowCount": 2000, "columnCount": 13 } } } }
   ]
   }

2. values.batchUpdate (write header + rows for project + update index)
   {
   "valueInputOption": "USER_ENTERED",
   "data": [
   {
   "range": "'Project — website-redesign-123'!A1",
   "majorDimension": "ROWS",
   "values": [ /* AOA rows above */ ]
   },
   {
   "range": "'\_\_projects_index'!A1",
   "majorDimension": "ROWS",
   "values": [
   ["project_id","sheet_name","project_name","client","last_synced_iso","sync_status","migrated_version"],
   ["<uuid>","Project — website-redesign-123","Website Redesign","Acme Ltd","2026-05-31T12:34:56Z","ok","v1"]
   ]
   }
   ]
   }

3. addDimensionGroup + updateDimensionProperties (create/collapse subtask rows)
   {
   "requests": [
   { "addDimensionGroup": { "range": { "sheetId": 123456, "dimension": "ROWS", "startIndex": 4, "endIndex": 7 } } },
   { "updateDimensionProperties": { "range": { "sheetId": 123456, "dimension": "ROWS", "startIndex": 4, "endIndex": 7 }, "properties": { "hiddenByUser": true }, "fields": "hiddenByUser" } }
   ]
   }

Notes

- Row indices are 0-based. Calculate ranges after assembling the AOA. `hiddenByUser: true` collapses the group visible in Sheets UI.
- Use `values.batchUpdate` to write multiple sheets in one call (project sheet + index).
- For large projects, chunk rows to avoid payload limits.

Apps Script worker pseudo-code (doPost)

function doPost(e) {
const body = JSON.parse(e.postData.contents);
if (body.secret !== SCRIPT_SECRET) return ContentService.createTextOutput(JSON.stringify({ok:false,err:"unauth"}));

// Accept either { project } or { projects: [ ... ] }
const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
ensureIndexSheet(ss);

const projects = body.projects || (body.project ? [body.project] : []);
projects.forEach((proj) => {
const sheetName = sanitizeTitle(`Project — ${proj.slug || proj.id}`);
let sheet = ss.getSheetByName(sheetName);
if (!sheet) sheet = ss.insertSheet(sheetName);

    const aoa = projectToAOA(proj); // map tasks -> compact rows
    const range = sheet.getRange(1,1, aoa.length, aoa[0].length);
    range.setValues(aoa);

    // Optional: create row groups for subtasks using Sheets Advanced API (needs OAuth scope)
    // Use UrlFetch to call spreadsheets.batchUpdate for addDimensionGroup

    updateIndexSheet(ss, proj.id, sheetName, proj.name, proj.client, new Date().toISOString(), 'ok');

});

return ContentService.createTextOutput(JSON.stringify({ok:true}));
}

Front-end patch plan (`src/App.jsx`) — concrete changes

- Add fields to task objects: `task_id`, `parent_id`, `row_type`.
- Provide a function to build nested structure:

function buildHierarchy(tasks) {
const byId = new Map(tasks.map(t => [t.task_id, { ...t, subtasks: [] }]));
const roots = [];
byId.forEach(t => {
if (t.parent_id) {
const p = byId.get(t.parent_id);
if (p) p.subtasks.push(t);
else roots.push(t);
} else if (t.row_type === 'main') roots.push(t);
else roots.push(t);
});
// sort by `order`
return roots.sort((a,b)=>a.order-b.order);
}

- Add `expanded` state: `const [expanded, setExpanded] = useState(new Set());`
- Toggle function: `const toggle = (id) => setExpanded(s => { const ns = new Set(s); ns.has(id)?ns.delete(id):ns.add(id); return ns; })`
- Render main rows with a caret button (aria-expanded based on `expanded.has(id)`). When expanded, map `subtasks` to render indented rows with detailed bars.
- Compute main summary: `min(start_date)`, `max(end_date)`, `avg(progress_pct)` on render to show the summary bar.
- Persist expanded set per project in `localStorage` under `expanded:<projectId>`.

Migration outline

1. Create `__projects_index` if missing.
2. For a sample set, convert existing combined sheet rows to per-project AOA and write to new tabs (dry-run first).
3. Verify parity for a handful of projects.
4. Switch service to accept per-project updates and update front-end `api/sync-sheets.js` to post only changed project.
5. After confidence, archive legacy combined sheet.

On-demand sync recommendation

- Keep auto-sync on save but scope to that single project (POST one `project` to the worker).
- Provide manual per-project "Sync" in the Projects list and a global "Sync All" that queues projects in batches.

Next steps I can implement now (if you confirm):

- Produce the Apps Script `doPost` implementation (full code) and the exact `spreadsheets.batchUpdate` JSON payloads.
- Patch `api/sync-sheets.js` to POST per-project payloads (and update `src/App.jsx` call sites).
- Implement the front-end UI patch in `src/App.jsx` (collapse/expand rendering) with tests.

---
