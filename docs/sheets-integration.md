# Google Sheets Integration

The tracker mirrors all projects to a single Google Sheet automatically. There is
no manual "sync" button — every project add, edit, delete, or active/inactive
toggle pushes the **full project list** to the sheet in the background.

## Data flow

```
src/App.jsx  ──POST {projects:[…]}──▶  /api/sync-sheets  ──+ secret──▶  Apps Script Web App  ──▶  Google Sheet
   syncSheets(next)                    (Vercel fn / Vite dev          (scripts/sheets-worker.gs)   (3 tabs)
                                        middleware, server-only)
```

- `syncSheets(next)` in `src/App.jsx` fires after each state change (non-blocking;
  failures surface as a small "last sync failed" note on the Sheets tab).
- `api/sync-sheets.js` (prod) and the Vite dev middleware in `vite.config.js` both
  attach the `GOOGLE_SHEETS_SECRET` server-side and forward to `GOOGLE_SHEETS_URL`.
  The secret is **never** exposed to the browser.
- `scripts/sheets-worker.gs` validates the secret and rebuilds three tabs.

## Environment variables (server-only)

| Variable | Where | Value |
|---|---|---|
| `GOOGLE_SHEETS_URL` | `.env.local` + Vercel | Apps Script Web App `/exec` URL |
| `GOOGLE_SHEETS_SECRET` | `.env.local` + Vercel | Shared secret, must match `SCRIPT_SECRET` in the worker |

## The three tabs (rebuilt on every sync)

**Website Project Tracker** — one row per project:
`Project · Client · Website · Status · Progress % · Tasks Done · Tasks Total · Start · End · Last Updated`

**Gantt chart** — one row per task, subtasks nested under their parent (indented):
`Project · Task · Type · Assignee · Start · End · Duration (days) · Status · Progress %`

**Timeline** — every dated task across all projects, sorted chronologically:
`Start · End · Project · Task · Assignee · Status`

Each sync `clear()`s and rewrites these three tabs, so they always reflect current
state. Other tabs in the spreadsheet are left untouched.

## Request payload

```json
{
  "secret": "…",
  "projects": [
    {
      "id": "uuid",
      "projectName": "Website Redesign",
      "clientName": "Acme Ltd",
      "website": "https://acme.com",
      "status": "In Progress",
      "tasks": [
        { "task_id": "…", "parent_id": null, "row_type": "main", "order": 1,
          "name": "Questionnaire", "assignee": "Alice",
          "startDate": "2026-05-01", "endDate": "2026-05-05",
          "status": "Completed", "notes": "" }
      ]
    }
  ]
}
```

## Deploying the worker

1. Open the master sheet → Extensions → Apps Script.
2. Paste `scripts/sheets-worker.gs`. Confirm `MASTER_SHEET_ID` matches the sheet and
   `SCRIPT_SECRET` matches `GOOGLE_SHEETS_SECRET`.
3. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**.
4. Copy the `/exec` URL into `GOOGLE_SHEETS_URL` (local `.env.local` and Vercel).
5. **Redeploy** (new version) whenever `sheets-worker.gs` changes — Apps Script
   serves the last deployed version, not the latest saved code.
