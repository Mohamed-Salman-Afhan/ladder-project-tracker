/* ─── Web Project Lifecycle ────────────────────────────────────────
   Project-level lifecycle phase, health rules and renewal tracking.
   Mirrors the "Ladder Global — Web Project Lifecycle" process doc.

   The build tasks (Questionnaire → Kickoff → UI/UX → Development) stay as
   they are; the lifecycle PHASE sits above them and covers the whole client
   journey from sales handover to offboarding. Stored in the `lifecycle`
   jsonb column (see supabase/migrations/20260919000000_add_lifecycle.sql). */

export const PHASES = [
  { key: "handover",    label: "Sales Handover", targetDays: 1 },
  { key: "onboarding",  label: "Onboarding",     targetDays: 14 },
  { key: "discovery",   label: "Discovery",      targetDays: 7 },
  { key: "uxui",        label: "UX/UI Design",   targetDays: 21 },
  { key: "build",       label: "Build",          targetDays: 28 },
  { key: "qa",          label: "QA",             targetDays: 5 },
  { key: "launch",      label: "Launch",         targetDays: 1 },
  { key: "hypercare",   label: "Hypercare",      targetDays: 30 },
  { key: "care",        label: "Care Plan",      targetDays: null }, // ongoing
  { key: "offboarding", label: "Offboarding",    targetDays: 7 },
  { key: "closed",      label: "Closed",         targetDays: null },
];
export const PHASE_BY_KEY = Object.fromEntries(PHASES.map((p) => [p.key, p]));

export const PLATFORMS = [
  "WordPress – Elementor",
  "WordPress – WPBakery",
  "WordPress – Beaver Builder",
  "WordPress – Other",
  "Shopify",
  "Squarespace",
  "Webflow",
  "Framer",
  "Astro",
  "Custom – React/Next.js",
  "Custom – PHP",
  "Custom – Other",
  "Email – Mailchimp",
  "Email – Klaviyo",
];

export const RENEWAL_ITEMS = ["Domain", "Hosting", "SSL", "Premium licence", "Care plan contract", "Other"];

export const HEALTH = {
  Green: { label: "On track",        bg: "#22c55e22", color: "#4ade80", dot: "#22c55e", rank: 0 },
  Amber: { label: "Needs attention", bg: "#f59e0b22", color: "#fbbf24", dot: "#f59e0b", rank: 1 },
  Red:   { label: "At risk",         bg: "#ef444422", color: "#f87171", dot: "#ef4444", rank: 2 },
};

export const mkLifecycle = () => ({
  phase: "handover",
  phaseSince: todayISO(),
  account: "",        // who is billed: "Bear", "Shane Young", "Sprint Integration", "Direct"…
  retainerHours: "",  // monthly retainer hours, if any
  platform: "",
  hosting: "",
  owner: "",
  nextAction: "",
  nextActionDue: "",
  lastClientContact: "",
  waitingOnClient: false,
  budgetHours: "",
  usedHours: "",
  carePlan: false,
  renewals: [],
  security: { lastAudit: "", score: "", critical: 0, high: 0 },
  gates: [],
});

/* Fill in any missing keys (older rows, partial objects) without dropping data. */
export const normalizeLifecycle = (lc) => {
  const base = mkLifecycle();
  const src = lc && typeof lc === "object" ? lc : {};
  return {
    ...base,
    ...src,
    phaseSince: src.phaseSince || "",
    renewals: Array.isArray(src.renewals) ? src.renewals : [],
    gates: Array.isArray(src.gates) ? src.gates : [],
    security: { ...base.security, ...(src.security || {}) },
  };
};

export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

const parse = (s) => {
  if (!s) return null;
  const d = new Date(s + (String(s).length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
};
/* Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);

/* Next renewal (soonest date, including already-expired ones). */
export const nextRenewal = (lc, now = new Date()) => {
  const list = (lc?.renewals || [])
    .map((r) => ({ ...r, d: parse(r.date) }))
    .filter((r) => r.d)
    .sort((a, b) => a.d - b.d);
  if (!list.length) return null;
  const r = list[0];
  return { item: r.item || "Renewal", date: r.date, days: daysBetween(startOfDay(now), r.d) };
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/* Health rules — see "Tracking and monitoring" in the lifecycle doc.
   Returns { level: "Green"|"Amber"|"Red", reasons: string[] }. */
export function computeHealth(project, now = new Date()) {
  const lc = normalizeLifecycle(project?.lifecycle);
  const today = startOfDay(now);
  const red = [];
  const amber = [];

  if (lc.phase === "closed" || project?.isActive === false) return { level: "Green", reasons: [] };

  // Phase running over its target length
  const phase = PHASE_BY_KEY[lc.phase];
  const since = parse(lc.phaseSince);
  if (phase?.targetDays && since) {
    const over = daysBetween(since, today) - phase.targetDays;
    if (over > 14) red.push(`${phase.label} is ${over} days over target`);
    else if (over > 0) amber.push(`${phase.label} is ${over} day${over === 1 ? "" : "s"} over target`);
  }

  // Build tasks past their end date and not completed
  const lateTasks = (project?.tasks || []).filter((t) => {
    if (t.isActive === false || t.status === "Completed" || !t.endDate) return false;
    const e = parse(t.endDate);
    return e && e < today;
  });
  lateTasks.forEach((t) => {
    const late = daysBetween(parse(t.endDate), today);
    (late > 14 ? red : amber).push(`"${t.name}" is ${late} day${late === 1 ? "" : "s"} late`);
  });

  // Next action overdue
  const due = parse(lc.nextActionDue);
  if (due && due < today) amber.push(`Next action overdue${lc.nextAction ? `: ${lc.nextAction}` : ""}`);

  // Waiting on client for more than 5 working days (~7 calendar days)
  const contact = parse(lc.lastClientContact);
  if (lc.waitingOnClient && contact) {
    const silent = daysBetween(contact, today);
    if (silent > 7) amber.push(`No client reply for ${silent} days`);
  }

  // Budget
  const b = Number(lc.budgetHours), u = Number(lc.usedHours);
  if (b > 0 && u >= 0 && lc.usedHours !== "") {
    const pct = Math.round((u / b) * 100);
    if (pct > 100) red.push(`Hours at ${pct}% of budget`);
    else if (pct >= 80) amber.push(`Hours at ${pct}% of budget`);
  }

  // Security
  const crit = Number(lc.security.critical) || 0, high = Number(lc.security.high) || 0;
  if (crit > 0) red.push(`${crit} open Critical security issue${crit === 1 ? "" : "s"}`);
  if (high > 0) amber.push(`${high} open High security issue${high === 1 ? "" : "s"}`);
  const lastAudit = parse(lc.security.lastAudit);
  const liveSite = ["launch", "hypercare", "care"].includes(lc.phase);
  if (liveSite && (!lastAudit || daysBetween(lastAudit, today) > 45)) amber.push("Security audit overdue (over 45 days)");

  // Renewals
  (lc.renewals || []).forEach((r) => {
    const d = parse(r.date);
    if (!d) return;
    const left = daysBetween(today, d);
    const name = r.item || "Renewal";
    if (left < 0) red.push(`${name} expired ${-left} day${left === -1 ? "" : "s"} ago`);
    else if (left <= 14) red.push(`${name} renews in ${left} day${left === 1 ? "" : "s"}`);
    else if (left <= 30) amber.push(`${name} renews in ${left} days`);
  });

  // Hypercare must end in a care plan or offboarding
  if (lc.phase === "hypercare" && since && daysBetween(since, today) > 30 && !lc.carePlan) {
    red.push("Hypercare over 30 days with no care plan or offboarding");
  }

  if (red.length) return { level: "Red", reasons: [...red, ...amber] };
  if (amber.length) return { level: "Amber", reasons: amber };
  return { level: "Green", reasons: [] };
}
