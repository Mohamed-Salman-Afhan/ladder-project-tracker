#!/usr/bin/env node
// migrate-to-tabs.js
// Usage:
//   node scripts/migrate-to-tabs.js --spreadsheetId=SPREADSHEET_ID --sourceSheet="Legacy Timeline" --projectCol="Project ID" --projectNameCol="Project Name"
// Requires: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Sheets API access.

import { google } from 'googleapis';
import slugify from 'slugify';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));

async function main() {
  const spreadsheetId = argv.spreadsheetId || process.env.MASTER_SHEET_ID;
  const sourceSheet = argv.sourceSheet; // optional
  const projectCol = argv.projectCol || argv.projectIdCol || 'project_id';
  const projectNameCol = argv.projectNameCol || 'project_name';
  if (!spreadsheetId) {
    console.error('Missing --spreadsheetId or MASTER_SHEET_ID env var');
    process.exit(2);
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let sheet = null;
  if (sourceSheet) {
    sheet = meta.data.sheets.find((s) => s.properties.title === sourceSheet);
    if (!sheet) {
      console.error('sourceSheet not found:', sourceSheet);
      process.exit(2);
    }
  } else {
    // pick the sheet with the largest column count
    sheet = meta.data.sheets.reduce((a, b) => (a.properties.gridProperties.columnCount > b.properties.gridProperties.columnCount ? a : b));
  }

  const sourceName = sheet.properties.title;
  console.log('Migrating from sheet:', sourceName);

  const valuesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sourceName}` });
  const values = valuesRes.data.values || [];
  if (values.length === 0) {
    console.error('No data found in source sheet.');
    process.exit(1);
  }

  const headers = values[0].map((h) => (h || '').toString().trim());
  const projectIdIndex = headers.findIndex((h) => h.toLowerCase() === projectCol.toLowerCase());
  const projectNameIndex = headers.findIndex((h) => h.toLowerCase() === projectNameCol.toLowerCase());
  if (projectIdIndex === -1) {
    console.error('Project ID column not found. Pass --projectCol header name. Available headers:', headers.join(', '));
    process.exit(2);
  }

  const rows = values.slice(1);
  const groups = {};
  rows.forEach((r) => {
    const pid = (r[projectIdIndex] || '').toString().trim() || '__unknown__';
    const pname = (r[projectNameIndex] || pid).toString().trim();
    if (!groups[pid]) groups[pid] = { name: pname, rows: [] };
    groups[pid].rows.push(r);
  });

  console.log('Found', Object.keys(groups).length, 'projects to migrate.');

  for (const [pid, g] of Object.entries(groups)) {
    const sheetName = `Project — ${slugify(g.name || pid, { lower: false, strict: true }).substring(0, 80)}`;
    console.log('Creating/updating sheet:', sheetName, 'rows:', g.rows.length);

    // create sheet if not exists
    const exists = meta.data.sheets.find((s) => s.properties.title === sheetName);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      // refresh meta
      meta.data = (await sheets.spreadsheets.get({ spreadsheetId })).data;
    }

    // prepare AOA: headers + rows
    const aoa = [headers, ...g.rows];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: aoa },
    });

    // update __projects_index
    await upsertIndexRow(sheets, spreadsheetId, pid, sheetName, g.name || '', '__migrated__');
  }

  console.log('Migration completed.');
}

async function upsertIndexRow(sheets, spreadsheetId, projectId, sheetName, projectName, status) {
  const idxName = '__projects_index';
  // ensure index exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const idxSheet = meta.data.sheets.find((s) => s.properties.title === idxName);
  if (!idxSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: idxName } } },
        ],
      },
    });
  }

  const cur = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${idxName}!A1:G1000` });
  const values = cur.data.values || [];
  const header = ['project_id','sheet_name','project_name','client','last_synced_iso','sync_status','migrated_version'];
  if (values.length === 0) {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${idxName}!A1`, valueInputOption: 'RAW', requestBody: { values: [header] } });
  }

  // find row
  const all = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${idxName}!A1:G1000` })).data.values || [];
  let found = -1;
  for (let i = 1; i < all.length; i++) {
    if (all[i][0] === projectId) { found = i; break; }
  }
  const iso = new Date().toISOString();
  const row = [projectId, sheetName, projectName, '', iso, status || 'ok', 'v1'];
  if (found >= 0) {
    const rowIndex = found + 1;
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${idxName}!A${rowIndex}:G${rowIndex}`, valueInputOption: 'RAW', requestBody: { values: [row] } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${idxName}!A1:G1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
