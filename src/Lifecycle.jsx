import { useMemo } from "react";
import i18n from "./i18n";
import {
  PHASES, PHASE_BY_KEY, PLATFORMS, RENEWAL_ITEMS, HEALTH,
  normalizeLifecycle, computeHealth, nextRenewal, todayISO,
} from "./lib/lifecycle";

/* Palette mirrors App.jsx so the new sections sit in the same system. */
const BRAND = "#FF5050";
const SURFACE = "#0f0d0d";
const SURFACE2 = "#171414";
const BORDER = "#292424";
const BORDER2 = "#3d3535";
const TEXT = "#f5f0f0";
const TEXT2 = "#a39999";
const TEXT3 = "#756b6b";
const TEXT_ACCENT = "#ffffff";

/* Health — always shows a text label, never colour alone (WCAG). */
export function HealthBadge({ project, small, withReasons }) {
  const h = computeHealth(project);
  const s = HEALTH[h.level];
  return (
    <span
      data-testid={`health-${project.id}`}
      data-health={h.level}
      title={h.reasons.join("\n") || s.label}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.dot}33`, borderRadius: 20, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 600, whiteSpace: "nowrap" }}
    >
      <span style={{ width: small ? 6 : 7, height: small ? 6 : 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {s.label}
      {withReasons && h.reasons.length > 0 && <span style={{ color: TEXT2, fontWeight: 500 }}>· {h.reasons[0]}</span>}
    </span>
  );
}

export function PhaseBadge({ project, small }) {
  const lc = normalizeLifecycle(project.lifecycle);
  const ph = PHASE_BY_KEY[lc.phase] || PHASES[0];
  const idx = PHASES.findIndex((p) => p.key === ph.key);
  if (!project.lifecycle?.phase) {
    return <span data-testid={`phase-${project.id}`} style={{ display: "inline-flex", alignItems: "center", border: `1px dashed ${BORDER2}`, borderRadius: 20, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 600, color: TEXT3, whiteSpace: "nowrap" }}>Phase not set</span>;
  }
  return (
    <span data-testid={`phase-${project.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${BORDER2}`, borderRadius: 20, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 600, color: TEXT2, whiteSpace: "nowrap" }}>
      <span style={{ color: BRAND, fontWeight: 800 }}>{idx}</span>{ph.label}
    </span>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: TEXT3, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 };

/* Editor rendered inside the Project modal. `value` is the lifecycle object,
   `onChange` receives the full updated object. */
export function LifecycleEditor({ value, onChange, team = [], isMobile, accounts = [] }) {
  const lc = normalizeLifecycle(value);
  const set = (k, v) => onChange({ ...lc, [k]: v });
  const setSec = (k, v) => onChange({ ...lc, security: { ...lc.security, [k]: v } });

  const inp = { border: `1.5px solid ${BORDER2}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none", color: TEXT, padding: "9px 12px", width: "100%", background: SURFACE2 };
  const sinp = { ...inp, padding: "7px 10px", borderRadius: 7, fontSize: 13 };
  const grid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 };

  const changePhase = (key) => {
    if (key === lc.phase && value?.phase) return;
    // Log the gate (leaving the current phase today). Skip it when the phase
    // is being set for the first time on an older project.
    const gates = value?.phase ? [...lc.gates, { from: lc.phase, to: key, date: todayISO(), link: "" }] : lc.gates;
    onChange({ ...lc, phase: key, phaseSince: todayISO(), gates });
  };

  const setRenewal = (i, k, v) => set("renewals", lc.renewals.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRenewal = () => set("renewals", [...lc.renewals, { item: "Domain", date: "", note: "" }]);
  const removeRenewal = (i) => set("renewals", lc.renewals.filter((_, j) => j !== i));
  const setGateLink = (i, v) => set("gates", lc.gates.map((g, j) => (j === i ? { ...g, link: v } : g)));

  const preview = useMemo(() => computeHealth({ lifecycle: lc, tasks: [] }), [lc]);
  const ps = HEALTH[preview.level];

  return (
    <div data-testid="lifecycle-editor" style={{ gridColumn: isMobile ? "span 1" : "span 2", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: "grid", gap: 14, background: SURFACE }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14, color: TEXT }}>{i18n.t("Lifecycle & Health")}</h3>
        <span style={{ fontSize: 12, color: ps.color, fontWeight: 700 }}>{ps.label}{preview.reasons[0] ? ` · ${preview.reasons[0]}` : ""}</span>
      </div>

      <div style={grid}>
        <div>
          <label style={lbl}>{i18n.t("Phase")}</label>
          <select data-testid="input-phase" value={lc.phase} onChange={(e) => changePhase(e.target.value)} style={inp}>
            {PHASES.map((p, i) => <option key={p.key} value={p.key}>{i} · {p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{i18n.t("In phase since")}</label>
          <input data-testid="input-phaseSince" type="date" value={lc.phaseSince} onChange={(e) => set("phaseSince", e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{i18n.t("Owner")}</label>
          <select data-testid="input-owner" value={lc.owner} onChange={(e) => set("owner", e.target.value)} style={inp}>
            <option value="">—</option>
            {team.filter((m) => m.is_active !== false).map((m) => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{i18n.t("Platform")}</label>
          <select data-testid="input-platform" value={lc.platform} onChange={(e) => set("platform", e.target.value)} style={inp}>
            <option value="">—</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{i18n.t("Account (billed to)")}</label>
          <input data-testid="input-account" list="lc-accounts" value={lc.account} placeholder="e.g. Bear, Direct" onChange={(e) => set("account", e.target.value)} style={inp} />
          <datalist id="lc-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
        <div>
          <label style={lbl}>{i18n.t("Retainer h / month")}</label>
          <input data-testid="input-retainerHours" type="number" min="0" step="0.5" value={lc.retainerHours} placeholder="0 = no retainer" onChange={(e) => set("retainerHours", e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{i18n.t("Hosting")}</label>
          <input data-testid="input-hosting" value={lc.hosting} placeholder="e.g. SiteGround" onChange={(e) => set("hosting", e.target.value)} style={inp} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TEXT2, cursor: "pointer", paddingBottom: 10 }}>
            <input data-testid="input-carePlan" type="checkbox" checked={!!lc.carePlan} onChange={(e) => set("carePlan", e.target.checked)} />
            {i18n.t("On a monthly care plan")}
          </label>
        </div>
      </div>

      <div style={grid}>
        <div style={{ gridColumn: isMobile ? undefined : "span 2" }}>
          <label style={lbl}>{i18n.t("Next action")}</label>
          <input data-testid="input-nextAction" value={lc.nextAction} placeholder="e.g. Send staging link to client" onChange={(e) => set("nextAction", e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{i18n.t("Due")}</label>
          <input data-testid="input-nextActionDue" type="date" value={lc.nextActionDue} onChange={(e) => set("nextActionDue", e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{i18n.t("Last client contact")}</label>
          <input data-testid="input-lastClientContact" type="date" value={lc.lastClientContact} onChange={(e) => set("lastClientContact", e.target.value)} style={inp} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TEXT2, cursor: "pointer", paddingBottom: 10 }}>
            <input data-testid="input-waitingOnClient" type="checkbox" checked={!!lc.waitingOnClient} onChange={(e) => set("waitingOnClient", e.target.checked)} />
            {i18n.t("Waiting on client")}
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={lbl}>{i18n.t("Budget h")}</label>
            <input data-testid="input-budgetHours" type="number" min="0" value={lc.budgetHours} onChange={(e) => set("budgetHours", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>{i18n.t("Used h")}</label>
            <input data-testid="input-usedHours" type="number" min="0" value={lc.usedHours} onChange={(e) => set("usedHours", e.target.value)} style={inp} />
          </div>
        </div>
      </div>

      <div>
        <label style={lbl}>{i18n.t("Security (from the monthly read-only audit)")}</label>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 8 }}>
          {[
            ["lastAudit", "Last audit", { type: "date" }],
            ["score", "Score %", {}],
            ["critical", "Open Critical", { type: "number", min: "0" }],
            ["high", "Open High", { type: "number", min: "0" }],
          ].map(([k, cap, extra]) => (
            <label key={k} style={{ display: "grid", gap: 3, fontSize: 11, color: TEXT3 }}>
              {cap}
              <input data-testid={`input-sec-${k}`} aria-label={cap} {...extra} value={lc.security[k]} onChange={(e) => setSec(k, e.target.value)} style={sinp} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>{i18n.t("Renewals")}</label>
          <button data-testid="btn-add-renewal" onClick={addRenewal} style={{ background: "transparent", color: BRAND, border: `1px solid ${BRAND}55`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ {i18n.t("Add renewal")}</button>
        </div>
        {lc.renewals.length === 0 && <div style={{ fontSize: 12, color: TEXT3 }}>{i18n.t("Add domain, hosting, SSL and licence expiry dates.")}</div>}
        {lc.renewals.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr auto" : "1fr 1fr 2fr auto", gap: 8, marginBottom: 6 }}>
            <select data-testid={`renewal-item-${i}`} value={r.item} onChange={(e) => setRenewal(i, "item", e.target.value)} style={sinp}>
              {RENEWAL_ITEMS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <input data-testid={`renewal-date-${i}`} type="date" value={r.date} onChange={(e) => setRenewal(i, "date", e.target.value)} style={sinp} />
            {!isMobile && <input placeholder="Note (provider, who pays)" value={r.note || ""} onChange={(e) => setRenewal(i, "note", e.target.value)} style={sinp} />}
            <button aria-label="Remove renewal" onClick={() => removeRenewal(i)} style={{ background: "transparent", border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT3, cursor: "pointer", padding: "0 10px" }}>×</button>
          </div>
        ))}
      </div>

      {lc.gates.length > 0 && (
        <div>
          <label style={lbl}>{i18n.t("Gate log (paste the approval email or doc link)")}</label>
          {lc.gates.slice().reverse().map((g, ri) => {
            const i = lc.gates.length - 1 - ri;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 12, color: TEXT2 }}>
                <span>{g.date} · {PHASE_BY_KEY[g.from]?.label || g.from} → {PHASE_BY_KEY[g.to]?.label || g.to}</span>
                <input placeholder="Approval link" value={g.link || ""} onChange={(e) => setGateLink(i, e.target.value)} style={sinp} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Dashboard: projects needing attention (Red first), with the reasons. */
export function AttentionPanel({ projects, onOpen }) {
  const rows = useMemo(() => projects
    .filter((p) => p.isActive !== false)
    .map((p) => ({ p, h: computeHealth(p) }))
    .filter((x) => x.h.level !== "Green")
    .sort((a, b) => HEALTH[b.h.level].rank - HEALTH[a.h.level].rank || a.p.projectName.localeCompare(b.p.projectName)), [projects]);

  return (
    <div data-testid="attention-panel" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>{i18n.t("Needs attention")} <span style={{ color: TEXT3, fontWeight: 600, fontSize: 13 }}>({rows.length})</span></h2>
      {rows.length === 0 && <div style={{ color: TEXT3, fontSize: 13 }}>{i18n.t("All active projects are on track.")}</div>}
      {rows.map(({ p, h }) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: `1px solid ${BORDER}`, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <button onClick={() => onOpen?.(p)} style={{ background: "none", border: "none", padding: 0, color: TEXT, fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left" }}>{p.projectName}</button>
            <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{h.reasons.slice(0, 3).join(" · ")}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <PhaseBadge project={p} small />
            <HealthBadge project={p} small />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Dashboard: renewals across all projects in the next 60 days (and overdue). */
export function RenewalsPanel({ projects }) {
  const rows = useMemo(() => {
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    projects.forEach((p) => normalizeLifecycle(p.lifecycle).renewals.forEach((r) => {
      if (!r.date) return;
      const d = new Date(r.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      const days = Math.round((d - today) / 86400000);
      if (days <= 60) out.push({ project: p.projectName, item: r.item, date: r.date, days, note: r.note || "" });
    }));
    return out.sort((a, b) => a.days - b.days);
  }, [projects]);

  return (
    <div data-testid="renewals-panel" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>{i18n.t("Renewals — next 60 days")}</h2>
      {rows.length === 0 && <div style={{ color: TEXT3, fontSize: 13 }}>{i18n.t("Nothing due. Add renewal dates in each project.")}</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
            <thead>
              <tr>{["Project", "Item", "Date", "Days left"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: TEXT3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "8px", color: TEXT }}>{r.project}</td>
                  <td style={{ padding: "8px", color: TEXT2 }}>{r.item}{r.note ? ` · ${r.note}` : ""}</td>
                  <td style={{ padding: "8px", color: TEXT2 }}>{r.date}</td>
                  <td style={{ padding: "8px", fontWeight: 700, color: r.days < 0 || r.days <= 14 ? "#f87171" : r.days <= 30 ? "#fbbf24" : TEXT2 }}>
                    {r.days < 0 ? `Expired ${-r.days}d ago` : `${r.days}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Flat summary used by the Sheets sync payload. */
export const lifecycleSummary = (p) => {
  const lc = normalizeLifecycle(p.lifecycle);
  const h = computeHealth(p);
  const nr = nextRenewal(lc);
  return {
    phase: PHASE_BY_KEY[lc.phase]?.label || "",
    health: h.level,
    healthReasons: h.reasons.join("; "),
    platform: lc.platform,
    owner: lc.owner,
    nextAction: lc.nextAction,
    nextActionDue: lc.nextActionDue,
    nextRenewal: nr ? `${nr.item} ${nr.date}` : "",
    carePlan: lc.carePlan ? "Yes" : "No",
    securityScore: lc.security.score || "",
  };
};
