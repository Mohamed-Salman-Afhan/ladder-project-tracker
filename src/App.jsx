import { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase, toDb, fromDb } from "./lib/supabase";

/* ─── Constants ─────────────────────────────────────────────── */
const BRAND = "#FF5050";
const BRAND_DARK = "#cc3333";
const NAVY = "#0f1b2d";
const STAGES = ["Questionnaire", "Kickoff Meeting", "UI/UX Design", "Development"];
const STATUSES = ["Not Started", "In Progress", "Completed", "On Hold"];
const STATUS_STYLE = {
  "Not Started": { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
  "In Progress":  { bg: "#eff6ff", color: "#2563eb", dot: "#3b82f6" },
  "Completed":    { bg: "#f0fdf4", color: "#16a34a", dot: "#22c55e" },
  "On Hold":      { bg: "#fffbeb", color: "#d97706", dot: "#f59e0b" },
};
const INIT_TEAM = ["Pasindu", "Shamam", "Salman", "Janith"];
const SHEETS_DEFAULTS = {
  url: "https://script.google.com/macros/s/AKfycbzuPa5HwBMz84G4WbOudvA0Yw0R9zKIiziRRz2LDS-KQZVB7-FTJGYbBFd331ZNVI98HA/exec",
  secret: "lg-web-project-tracker-2026",
};
const SHEET_VIEW_URL = "https://docs.google.com/spreadsheets/d/1bgvc5kE8ELx_xg9APYfsHIY1_9bh7zl34lPJ-K-uQvM/edit";

const mkStage = (n) => ({ name: n, assignee: "", startDate: "", endDate: "", status: "Not Started", notes: "" });
const mkProject = () => ({ id: crypto.randomUUID(), projectName: "", clientName: "", website: "", status: "Not Started", stages: STAGES.map(mkStage) });
const stagePct = (s) => Math.round(s.filter((x) => x.status === "Completed").length / s.length * 100);


/* ─── Responsive hook ───────────────────────────────────────── */
function useBreakpoint() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: w < 640, isTablet: w < 1024, width: w };
}

/* ─── Badge ─────────────────────────────────────────────────── */
const Badge = ({ status, small }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Not Started"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.dot}33`, borderRadius: 20, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: small ? 6 : 7, height: small ? 6 : 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{status}
    </span>
  );
};

/* ─── Project Modal ─────────────────────────────────────────── */
function ProjectModal({ project, team, onSave, onClose }) {
  const { isMobile, isTablet } = useBreakpoint();
  const [form, setForm] = useState(project);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setStage = (i, k, v) => setForm((p) => ({ ...p, stages: p.stages.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));
  const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none", color: NAVY, padding: "9px 12px", width: "100%", background: "#fff" };
  const sinp = { ...inp, padding: "7px 10px", borderRadius: 7, fontSize: 13 };

  return (
    <div data-testid="project-modal" style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 200, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}>
      <div style={{ background: "#fff", borderRadius: isMobile ? "16px 16px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : 800, maxHeight: isMobile ? "95vh" : "90vh", overflowY: "auto", boxShadow: "0 30px 70px #0004" }}>
        <div style={{ padding: isMobile ? "18px 20px" : "22px 28px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 22, background: BRAND, borderRadius: 4 }} />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: NAVY }}>{project.projectName ? "Edit Project" : "New Project"}</h2>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748b" }}>×</button>
        </div>
        <div style={{ padding: isMobile ? "18px 20px" : "24px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 22 }}>
            {[["projectName", "Project Name *"], ["clientName", "Client Name *"], ["website", "Website URL"]].map(([k, lbl]) => (
              <div key={k} style={{ gridColumn: !isMobile && k === "website" ? "span 2" : undefined }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</label>
                <input data-testid={`input-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} style={inp} />
              </div>
            ))}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Overall Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} style={{ ...inp, background: "#fff" }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: NAVY }}>Workflow Stages</h3>
            {form.stages.map((stage, i) => (
              <div key={i} style={{ background: "#f8fafc", borderRadius: 12, padding: isMobile ? 14 : 16, marginBottom: 10, border: "1px solid #e8ecf0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{stage.name}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 9 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#aab", marginBottom: 3, textTransform: "uppercase" }}>Assigned To</label>
                    <select value={stage.assignee} onChange={(e) => setStage(i, "assignee", e.target.value)} style={{ ...sinp, background: "#fff" }}>
                      <option value="">— Select —</option>
                      {team.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  {[["startDate", "Start Date"], ["endDate", "End Date"]].map(([k, lbl]) => (
                    <div key={k}>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#aab", marginBottom: 3, textTransform: "uppercase" }}>{lbl}</label>
                      <input type="date" value={stage[k]} onChange={(e) => setStage(i, k, e.target.value)} style={sinp} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#aab", marginBottom: 3, textTransform: "uppercase" }}>Status</label>
                    <select value={stage.status} onChange={(e) => setStage(i, "status", e.target.value)} style={{ ...sinp, background: "#fff" }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  </div>
                  <div style={{ gridColumn: isMobile ? "span 2" : "span 4" }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#aab", marginBottom: 3, textTransform: "uppercase" }}>Notes</label>
                    <input value={stage.notes} onChange={(e) => setStage(i, "notes", e.target.value)} placeholder="Optional notes…" style={sinp} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: isMobile ? "14px 20px" : "16px 28px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 10, position: "sticky", bottom: 0, background: "#fff" }}>
          <button data-testid="btn-cancel-modal" onClick={onClose} style={{ flex: isMobile ? 1 : undefined, padding: "9px 20px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#64748b" }}>Cancel</button>
          <button data-testid="btn-save" onClick={() => { if (!form.projectName || !form.clientName) { alert("Project Name and Client Name are required."); return; } onSave(form); }} style={{ flex: isMobile ? 1 : undefined, padding: "9px 24px", borderRadius: 8, border: "none", background: BRAND, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14 }}>Save Project</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Tab ──────────────────────────────────────────────── */
function TeamTab({ team, setTeam }) {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState("");
  const [eIdx, setEIdx] = useState(null);
  const [eVal, setEVal] = useState("");
  const add = () => { const n = name.trim(); if (!n) return; if (team.includes(n)) { alert("Already exists."); return; } setTeam((t) => [...t, n]); setName(""); };
  const save = (i) => { const v = eVal.trim(); if (!v) return; setTeam((t) => t.map((m, idx) => idx === i ? v : m)); setEIdx(null); };

  return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: NAVY }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#fff" }}>Team Members</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#aab8cc" }}>Names appear in assignee dropdowns across all projects.</p>
          </div>
          <div style={{ background: BRAND, color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 800 }}>{team.length} members</div>
        </div>
        <div style={{ padding: "14px 22px" }}>
          {team.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px 0", fontSize: 13 }}>No team members yet.</div>}
          {team.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #f8fafc" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{m[0].toUpperCase()}</div>
              {eIdx === i
                ? (<><input autoFocus value={eVal} onChange={(e) => setEVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(i); if (e.key === "Escape") setEIdx(null); }} style={{ flex: 1, padding: "7px 10px", border: `1.5px solid ${BRAND}`, borderRadius: 8, fontSize: 14, outline: "none", color: NAVY, minWidth: 0 }} />
                  <button onClick={() => save(i)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: BRAND, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>Save</button>
                  <button onClick={() => setEIdx(null)} style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>Cancel</button></>)
                : (<><span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: NAVY }}>{m}</span>
                  <button onClick={() => { setEIdx(i); setEVal(m); }} style={{ padding: "6px 14px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, color: BRAND }}>Edit</button>
                  <button onClick={() => { if (window.confirm(`Remove "${m}"?`)) setTeam((t) => t.filter((_, idx) => idx !== i)); }} style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid #fee2e2", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#ef4444" }}>Remove</button></>)}
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #f0f0f0", background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input data-testid="input-team-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Enter name and press Add…" style={{ flex: 1, padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", color: NAVY, background: "#fff", minWidth: 0 }} />
            <button data-testid="btn-add-team" onClick={add} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: BRAND, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Google Sheets Tab ─────────────────────────────────────── */
function SheetsTab({ sheetsCfg, setSheetsCfg, onTestSync, syncStatus }) {
  const { isMobile } = useBreakpoint();
  const [cfg, setCfg] = useState(sheetsCfg);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const canSave = cfg.url && cfg.secret;

  return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", background: NAVY, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#fff" }}>Google Sheets Sync</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#aab8cc" }}>Auto-syncs on every project save or delete.</p>
          </div>
          <a href={SHEET_VIEW_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", color: "#3ECF8E", textDecoration: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
            Open Google Sheet ↗
          </a>
        </div>

        {/* Auto-sync indicator */}
        <div style={{ padding: "10px 22px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
            Auto-sync active — sheet updates on every project add, edit, or delete.
          </span>
        </div>

        {/* Last sync result */}
        {syncStatus && (
          <div style={{ padding: "10px 22px", borderBottom: "1px solid #f0f0f0", background: syncStatus.ok ? "#f0fdf4" : "#fef2f2" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: syncStatus.ok ? "#16a34a" : "#ef4444" }}>
              {syncStatus.ok ? "✓ Last sync succeeded" : `✗ Last sync failed: ${syncStatus.msg}`}
            </span>
          </div>
        )}

        {/* Config */}
        <div style={{ padding: "20px 22px" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: NAVY, textTransform: "uppercase", letterSpacing: 0.4 }}>Apps Script Config</h3>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Secret Token</label>
              <input value={cfg.secret} onChange={(e) => set("secret", e.target.value)}
                style={{ width: "100%", padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", color: NAVY, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Web App URL</label>
              <input value={cfg.url} onChange={(e) => set("url", e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec"
                style={{ width: "100%", padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", color: NAVY, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSheetsCfg(cfg)} disabled={!canSave}
              style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: canSave ? NAVY : "#e2e8f0", color: canSave ? "#fff" : "#aaa", cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13 }}>
              Save Config
            </button>
            <button onClick={() => { setSheetsCfg(cfg); onTestSync(); }} disabled={!canSave}
              style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: canSave ? BRAND : "#e2e8f0", color: canSave ? "#fff" : "#aaa", cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13 }}>
              Test Sync Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main App ──────────────────────────────────────────────── */
export default function App() {
  const { isMobile, isTablet } = useBreakpoint();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ladder_team")) || INIT_TEAM; } catch { return INIT_TEAM; }
  });
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [sheetsCfg, setSheetsCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ladder_sheets_cfg")) || SHEETS_DEFAULTS; } catch { return SHEETS_DEFAULTS; }
  });
  const [syncStatus, setSyncStatus] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* Persist team to localStorage */
  useEffect(() => { localStorage.setItem("ladder_team", JSON.stringify(team)); }, [team]);

  /* Persist sheets config to localStorage */
  useEffect(() => { localStorage.setItem("ladder_sheets_cfg", JSON.stringify(sheetsCfg)); }, [sheetsCfg]);

  /* Load projects from Supabase (or localStorage fallback) */
  useEffect(() => {
    const load = async () => {
      if (supabase) {
        const { data, error } = await supabase.from("projects").select("*").order("created_at");
        if (!error && data) { setProjects(data.map(fromDb)); setLoading(false); return; }
      }
      // localStorage fallback
      try {
        const saved = JSON.parse(localStorage.getItem("ladder_projects"));
        setProjects(saved || []);
      } catch { setProjects(SAMPLE); }
      setLoading(false);
    };
    load();
  }, []);

  /* Persist projects to localStorage whenever they change */
  useEffect(() => {
    if (!loading) localStorage.setItem("ladder_projects", JSON.stringify(projects));
  }, [projects, loading]);

  /* Google Sheets sync */
  const syncSheets = useCallback(async (ps) => {
    if (!sheetsCfg.url || !sheetsCfg.secret) return;
    try {
      const payload = {
        url: sheetsCfg.url,
        secret: sheetsCfg.secret,
        projects: ps.map((p) => ({ ...p, progress: stagePct(p.stages) })),
      };
      const res = await fetch("/api/sync-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSyncStatus({ ok: data.ok, msg: data.error || "" });
    } catch (e) { setSyncStatus({ ok: false, msg: e.message }); }
  }, [sheetsCfg]);

  const onTestSync = () => syncSheets(projects);

  /* Save project */
  const saveProject = async (form) => {
    const exists = projects.find((p) => p.id === form.id);
    let next;
    if (supabase) {
      const { data, error } = await supabase.from("projects").upsert(toDb(form), { onConflict: "id" }).select().single();
      if (!error && data) {
        const saved = fromDb(data);
        next = exists ? projects.map((p) => p.id === saved.id ? saved : p) : [...projects, saved];
      } else {
        next = exists ? projects.map((p) => p.id === form.id ? form : p) : [...projects, form];
      }
    } else {
      next = exists ? projects.map((p) => p.id === form.id ? form : p) : [...projects, { ...form, id: crypto.randomUUID() }];
    }
    setProjects(next);
    setModal(null);
    syncSheets(next);
  };

  /* Delete project */
  const deleteProject = async (id) => {
    if (supabase) await supabase.from("projects").delete().eq("id", id);
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    syncSheets(next);
    setDelId(null);
  };

  /* Export helpers */
  const buildExportRows = () => {
    const hdr = ["Project", "Client", "Website", "Status", "Progress %",
      "Questionnaire Status", "Q Assignee", "Q Start", "Q End",
      "Kickoff Status", "KM Assignee", "KM Start", "KM End",
      "UI/UX Status", "UI Assignee", "UI Start", "UI End",
      "Dev Status", "Dev Assignee", "Dev Start", "Dev End", "Notes (Latest)"];
    const rows = projects.map((p) => {
      const s = p.stages;
      const latestNote = [...s].reverse().find((x) => x.notes)?.notes || "";
      return [p.projectName, p.clientName, p.website, p.status, stagePct(p.stages) + "%",
        s[0].status, s[0].assignee, s[0].startDate, s[0].endDate,
        s[1].status, s[1].assignee, s[1].startDate, s[1].endDate,
        s[2].status, s[2].assignee, s[2].startDate, s[2].endDate,
        s[3].status, s[3].assignee, s[3].startDate, s[3].endDate, latestNote];
    });
    return [hdr, ...rows];
  };

  const exportCSV = () => {
    const rows = buildExportRows();
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "ladder_projects.csv";
    a.click();
  };

  const exportXLSX = () => {
    const rows = buildExportRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [18, 16, 18, 14, 10, 14, 12, 10, 10, 14, 12, 10, 10, 12, 12, 10, 10, 12, 12, 10, 10, 30].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Project Tracker");
    XLSX.writeFile(wb, "ladder_projects.xlsx");
  };

  const stats = useMemo(() => ({
    total: projects.length,
    inProgress: projects.filter((p) => p.status === "In Progress").length,
    completed: projects.filter((p) => p.status === "Completed").length,
    notStarted: projects.filter((p) => p.status === "Not Started").length,
    onHold: projects.filter((p) => p.status === "On Hold").length,
  }), [projects]);

  const filtered = useMemo(() => projects.filter((p) => {
    const q = search.toLowerCase();
    return (!q || p.projectName.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q)) && (fStatus === "All" || p.status === fStatus);
  }), [projects, search, fStatus]);

  const TABS = [["dashboard", "Dashboard"], ["projects", "Projects"], ["team", "Team"], ["sheets", "Sheets"]];
  const CARDS = [
    { l: "Total", v: stats.total, c: BRAND, bg: "#fff0f0" },
    { l: "In Progress", v: stats.inProgress, c: "#2563eb", bg: "#eff6ff" },
    { l: "Completed", v: stats.completed, c: "#16a34a", bg: "#f0fdf4" },
    { l: "Not Started", v: stats.notStarted, c: "#94a3b8", bg: "#f8fafc" },
    { l: "On Hold", v: stats.onHold, c: "#d97706", bg: "#fffbeb" },
  ];

  const headerPad = isMobile ? "0 16px" : "0 28px";
  const contentPad = isMobile ? "16px" : isTablet ? "20px 24px" : "24px 28px";

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minHeight: "100vh", background: "#f4f6f9", color: NAVY }}>

      {/* ── Header ── */}
      <div style={{ background: NAVY, padding: headerPad, boxShadow: "0 2px 12px #0004" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: isMobile ? 56 : 62 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src="/logo.svg" alt="Ladder Global" style={{ height: isMobile ? 22 : 28}} onError={(e) => { e.target.style.display = "none"; }} />
              <div style={{ width: 1, height: 20, background: "#ffffff33" }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: "#fff", letterSpacing: 0.2 }}>Project Tracker</div>
                {!isMobile && <div style={{ fontSize: 10, color: "#aab8cc", marginTop: -1 }}>Ladder Labs · Internal Tool</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!isMobile && (
                <>
                  <button onClick={exportCSV} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#fff" }}>CSV</button>
                  <button onClick={exportXLSX} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#3ECF8E" }}>XLSX</button>
                </>
              )}
              <button data-testid="btn-new" onClick={() => setModal(mkProject())} style={{ padding: isMobile ? "7px 14px" : "7px 16px", borderRadius: 8, border: "none", background: BRAND, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 12 : 13 }}>+ New</button>
              {isMobile && (
                <button onClick={() => setMobileMenuOpen((o) => !o)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", color: "#fff", fontSize: 16, lineHeight: 1 }}>⋮</button>
              )}
            </div>
          </div>

          {/* Mobile export menu */}
          {isMobile && mobileMenuOpen && (
            <div style={{ paddingBottom: 12, display: "flex", gap: 8 }}>
              <button onClick={() => { exportCSV(); setMobileMenuOpen(false); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#fff" }}>Export CSV</button>
              <button onClick={() => { exportXLSX(); setMobileMenuOpen(false); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#3ECF8E" }}>Export XLSX</button>
            </div>
          )}

          {/* Tab bar — scrollable on mobile */}
          <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: isMobile ? "10px 14px" : "10px 16px", border: "none", background: "none", cursor: "pointer", fontSize: isMobile ? 12 : 13, fontWeight: 600, color: tab === id ? "#fff" : "#778ca3", borderBottom: `2px solid ${tab === id ? BRAND : "transparent"}`, transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: contentPad }}>

        {/* Loading */}
        {loading && (
          <div data-testid="loading" style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>Loading projects…
          </div>
        )}

        {/* Supabase not configured notice */}
        {!loading && !supabase && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 10 }}>
            <span>⚠</span>
            <span>Supabase not configured — data is saved to this browser only. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to enable cloud sync.</span>
          </div>
        )}

        {/* DASHBOARD */}
        {!loading && tab === "dashboard" && <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(3,1fr)" : "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
            {CARDS.map((c, idx) => (
              <div key={c.l} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px #0001", gridColumn: isMobile && idx === 4 ? "span 2" : undefined }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: c.c }}>{c.v}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontWeight: 500 }}>{c.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px 22px", boxShadow: "0 1px 3px #0001" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: NAVY }}>Project Progress</h2>
            {projects.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>No projects yet.</div>}
            {projects.map((p) => {
              const pct = stagePct(p.stages);
              return (
                <div key={p.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.projectName}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.clientName}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Badge status={p.status} small />
                      <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
                    {p.stages.map((s, i) => { const st = STATUS_STYLE[s.status]; return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: st.bg, border: `1px solid ${st.dot}33`, borderRadius: 20, padding: "2px 9px", fontSize: 11 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot }} />
                        <span style={{ fontWeight: 600, color: st.color }}>{isMobile ? s.name.split(" ")[0] : s.name}</span>
                        {!isMobile && s.assignee && <span style={{ color: "#94a3b8" }}>· {s.assignee}</span>}
                      </div>
                    ); })}
                  </div>
                  <div style={{ background: "#f1f5f9", borderRadius: 99, height: 5, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : `linear-gradient(90deg,${BRAND},#ff8c69)`, borderRadius: 99, transition: "width .4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* PROJECTS */}
        {!loading && tab === "projects" && <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input data-testid="input-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or clients…" style={{ flex: 1, minWidth: 180, padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", color: NAVY, background: "#fff" }} />
            <select data-testid="select-filter-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: NAVY, background: "#fff" }}>
              <option value="All">All Statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {filtered.length === 0
            ? <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "48px 0", textAlign: "center", color: "#94a3b8" }}>No projects found.</div>
            : filtered.map((p) => {
              const pct = stagePct(p.stages);
              return (
                <div key={p.id} data-testid={`project-card-${p.id}`} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 14, boxShadow: "0 1px 3px #0001", overflow: "hidden" }}>
                  <div style={{ padding: isMobile ? "14px 16px" : "16px 20px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#fff", fontWeight: 800, flexShrink: 0 }}>{p.projectName[0]}</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: NAVY }}>{p.projectName}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.clientName}{p.website ? ` · ${p.website}` : ""}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Badge status={p.status} />
                        <span style={{ fontSize: 13, color: BRAND, fontWeight: 800 }}>{pct}%</span>
                        <button onClick={() => setModal({ ...p })} style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12, color: BRAND }}>Edit</button>
                        <button onClick={() => setDelId(p.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #fee2e2", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#ef4444" }}>Delete</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["Stage", "Assigned To", "Start", "End", "Status", "Notes"].map((h) => (
                            <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.stages.map((s, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: BRAND + "22", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                                <span style={{ fontWeight: 700, color: NAVY }}>{s.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px", color: s.assignee ? NAVY : "#cbd5e1" }}>{s.assignee || "—"}</td>
                            <td style={{ padding: "10px 14px", color: s.startDate ? NAVY : "#cbd5e1", whiteSpace: "nowrap" }}>{s.startDate || "—"}</td>
                            <td style={{ padding: "10px 14px", color: s.endDate ? NAVY : "#cbd5e1", whiteSpace: "nowrap" }}>{s.endDate || "—"}</td>
                            <td style={{ padding: "10px 14px" }}><Badge status={s.status} small /></td>
                            <td style={{ padding: "10px 14px", color: s.notes ? NAVY : "#cbd5e1", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </>}

        {!loading && tab === "team" && <TeamTab team={team} setTeam={setTeam} />}
        {!loading && tab === "sheets" && <SheetsTab sheetsCfg={sheetsCfg} setSheetsCfg={setSheetsCfg} onTestSync={onTestSync} syncStatus={syncStatus} />}
      </div>

      {/* ── Project Modal ── */}
      {modal && <ProjectModal project={modal} team={team} onSave={saveProject} onClose={() => setModal(null)} />}

      {/* ── Delete Confirm ── */}
      {delId && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 20px 50px #0004" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🗑️</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: NAVY }}>Delete Project?</div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button data-testid="btn-cancel-delete" onClick={() => setDelId(null)} style={{ padding: "9px 20px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#64748b" }}>Cancel</button>
              <button data-testid="btn-confirm-delete" onClick={() => deleteProject(delId)} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
