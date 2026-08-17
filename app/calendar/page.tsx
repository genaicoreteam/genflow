"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { Task, Project, Portfolio, StageRow, cap } from "@/lib/types";

/* Workspace calendar, customisable by portfolio → project → stage (changes #2a, #10d). */
export default function CalendarPage() {
  const { profile } = useProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [grants, setGrants] = useState<{ pf: string[]; pj: string[] } | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [fPf, setFPf] = useState("");
  const [fPj, setFPj] = useState("");
  const [fStage, setFStage] = useState("");

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const db = supabase();
      const [{ data: t }, { data: pj }, { data: pf }, { data: st }] = await Promise.all([
        db.from("tasks").select("*").not("due_at", "is", null),
        db.from("projects").select("*").order("sort"),
        db.from("portfolios").select("*").order("sort"),
        db.from("stages").select("*").order("sort"),
      ]);
      setTasks((t as Task[]) || []); setProjects((pj as Project[]) || []);
      setPortfolios((pf as Portfolio[]) || []); setStages((st as StageRow[]) || []);
      if (profile.role === "member") {
        const [{ data: pm }, { data: pjm }] = await Promise.all([
          db.from("portfolio_members").select("portfolio_id").eq("profile_id", profile.id),
          db.from("project_members").select("project_id").eq("profile_id", profile.id),
        ]);
        setGrants({ pf: (pm || []).map((r: any) => r.portfolio_id), pj: (pjm || []).map((r: any) => r.project_id) });
      } else setGrants(null);
    })();
  }, [profile]);

  const allowedProjects = useMemo(() => projects.filter((p) => {
    if (!grants) return true;
    return grants.pf.includes(p.portfolio_id) || grants.pj.includes(p.id);
  }), [projects, grants]);

  const pjOptions = allowedProjects.filter((p) => !fPf || p.portfolio_id === fPf);
  const stageNames = useMemo(() => {
    const relevant = stages.filter((s) => (fPj ? s.project_id === fPj : pjOptions.some((p) => p.id === s.project_id)));
    return Array.from(new Set(relevant.map((s) => s.name)));
  }, [stages, fPj, pjOptions]);

  const visible = tasks.filter((t) => {
    const proj = allowedProjects.find((p) => p.id === t.project_id);
    if (!proj) return false;
    if (profile?.role === "member" && t.assignee !== profile.id) return false;
    if (fPf && proj.portfolio_id !== fPf) return false;
    if (fPj && t.project_id !== fPj) return false;
    if (fStage && t.stage !== fStage) return false;
    return true;
  });

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const byDay = useMemo(() => {
    const map: Record<number, Task[]> = {};
    visible.forEach((t) => {
      const d = new Date(t.due_at!);
      if (d.getFullYear() === y && d.getMonth() === m - 1) (map[d.getDate()] ||= []).push(t);
    });
    return map;
  }, [visible, y, m]);

  return (
    <Shell title="Calendar">
      <PageHead title="Calendar" sub="Pick a portfolio, a project, or a single stage — the calendar shows exactly that slice of deadlines." />
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input type="month" className="input max-w-[170px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select className="input max-w-[180px]" value={fPf} onChange={(e) => { setFPf(e.target.value); setFPj(""); setFStage(""); }}>
          <option value="">All portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input max-w-[220px]" value={fPj} onChange={(e) => { setFPj(e.target.value); setFStage(""); }}>
          <option value="">All projects</option>
          {pjOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input max-w-[170px]" value={fStage} onChange={(e) => setFStage(e.target.value)}>
          <option value="">All stages</option>
          {stageNames.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <span className="ml-auto badge bg-brand-100 text-brand-700">{visible.length} tasks in view</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs font-bold text-slate-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="p-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={"x" + i} />)}
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} className="card min-h-20 p-1.5">
            <div className="text-xs font-bold text-slate-400">{i + 1}</div>
            {(byDay[i + 1] || []).slice(0, 3).map((t) => (
              <div key={t.id} className={`mt-0.5 truncate rounded px-1 text-[10px] font-semibold ${t.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700"}`}>{t.code} {t.title}</div>
            ))}
            {(byDay[i + 1] || []).length > 3 && <div className="text-[10px] text-slate-400">+{byDay[i + 1].length - 3} more</div>}
          </div>
        ))}
      </div>
    </Shell>
  );
}
