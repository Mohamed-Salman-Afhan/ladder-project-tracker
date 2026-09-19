# Web Project Lifecycle in the tracker

Each project now carries a **lifecycle** (jsonb column `projects.lifecycle`) on top of the
existing build tasks (Questionnaire → Kickoff → UI/UX → Development).

- **Phase** (0–10): Sales Handover, Onboarding, Discovery, UX/UI Design, Build, QA, Launch,
  Hypercare, Care Plan, Offboarding, Closed. Changing phase logs a gate with today's date;
  paste the approval email/doc link into the gate log.
- **Health** (computed, never stored): On track / Needs attention / At risk.
  Rules live in `src/lib/lifecycle.js` → `computeHealth()`:
  - At risk: phase >14 days over target, a task >14 days late, hours >100% of budget,
    an open Critical security issue, a renewal expired or due within 14 days,
    hypercare >30 days with no care plan.
  - Needs attention: phase over target, a late task, next action overdue, waiting on the
    client >7 days, hours ≥80% of budget, open High security issues, a renewal due within
    30 days, a live site with no security audit in 45 days.
- **Renewals**: domain, hosting, SSL, premium licence, contract — shown on the dashboard for
  the next 60 days.
- **Security**: last audit date, score, open Critical/High from the monthly read-only audit.

Process reference: "Ladder Global — Web Project Lifecycle" doc.

## Deploy order

1. Apply the migration: `supabase db push` (adds `lifecycle`, idempotent).
2. Deploy the app. If step 1 is skipped the app still saves everything else and keeps
   lifecycle data in the browser only (console warning).
3. Paste `scripts/sheets-worker.gs` into Apps Script and deploy a new version to get the
   new Tracker columns (Phase, Health, Platform, Owner, Next Action, Due, Next Renewal,
   Care Plan, Security Score).
