"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { useProfile } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { Task, Project, Portfolio, StageRow, cap } from "@/lib/types";
import { downloadDoc, downloadText } from "@/lib/csv";

/* Cumulative Report — aggregates COMPLETED tasks by portfolio → stage → project,
   producing the daily / weekly / monthly overview in the team's house format. */

export default function CumulativeReport() {
  const { profile, loading } = useProfile();
  const perms = useFeaturePerms();
  const allowed = profile && featureAllowed(perms, "cumulative", profile.role);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const db = supabase();
      const [{ data: t }, { data: pj }, { data: pf }, { data: st }] = await Promise.all([
        db.from("tasks").select("*").eq("status", "completed"),
        db.from("projects").select("*"),
        db.from("portfolios").select("*").order("sort"),
        db.from("stages").select("*").order("sort"),
      ]);
      setTasks((t as Task[]) || []); setProjects((pj as Project[]) || []);
      setPortfolios((pf as Portfolio[]) || []); setStages((st as StageRow[]) || []);
    })();
  }, [allowed]);

  const { fromD, toD, label } = useMemo(() => {
    const a = new Date(anchor + "T00:00:00");
    if (range === "day") return { fromD: a, toD: new Date(a.getTime() + 86400000), label: a.toLocaleDateString("en-IN", { day: "numeric", month: "long" }) };
    if (range === "week") { const s = new Date(a); s.setDate(a.getDate() - a.getDay()); const e = new Date(s.getTime() + 7 * 86400000); return { fromD: s, toD: e, label: `Week of ${s.toLocaleDateString()}` }; }
    const s = new Date(a.getFullYear(), a.getMonth(), 1); const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { fromD: s, toD: e, label: a.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }, [range, anchor]);

  const stageNames = useMemo(() => Array.from(new Set(stages.map((s) => s.name))), [stages]);

  const report = useMemo(() => {
    const done = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= fromD && new Date(t.completed_at) < toD);
    const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
    const out: { portfolio: string; stages: { stage: string; lines: string[] }[] }[] = [];
    for (const pf of portfolios) {
      const stageBuckets: { stage: string; lines: string[] }[] = [];
      for (const s of stageNames) {
        const inStage = done.filter((t) => t.stage === s && projById[t.project_id]?.portfolio_id === pf.id);
        const counts: Record<string, number> = {};
        for (const t of inStage) {
          const verb = s.includes("post") ? "posted on" : s;
          const key = `${(t.content_type || "task").toLowerCase()} ${verb} — ${projById[t.project_id]?.name || "project"}`;
          counts[key] = (counts[key] || 0) + 1;
        }
        const lines = Object.entries(counts).map(([k, n]) => `${n} ${k}`);
        if (lines.length) stageBuckets.push({ stage: cap(s), lines });
      }
      if (stageBuckets.length) out.push({ portfolio: pf.name, stages: stageBuckets });
    }
    return out;
  }, [tasks, projects, portfolios, stageNames, fromD, toD]);

  const asText = () => {
    let s = `${range === "day" ? "Daily" : range === "week" ? "Weekly" : "Monthly"} Report - ${label}\n`;
    for (const p of report) {
      s += `\n${p.portfolio}\n`;
      for (const st of p.stages) { s += `${st.stage}\n`; st.lines.forEach((l) => (s += `- ${l}\n`)); }
    }
    return s;
  };

  if (!loading && !allowed) return <Shell title="Cumulative Report"><Empty text="The Cumulative Report isn't available on your dashboard." /></Shell>;

  return (
    <Shell title="Cumulative Report">
      <PageHead title="Cumulative Report" sub="Auto-generated from completed tasks: each portfolio, each stage, each project — daily, weekly or monthly." />
      <div className="card mb-4 flex flex-wrap items-end gap-2 p-4">
        <div><label className="label">Range</label>
          <select className="input" value={range} onChange={(e) => setRange(e.target.value as any)}>
            <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
          </select></div>
        <div><label className="label">Date</label><input type="date" className="input" value={anchor} onChange={(e) => setAnchor(e.target.value)} /></div>
        <span className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={() => downloadText(`report-${anchor}.txt`, asText())}>Export .txt</button>
          <button className="btn-ghost" onClick={() => downloadDoc(`report-${anchor}`, "Cumulative report", asText().replace(/\n/g, "<br>"))}>Export Doc</button>
        </span>
      </div>
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">{range === "day" ? "Daily" : range === "week" ? "Weekly" : "Monthly"} Report — {label}</h2>
        {report.length === 0 && <p className="text-sm text-slate-500">No tasks were completed in this range yet. Completed tasks appear here automatically.</p>}
        {report.map((p) => (
          <div key={p.portfolio} className="mb-5">
            <h3 className="font-display font-bold text-brand-600">{p.portfolio}</h3>
            {p.stages.map((s) => (
              <div key={s.stage} className="mt-2">
                <div className="text-sm font-semibold">{s.stage}</div>
                <ul className="ml-4 list-disc text-sm text-brand-ink">
                  {s.lines.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}
