# Hours (time tracking)

Log hours per website; the tracker groups them by **account** (who is billed:
Bear, Shane Young, Sprint Integration, Direct…) for month-end reports.

- **Hours tab → Log hours**: website, account (auto-filled from the project), date,
  task, hours, type (Change request, Maintenance, Security, CRO, SEO, …), person.
- **Retainers**: set "Retainer h / month" on a project (Lifecycle & Health). The Hours
  tab shows hours left or hours over for the month, and lists retainer sites even
  when nothing is logged yet.
- **Month report**: pick the month and account, then "Download month report" → XLSX,
  one sheet per account, one block per website (Date · Task · Type · Hours), totals and
  retainer usage — same layout as the old Google Sheets timesheets.
- Data: `public.time_entries` (migration `20260920000000_add_time_entries.sql`).
  `project_name` is stored as a snapshot so history survives renames or deletes.
