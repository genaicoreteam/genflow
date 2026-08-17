"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { Profile, Task, StageRow, cap, displayName } from "@/lib/types";
import { downloadCSV } from "@/lib/csv";

/* Reporting — per-person workload across whatever stages the projects use.
   Because a completed copy stays behind in its stage, every person's work
   keeps counting for the stage they actually did. */
export default function Reporting() {
  const { profile, loading } = useProfile();
  const perms = useFeaturePerms();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<any[]>([]);

  const [view, setView] = useState<"people" | "tasks" | "kanban">("people");
  const [q, setQ] = useState("");
  const [selPortfolios, setSelPortfolios] = useState<string[]>([]);
  const [selProjects, setSelProjects] = useState<string[]>([]);
  const [selSections, setSelSections] = useState<string[]>([]);
  const [selPeople, setSelPeople] = useState<string[]>([]);

  const allowed = profile && featureAllowed(perms, "reporting", profile.role);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const db = supabase();
      const [{ data: pp }, { data: st }, { data: pj }, { data: pf }] = await Promise.all([
        db.from("profiles").select("*").order("full_name"),
        db.from("stages").select("*").order("sort"),
        db.from("projects").select("*").order("name"),
        db.from("portfolios").select("*").order("sort"),
      ]);
      setPeople((pp as Profile[]) || []);
      setStages((st as StageRow[]) || []);
      setProjects((pj as any[]) || []);
      setPortfolios((pf as any[]) || []);
    })();
  }, [allowed]);

  // Hierarchy-based visibility (same approach used elsewhere)
  const myReports = people.filter((p) => p.reports_to === profile?.id).map((p) => p.id);
  const hasFull = profile && (profile.role === "core_team" || profile.role === "manager" || profile.role === "team_lead" || profile.role === "process_coordinator" || profile.role === "admin");
  const visiblePeople = hasFull ? people
    : myReports.length ? people.filter((p) => myReports.includes(p.id) || p.id === profile?.id)
    : people.filter((p) => p.id === profile?.id);

  // helpers for multi-selects
  function toggleIn(arr: string[], v: string) { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; }

  const stageNames = useMemo(() => Array.from(new Set(stages.map((s) => s.name))), [stages]);

  // Server-side filtered tasks
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [loadingFiltered, setLoadingFiltered] = useState(false);

  useEffect(() => {
    if (!allowed || !profile) return;
    let cancelled = false;
    setLoadingFiltered(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/reports/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: profile.id,
            portfolio_ids: selPortfolios,
            project_ids: selProjects,
            sections: selSections,
            people: selPeople,
            q,
            limit: 100,
            offset: 0,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        setFilteredTasks(json.rows || []);
        setTotalFiltered(json.total || 0);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoadingFiltered(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [allowed, profile, q, selPortfolios, selProjects, selSections, selPeople]);

  const rows = useMemo(() => visiblePeople.map((p) => {
    const mine = filteredTasks.filter((t) => t.assignee === p.id);
    const per = stageNames.map((s) => mine.filter((t) => t.stage === s && t.status === "completed").length);
    return { p, open: mine.filter((t) => t.status === "open").length, done: mine.filter((t) => t.status === "completed").length, per };
  }), [visiblePeople, filteredTasks, stageNames]);

  if (!loading && !allowed) return <Shell title="Reporting"><Empty text="Reporting isn't available on your dashboard." /></Shell>;

  return (
    <Shell title="Reporting">
      <PageHead title="Reporting" sub="Advanced reporting: filter by portfolio / project / section, pick individuals, and toggle views (list, kanban). Visibility respects reporting hierarchy." />

      <div className="grid gap-4 lg:grid-cols-4 mb-4">
        <div className="card p-3 lg:col-span-1">
          <label className="label">Search</label>
          <input className="input" placeholder="Task title or code" value={q} onChange={(e) => setQ(e.target.value)} />

          <label className="label mt-3">Portfolios</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {portfolios.map((pf) => (
              <label key={pf.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selPortfolios.includes(pf.id)} onChange={() => setSelPortfolios(toggleIn(selPortfolios, pf.id))} />
                <span className="ml-1">{pf.name}</span>
              </label>
            ))}
          </div>

          <label className="label mt-3">Projects</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {projects.filter((p) => !selPortfolios.length || selPortfolios.includes(p.portfolio_id)).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selProjects.includes(p.id)} onChange={() => setSelProjects(toggleIn(selProjects, p.id))} />
                <span className="ml-1">{p.name}</span>
              </label>
            ))}
          </div>

          <label className="label mt-3">Sections</label>
          <div className="space-y-1">
            {stageNames.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selSections.includes(s)} onChange={() => setSelSections(toggleIn(selSections, s))} />
                <span className="ml-1">{cap(s)}</span>
              </label>
            ))}
          </div>

          <label className="label mt-3">People</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {visiblePeople.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selPeople.includes(p.id)} onChange={() => setSelPeople(toggleIn(selPeople, p.id))} />
                <span className="ml-1">{displayName(p)}</span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button className="btn-ghost" onClick={() => { setSelPortfolios([]); setSelProjects([]); setSelSections([]); setSelPeople([]); setQ(""); }}>Reset</button>
            <button className="btn-primary ml-auto" onClick={() => downloadCSV("reporting-filtered", [
              ["Person", "Email", "Open", "Completed", ...stageNames.map((s) => cap(s))],
              ...rows.map(({ p, open, done, per }) => [displayName(p), p.email, open, done, ...per]),
            ])}>Export CSV</button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="card p-3 mb-3 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <button className={`btn-ghost ${view === "people" ? "bg-slate-100" : ""}`} onClick={() => setView("people")}>People view</button>
              <button className={`btn-ghost ${view === "tasks" ? "bg-slate-100" : ""}`} onClick={() => setView("tasks")}>Tasks list</button>
              <button className={`btn-ghost ${view === "kanban" ? "bg-slate-100" : ""}`} onClick={() => setView("kanban")}>Kanban</button>
            </div>
            <div className="ml-auto text-sm text-slate-500">Showing {filteredTasks.length} tasks • {visiblePeople.length} people visible</div>
          </div>

          {view === "people" && (
            <div className="card overflow-x-auto p-2">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 text-left text-xs font-bold uppercase text-slate-400">
                  <th className="p-3">Person</th><th className="p-3">Open</th><th className="p-3">Completed</th>
                  {stageNames.map((s) => <th key={s} className="p-3">{cap(s)}</th>)}</tr></thead>
                <tbody>
                  {rows.map(({ p, open, done, per }) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0">
                      <td className="p-3 font-semibold">{displayName(p)}</td>
                      <td className="p-3">{open}</td>
                      <td className="p-3 font-bold text-emerald-700">{done}</td>
                      {per.map((n, i) => <td key={i} className="p-3">{n}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === "tasks" && (
            <div className="space-y-2">
              {filteredTasks.length === 0 && <Empty text="No tasks match these filters." />}
              {filteredTasks.map((t) => (
                <div key={t.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
                  <span className="text-[11px] font-semibold text-brand-500">{t.code}</span>
                  <span className={t.status === "completed" ? "text-slate-400 line-through" : "font-semibold"}>{t.title}</span>
                  <span className="badge bg-brand-100 text-brand-700">{cap(t.stage)}</span>
                  <span className="ml-auto text-xs text-slate-500">{t.assignee ? displayName(people.find((p) => p.id === t.assignee)) : "Unassigned"}</span>
                </div>
              ))}
            </div>
          )}

          {view === "kanban" && (
            <div className="grid grid-cols-\[repeat(auto-fit,minmax(240px,1fr))\] gap-3">
              {stageNames.map((s) => (
                <div key={s} className="card p-3">
                  <h3 className="mb-2 font-semibold">{cap(s)}</h3>
                  <div className="space-y-2">
                    {filteredTasks.filter((t) => t.stage === s).map((t) => (
                      <div key={t.id} className="rounded-xl border border-slate-50 p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] font-semibold text-brand-500">{t.code}</div>
                          <div className={`ml-2 ${t.status === "completed" ? "text-slate-400 line-through" : "font-semibold"}`}>{t.title}</div>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{t.assignee ? displayName(people.find((p) => p.id === t.assignee)) : "Unassigned"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
