"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty, StatusBadge } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Task, Project, Profile, StageRow, cap } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import { formatDueAt } from "@/lib/date";
import TaskDetailModal from "@/components/TaskDetailModal";
import Link from "next/link";

export default function MyWork() {
  const { profile } = useProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    const db = supabase();
    const [{ data: t }, { data: pj }, { data: st }, { data: pp }] = await Promise.all([
      db.from("tasks").select("*").eq("assignee", profile.id).order("due_at", { ascending: true, nullsFirst: false }),
      db.from("projects").select("*"),
      db.from("stages").select("*").order("sort"),
      db.from("profiles").select("*").order("full_name"),
    ]);
    setTasks((t as Task[]) || []); setProjects((pj as Project[]) || []); setStages((st as StageRow[]) || []); setPeople((pp as Profile[]) || []);
  }
  useEffect(() => { load(); }, [profile]);

  const pj = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const stageColor = (name: string, projectId: string) =>
    stages.find((s) => s.project_id === projectId && s.name === name)?.color
    || stages.find((s) => s.name === name)?.color || "#2F63F6";

  const stageNames = useMemo(() => Array.from(new Set(stages.map((s) => s.name))), [stages]);
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) || null : null;

  return (
    <Shell title="My Work">
      <PageHead title="My Work" sub="Everything assigned to you, across every project and stage — soonest deadline first." />
      <div className="card mb-3 p-3 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <button className={`btn-ghost ${view === "list" ? "bg-slate-100" : ""}`} onClick={() => setView("list")}>List view</button>
          <button className={`btn-ghost ${view === "kanban" ? "bg-slate-100" : ""}`} onClick={() => setView("kanban")}>Kanban view</button>
        </div>
        <div className="ml-auto text-sm text-slate-500">{tasks.length} tasks assigned to you</div>
      </div>

      {view === "list" && (
        tasks.length === 0 ? <Empty text="Nothing assigned to you right now." /> : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm cursor-pointer hover:border-brand-200" onClick={() => setOpenTaskId(t.id)}>
                <span className="text-[11px] font-semibold text-brand-500">{t.code}</span>
                <button title="Copy task ID" className="text-slate-400 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); copyText(t.code); }}>📋</button>
                <span className={t.status === "completed" ? "text-slate-400 line-through" : "font-semibold"}>{t.title}</span>
                <span className="badge text-white" style={{ background: stageColor(t.stage, t.project_id) }}>{cap(t.stage)}</span>
                <span className="badge bg-brand-100 text-brand-700">{pj[t.project_id]?.name}</span>
                <span className="ml-auto flex items-center gap-2">
                  {t.due_at && <span className={`text-xs ${t.status === "open" && new Date(t.due_at) < new Date() ? "font-bold text-red-600" : "text-slate-500"}`}>{formatDueAt(t.due_at)}</span>}
                  <StatusBadge s={t.status} />
                  <Link href={`/project/${t.project_id}`} onClick={(e) => e.stopPropagation()} title="Open project" className="text-slate-400 hover:text-slate-600">↗</Link>
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {view === "kanban" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {stageNames.map((s) => (
            <div key={s} className="card p-3">
              <h3 className="mb-2 font-semibold">{cap(s)}</h3>
              <div className="space-y-2">
                {tasks.filter((t) => t.stage === s).map((t) => (
                  <div key={t.id} className="rounded-xl border border-slate-50 p-2 text-sm cursor-pointer hover:border-brand-200" onClick={() => setOpenTaskId(t.id)}>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-semibold text-brand-500">{t.code}</div>
                      <button title="Copy task ID" className="text-slate-400 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); copyText(t.code); }}>📋</button>
                      <div className={`ml-2 ${t.status === "completed" ? "text-slate-400 line-through" : "font-semibold"}`}>{t.title}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{pj[t.project_id]?.name} • {t.due_at ? formatDueAt(t.due_at) : "No due"}</span>
                      <Link href={`/project/${t.project_id}`} onClick={(e) => e.stopPropagation()} title="Open project" className="text-slate-400 hover:text-slate-600">↗</Link>
                    </div>
                  </div>
                ))}
                {tasks.filter((t) => t.stage === s).length === 0 && <div className="text-sm text-slate-400">No tasks</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask} people={people} canEdit
          onClose={() => setOpenTaskId(null)} onChanged={load}
        />
      )}
    </Shell>
  );
}
