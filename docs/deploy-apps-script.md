Apps Script deployment and grouping notes

1) Deploying `scripts/sheets-worker.gs` as a Web App

- Open Google Apps Script editor, create a new project, paste the contents of `scripts/sheets-worker.gs`.
- Set `MASTER_SHEET_ID` constant to your Google Spreadsheet ID.
- Deploy -> New deployment -> select "Web app".
  - Execute as: Me
  - Who has access: Anyone with the link (or restrict to org)
- Copy the Web App URL and set `GOOGLE_SHEETS_URL` in your `.env` or hosting environment.
- Keep `SCRIPT_SECRET` matching `GOOGLE_SHEETS_SECRET` in your server env.

2) Enabling row grouping (optional, advanced)

Apps Script `SpreadsheetApp` supports grouping via `sheet.getRange(...).shiftRowGroupDepth(1)` but reliable control is better via the Sheets REST API `spreadsheets.batchUpdate`. To use the Sheets REST API from Apps Script you must enable the Advanced Sheets service (Resources -> Advanced Google services -> Sheets API), and then use `Sheets.Spreadsheets.batchUpdate`.

Example `batchUpdate` request to create a row group around rows 5..8 (0-indexed ranges):

{
  "requests": [
    {
      "addDimensionGroup": {
        "range": {
          "sheetId": YOUR_SHEET_ID,
          "dimension": "ROWS",
          "startIndex": 4,
          "endIndex": 8
        }
      }
    }
  ]
}

To collapse by default, follow with `updateDimensionProperties` setting `hiddenByUser: true` for the same range.

3) Using a service account or OAuth for server-to-sheets operations

- If your server needs to call the Sheets REST API directly (for grouping or batch operations), use a Google service account with domain-wide delegation OR implement an OAuth flow. Add the service account as an editor to the target spreadsheet.
- For simple per-project writes, the Web App approach (Apps Script `doPost`) is easiest.

4) Security notes

- Keep `GOOGLE_SHEETS_SECRET` private; validate it in `doPost` as implemented.
- If the web app is public, ensure the secret is checked and rotate it if leaked.

5) Testing locally

- Deploy a test Web App and set `GOOGLE_SHEETS_URL` to the test URL.
- Run `node scripts/migrate-to-tabs.js --spreadsheetId=SPREADSHEET_ID --sourceSheet="Legacy Timeline" --projectCol="Project ID" --projectNameCol="Project Name"` to migrate.

6) Rollback

- The migration script writes into new per-project sheets and updates `__projects_index`. Keep a backup by making a copy of the spreadsheet before running the migration.
