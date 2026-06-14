import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase, toDb, fromDb } from "./lib/supabase";
import i18n from "./i18n";


/* ─── Constants ─────────────────────────────────────────────── */
const BRAND = "#FF5050";
const BRAND_DARK = "#cc3333";
const BRAND_DIM = "#FF505022";
const SURFACE = "#0f0d0d";
const SURFACE2 = "#171414";
const TEXT_ACCENT = "#ffffff";
const HEADER_BG = "#120f0f";
const BORDER = "#292424";
const BORDER2 = "#3d3535";
const TEXT = "#f5f0f0";
const TEXT2 = "#a39999";
const TEXT3 = "#756b6b";
const STAGES = ["Questionnaire", "Kickoff Meeting", "UI/UX Design", "Development"];
const STATUSES = ["Not Started", "In Progress", "Completed", "On Hold"];
const STATUS_STYLE = {
  "Not Started": { bg: "#1f1d1d", color: "#a39999", dot: "#756b6b" },
  "In Progress": { bg: "#3b82f622", color: "#60a5fa", dot: "#3b82f6" },
  "Completed":   { bg: "#22c55e22", color: "#4ade80", dot: "#22c55e" },
  "On Hold":     { bg: "#f59e0b22", color: "#fbbf24", dot: "#f59e0b" },
};
const STAGE_PALETTE = {
  "Questionnaire": { bar: "#3b82f6", bg: "#3b82f622" },
  "Kickoff Meeting": { bar: "#8b5cf6", bg: "#8b5cf622" },
  "UI/UX Design": { bar: "#ec4899", bg: "#ec489922" },
  "Development": { bar: "#10b981", bg: "#10b98122" },
};
const INIT_TEAM = [
  { id: "1", name: "Pasindu", role: "Developer", is_active: true },
  { id: "2", name: "Shamam", role: "Project Manager", is_active: true },
  { id: "3", name: "Salman", role: "Developer", is_active: true },
  { id: "4", name: "Janith", role: "Designer", is_active: true }
];
const SHEETS_DEFAULTS = {
  url: "https://script.google.com/macros/s/AKfycbzuPa5HwBMz84G4WbOudvA0Yw0R9zKIiziRRz2LDS-KQZVB7-FTJGYbBFd331ZNVI98HA/exec",
  secret: "lg-web-project-tracker-2026",
};
const SHEET_VIEW_URL = "https://docs.google.com/spreadsheets/d/1bgvc5kE8ELx_xg9APYfsHIY1_9bh7zl34lPJ-K-uQvM/edit";

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};
const dayDiff = (d1, d2) => Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
const isWkend = (d) => d.getDay() === 0 || d.getDay() === 6;
const isTodayFn = (d) => {
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
};
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const mkTask = (n, row_type = "main", parent_id = null, order = 1) => ({
  task_id: crypto.randomUUID(),
  parent_id,
  row_type,
  order,
  name: n,
  assignee: "",
  startDate: "",
  endDate: "",
  status: "Not Started",
  notes: "",
});

const mkProject = () => ({
  id: crypto.randomUUID(),
  projectName: "",
  clientName: "",
  website: "",
  status: "Not Started",
  tasks: STAGES.map((s, i) => mkTask(s, "main", null, i + 1)),
});

const taskPct = (ts) => ts.length ? Math.round(ts.filter((x) => x.status === "Completed").length / ts.length * 100) : 0;

const buildHierarchy = (tasks = []) => {
  const safeTasks = tasks.map((t, i) => ({ ...t, task_id: t.task_id || `legacy-${i}` }));
  const byId = new Map(safeTasks.map(t => [t.task_id, { ...t, subtasks: [] }]));
  const roots = [];
  byId.forEach(t => {
    if (t.parent_id && byId.has(t.parent_id)) {
      byId.get(t.parent_id).subtasks.push(t);
    } else {
      roots.push(t);
    }
  });
  return roots.sort((a,b) => (a.order || 0) - (b.order || 0));
};





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

/* ─── Team Member Serialization ─── */
const parseMember = (dbMember) => {
  try {
    const p = JSON.parse(dbMember.name);
    if (p && typeof p === "object" && p.n) {
      return { id: dbMember.id, name: p.n, role: p.r || "", is_active: p.a !== false, position: dbMember.position };
    }
  } catch(e) {}
  return { id: dbMember.id, name: dbMember.name, role: "", is_active: true, position: dbMember.position };
};
const serializeMember = (name, role, is_active) => JSON.stringify({ n: name, r: role, a: is_active });

/* ─── Badge ─────────────────────────────────────────────────── */
const Badge = ({ status, small }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Not Started"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.dot}33`, borderRadius: 20, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: small ? 6 : 7, height: small ? 6 : 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />{status}
    </span>
  );
};

/* ─── Project View Modal ─────────────────────────────────────── */
function ProjectViewModal({ project, onClose }) {
  const { isMobile } = useBreakpoint();
  
  if (!project) return null;
  const pct = taskPct(project.tasks || project.stages);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", zIndex: 500, overflowY: "auto", padding: isMobile ? 12 : 32, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <div style={{ background: SURFACE, width: "100%", maxWidth: 840, borderRadius: 24, border: `1px solid ${BORDER}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        
        {/* Header */}
        <div style={{ padding: isMobile ? "24px 20px" : "32px 40px", background: SURFACE2, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT_ACCENT }}>{project.projectName}</h2>
                <Badge status={project.status} />
              </div>
              <p style={{ margin: 0, fontSize: 15, color: TEXT2, fontWeight: 600 }}>{project.clientName} {project.website && <a href={project.website.startsWith('http') ? project.website : `https://${project.website}`} target="_blank" rel="noopener noreferrer" style={{ color: BRAND, marginLeft: 8, textDecoration: "none" }}>↗ Visit Site</a>}</p>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: TEXT3, cursor: "pointer", fontSize: 28, padding: 0, marginTop: -4 }}>×</button>
          </div>
          
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT3, textTransform: "uppercase", letterSpacing: 0.5 }}>Overall Progress</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>{pct}%</span>
            </div>
            <div style={{ background: SURFACE, borderRadius: 99, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : `linear-gradient(90deg, ${BRAND}, #ff8c69)`, borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div style={{ padding: isMobile ? "20px 16px" : "32px 40px" }}>
          <h3 style={{ margin: "0 0 20px 0", fontSize: 16, fontWeight: 800, color: TEXT_ACCENT }}>Project Tasks</h3>
          
          {(!project.tasks || project.tasks.length === 0) ? (
            <div style={{ textAlign: "center", color: TEXT3, padding: "40px 0", fontStyle: "italic", fontSize: 14 }}>No tasks defined for this project.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {buildHierarchy(project.tasks).map((mainTask, idx) => (
                <div key={mainTask.task_id || idx} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", opacity: mainTask.isActive === false ? 0.4 : 1 }}>
                  
                  {/* Main Task Header */}
                  <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: (mainTask.subtasks && mainTask.subtasks.length > 0) ? `1px solid ${BORDER}` : "none", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_ACCENT }}>{mainTask.name}</div>
                        <Badge status={mainTask.status} small />
                      </div>
                      <div style={{ fontSize: 13, color: TEXT2, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {mainTask.assignee && <span><strong style={{ color: TEXT3 }}>Assignee:</strong> {mainTask.assignee}</span>}
                        {mainTask.startDate && <span><strong style={{ color: TEXT3 }}>Start:</strong> {mainTask.startDate}</span>}
                        {mainTask.endDate && <span><strong style={{ color: TEXT3 }}>End:</strong> {mainTask.endDate}</span>}
                      </div>
                      {mainTask.notes && <div style={{ fontSize: 13, color: TEXT3, marginTop: 8, fontStyle: "italic" }}>"{mainTask.notes}"</div>}
                    </div>
                  </div>

                  {/* Subtasks */}
                  {(mainTask.subtasks && mainTask.subtasks.length > 0) && (
                    <div style={{ padding: "12px 16px", background: SURFACE }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <tbody>
                          {mainTask.subtasks.map((sub, sIdx) => (
                            <tr key={sub.task_id || sIdx} style={{ borderBottom: sIdx === mainTask.subtasks.length - 1 ? "none" : `1px dashed ${BORDER2}` }}>
                              <td style={{ padding: "10px 12px", width: "40%" }}>
                                <div style={{ fontWeight: 600, color: TEXT }}>{sub.name}</div>
                                {sub.notes && <div style={{ fontSize: 11, color: TEXT3, marginTop: 4 }}>{sub.notes}</div>}
                              </td>
                              <td style={{ padding: "10px 12px", color: sub.assignee ? TEXT_ACCENT : TEXT3 }}>{sub.assignee || "Unassigned"}</td>
                              <td style={{ padding: "10px 12px", color: sub.startDate || sub.endDate ? TEXT : TEXT3, whiteSpace: "nowrap" }}>
                                {sub.startDate || "—"} / {sub.endDate || "—"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}><Badge status={sub.status} small /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Project Modal ─────────────────────────────────────────── */
function ProjectModal({ project, team, onSave, onClose }) {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState(project);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  
  const moveTask = (idx, direction) => {
    setForm(p => {
      const newTasks = [...p.tasks];
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= newTasks.length) return p;
      // swap orders
      const tempOrder = newTasks[idx].order;
      newTasks[idx].order = newTasks[targetIdx].order;
      newTasks[targetIdx].order = tempOrder;
      // swap in array
      const temp = newTasks[idx];
      newTasks[idx] = newTasks[targetIdx];
      newTasks[targetIdx] = temp;
      return { ...p, tasks: newTasks };
    });
  };

  const setTask = (id, k, v) => {
    setForm(p => ({
      ...p,
      tasks: p.tasks.map(t => t.task_id === id ? { ...t, [k]: v } : t)
    }));
  };

  const addSubTask = (parentId, order) => {
    setForm(p => ({
      ...p,
      tasks: [...p.tasks, mkTask("New Sub-task", "sub", parentId, order)]
    }));
  };

  const addMainTask = () => {
    setForm(p => {
      const maxOrder = Math.max(0, ...p.tasks.filter(t => t.row_type === "main").map(t => t.order));
      return {
        ...p,
        tasks: [...p.tasks, mkTask("New Main Task", "main", null, maxOrder + 1)]
      };
    });
  };

  const removeTask = (id) => {
    setForm(p => ({
      ...p,
      tasks: p.tasks.filter(t => t.task_id !== id && t.parent_id !== id)
    }));
  };

  const inp = {
    border: `1.5px solid ${BORDER2}`,
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
    color: TEXT,
    padding: "9px 12px",
    width: "100%",
    background: SURFACE2,
  };
  const sinp = { ...inp, padding: "7px 10px", borderRadius: 7, fontSize: 13 };

  const hierarchy = buildHierarchy(form.tasks || []);

  return (
    <div
      data-testid="project-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 200,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: SURFACE,
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          width: "100%",
          maxWidth: isMobile ? "100%" : 800,
          maxHeight: isMobile ? "95vh" : "90vh",
          overflowY: "auto",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            padding: isMobile ? "18px 20px" : "22px 28px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: SURFACE,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 3,
                height: 20,
                background: BRAND,
                borderRadius: 4,
              }}
            />
            <h2
              style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}
            >
              {project.projectName ? i18n.t("Edit Project") : i18n.t("New Project")}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: SURFACE2,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 18,
              color: TEXT2,
              lineHeight: 1,
            }}
          >
            {i18n.t("×")}
          </button>
        </div>

        <div style={{ padding: isMobile ? "18px 20px" : "24px 28px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 14,
              marginBottom: 22,
            }}
          >
            {[
              ["projectName", "Project Name *"],
              ["clientName", "Client Name *"],
              ["website", "Website URL"],
            ].map(([k, lbl]) => (
              <div
                key={k}
                style={{
                  gridColumn:
                    !isMobile && k === "website" ? "span 2" : undefined,
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: TEXT3,
                    marginBottom: 5,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {i18n.t(lbl)}
                </label>
                <input
                  data-testid={`input-${k}`}
                  value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                  style={inp}
                />
              </div>
            ))}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: TEXT3,
                  marginBottom: 5,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {i18n.t("Overall Status")}
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                style={{ ...inp, background: SURFACE2 }}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {i18n.t(status)}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ display: "grid", gap: 14, gridColumn: isMobile ? "span 1" : "span 2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 14, color: TEXT }}>{i18n.t("Tasks")}</h3>
                <button onClick={addMainTask} style={{ background: BRAND, color: TEXT_ACCENT, border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
                  {i18n.t("+ Add Main Task")}
                </button>
              </div>
              
              {hierarchy.map((mainTask, i) => (
                <div
                  key={mainTask.task_id}
                  style={{
                    borderRadius: 14,
                    background: SURFACE2,
                    border: `1px solid ${BORDER}`,
                    padding: 14,
                    display: "grid",
                    gap: 12,
                    opacity: mainTask.isActive === false ? 0.4 : 1,
                    transition: "opacity 0.2s"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: "50%", background: BRAND_DIM, color: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, border: `1px solid ${BRAND}44`
                        }}
                      >
                        {i + 1}
                      </div>
                      <input 
                        value={mainTask.name} 
                        onChange={(e) => setTask(mainTask.task_id, "name", e.target.value)}
                        style={{ ...sinp, background: SURFACE, fontWeight: 700, width: "auto", flex: 1 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => addSubTask(mainTask.task_id, mainTask.subtasks.length + 1)} style={{ ...sinp, width: "auto", cursor: "pointer" }}>{i18n.t("+ Sub")}</button>
                      <button onClick={() => moveTask(form.tasks.findIndex(t => t.task_id === mainTask.task_id), -1)} style={{ ...sinp, width: "auto", cursor: "pointer" }}>↑</button>
                      <button onClick={() => moveTask(form.tasks.findIndex(t => t.task_id === mainTask.task_id), 1)} style={{ ...sinp, width: "auto", cursor: "pointer" }}>↓</button>
                      <button onClick={() => setTask(mainTask.task_id, "isActive", mainTask.isActive === false)} style={{ ...sinp, width: "auto", cursor: "pointer", color: mainTask.isActive === false ? "#4ade80" : "#f59e0b", border: `1px solid ${mainTask.isActive === false ? "#22c55e44" : "#f59e0b44"}` }}>
                        {mainTask.isActive === false ? i18n.t("Set Active") : i18n.t("Set Inactive")}
                      </button>
                    </div>
                  </div>
                  
                  {mainTask.subtasks.length === 0 ? (
                    <>
                     <div
                     style={{
                       display: "grid",
                       gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
                       gap: 9,
                     }}
                   >
                     {/* Same fields as subtask but for main task */}
                     <div>
                       <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: TEXT3, marginBottom: 3, textTransform: "uppercase" }}>{i18n.t("Assigned To")}</label>
                       <select value={mainTask.assignee} onChange={(e) => setTask(mainTask.task_id, "assignee", e.target.value)} style={{ ...sinp, background: SURFACE }}>
                         <option value="">{i18n.t("— Select —")}</option>
                         {team.filter(t => t.is_active !== false).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                       </select>
                     </div>
                     <div>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: TEXT3, marginBottom: 3, textTransform: "uppercase" }}>{i18n.t("Start Date")}</label>
                        <input type="date" value={mainTask.startDate} onChange={(e) => setTask(mainTask.task_id, "startDate", e.target.value)} style={{ ...sinp, colorScheme: "dark" }} />
                     </div>
                     <div>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: TEXT3, marginBottom: 3, textTransform: "uppercase" }}>{i18n.t("End Date")}</label>
                        <input type="date" value={mainTask.endDate} onChange={(e) => setTask(mainTask.task_id, "endDate", e.target.value)} style={{ ...sinp, colorScheme: "dark" }} />
                     </div>
                     <div>
                       <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: TEXT3, marginBottom: 3, textTransform: "uppercase" }}>{i18n.t("Status")}</label>
                       <select value={mainTask.status} onChange={(e) => setTask(mainTask.task_id, "status", e.target.value)} style={{ ...sinp, background: SURFACE }}>
                         {STATUSES.map((s) => <option key={s}>{i18n.t(s)}</option>)}
                       </select>
                     </div>
                   </div>
                   <div style={{ marginTop: 10 }}>
                     <input placeholder={i18n.t("Add notes (optional)...")} value={mainTask.notes || ""} onChange={(e) => setTask(mainTask.task_id, "notes", e.target.value)} style={{ ...sinp, width: "100%", background: SURFACE }} />
                   </div>
                   </>
                  ) : (
                    <div style={{ marginLeft: 20, display: "grid", gap: 10, borderLeft: `2px solid ${BORDER2}`, paddingLeft: 14 }}>
                      {mainTask.subtasks.map((sub, j) => (
                        <div key={sub.task_id} style={{ display: "grid", gap: 8, background: SURFACE, padding: 10, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input value={sub.name} onChange={(e) => setTask(sub.task_id, "name", e.target.value)} style={{ ...sinp, fontWeight: 600, flex: 1 }} />
                            <button onClick={() => removeTask(sub.task_id)} style={{ ...sinp, width: "auto", color: "#f87171", cursor: "pointer", padding: "4px 8px" }}>{i18n.t("×")}</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 9 }}>
                            <select value={sub.assignee} onChange={(e) => setTask(sub.task_id, "assignee", e.target.value)} style={sinp}>
                              <option value="">{i18n.t("— Select —")}</option>
                              {team.filter(t => t.is_active !== false).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                            <input type="date" value={sub.startDate} onChange={(e) => setTask(sub.task_id, "startDate", e.target.value)} style={{ ...sinp, colorScheme: "dark" }} />
                            <input type="date" value={sub.endDate} onChange={(e) => setTask(sub.task_id, "endDate", e.target.value)} style={{ ...sinp, colorScheme: "dark" }} />
                            <select value={sub.status} onChange={(e) => setTask(sub.task_id, "status", e.target.value)} style={sinp}>
                              {STATUSES.map((s) => <option key={s}>{i18n.t(s)}</option>)}
                            </select>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <input placeholder={i18n.t("Add notes (optional)...")} value={sub.notes || ""} onChange={(e) => setTask(sub.task_id, "notes", e.target.value)} style={{ ...sinp, width: "100%", background: SURFACE2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: isMobile ? "14px 20px" : "16px 28px",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            position: "sticky",
            bottom: 0,
            background: SURFACE,
          }}
        >
          <button
            data-testid="btn-cancel-modal"
            onClick={onClose}
            style={{
              flex: isMobile ? 1 : undefined,
              padding: "9px 20px",
              borderRadius: 8,
              border: `1.5px solid ${BORDER2}`,
              background: "transparent",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              color: TEXT2,
            }}
          >
            {i18n.t("Cancel")}
          </button>
          <button
            data-testid="btn-save"
            onClick={() => {
              if (!form.projectName || !form.clientName) {
                alert(i18n.t("Project Name and Client Name are required."));
                return;
              }
              onSave(form);
            }}
            style={{
              flex: isMobile ? 1 : undefined,
              padding: "9px 24px",
              borderRadius: 8,
              border: "none",
              background: BRAND,
              color: TEXT_ACCENT,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {i18n.t("Save Project")}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── Team Tab ──────────────────────────────────────────────── */
function TeamTab({ team, setTeam, projects }) {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [eIdx, setEIdx] = useState(null);
  const [eVal, setEVal] = useState("");
  const [eRole, setERole] = useState("");
  const [viewMember, setViewMember] = useState(null);

  const getAssignedTasks = (memberName) => {
    if (!projects) return [];
    let assigned = [];
    projects.forEach(p => {
       (p.tasks || []).forEach(t => {
          if (t.assignee === memberName) assigned.push({ project: p.projectName, task: t.name, status: t.status });
          (t.subtasks || []).forEach(sub => {
             if (sub.assignee === memberName) assigned.push({ project: p.projectName, task: sub.name, status: sub.status });
          });
       });
    });
    return assigned;
  };
  const add = async () => { 
    const n = name.trim(); 
    const r = role.trim();
    if (!n) return; 
    if (team.some(x => x.name === n)) { alert("Already exists."); return; } 
    const newM = { id: crypto.randomUUID(), name: n, role: r, is_active: true, position: team.length };
    setTeam((t) => [...t, newM]);
    setName("");
    setRole("");
    // team_members only has id/name/position columns — role & is_active are packed
    // into the serialized `name` JSON (see serializeMember/parseMember).
    if (supabase) await supabase.from("team_members").insert({ id: newM.id, position: newM.position, name: serializeMember(n, r, true) });
  };
  const save = async (i) => { 
    const v = eVal.trim(); 
    const r = eRole.trim();
    if (!v) return; 
    const m = team[i];
    setTeam((t) => t.map((member, idx) => idx === i ? { ...member, name: v, role: r } : member)); 
    setEIdx(null); 
    if (supabase) await supabase.from("team_members").update({ name: serializeMember(v, r, m.is_active) }).eq("id", m.id);
  };
  const toggleStatus = async (i) => {
    const m = team[i];
    const newStatus = !(m.is_active !== false); // toggle
    setTeam((t) => t.map((member, idx) => idx === i ? { ...member, is_active: newStatus } : member));
    if (supabase) await supabase.from("team_members").update({ name: serializeMember(m.name, m.role, newStatus) }).eq("id", m.id);
  };

  return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: HEADER_BG }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>Team Members</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#aab8cc" }}>Names appear in assignee dropdowns across all projects.</p>
          </div>
          <div style={{ background: BRAND, color: TEXT_ACCENT, borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 800 }}>{team.length} members</div>
        </div>
        <div style={{ padding: "14px 22px" }}>
          {team.length === 0 && <div style={{ textAlign: "center", color: TEXT3, padding: "24px 0", fontSize: 13 }}>No team members yet.</div>}
          {team.map((m, i) => (
            <div key={m.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${BORDER2}` }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: BRAND, color: TEXT_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{(m.name || "?")[0].toUpperCase()}</div>
              {eIdx === i
                ? (<><input autoFocus value={eVal} onChange={(e) => setEVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(i); if (e.key === "Escape") setEIdx(null); }} style={{ flex: 1, padding: "7px 10px", border: `1.5px solid ${BRAND}`, borderRadius: 8, fontSize: 14, outline: "none", color: TEXT_ACCENT, minWidth: 0, background: SURFACE }} />
                  <input value={eRole} onChange={(e) => setERole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(i); if (e.key === "Escape") setEIdx(null); }} placeholder="Role" style={{ width: 120, padding: "7px 10px", border: `1.5px solid ${BRAND}`, borderRadius: 8, fontSize: 14, outline: "none", color: TEXT_ACCENT, background: SURFACE }} />
                  <button onClick={() => save(i)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: BRAND, color: TEXT_ACCENT, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>Save</button>
                  <button onClick={() => setEIdx(null)} style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${BORDER}`, background: SURFACE, cursor: "pointer", fontWeight: 600, fontSize: 13, color: TEXT3, whiteSpace: "nowrap" }}>Cancel</button></>)
                : (<>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: m.is_active !== false ? TEXT_ACCENT : TEXT3, textDecoration: m.is_active !== false ? "none" : "line-through" }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: TEXT2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.role || "Member"}</span>
                  </div>
                  <button onClick={() => setViewMember(m)} style={{ padding: "6px 14px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: SURFACE, cursor: "pointer", fontWeight: 600, fontSize: 13, color: TEXT }}>View</button>
                  <button onClick={() => { setEIdx(i); setEVal(m.name); setERole(m.role || ""); }} style={{ padding: "6px 14px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: SURFACE, cursor: "pointer", fontWeight: 600, fontSize: 13, color: BRAND }}>Edit</button>
                  <button onClick={() => toggleStatus(i)} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${m.is_active !== false ? "#f59e0b44" : "#22c55e44"}`, background: SURFACE, cursor: "pointer", fontWeight: 600, fontSize: 13, color: m.is_active !== false ? "#f59e0b" : "#4ade80", whiteSpace: "nowrap" }}>{m.is_active !== false ? "Set Inactive" : "Set Active"}</button>
                </>)}
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${BORDER}`, background: SURFACE2 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input data-testid="input-team-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Enter name…" style={{ flex: 1, padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: "none", color: TEXT_ACCENT, background: SURFACE, minWidth: 0 }} />
            <input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Role (e.g. Designer)" style={{ width: 160, padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: "none", color: TEXT_ACCENT, background: SURFACE }} />
            <button data-testid="btn-add-team" onClick={add} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: BRAND, color: TEXT_ACCENT, cursor: "pointer", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </div>
      </div>

      {viewMember && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: HEADER_BG }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT_ACCENT }}>{viewMember.name}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{viewMember.role || "Member"}</p>
              </div>
              <button onClick={() => setViewMember(null)} style={{ background: "transparent", border: "none", color: TEXT3, cursor: "pointer", fontSize: 24, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "24px", maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: TEXT3, textTransform: "uppercase", letterSpacing: 0.5 }}>System Status</span>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: viewMember.is_active !== false ? "#4ade80" : "#ef4444" }}>
                  {viewMember.is_active !== false ? "● Active User" : "○ Inactive User"}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: TEXT3, textTransform: "uppercase", letterSpacing: 0.5 }}>Assigned Tasks</span>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {getAssignedTasks(viewMember.name).length === 0 ? (
                    <div style={{ fontSize: 13, color: TEXT2, padding: "12px 0", fontStyle: "italic" }}>No active tasks assigned across any projects.</div>
                  ) : (
                    getAssignedTasks(viewMember.name).map((t, idx) => (
                      <div key={idx} style={{ background: SURFACE2, padding: 14, borderRadius: 10, border: `1px solid ${BORDER2}` }}>
                        <div style={{ fontSize: 11, color: BRAND, fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.project}</div>
                        <div style={{ fontSize: 14, color: TEXT, fontWeight: 700, lineHeight: 1.4 }}>{t.task}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                          <Badge status={t.status} small />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Google Sheets Tab ─────────────────────────────────────── */
function SheetsTab({ syncStatus }) {
  return (
    <div style={{ maxWidth: 540 }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", background: HEADER_BG, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>Google Sheets</h2>
          <a href={SHEET_VIEW_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", color: "#3ECF8E", textDecoration: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
            Open Google Sheet ↗
          </a>
        </div>

        {/* What's mirrored */}
        <div style={{ padding: "18px 22px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: TEXT2, lineHeight: 1.5 }}>
            These tabs update automatically whenever a project is added, edited, or deleted:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: TEXT, lineHeight: 1.9 }}>
            <li><strong>Website Project Tracker</strong> — one row per project with status and progress</li>
            <li><strong>Gantt chart</strong> — every task with start, end, duration and status</li>
            <li><strong>Timeline</strong> — all dated tasks in chronological order</li>
          </ul>
          {syncStatus && (
            <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: syncStatus.ok ? "#16a34a" : "#ef4444" }}>
              {syncStatus.ok ? "✓ Last sync succeeded" : `✗ Last sync failed: ${syncStatus.msg}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineTab({ projects, initialFocusId }) {
  const [focusedProjectId, setFocusedProjectId] = useState(initialFocusId || null);
  useEffect(() => { setFocusedProjectId(initialFocusId || null); }, [initialFocusId]);
  const onProjectClick = (id) => setFocusedProjectId(id);
  const onBack = () => setFocusedProjectId(null);

  const CELL = 30, ROW = 38, PROJ_ROW = 30, LBL = 228, HDR = 52;
  const [expandedTasks, setExpandedTasks] = useState(new Set());

  const toggleTask = (id) => setExpandedTasks(s => {
    const ns = new Set(s);
    if (ns.has(id)) ns.delete(id);
    else ns.add(id);
    return ns;
  });

  const viewProjects = focusedProjectId ? projects.filter((p) => p.id === focusedProjectId) : projects;
  const focusedProject = focusedProjectId ? projects.find((p) => p.id === focusedProjectId) : null;

  const allDated = viewProjects.flatMap((p) => (p.tasks||[]).filter((s) => s.startDate || s.endDate));

  if (!projects.length) return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "48px 0", textAlign: "center", color: TEXT3, fontSize: 13 }}>
      {i18n.t("No projects yet. Create one to get started.")}
    </div>
  );

  if (!allDated.length) return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      {focusedProject && (
        <div style={{ padding: "14px 20px", background: HEADER_BG, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${BORDER2}`, background: "transparent", cursor: "pointer", fontSize: 12, color: TEXT2, fontWeight: 600 }}>{i18n.t("← All")}</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{focusedProject.projectName}</span>
          <Badge status={focusedProject.status} small />
        </div>
      )}
      <div style={{ padding: "48px 0", textAlign: "center", color: TEXT3, fontSize: 13 }}>{i18n.t("No stages have start/end dates yet — edit a project to add dates.")}</div>
    </div>
  );

  const starts = allDated.map((s) => new Date(s.startDate));
  const ends = allDated.map((s) => new Date(s.endDate));
  const minD = addDays(new Date(Math.min(...starts)), -3);
  const maxD = addDays(new Date(Math.max(...ends)), 5);
  const total = dayDiff(minD, maxD) + 1;
  const days = Array.from({ length: total }, (_, i) => addDays(minD, i));

  const months = [];
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!months.length || months[months.length - 1].key !== key)
      months.push({ key, label: MON_SHORT[d.getMonth()] + " " + d.getFullYear(), startIdx: i, count: 1 });
    else months[months.length - 1].count++;
  });

  const bL = (start) => dayDiff(minD, new Date(start)) * CELL;
  const bW = (start, end) => Math.max((dayDiff(new Date(start), new Date(end)) + 1) * CELL - 4, CELL - 4);
  const todayIdx = days.findIndex((d) => isTodayFn(d));

  const TodayLine = () => todayIdx >= 0 ? (
    <div style={{ position: "absolute", left: todayIdx * CELL + CELL / 2 - 1, top: 0, bottom: 0, width: 2, background: BRAND, opacity: 0.35, zIndex: 2, pointerEvents: "none" }} />
  ) : null;

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      {/* ── Header ── */}
      <div style={{ padding: "18px 24px", background: HEADER_BG, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {focusedProject && (
            <button onClick={onBack} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${BORDER2}`, background: "transparent", cursor: "pointer", fontSize: 12, color: TEXT2, fontWeight: 600 }}>{i18n.t("← All")}</button>
          )}
          <div style={{ width: 3, height: 20, background: BRAND, borderRadius: 4 }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{focusedProject ? focusedProject.projectName : "Project Timeline"}</h2>
          {focusedProject && <Badge status={focusedProject.status} small />}
        </div>
      </div>
      
      {/* ── Gantt ── */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", minWidth: LBL + total * CELL }}>
          {/* Label column */}
          <div style={{ width: LBL, flexShrink: 0, position: "sticky", left: 0, background: SURFACE, zIndex: 10, borderRight: `1px solid ${BORDER}` }}>
            <div style={{ height: HDR, background: HEADER_BG, borderBottom: `1px solid ${BORDER}` }} />
            {viewProjects.map((p) => {
              const hierarchy = buildHierarchy(p.tasks || []);
              return (
              <div key={p.id}>
                <div style={{ height: PROJ_ROW, display: "flex", alignItems: "center", padding: "0 14px", gap: 7, background: SURFACE2, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: BRAND, flexShrink: 0 }} />
                  <span onClick={!focusedProject ? () => onProjectClick(p.id) : undefined} style={{ fontSize: 11, fontWeight: 700, color: !focusedProject ? "#93c5fd" : TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: !focusedProject ? "pointer" : "default", textDecoration: !focusedProject ? "underline" : "none" }}>{p.projectName}</span>
                  <Badge status={p.status} small />
                </div>
                {hierarchy.map((mTask) => {
                  const isExpanded = expandedTasks.has(mTask.task_id);
                  const hasSubtasks = mTask.subtasks && mTask.subtasks.length > 0;
                  return (
                    <div key={mTask.task_id}>
                      <div style={{ height: ROW, display: "flex", alignItems: "center", padding: "0 14px 0 22px", gap: 7, borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
                        {hasSubtasks ? (
                          <button onClick={() => toggleTask(mTask.task_id)} style={{ background: "transparent", border: "none", color: TEXT2, cursor: "pointer", padding: 0, fontSize: 10, width: 12 }}>
                            {isExpanded ? "▼" : "▶"}
                          </button>
                        ) : (
                          <div style={{ width: 12 }} />
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, color: TEXT, flex: 1 }}>{mTask.name}</span>
                      </div>
                      {isExpanded && hasSubtasks && mTask.subtasks.map((sub) => (
                        <div key={sub.task_id} style={{ height: ROW, display: "flex", alignItems: "center", padding: "0 14px 0 40px", gap: 7, borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
                          <span style={{ fontSize: 10, color: TEXT2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>↳ {sub.name}</span>
                          {sub.assignee && <span style={{ fontSize: 9, color: TEXT3, whiteSpace: "nowrap" }}>{sub.assignee}</span>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )})}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, minWidth: total * CELL }}>
            <div style={{ height: HDR, position: "relative", background: HEADER_BG, borderBottom: `1px solid ${BORDER}` }}>
              {months.map((m) => (
                <div key={m.key} style={{ position: "absolute", left: m.startIdx * CELL, width: m.count * CELL, top: 0, height: 24, display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 9, fontWeight: 700, color: TEXT2, textTransform: "uppercase", borderRight: `1px solid ${BORDER2}`, overflow: "hidden" }}>{m.label}</div>
              ))}
              {days.map((d, i) => (
                <div key={i} style={{ position: "absolute", left: i * CELL, width: CELL, top: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: isTodayFn(d) ? 800 : 400, color: isTodayFn(d) ? BRAND : isWkend(d) ? BORDER2 : TEXT3, background: isTodayFn(d) ? BRAND_DIM : "transparent", borderRight: `1px solid ${BORDER}` }}>{d.getDate()}</div>
              ))}
            </div>

            {viewProjects.map((p) => {
              const hierarchy = buildHierarchy(p.tasks || []);
              return (
              <div key={p.id}>
                <div style={{ height: PROJ_ROW, position: "relative", background: SURFACE2, borderBottom: `1px solid ${BORDER}` }}>
                  <TodayLine />
                  {days.map((d, i) => (
                    <div key={i} style={{ position: "absolute", left: i * CELL, width: CELL, height: "100%", borderRight: `1px solid ${BORDER}`, background: isWkend(d) ? "rgba(255,255,255,0.02)" : "transparent" }} />
                  ))}
                </div>
                {hierarchy.map((mTask) => {
                  const isExpanded = expandedTasks.has(mTask.task_id);
                  const hasSubtasks = mTask.subtasks && mTask.subtasks.length > 0;
                  
                  // Compute summary dates for main task
                  let mainStart = mTask.startDate;
                  let mainEnd = mTask.endDate;
                  if (hasSubtasks) {
                     const subStarts = mTask.subtasks.map(s => new Date(s.startDate)).filter(d => !isNaN(d));
                     const subEnds = mTask.subtasks.map(s => new Date(s.endDate)).filter(d => !isNaN(d));
                     if (subStarts.length > 0) mainStart = new Date(Math.min(...subStarts)).toISOString().split('T')[0];
                     if (subEnds.length > 0) mainEnd = new Date(Math.max(...subEnds)).toISOString().split('T')[0];
                  }
                  
                  const done = mTask.status === "Completed";
                  const col = STAGE_PALETTE[mTask.name] || { bar: BRAND, bg: BRAND_DIM };

                  return (
                    <div key={mTask.task_id}>
                      <div style={{ height: ROW, position: "relative", borderBottom: `1px solid ${BORDER}` }}>
                        {days.map((d, i) => <div key={i} style={{ position: "absolute", left: i * CELL, width: CELL, height: "100%", borderRight: `1px solid ${BORDER}`, background: isWkend(d) ? "rgba(255,255,255,0.018)" : "transparent" }} />)}
                        <TodayLine />
                        {mainStart && mainEnd && (
                          <div style={{ position: "absolute", left: bL(mainStart), width: bW(mainStart, mainEnd), height: 4, top: ROW/2 - 2, background: col.bar, borderRadius: 2, zIndex: 3, opacity: 0.8 }} />
                        )}
                      </div>
                      {isExpanded && hasSubtasks && mTask.subtasks.map((sub) => {
                        const sDone = sub.status === "Completed";
                        return (
                          <div key={sub.task_id} style={{ height: ROW, position: "relative", borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
                            {days.map((d, i) => <div key={i} style={{ position: "absolute", left: i * CELL, width: CELL, height: "100%", borderRight: `1px solid ${BORDER}` }} />)}
                            <TodayLine />
                            {sub.startDate && sub.endDate && (
                              <div style={{ position: "absolute", left: bL(sub.startDate), width: bW(sub.startDate, sub.endDate), height: ROW - 12, top: 6, background: sDone ? col.bar : col.bg, border: `1.5px solid ${col.bar}`, borderRadius: 6, zIndex: 3, display: "flex", alignItems: "center", overflow: "hidden" }}>
                                <span style={{ position: "relative", zIndex: 1, fontSize: 9, fontWeight: 700, paddingLeft: 6, color: sDone ? SURFACE : col.bar, whiteSpace: "nowrap" }}>{sDone ? "✓ " : ""}{sub.name}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )})}
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
    try {
      const saved = localStorage.getItem("ladder_team");
      return saved ? JSON.parse(saved) : INIT_TEAM;
    } catch {
      return INIT_TEAM;
    }
  });
  const [tab, setTab] = useState("dashboard");
  const [timelineProjectId, setTimelineProjectId] = useState(null);
  const [modal, setModal] = useState(null);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [syncStatus, setSyncStatus] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewProjectDetails, setViewProjectDetails] = useState(null);
  const [toast, setToast] = useState(null);

  const [expandedProjectTasks, setExpandedProjectTasks] = useState(new Set());
  const toggleProjectTaskExpand = (id) => setExpandedProjectTasks(s => {
    const ns = new Set(s);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    return ns;
  });

  const toastTimer = useRef(null);
  const showToast = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  /* Persist team to localStorage */
  useEffect(() => { localStorage.setItem("ladder_team", JSON.stringify(team)); }, [team]);

  /* Load projects from Supabase (or localStorage fallback) */
  useEffect(() => {
    const loadFromLocal = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("ladder_projects"));
        const normalized = (saved || []).map(p => ({
          ...p,
          tasks: p.tasks || p.stages || []
        }));
        setProjects(normalized);
      } catch { setProjects([]); }
    };

    const load = async () => {
      if (supabase) {
        try {
          const [projRes, teamRes] = await Promise.all([
            supabase.from("projects").select("*").order("created_at"),
            supabase.from("team_members").select("*").order("position")
          ]);
          if (!projRes.error && projRes.data) {
            setProjects(projRes.data.map(fromDb));
          } else {
            // Cloud unreachable — fall back to the local cache so the app still works
            console.error("Supabase load failed, using local cache:", projRes.error);
            loadFromLocal();
          }
          if (!teamRes.error && teamRes.data && teamRes.data.length > 0) { setTeam(teamRes.data.map(parseMember)); }
        } catch (e) {
          // A thrown/rejected promise (network/CORS) would otherwise hang the spinner
          console.error("Supabase load threw, using local cache:", e);
          loadFromLocal();
        } finally {
          setLoading(false);
        }
        return;
      }
      // No Supabase configured — local-only mode
      loadFromLocal();
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
    try {
      const payload = {
        projects: ps.map((p) => ({ ...p, progress: taskPct(p.tasks || p.stages || []) })),
      };
      const res = await fetch("/api/sync-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSyncStatus({ ok: data.ok, msg: data.error || "" });
    } catch (e) { setSyncStatus({ ok: false, msg: e.message }); }
  }, []);

  /* Save project — optimistic local update first, then background cloud sync.
     We never block the UI on the Supabase round-trip (a failed request can take
     several seconds): local state (and localStorage) is the immediate source of
     truth and the cloud write happens in the background. On failure the change is
     kept locally and the user is warned via a toast so they can retry. */
  const saveProject = async (form) => {
    try {
      // `mkProject()` pre-assigns an id, so presence of an id does NOT mean the
      // project already exists. A project is "new" only if it isn't in the list yet.
      const isNew = !form.id || !projects.some((p) => p.id === form.id);
      const finalProj = { ...form, id: form.id || crypto.randomUUID(), createdAt: form.createdAt || new Date().toISOString() };

      const next = isNew
        ? [...projects, finalProj]
        : projects.map((x) => (x.id === finalProj.id ? finalProj : x));
      setProjects(next);
      showToast(isNew ? i18n.t("Project created successfully!") : i18n.t("Project updated successfully!"));
      setModal(null);

      // Background cloud sync — don't await; warn (non-blocking) on failure
      if (supabase) {
        const op = isNew
          ? supabase.from("projects").insert(toDb(finalProj))
          : supabase.from("projects").update(toDb(finalProj)).eq("id", finalProj.id);
        op.then(({ error }) => {
          if (error) {
            console.error("Supabase write failed (saved to local storage):", error);
            showToast(i18n.t("Cloud sync failed — saved locally"), "error");
          }
        });
      }

      // Background Google Sheets sync — mirrors the full project list to the
      // Tracker / Gantt / Timeline tabs. Non-blocking.
      syncSheets(next);
    } catch (e) {
      showToast(i18n.t("Error saving project"), "error");
    }
  };

  const deleteProject = (id) => {
    try {
      const next = projects.filter((x) => x.id !== id);
      setProjects(next);
      setDelId(null);
      showToast(i18n.t("Project deleted successfully!"));
      // Background cloud sync — non-blocking
      if (supabase) {
        supabase.from("projects").delete().eq("id", id).then(({ error }) => {
          if (error) console.error("Supabase delete failed (removed locally):", error);
        });
      }
      syncSheets(next);
    } catch (e) {
      showToast(i18n.t("Error deleting project"), "error");
    }
  };

  /* Toggle project active — optimistic local update, background cloud sync */
  const toggleProjectActive = (id, isActive) => {
    try {
      const next = projects.map((p) => p.id === id ? { ...p, isActive } : p);
      setProjects(next);
      showToast(isActive ? i18n.t("Project set to Active") : i18n.t("Project set to Inactive"));
      if (supabase) {
        supabase.from("projects").update({ is_active: isActive }).eq("id", id).then(({ error }) => {
          if (error) {
            console.error("Supabase update failed (applied to local storage):", error);
            showToast(i18n.t("Cloud sync failed — saved locally"), "error");
          }
        });
      }
      syncSheets(next);
    } catch (e) {
      showToast(i18n.t("Error updating project status"), "error");
    }
  };


  /* Export helpers */
  const buildExportRows = () => {
    const hdr = ["Project", "Client", "Website", "Status", "Progress %",
      "Questionnaire Status", "Q Assignee", "Q Start", "Q End",
      "Kickoff Status", "KM Assignee", "KM Start", "KM End",
      "UI/UX Status", "UI Assignee", "UI Start", "UI End",
      "Dev Status", "Dev Assignee", "Dev Start", "Dev End", "Notes (Latest)"];
    const rows = projects.map((p) => {
      const s = p.tasks;
      const latestNote = [...s].reverse().find((x) => x.notes)?.notes || "";
      return [p.projectName, p.clientName, p.website, p.status, taskPct(p.tasks) + "%",
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

  const TABS = [["dashboard", "Dashboard"], ["projects", "Projects"], ["timeline", "Timeline"], ["team", "Team"], ["sheets", "Sheets"]];
  const CARDS = [
    { l: "Total", v: stats.total, c: BRAND, bg: BRAND_DIM },
    { l: "In Progress", v: stats.inProgress, c: "#2563eb", bg: "#3b82f611" },
    { l: "Completed", v: stats.completed, c: "#16a34a", bg: "#22c55e11" },
    { l: "Not Started", v: stats.notStarted, c: TEXT3, bg: SURFACE2 },
    { l: "On Hold", v: stats.onHold, c: "#d97706", bg: "#f59e0b11" },
  ];

  const headerPad = isMobile ? "0 16px" : "0 28px";
  const contentPad = isMobile ? "16px" : isTablet ? "20px 24px" : "24px 28px";

  return (
    <div style={{ fontFamily: "'Geist Sans', 'SF Pro Display', 'Helvetica Neue', sans-serif", minHeight: "100vh", background: SURFACE, color: TEXT }}>

      {/* ── Header ── */}
      <div style={{ background: HEADER_BG, padding: headerPad, boxShadow: "0 2px 12px #0004" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: isMobile ? 56 : 62 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src="/logo.svg" alt="Ladder Global" style={{ height: isMobile ? 22 : 28}} onError={(e) => { e.target.style.display = "none"; }} />
              <div style={{ width: 1, height: 20, background: "#ffffff33" }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: TEXT_ACCENT, letterSpacing: 0.2 }}>Project Tracker</div>
                {!isMobile && <div style={{ fontSize: 10, color: "#aab8cc", marginTop: -1 }}>Ladder Labs · Internal Tool</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!isMobile && (
                <>
                  <button onClick={exportCSV} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", fontWeight: 600, fontSize: 12, color: TEXT_ACCENT }}>CSV</button>
                  <button onClick={exportXLSX} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#3ECF8E" }}>XLSX</button>
                </>
              )}
              <button data-testid="btn-new" onClick={() => setModal(mkProject())} style={{ padding: isMobile ? "7px 14px" : "7px 16px", borderRadius: 8, border: "none", background: BRAND, color: TEXT_ACCENT, cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 12 : 13 }}>+ New</button>
              {isMobile && (
                <button onClick={() => setMobileMenuOpen((o) => !o)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", color: TEXT_ACCENT, fontSize: 16, lineHeight: 1 }}>⋮</button>
              )}
            </div>
          </div>

          {/* Mobile export menu */}
          {isMobile && mobileMenuOpen && (
            <div style={{ paddingBottom: 12, display: "flex", gap: 8 }}>
              <button onClick={() => { exportCSV(); setMobileMenuOpen(false); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ffffff33", background: "transparent", cursor: "pointer", fontWeight: 600, fontSize: 12, color: TEXT_ACCENT }}>Export CSV</button>
              <button onClick={() => { exportXLSX(); setMobileMenuOpen(false); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #3ECF8E55", background: "#3ECF8E22", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#3ECF8E" }}>Export XLSX</button>
            </div>
          )}

          {/* Tab bar — scrollable on mobile */}
          <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: isMobile ? "10px 14px" : "10px 16px", border: "none", background: "none", cursor: "pointer", fontSize: isMobile ? 12 : 13, fontWeight: 600, color: tab === id ? TEXT : "#778ca3", borderBottom: `2px solid ${tab === id ? BRAND : "transparent"}`, transition: "all .15s", whiteSpace: "nowrap", flexShrink: 0 }}>
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
          <div data-testid="loading" style={{ textAlign: "center", padding: "60px 0", color: TEXT3, fontSize: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>Loading projects…
          </div>
        )}

        {/* Supabase not configured notice */}
        {!loading && !supabase && (
          <div style={{ background: "#f59e0b11", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 10 }}>
            <span>⚠</span>
            <span>Supabase not configured — data is saved to this browser only. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> to enable cloud sync.</span>
          </div>
        )}

        {/* DASHBOARD */}
        {!loading && tab === "dashboard" && <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(3,1fr)" : "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
            {CARDS.map((c, idx) => (
              <div key={c.l} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", boxShadow: "none", gridColumn: isMobile && idx === 4 ? "span 2" : undefined }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: c.c }}>{c.v}</div>
                <div style={{ fontSize: 12, color: TEXT3, marginTop: 3, fontWeight: 500 }}>{c.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 22px", boxShadow: "none" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>Project Progress</h2>
            {projects.length === 0 && <div style={{ color: TEXT3, textAlign: "center", padding: "32px 0" }}>No projects yet.</div>}
            {projects.map((p) => {
              const safeTasks = p.tasks || p.stages || [];
              const pct = taskPct(safeTasks);
              return (
                <div key={p.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.projectName}</div>
                      <div style={{ fontSize: 12, color: TEXT3 }}>{p.clientName}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Badge status={p.status} small />
                      <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
                    {safeTasks.map((s, i) => { const st = STATUS_STYLE[s.status] || STATUS_STYLE["Not Started"]; return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: st.bg, border: `1px solid ${st.dot}33`, borderRadius: 20, padding: "2px 9px", fontSize: 11 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot }} />
                        <span style={{ fontWeight: 600, color: st.color }}>{isMobile ? s.name.split(" ")[0] : s.name}</span>
                        {!isMobile && s.assignee && <span style={{ color: TEXT3 }}>· {s.assignee}</span>}
                      </div>
                    ); })}
                  </div>
                  <div style={{ background: SURFACE2, borderRadius: 99, height: 5, overflow: "hidden" }}>
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
            <input data-testid="input-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or clients…" style={{ flex: 1, minWidth: 180, padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, outline: "none", color: TEXT_ACCENT, background: SURFACE }} />
            <select data-testid="select-filter-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: "9px 14px", border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: TEXT_ACCENT, background: SURFACE }}>
              <option value="All">All Statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {filtered.length === 0
            ? <div style={{ background: SURFACE, borderRadius: 14, border: `1px solid ${BORDER}`, padding: "48px 0", textAlign: "center", color: TEXT3 }}>No projects found.</div>
            : filtered.map((p) => {
              const pct = taskPct(p.tasks);
              return (
                <div key={p.id} data-testid={`project-card-${p.id}`} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 14, boxShadow: "none", overflow: "hidden" }}>
                  <div style={{ padding: isMobile ? "14px 16px" : "16px 20px", background: SURFACE2, borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: TEXT_ACCENT, fontWeight: 800, flexShrink: 0 }}>{p.projectName[0]}</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: TEXT_ACCENT }}>{p.projectName}</div>
                          <div style={{ fontSize: 12, color: TEXT3 }}>{p.clientName}{p.website ? ` · ${p.website}` : ""}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Badge status={p.status} />
                        <span style={{ fontSize: 13, color: BRAND, fontWeight: 800 }}>{pct}%</span>
                        <button onClick={() => setViewProjectDetails(p)} style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: SURFACE, cursor: "pointer", fontWeight: 700, fontSize: 12, color: TEXT }}>View</button>
                        <button onClick={() => setModal({ ...p })} style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${BRAND}33`, background: SURFACE, cursor: "pointer", fontWeight: 700, fontSize: 12, color: BRAND }}>Edit</button>
                        <button onClick={() => toggleProjectActive(p.id, !(p.isActive !== false))} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${p.isActive !== false ? "#f59e0b44" : "#22c55e44"}`, background: SURFACE, cursor: "pointer", fontWeight: 700, fontSize: 12, color: p.isActive !== false ? "#f59e0b" : "#4ade80" }}>{p.isActive !== false ? "Set Inactive" : "Set Active"}</button>
                        <button data-testid={`btn-delete-${p.id}`} onClick={() => setDelId(p.id)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #ef444444", background: SURFACE, cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#ef4444" }}>Delete</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                      <thead>
                        <tr style={{ background: SURFACE2 }}>
                          {["Stage", "Assigned To", "Start", "End", "Status", "Notes"].map((h) => (
                            <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: TEXT3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {buildHierarchy(p.tasks || p.stages || []).map((mainTask, i) => {
                          const col = STAGE_PALETTE[mainTask.name] || { bar: BRAND, bg: BRAND_DIM };
                          const isExpanded = expandedProjectTasks.has(mainTask.task_id);
                          const hasSubs = mainTask.subtasks && mainTask.subtasks.length > 0;
                          return (
                          <Fragment key={mainTask.task_id || i}>
                            <tr style={{ borderTop: `1px solid ${BORDER}`, opacity: mainTask.isActive === false ? 0.4 : 1 }}>
                              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                  {hasSubs ? (
                                    <button onClick={() => toggleProjectTaskExpand(mainTask.task_id)} style={{ background: "transparent", border: "none", color: TEXT3, cursor: "pointer", fontSize: 10, padding: 0, width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      {isExpanded ? "▼" : "▶"}
                                    </button>
                                  ) : <div style={{ width: 14 }} />}
                                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: col.bg, color: col.bar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                                  <span style={{ fontWeight: 700, color: TEXT_ACCENT }}>{mainTask.name}</span>
                                </div>
                              </td>
                              <td style={{ padding: "10px 14px", color: mainTask.assignee ? TEXT_ACCENT : BORDER2 }}>{mainTask.assignee || "—"}</td>
                              <td style={{ padding: "10px 14px", color: mainTask.startDate ? TEXT_ACCENT : BORDER2, whiteSpace: "nowrap" }}>{mainTask.startDate || "—"}</td>
                              <td style={{ padding: "10px 14px", color: mainTask.endDate ? TEXT_ACCENT : BORDER2, whiteSpace: "nowrap" }}>{mainTask.endDate || "—"}</td>
                              <td style={{ padding: "10px 14px" }}><Badge status={mainTask.status} small /></td>
                              <td style={{ padding: "10px 14px", color: mainTask.notes ? TEXT_ACCENT : BORDER2, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mainTask.notes || "—"}</td>
                            </tr>
                            {isExpanded && hasSubs && mainTask.subtasks.map((sub, j) => (
                              <tr key={sub.task_id || j} style={{ borderTop: `1px dashed ${BORDER2}`, background: SURFACE2 }}>
                                <td style={{ padding: "8px 14px 8px 48px", whiteSpace: "nowrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: TEXT3 }} />
                                    <span style={{ fontWeight: 600, color: TEXT }}>{sub.name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "8px 14px", color: sub.assignee ? TEXT_ACCENT : BORDER2 }}>{sub.assignee || "—"}</td>
                                <td style={{ padding: "8px 14px", color: sub.startDate ? TEXT : BORDER2, whiteSpace: "nowrap" }}>{sub.startDate || "—"}</td>
                                <td style={{ padding: "8px 14px", color: sub.endDate ? TEXT : BORDER2, whiteSpace: "nowrap" }}>{sub.endDate || "—"}</td>
                                <td style={{ padding: "8px 14px" }}><Badge status={sub.status} small /></td>
                                <td style={{ padding: "8px 14px", color: sub.notes ? TEXT : BORDER2, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.notes || "—"}</td>
                              </tr>
                            ))}
                          </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </>}

                {!loading && tab === "timeline" && <TimelineTab projects={projects} initialFocusId={timelineProjectId} />}
        {!loading && tab === "team" && <TeamTab team={team} setTeam={setTeam} projects={projects} />}
        {!loading && tab === "sheets" && <SheetsTab syncStatus={syncStatus} />}
      </div>

      {/* ── Project Modal ── */}
      {modal && <ProjectModal project={modal} team={team} onSave={saveProject} onClose={() => setModal(null)} />}
      
      {/* ── Project View Details Modal ── */}
      {viewProjectDetails && <ProjectViewModal project={viewProjectDetails} onClose={() => setViewProjectDetails(null)} />}

      {/* ── Delete Confirm ── */}
      {delId && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: SURFACE, borderRadius: 14, padding: "28px 32px", maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 20px 50px #0004" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🗑️</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: TEXT_ACCENT }}>Delete Project?</div>
            <div style={{ color: TEXT3, fontSize: 13, marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button data-testid="btn-cancel-delete" onClick={() => setDelId(null)} style={{ padding: "9px 20px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: SURFACE, cursor: "pointer", fontWeight: 600, fontSize: 14, color: TEXT3 }}>Cancel</button>
              <button data-testid="btn-confirm-delete" onClick={() => deleteProject(delId)} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: TEXT_ACCENT, cursor: "pointer", fontWeight: 800, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div data-testid="toast" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 600, background: toast.type === "error" ? "#7f1d1d" : SURFACE2, border: `1px solid ${toast.type === "error" ? "#ef4444" : BORDER2}`, color: toast.type === "error" ? "#fecaca" : TEXT, padding: "11px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 9, maxWidth: "90vw" }}>
          <span style={{ color: toast.type === "error" ? "#f87171" : "#4ade80" }}>{toast.type === "error" ? "✕" : "✓"}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
