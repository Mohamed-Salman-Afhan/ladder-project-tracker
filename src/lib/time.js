/* ─── Time tracking ─────────────────────────────────────────────────
   Hours logged per website, grouped by account (the client who is billed:
   e.g. "Bear" for Tara & Tom's sites, "Shane Young", "Sprint Integration",
   or "Direct" for Ladder's own clients). Month-end reports are built from
   here. Stored in `public.time_entries`
   (supabase/migrations/20260920000000_add_time_entries.sql). */

import { normalizeLifecycle, todayISO } from "./lifecycle";

export const CATEGORIES = [
  "Change request",
  "Maintenance",
  "Security",
  "CRO",
  "SEO",
  "UI/UX Design",
  "Development",
  "Content",
  "Email marketing",
  "Paid ads",
  "Audit/Report",
  "Meeting/Admin",
];

export const DEFAULT_ACCOUNT = "Direct";

export const monthOf = (iso) => (iso || "").slice(0, 7); // "2026-09"
export const currentMonth = () => monthOf(todayISO());
export const monthLabel = (ym) => {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym || "";
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
};
export const monthRange = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const mkEntry = (over = {}) => ({
  id: crypto.randomUUID(),
  projectId: null,
  projectName: "",
  account: DEFAULT_ACCOUNT,
  workDate: todayISO(),
  task: "",
  category: "Change request",
  hours: "",
  person: "",
  ...over,
});

/* Validation — returns an error message or "" */
export const validateEntry = (e) => {
  if (!e.projectName?.trim()) return "Choose or type a website/project.";
  if (!e.task?.trim()) return "Describe the task.";
  const h = Number(e.hours);
  if (!(h > 0) || h > 24) return "Hours must be between 0.25 and 24.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.workDate || "")) return "Pick a valid date.";
  return "";
};

/* Account + monthly retainer for a project (both live in lifecycle jsonb). */
export const accountOf = (p) => normalizeLifecycle(p?.lifecycle).account || DEFAULT_ACCOUNT;
export const retainerOf = (p) => {
  const r = Number(normalizeLifecycle(p?.lifecycle).retainerHours);
  return r > 0 ? r : 0;
};

/* Group entries for a month: account → site → entries, with totals and
   retainer usage. `projects` supplies retainers and accounts for linked sites. */
export function groupMonth(entries, projects = [], ym = currentMonth()) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const byName = new Map(projects.map((p) => [(p.projectName || "").toLowerCase(), p]));
  const accounts = new Map();

  const ensureSite = (account, name, project) => {
    if (!accounts.has(account)) accounts.set(account, { account, total: 0, sites: new Map() });
    const acc = accounts.get(account);
    if (!acc.sites.has(name)) {
      acc.sites.set(name, { name, project: project || null, retainer: project ? retainerOf(project) : 0, total: 0, entries: [] });
    }
    return acc.sites.get(name);
  };

  // Retainer sites always appear, even with 0 hours logged, so unused hours are visible.
  projects
    .filter((p) => p.isActive !== false && retainerOf(p) > 0)
    .forEach((p) => ensureSite(accountOf(p), p.projectName, p));

  entries
    .filter((e) => monthOf(e.workDate) === ym)
    .forEach((e) => {
      const project = (e.projectId && byId.get(e.projectId)) || byName.get((e.projectName || "").toLowerCase()) || null;
      const account = e.account || (project ? accountOf(project) : DEFAULT_ACCOUNT);
      const site = ensureSite(account, project ? project.projectName : e.projectName, project);
      site.entries.push(e);
      site.total = round2(site.total + Number(e.hours || 0));
      accounts.get(account).total = round2(accounts.get(account).total + Number(e.hours || 0));
    });

  return [...accounts.values()]
    .map((a) => ({
      ...a,
      sites: [...a.sites.values()]
        .map((s) => ({
          ...s,
          entries: s.entries.sort((x, y) => (x.workDate < y.workDate ? -1 : x.workDate > y.workDate ? 1 : 0)),
          remaining: s.retainer ? round2(s.retainer - s.total) : null,
        }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .sort((x, y) => x.account.localeCompare(y.account));
}

/* DB mapping */
export const entryToDb = (e) => ({
  id: e.id,
  project_id: e.projectId || null,
  project_name: e.projectName.trim(),
  account: (e.account || DEFAULT_ACCOUNT).trim(),
  work_date: e.workDate,
  task: e.task.trim(),
  category: e.category || "Change request",
  hours: round2(e.hours),
  person: e.person || "",
});
export const entryFromDb = (r) => ({
  id: r.id,
  projectId: r.project_id,
  projectName: r.project_name,
  account: r.account || DEFAULT_ACCOUNT,
  workDate: r.work_date,
  task: r.task,
  category: r.category,
  hours: Number(r.hours),
  person: r.person || "",
});

/* Rows for the month-end report, laid out like the existing Google Sheets:
   a block per site ("Client: <site>"), Date / Task / Type / Time spent, a total
   row, then the retainer line when there is one. */
export function reportRows(group, ym) {
  const rows = [];
  rows.push([`${group.account} — hours for ${monthLabel(ym)}`, "", "", ""]);
  rows.push(["", "", "", ""]);
  group.sites.forEach((s) => {
    rows.push([`Client: ${s.name}`, "", "", ""]);
    rows.push(["Date", "Task", "Type", "Time spent (hours)"]);
    s.entries.forEach((e) => rows.push([e.workDate, e.task, e.category, round2(e.hours)]));
    rows.push(["", "", "Total", s.total]);
    if (s.retainer) rows.push(["", "", "Retainer / Remaining", `${s.retainer} / ${s.remaining}`]);
    rows.push(["", "", "", ""]);
  });
  rows.push(["", "", `${group.account} total`, group.total]);
  return rows;
}
