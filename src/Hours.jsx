import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import i18n from "./i18n";
import { supabase } from "./lib/supabase";
import {
  CATEGORIES, DEFAULT_ACCOUNT, currentMonth, monthLabel, monthRange, round2,
  mkEntry, validateEntry, accountOf, groupMonth, entryToDb, entryFromDb, reportRows,
} from "./lib/time";

/* Palette mirrors App.jsx */
const BRAND = "#FF5050";
const SURFACE = "#0f0d0d";
const SURFACE2 = "#171414";
const BORDER = "#292424";
const BORDER2 = "#3d3535";
const TEXT = "#f5f0f0";
const TEXT2 = "#a39999";
const TEXT3 = "#756b6b";
const TEXT_ACCENT = "#ffffff";

const LOCAL_KEY = "ladder_time_entries";
const AUTH_BYPASS = typeof navigator !== "undefined" && navigator.webdriver === true;
const useCloud = () => !!supabase && !AUTH_BYPASS;

const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; } };
const saveLocal = (list) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

const download = (blob, filename) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};

export default function HoursTab({ projects = [], team = [], isMobile, showToast = () => {} }) {
  const [month, setMonth] = useState(currentMonth());
  const [accountFilter, setAccountFilter] = useState("All");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => mkEntry());
  const [error, setError] = useState("");
  const [delId, setDelId] = useState(null);

  const activeProjects = useMemo(() => projects.filter((p) => p.isActive !== false), [projects]);
  const knownAccounts = useMemo(() => {
    const s = new Set([DEFAULT_ACCOUNT]);
    projects.forEach((p) => s.add(accountOf(p)));
    entries.forEach((e) => e.account && s.add(e.account));
    return [...s].sort();
  }, [projects, entries]);

  /* Load the selected month */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const { from, to } = monthRange(month);
    const run = async () => {
      if (useCloud()) {
        const { data, error: err } = await supabase
          .from("time_entries").select("*")
          .gte("work_date", from).lte("work_date", to)
          .order("work_date");
        if (!alive) return;
        if (err) {
          console.error("time_entries load failed:", err);
          showToast(i18n.t("Could not load hours — is the time_entries migration applied?"), "error");
          setEntries([]);
        } else setEntries((data || []).map(entryFromDb));
      } else {
        setEntries(loadLocal().filter((e) => e.workDate >= from && e.workDate <= to));
      }
      if (alive) setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* Picking a site fills in its account automatically */
  const pickSite = (name) => {
    const p = activeProjects.find((x) => x.projectName.toLowerCase() === name.trim().toLowerCase());
    setForm((f) => ({ ...f, projectName: name, projectId: p ? p.id : null, account: p ? accountOf(p) : f.account }));
  };

  const addEntry = async () => {
    const msg = validateEntry(form);
    if (msg) { setError(msg); return; }
    setError("");
    const entry = { ...form, hours: round2(form.hours) };
    if (useCloud()) {
      const { error: err } = await supabase.from("time_entries").insert(entryToDb(entry));
      if (err) { console.error(err); showToast(i18n.t("Could not save hours"), "error"); return; }
    } else {
      saveLocal([...loadLocal(), entry]);
    }
    if (entry.workDate.slice(0, 7) === month) setEntries((l) => [...l, entry]);
    showToast(i18n.t("Hours logged"));
    // Keep site, account, person, date for fast repeated logging
    setForm((f) => mkEntry({ projectName: f.projectName, projectId: f.projectId, account: f.account, person: f.person, workDate: f.workDate, category: f.category }));
  };

  const deleteEntry = async (id) => {
    if (useCloud()) {
      const { error: err } = await supabase.from("time_entries").delete().eq("id", id);
      if (err) { console.error(err); showToast(i18n.t("Could not delete entry"), "error"); return; }
    } else {
      saveLocal(loadLocal().filter((e) => e.id !== id));
    }
    setEntries((l) => l.filter((e) => e.id !== id));
    setDelId(null);
    showToast(i18n.t("Entry deleted"));
  };

  const groups = useMemo(() => groupMonth(entries, projects, month), [entries, projects, month]);
  const shown = accountFilter === "All" ? groups : groups.filter((g) => g.account === accountFilter);
  const monthTotal = round2(shown.reduce((a, g) => a + g.total, 0));

  const exportXLSX = () => {
    if (!shown.length) { showToast(i18n.t("No hours to export for this month"), "error"); return; }
    const wb = XLSX.utils.book_new();
    shown.forEach((g) => {
      const rows = reportRows(g, month);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 22 }, { wch: 20 }];
      rows.forEach((r, i) => {
        const bold = (r[0] || "").toString().startsWith("Client:") || r[0] === "Date" || i === 0 || (r[2] || "").toString().endsWith("total") || r[2] === "Total";
        if (!bold) return;
        for (let c = 0; c < 4; c++) {
          const ref = XLSX.utils.encode_cell({ r: i, c });
          if (ws[ref]) ws[ref].s = { font: { bold: true } };
        }
      });
      XLSX.utils.book_append_sheet(wb, ws, g.account.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
    });
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const who = accountFilter === "All" ? "all-accounts" : accountFilter.toLowerCase().replace(/\s+/g, "-");
    download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `hours-${who}-${month}.xlsx`);
  };

  const inp = { border: `1.5px solid ${BORDER2}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none", color: TEXT, padding: "9px 12px", width: "100%", background: SURFACE2 };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: TEXT3, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 };
  const card = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? "16px" : "20px 22px", marginBottom: 16 };

  return (
    <div data-testid="hours-tab">
      {/* Quick log */}
      <div style={card}>
        <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>{i18n.t("Log hours")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1.2fr 1fr", gap: 12 }}>
          <div>
            <label style={lbl}>{i18n.t("Website / project")}</label>
            <input data-testid="hours-site" list="hours-sites" value={form.projectName} placeholder="e.g. Warneford" onChange={(e) => pickSite(e.target.value)} style={inp} />
            <datalist id="hours-sites">{activeProjects.map((p) => <option key={p.id} value={p.projectName}>{accountOf(p)}</option>)}</datalist>
          </div>
          <div>
            <label style={lbl}>{i18n.t("Account (billed to)")}</label>
            <input data-testid="hours-account" list="hours-accounts" value={form.account} onChange={(e) => set("account", e.target.value)} style={inp} />
            <datalist id="hours-accounts">{knownAccounts.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div>
            <label style={lbl}>{i18n.t("Date")}</label>
            <input data-testid="hours-date" type="date" value={form.workDate} onChange={(e) => set("workDate", e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: isMobile ? undefined : "span 2" }}>
            <label style={lbl}>{i18n.t("Task")}</label>
            <input data-testid="hours-task" value={form.task} placeholder="e.g. Plugins, theme and WordPress update" onChange={(e) => set("task", e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} style={inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>{i18n.t("Hours")}</label>
              <input data-testid="hours-hours" type="number" min="0.25" max="24" step="0.25" value={form.hours} onChange={(e) => set("hours", e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} style={inp} />
            </div>
            <div>
              <label style={lbl}>{i18n.t("Type")}</label>
              <select data-testid="hours-category" value={form.category} onChange={(e) => set("category", e.target.value)} style={inp}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>{i18n.t("Person")}</label>
            <select data-testid="hours-person" value={form.person} onChange={(e) => set("person", e.target.value)} style={inp}>
              <option value="">—</option>
              {team.filter((m) => m.is_active !== false).map((m) => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, gridColumn: isMobile ? undefined : "span 2" }}>
            <button data-testid="hours-add" onClick={addEntry} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: BRAND, color: TEXT_ACCENT, cursor: "pointer", fontWeight: 800, fontSize: 13 }}>{i18n.t("+ Log hours")}</button>
            {error && <span data-testid="hours-error" role="alert" style={{ color: "#f87171", fontSize: 13 }}>{error}</span>}
          </div>
        </div>
      </div>

      {/* Month report */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 12, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TEXT_ACCENT }}>
            {monthLabel(month)} <span data-testid="hours-month-total" style={{ color: BRAND }}>{monthTotal} h</span>
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input data-testid="hours-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "7px 10px" }} />
            <select data-testid="hours-account-filter" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ ...inp, width: "auto", padding: "7px 10px" }}>
              <option value="All">{i18n.t("All accounts")}</option>
              {knownAccounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button data-testid="hours-export" onClick={exportXLSX} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid #22c55e55`, background: "transparent", color: "#4ade80", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{i18n.t("Download month report")}</button>
          </div>
        </div>

        {loading && <div style={{ color: TEXT3, fontSize: 13 }}>Loading hours…</div>}
        {!loading && shown.length === 0 && <div style={{ color: TEXT3, fontSize: 13, padding: "16px 0" }}>{i18n.t("No hours logged for this month yet.")}</div>}

        {!loading && shown.map((g) => (
          <div key={g.account} data-testid={`hours-account-${g.account}`} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${BORDER2}`, paddingBottom: 6, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>{g.account}</span>
              <span style={{ fontWeight: 800, color: TEXT, fontSize: 14 }}>{g.total} h</span>
            </div>
            {g.sites.map((s) => {
              const over = s.retainer && s.total > s.retainer;
              return (
                <details key={s.name} data-testid={`hours-site-${s.name}`} style={{ borderBottom: `1px solid ${BORDER}`, padding: "6px 0" }}>
                  <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: TEXT2, listStyle: "none" }}>
                    <span style={{ color: TEXT, fontWeight: 600 }}>▸ {s.name} <span style={{ color: TEXT3, fontWeight: 400 }}>({s.entries.length})</span></span>
                    <span>
                      <strong style={{ color: TEXT }}>{s.total} h</strong>
                      {s.retainer > 0 && (
                        <span data-testid={`retainer-${s.name}`} style={{ marginLeft: 8, color: over ? "#f87171" : "#4ade80", fontWeight: 700 }}>
                          {over ? `${round2(s.total - s.retainer)} h over ${s.retainer} h retainer` : `${s.remaining} h left of ${s.retainer} h`}
                        </span>
                      )}
                    </span>
                  </summary>
                  <div style={{ overflowX: "auto", marginTop: 6 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480 }}>
                      <tbody>
                        {s.entries.map((e) => (
                          <tr key={e.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                            <td style={{ padding: "6px 8px", color: TEXT3, whiteSpace: "nowrap" }}>{e.workDate}</td>
                            <td style={{ padding: "6px 8px", color: TEXT }}>{e.task}</td>
                            <td style={{ padding: "6px 8px", color: TEXT3 }}>{e.category}</td>
                            <td style={{ padding: "6px 8px", color: TEXT3 }}>{e.person}</td>
                            <td style={{ padding: "6px 8px", color: TEXT, fontWeight: 700, textAlign: "right" }}>{round2(e.hours)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>
                              {delId === e.id ? (
                                <span style={{ whiteSpace: "nowrap" }}>
                                  <button data-testid={`hours-confirm-delete-${e.id}`} onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Delete</button>
                                  <button onClick={() => setDelId(null)} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                                </span>
                              ) : (
                                <button aria-label="Delete entry" data-testid={`hours-delete-${e.id}`} onClick={() => setDelId(e.id)} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", fontSize: 14 }}>×</button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {s.entries.length === 0 && <tr><td colSpan={6} style={{ padding: "6px 8px", color: TEXT3 }}>No hours logged yet this month.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
