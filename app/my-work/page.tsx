"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty, StatusBadge } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Task, Project, StageRow, cap } from "@/lib/types";
import Link from "next/link";

export default function MyWork() {
  const { profile } = useProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const db = supabase();
      const [{ data: t }, { data: pj }, { data: st }] = await Promise.all([
        db.from("tasks").select("*").eq("assignee", profile.id).order("due_at", { ascending: true, nullsFirst: false }),
        db.from("projects").select("*"),
        db.from("stages").select("*").order("sort"),
      ]);
      setTasks((t as Task[]) || []); setProjects((pj as Project[]) || []); setStages((st as StageRow[]) || []);
    })();
  }, [profile]);

  const pj = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const stageColor = (name: string, projectId: string) =>
    stages.find((s) => s.project_id === projectId && s.name === name)?.color
    || stages.find((s) => s.name === name)?.color || "#2F63F6";

  return (
    <Shell title="My Work">
      <PageHead title="My Work" sub="Everything assigned to you, across every project and stage — soonest deadline first." />
      {tasks.length === 0 ? <Empty text="Nothing assigned to you right now." /> : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/project/${t.project_id}`} className="card flex flex-wrap items-center gap-2 p-3 text-sm hover:border-brand-200">
              <span className="text-[11px] font-semibold text-brand-500">{t.code}</span>
              <span className={t.status === "completed" ? "text-slate-400 line-through" : "font-semibold"}>{t.title}</span>
              <span className="badge text-white" style={{ background: stageColor(t.stage, t.project_id) }}>{cap(t.stage)}</span>
              <span className="badge bg-brand-100 text-brand-700">{pj[t.project_id]?.name}</span>
              <span className="ml-auto flex items-center gap-2">
                {t.due_at && <span className={`text-xs ${t.status === "open" && new Date(t.due_at) < new Date() ? "font-bold text-red-600" : "text-slate-500"}`}>{new Date(t.due_at).toLocaleString()}</span>}
                <StatusBadge s={t.status} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
