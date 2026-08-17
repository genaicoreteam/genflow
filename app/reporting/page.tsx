"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { Profile, Task, StageRow, cap } from "@/lib/types";
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
  const allowed = profile && featureAllowed(perms, "reporting", profile.role);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const db = supabase();
      const [{ data: t }, { data: pp }, { data: st }] = await Promise.all([
        db.from("tasks").select("*"),
        db.from("profiles").select("*").order("full_name"),
        db.from("stages").select("*").order("sort"),
      ]);
      setTasks((t as Task[]) || []); setPeople((pp as Profile[]) || []); setStages((st as StageRow[]) || []);
    })();
  }, [allowed]);

  const stageNames = useMemo(() => Array.from(new Set(stages.map((s) => s.name))), [stages]);
  const rows = useMemo(() => people.map((p) => {
    const mine = tasks.filter((t) => t.assignee === p.id);
    const per = stageNames.map((s) => mine.filter((t) => t.stage === s && t.status === "completed").length);
    return { p, open: mine.filter((t) => t.status === "open").length, done: mine.filter((t) => t.status === "completed").length, per };
  }), [people, tasks, stageNames]);

  if (!loading && !allowed) return <Shell title="Reporting"><Empty text="Reporting isn't available on your dashboard." /></Shell>;

  return (
    <Shell title="Reporting">
      <PageHead title="Reporting" sub="Workload by person and stage. A completed copy stays in its stage, so everyone's contribution stays counted." />
      <div className="card overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs font-bold uppercase text-slate-400">
            <th className="p-3">Person</th><th className="p-3">Open</th><th className="p-3">Completed</th>
            {stageNames.map((s) => <th key={s} className="p-3">{cap(s)} ✓</th>)}</tr></thead>
          <tbody>
            {rows.map(({ p, open, done, per }) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-semibold">{p.full_name}</td>
                <td className="p-3">{open}</td>
                <td className="p-3 font-bold text-emerald-700">{done}</td>
                {per.map((n, i) => <td key={i} className="p-3">{n}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-ghost mt-3" onClick={() => downloadCSV("workload-report", [
        ["Person", "Email", "Open", "Completed", ...stageNames.map((s) => cap(s))],
        ...rows.map(({ p, open, done, per }) => [p.full_name, p.email, open, done, ...per]),
      ])}>Export CSV</button>
    </Shell>
  );
}
