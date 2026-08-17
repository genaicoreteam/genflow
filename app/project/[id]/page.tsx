"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { StatusBadge, Spinner } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { Task, Project, Profile, AutomationRule, StageRow, LogicRule, cap, displayName } from "@/lib/types";
import { pushNotification } from "@/lib/notify";
import { runLogicRules } from "@/lib/automation";

const TABS = ["Tasks", "Roadmap", "Discussions", "Docs", "Files", "Calendar"] as const;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading } = useProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logic, setLogic] = useState<LogicRule[]>([]);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Tasks");
  const [scope, setScope] = useState<"all" | "open" | "completed">("all");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [editStages, setEditStages] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = profile && profile.role !== "member";

  async function load() {
    const db = supabase();
    const [{ data: pj }, { data: st }, { data: ts }, { data: ps }, { data: rs }, { data: lr }] = await Promise.all([
      db.from("projects").select("*").eq("id", id).maybeSingle(),
      db.from("stages").select("*").eq("project_id", id).order("sort"),
      db.from("tasks").select("*").eq("project_id", id).order("created_at"),
      db.from("profiles").select("*").order("full_name"),
      db.from("automation_rules").select("*").or(`project_id.eq.${id},project_id.is.null`).eq("active", true),
      db.from("logic_rules").select("*").or(`project_id.eq.${id},project_id.is.null`).eq("active", true),
    ]);
    setProject(pj as Project); setStages((st as StageRow[]) || []); setTasks((ts as Task[]) || []);
    setPeople((ps as Profile[]) || []); setRules((rs as AutomationRule[]) || []); setLogic((lr as LogicRule[]) || []);
  }
  useEffect(() => { if (id) load(); }, [id]);

  // Members only enter projects they were granted (portfolio or project level)
  useEffect(() => {
    (async () => {
      if (!profile || !project) return;
      if (profile.role !== "member") { setGranted(true); return; }
      const db = supabase();
      const [{ data: pm }, { data: pjm }] = await Promise.all([
        db.from("portfolio_members").select("portfolio_id").eq("profile_id", profile.id).eq("portfolio_id", project.portfolio_id),
        db.from("project_members").select("project_id").eq("profile_id", profile.id).eq("project_id", project.id),
      ]);
      setGranted(!!(pm?.length || pjm?.length));
    })();
  }, [profile, project]);

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const stageNames = stages.map((s) => s.name);

  const visibleTasks = tasks.filter((t) => {
    if (scope !== "all" && t.status !== scope) return false;
    if (q && !(t.title + " " + t.code).toLowerCase().includes(q.toLowerCase())) return false;
    if (profile?.role === "member" && t.assignee !== profile.id) return false;
    return true;
  });

  const newCode = (offset = 1) => `${project?.prefix || "PRJ"}1-${String(tasks.length + offset).padStart(2, "0")}`;

  async function notifyAssignee(pid: string | null, taskTitle: string, code: string, stage: string, due?: string | null) {
    if (!pid) return;
    const p = byId[pid];
    if (!p) return;
    await pushNotification(p.id, p.email, "New task assigned to you",
      `"${taskTitle}" (${code}) in ${project?.name} — ${cap(stage)}${due ? `, due ${new Date(due).toLocaleString()}` : ""}.`,
      `/project/${id}`);
  }

  async function addTask(stage: string, title: string) {
    if (!title.trim() || !project) return;
    const code = newCode();
    const { data } = await supabase().from("tasks").insert({
      project_id: project.id, code, title: title.trim(), stage, status: "open",
      assignee: profile?.id || null, created_by: profile?.id || null,
    }).select().maybeSingle();
    if (data) await runLogicRules({ rules: logic, trigger: "task_created", task: data as Task, people, projectPrefix: project.prefix, taskCount: tasks.length + 1, actorName: displayName(profile) });
    load();
  }

  /** Change #2d: the live card MOVES forward per automation; a completed
      duplicate stays behind in the original stage for reports. */
  async function completeTask(t: Task, dropStage?: string) {
    if (busy) return; setBusy(true);
    const db = supabase();
    const now = new Date();
    const rule = rules.find((r) => r.from_stage === t.stage && (!dropStage || r.to_stage === dropStage));
    const target = dropStage || rule?.to_stage || null;

    // completed duplicate stays behind, keeping the original code + doer
    await db.from("tasks").insert({
      project_id: t.project_id, code: t.code, title: t.title, stage: t.stage,
      status: "completed", completed_at: now.toISOString(), assignee: t.assignee,
      origin_task: t.id, content_type: t.content_type, created_by: profile?.id || null,
    });

    if (target) {
      const nextAssignee = rule?.new_assignee || t.assignee;
      const due = new Date(now.getTime() + (rule?.due_offset_hours || 24) * 3600000).toISOString();
      await db.from("tasks").update({
        stage: target, status: "open", assignee: nextAssignee, due_at: due,
        code: newCode(2), completed_at: null,
      }).eq("id", t.id);
      if (nextAssignee && nextAssignee !== t.assignee) await notifyAssignee(nextAssignee, t.title, newCode(2), target, due);
      else if (nextAssignee) await notifyAssignee(nextAssignee, t.title, newCode(2), target, due);
      await runLogicRules({ rules: logic, trigger: "moved_to_stage", task: { ...t, stage: target }, stageMoved: target, people, projectPrefix: project?.prefix || "PRJ", taskCount: tasks.length + 2, actorName: displayName(profile) });
    } else {
      // last stage (or no rule): simply complete in place
      await db.from("tasks").update({ status: "completed", completed_at: now.toISOString() }).eq("id", t.id);
    }
    await runLogicRules({ rules: logic, trigger: "task_completed", task: t, people, projectPrefix: project?.prefix || "PRJ", taskCount: tasks.length + 2, actorName: displayName(profile) });
    setBusy(false); load();
  }

  async function reopen(t: Task) {
    await supabase().from("tasks").update({ status: "open", completed_at: null }).eq("id", t.id); load();
  }
  async function onDrop(stage: string) {
    if (!drag) return;
    const t = tasks.find((x) => x.id === drag);
    setDrag(null);
    if (!t || t.stage === stage || t.status === "completed") return;
    await completeTask(t, stage);
  }
  async function setAssignee(t: Task, pid: string) {
    await supabase().from("tasks").update({ assignee: pid || null }).eq("id", t.id);
    if (pid && pid !== t.assignee) await notifyAssignee(pid, t.title, t.code, t.stage, t.due_at);
    await runLogicRules({ rules: logic, trigger: pid ? "assignee_changed" : "task_unassigned", task: { ...t, assignee: pid || null }, people, projectPrefix: project?.prefix || "PRJ", taskCount: tasks.length + 1, actorName: displayName(profile) });
    load();
  }
  async function setDue(t: Task, v: string) {
    await supabase().from("tasks").update({ due_at: v ? new Date(v).toISOString() : null }).eq("id", t.id); load();
  }
  async function setContentType(t: Task, v: string) {
    await supabase().from("tasks").update({ content_type: v || null }).eq("id", t.id); load();
  }
  async function renameTask(t: Task) {
    const title = prompt("Edit task title", t.title);
    if (title && title.trim()) { await supabase().from("tasks").update({ title: title.trim() }).eq("id", t.id); load(); }
  }
  async function deleteTask(t: Task) {
    if (!confirm(`Delete ${t.code} — "${t.title}"?`)) return;
    await supabase().from("tasks").delete().eq("id", t.id); load();
  }
  async function duplicateTask(t: Task) {
    await supabase().from("tasks").insert({
      project_id: t.project_id, code: newCode(), title: t.title, stage: t.stage, status: "open",
      assignee: t.assignee, content_type: t.content_type, created_by: profile?.id || null,
    });
    load();
  }

  /* ------ Stage management (Nifty "Add Status") ------ */
  async function addStage() {
    const name = prompt("New stage name (e.g. Review)");
    if (!name?.trim() || !project) return;
    await supabase().from("stages").insert({ project_id: project.id, name: name.trim().toLowerCase(), color: "#2F63F6", sort: stages.length });
    load();
  }
  async function renameStage(s: StageRow) {
    const name = prompt("Rename stage", cap(s.name));
    if (!name?.trim()) return;
    const newName = name.trim().toLowerCase();
    await supabase().from("stages").update({ name: newName }).eq("id", s.id);
    await supabase().from("tasks").update({ stage: newName }).eq("project_id", s.project_id).eq("stage", s.name);
    load();
  }
  async function recolorStage(s: StageRow, color: string) {
    await supabase().from("stages").update({ color }).eq("id", s.id); load();
  }
  async function moveStage(s: StageRow, dir: -1 | 1) {
    const idx = stages.findIndex((x) => x.id === s.id);
    const other = stages[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase().from("stages").update({ sort: other.sort }).eq("id", s.id),
      supabase().from("stages").update({ sort: s.sort }).eq("id", other.id),
    ]);
    load();
  }
  async function removeStage(s: StageRow) {
    const inStage = tasks.filter((t) => t.stage === s.name).length;
    if (!confirm(`Remove stage "${cap(s.name)}"${inStage ? ` and its ${inStage} task(s)` : ""}?`)) return;
    await supabase().from("tasks").delete().eq("project_id", s.project_id).eq("stage", s.name);
    await supabase().from("stages").delete().eq("id", s.id);
    load();
  }

  if (!loading && granted === false) return (
    <Shell title={project?.name}><div className="card p-10 text-center text-sm text-slate-500">You don't have access to this project yet. Ask your admin or coordinator to grant it in Admin → Access.</div></Shell>
  );

  return (
    <Shell title={project?.name}>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl font-display text-xs font-bold text-white" style={{ background: project?.color || "#1D4ED8" }}>{project?.prefix}</span>
        <h1 className="mr-4 text-lg font-extrabold">{project?.name || "Project"}</h1>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? "tab-active" : ""}`}>{t}</button>)}
        </div>
      </div>

      {tab === "Tasks" && (
        <>
          <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
            <input className="input max-w-xs" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input max-w-[200px]" value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="all">Active and Completed</option>
              <option value="open">Active only</option>
              <option value="completed">Completed only</option>
            </select>
            {canEdit && <button className={`btn-ghost ml-auto ${editStages ? "!bg-brand-ink !text-white" : ""}`} onClick={() => setEditStages(!editStages)}>✎ Edit stages</button>}
            {canEdit && editStages && <button className="btn-primary" onClick={addStage}>+ Add stage</button>}
          </div>
          {stages.length === 0 && <Spinner />}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stages.map((s, si) => (
              <div key={s.id} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(s.name)}
                className="rounded-2xl border border-slate-100 bg-white/70 p-2">
                <div className="mb-2 flex items-center gap-1 rounded-xl px-2 py-1.5" style={{ background: s.color + "1A" }}>
                  <span className="text-sm font-bold" style={{ color: s.color }}>{cap(s.name)}</span>
                  <span className="badge ml-1 border border-slate-100 bg-white text-slate-600">
                    {visibleTasks.filter((t) => t.stage === s.name).length}
                  </span>
                  {editStages && canEdit && (
                    <span className="ml-auto flex items-center gap-1">
                      <input type="color" value={s.color} onChange={(e) => recolorStage(s, e.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent" title="Colour" />
                      <button className="rounded px-1 hover:bg-white" onClick={() => moveStage(s, -1)} disabled={si === 0} title="Move left">◀</button>
                      <button className="rounded px-1 hover:bg-white" onClick={() => moveStage(s, 1)} disabled={si === stages.length - 1} title="Move right">▶</button>
                      <button className="rounded px-1 hover:bg-white" onClick={() => renameStage(s)} title="Rename">✎</button>
                      <button className="rounded px-1 text-red-600 hover:bg-white" onClick={() => removeStage(s)} title="Remove">✕</button>
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {visibleTasks.filter((t) => t.stage === s.name).map((t) => (
                    <TaskCard key={t.id} t={t} people={people} canEdit={!!canEdit} me={profile?.id}
                      onDragStart={() => setDrag(t.id)}
                      onComplete={() => completeTask(t)} onReopen={() => reopen(t)}
                      onAssign={(v) => setAssignee(t, v)} onDue={(v) => setDue(t, v)} onContent={(v) => setContentType(t, v)}
                      onRename={() => renameTask(t)} onDelete={() => deleteTask(t)} onDuplicate={() => duplicateTask(t)} />
                  ))}
                  {canEdit && <AddTask onAdd={(v) => addTask(s.name, v)} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Roadmap" && <Roadmap tasks={tasks} byId={byId} stages={stages} />}
      {tab === "Discussions" && <Discussions projectId={id} people={people} projectName={project?.name || ""} />}
      {tab === "Docs" && <Docs projectId={id} />}
      {tab === "Files" && <ProjectFiles projectId={id} />}
      {tab === "Calendar" && <ProjectCalendar tasks={profile?.role === "member" ? tasks.filter((t) => t.assignee === profile.id) : tasks} stages={stages} />}
    </Shell>
  );
}

function TaskCard({ t, people, canEdit, me, onDragStart, onComplete, onReopen, onAssign, onDue, onContent, onRename, onDelete, onDuplicate }: any) {
  const [menu, setMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const editable = canEdit || t.assignee === me;

  async function copyCode() {
    try { await navigator.clipboard.writeText(t.code || ""); alert("Task ID copied to clipboard"); } catch { alert("Copy failed — your browser blocked clipboard access."); }
  }

  return (
    <div draggable={editable && t.status === "open"} onDragStart={onDragStart} className="card relative cursor-grab p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-brand-500">{t.code}</span>
          <button title="Copy task ID" className="text-slate-400 hover:text-slate-600" onClick={copyCode}>📋</button>
        </div>
        <span className="flex items-center gap-1">
          <StatusBadge s={t.status} />
          <button className="rounded px-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setShowComments((s) => !s)} title="Comments">💬</button>
          {editable && (
            <button className="rounded px-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setMenu(!menu)}>⋯</button>
          )}
        </span>
      </div>
      {menu && (
        <div className="absolute right-2 top-8 z-20 w-36 overflow-hidden rounded-xl border border-slate-100 bg-white text-sm shadow-card">
          <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setMenu(false); onRename(); }}>✎ Edit title</button>
          <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setMenu(false); onDuplicate(); }}>⧉ Duplicate</button>
          <button className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => { setMenu(false); onDelete(); }}>🗑 Delete</button>
        </div>
      )}
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={t.status === "completed"} disabled={!editable}
          onChange={() => (t.status === "open" ? onComplete() : onReopen())} className="mt-0.5 accent-brand-500" />
        <span className={`text-sm font-semibold ${t.status === "completed" ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
      </label>
      <div className="mt-2 flex items-center justify-between gap-2">
        <input type="datetime-local" className="input !w-auto !px-2 !py-1 text-xs" disabled={!canEdit}
          value={t.due_at ? new Date(t.due_at).toISOString().slice(0, 16) : ""} onChange={(e) => onDue(e.target.value)} />
        <select className="input !w-28 !px-1 !py-1 text-xs" disabled={!canEdit} value={t.assignee || ""} onChange={(e) => onAssign(e.target.value)}>
          <option value="">Unassigned</option>
          {people.map((p: Profile) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
        </select>
      </div>
      <select className="input mt-1 !w-full !px-1 !py-1 text-xs" disabled={!editable} value={t.content_type || ""} onChange={(e) => onContent(e.target.value)}>
        <option value="">Content type…</option>
        <option value="reel">Reel</option><option value="full length">Full length</option>
        <option value="short">Short</option><option value="poster">Poster</option><option value="other">Other</option>
      </select>
      {t.due_at && t.status === "open" && new Date(t.due_at) < new Date() && (
        <div className="mt-1 text-[11px] font-bold text-red-600">Overdue · {new Date(t.due_at).toLocaleString()}</div>
      )}

      {showComments && <TaskComments taskCode={t.code} people={people} projectId={t.project_id} />}
    </div>
  );
}

function TaskComments({ taskCode, people, projectId }: { taskCode: string; people: Profile[]; projectId: string }) {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await supabase().from("discussions").select("*, profiles(full_name)").eq("task_code", taskCode).order("created_at");
    setRows(data || []);
  }
  useEffect(() => { load(); }, [taskCode]);

  const word = msg.split(/\s/).pop() || "";
  const picking = word.startsWith("@") && !word.includes("]");
  const matches = picking ? people.filter((p) => displayName(p).toLowerCase().includes(word.slice(1).toLowerCase())).slice(0, 6) : [];

  function pick(p: Profile) {
    const parts = msg.split(/\s/); parts.pop();
    setMsg([...parts, `@[${displayName(p)}]`].join(" ") + " ");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || !profile) return;
    await supabase().from("discussions").insert({ project_id: projectId, author: profile.id, body: msg.trim(), task_code: taskCode });
    const mentioned = Array.from(msg.matchAll(/@\[([^\]]+)\]/g)).map((m) => m[1]);
    for (const name of mentioned) {
      const p = people.find((x) => displayName(x) === name);
      if (p && p.id !== profile.id)
        await pushNotification(p.id, p.email, `${displayName(profile)} mentioned you`, `In project discussion: "${msg.trim().slice(0, 140)}"`, `/project/${projectId}`);
    }
    setMsg(""); load();
  }

  const render = (body: string) => {
    const parts = body.split(/(@\[[^\]]+\])/g);
    return parts.map((p, i) => p.startsWith("@[")
      ? <span key={i} className="badge bg-brand-100 text-brand-700">@{p.slice(2, -1)}</span>
      : <span key={i}>{p}</span>);
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
      <div className="max-h-40 overflow-y-auto space-y-2 mb-2">
        {rows.length === 0 && <div className="text-slate-500">No comments yet — mention people with @ to notify them.</div>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-2">
            <div className="flex items-center gap-2 text-xs text-slate-500"><b className="text-brand-ink">{displayName(r.profiles || { email: "", full_name: "" })}</b><span>{new Date(r.created_at).toLocaleString()}</span></div>
            <div className="mt-1 text-sm">{render(r.body)}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="relative flex gap-2">
        {picking && matches.length > 0 && (
          <div className="absolute bottom-12 left-0 z-20 w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
            {matches.map((p) => (
              <button type="button" key={p.id} onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50">@{displayName(p)}</button>
            ))}
          </div>
        )}
        <input className="input" placeholder="Write a comment… @mention people" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="btn-primary">Post</button>
      </form>
    </div>
  );
}

function AddTask({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd(v); setV(""); }} className="flex gap-1">
      <input className="input !py-1.5 text-sm" placeholder="+ Add a Task" value={v} onChange={(e) => setV(e.target.value)} />
      {v && <button className="btn-primary !px-3 !py-1.5">Add</button>}
    </form>
  );
}

function Roadmap({ tasks, byId, stages }: { tasks: Task[]; byId: Record<string, Profile>; stages: StageRow[] }) {
  const withDue = [...tasks].sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
  const color = (name: string) => stages.find((s) => s.name === name)?.color || "#2F63F6";
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm text-slate-500">Every task, ordered by deadline — the assembly line from first stage to last.</p>
      <div className="space-y-1">
        {withDue.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
        {withDue.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-50 p-2 text-sm">
            <span className="text-[11px] font-bold text-brand-500">{t.code}</span>
            <span className="badge text-white" style={{ background: color(t.stage) }}>{cap(t.stage)}</span>
            <span className={`font-semibold ${t.status === "completed" ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
            {t.content_type && <span className="badge bg-slate-100 text-slate-600">{t.content_type}</span>}
            <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              {t.assignee && <span>{displayName(byId[t.assignee])}</span>}
              {t.due_at && <span className={t.status === "open" && new Date(t.due_at) < new Date() ? "font-bold text-red-600" : ""}>{new Date(t.due_at).toLocaleString()}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Discussions with @mentions: type @ to pick a person; they get notified. */
function Discussions({ projectId, people, projectName }: { projectId: string; people: Profile[]; projectName: string }) {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [showPick, setShowPick] = useState(false);

  async function load() {
    const { data } = await supabase().from("discussions").select("*, profiles(full_name)").eq("project_id", projectId).order("created_at");
    setRows(data || []);
  }
  useEffect(() => { load(); }, [projectId]);

  const word = msg.split(/\s/).pop() || "";
  const picking = word.startsWith("@") && !word.includes("]");
  const matches = picking ? people.filter((p) => displayName(p).toLowerCase().includes(word.slice(1).toLowerCase())).slice(0, 6) : [];

  function pick(p: Profile) {
    const parts = msg.split(/\s/); parts.pop();
    setMsg([...parts, `@[${displayName(p)}]`].join(" ") + " ");
    setShowPick(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || !profile) return;
    const codeMatch = msg.match(/[A-Z]{2,4}\d-\d{2,}/);
    await supabase().from("discussions").insert({ project_id: projectId, author: profile.id, body: msg.trim(), task_code: codeMatch?.[0] || null });
    // notify each mentioned person
    const mentioned = Array.from(msg.matchAll(/@\[([^\]]+)\]/g)).map((m) => m[1]);
    for (const name of mentioned) {
      const p = people.find((x) => displayName(x) === name);
      if (p && p.id !== profile.id)
        await pushNotification(p.id, p.email, `${displayName(profile)} mentioned you`,
          `In ${projectName} discussions: "${msg.trim().slice(0, 140)}"`, `/project/${projectId}`);
    }
    setMsg(""); load();
  }

  const render = (body: string) => {
    const parts = body.split(/(@\[[^\]]+\])/g);
    return parts.map((p, i) => p.startsWith("@[")
      ? <span key={i} className="badge bg-brand-100 text-brand-700">@{p.slice(2, -1)}</span>
      : <span key={i}>{p}</span>);
  };

  return (
    <div className="card p-4">
      <div className="mb-3 max-h-[50vh] space-y-2 overflow-y-auto">
        {rows.length === 0 && <p className="text-sm text-slate-500">No messages yet. Use @ to mention someone; paste a task ID (like CDT1-04) to link a task.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <b className="text-brand-ink">{displayName(r.profiles || { email: "", full_name: "" })}</b>
              {r.task_code && <span className="badge bg-brand-100 text-brand-700">{r.task_code}</span>}
              <span>{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-sm">{render(r.body)}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="relative flex gap-2">
        {picking && matches.length > 0 && (
          <div className="absolute bottom-12 left-0 z-20 w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
            {matches.map((p) => (
              <button type="button" key={p.id} onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50">@{displayName(p)}</button>
            ))}
          </div>
        )}
        <input className="input" placeholder="Write a message… @mention people, include a task ID to link it"
          value={msg} onChange={(e) => { setMsg(e.target.value); setShowPick(true); }} />
        <button className="btn-primary">Send</button>
      </form>
    </div>
  );
}

function Docs({ projectId }: { projectId: string }) {
  const { profile } = useProfile();
  const [docs, setDocs] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  async function load() {
    const { data } = await supabase().from("project_docs").select("*").eq("project_id", projectId).order("updated_at", { ascending: false });
    setDocs(data || []);
  }
  useEffect(() => { load(); }, [projectId]);
  async function save() {
    if (!title.trim()) return;
    if (open) await supabase().from("project_docs").update({ title, body, updated_at: new Date().toISOString() }).eq("id", open.id);
    else await supabase().from("project_docs").insert({ project_id: projectId, title, body, created_by: profile?.id });
    setOpen(null); setTitle(""); setBody(""); load();
  }
  async function removeDoc(d: any) {
    if (!confirm(`Delete "${d.title}"?`)) return;
    await supabase().from("project_docs").delete().eq("id", d.id);
    if (open?.id === d.id) { setOpen(null); setTitle(""); setBody(""); }
    load();
  }
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="card p-3">
        <button className="btn-primary mb-2 w-full justify-center" onClick={() => { setOpen(null); setTitle(""); setBody(""); }}>+ New doc</button>
        {docs.map((d) => (
          <div key={d.id} className={`mb-1 flex items-center rounded-xl ${open?.id === d.id ? "bg-brand-ink text-white" : "hover:bg-slate-50"}`}>
            <button onClick={() => { setOpen(d); setTitle(d.title); setBody(d.body || ""); }} className="flex-1 px-3 py-2 text-left text-sm font-semibold">{d.title}</button>
            <button onClick={() => removeDoc(d)} className="px-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        ))}
        {docs.length === 0 && <p className="p-2 text-sm text-slate-500">No docs yet.</p>}
      </div>
      <div className="card p-4 lg:col-span-2">
        <input className="input mb-2 font-semibold" placeholder="Document title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-64" placeholder="Write here… (scripts, briefs, checklists)" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary mt-2" onClick={save}>{open ? "Save changes" : "Create doc"}</button>
      </div>
    </div>
  );
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const { profile } = useProfile();
  const [files, setFiles] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  async function load() {
    const { data } = await supabase().from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    setFiles(data || []);
  }
  useEffect(() => { load(); }, [projectId]);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("Uploading…");
    const path = `files/${projectId}/${Date.now()}-${f.name}`;
    const { error } = await supabase().storage.from("recordings").upload(path, f);
    if (error) { setStatus("Upload failed — is the 'recordings' storage bucket created?"); return; }
    await supabase().from("project_files").insert({ project_id: projectId, name: f.name, path, uploaded_by: profile?.id });
    setStatus("Uploaded."); load();
  }
  async function openFile(path: string) {
    const { data } = await supabase().storage.from("recordings").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  async function removeFile(f: any) {
    if (!confirm(`Delete "${f.name}"?`)) return;
    await supabase().from("project_files").delete().eq("id", f.id); load();
  }
  return (
    <div className="card p-4">
      <label className="btn-primary cursor-pointer">Upload file<input type="file" className="hidden" onChange={upload} /></label>
      {status && <span className="ml-3 text-sm text-slate-500">{status}</span>}
      <div className="mt-4 space-y-2">
        {files.length === 0 && <p className="text-sm text-slate-500">No files yet — thumbnails, exports and references live here.</p>}
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-xl border border-slate-50 p-2 text-sm">
            <span className="font-semibold">📄 {f.name}</span>
            <span className="ml-auto flex gap-1">
              <button className="btn-ghost !px-3 !py-1" onClick={() => openFile(f.path)}>Open</button>
              <button className="btn-danger !px-3 !py-1" onClick={() => removeFile(f)}>Delete</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Project-scoped calendar with a stage filter (change #2a / #10d) */
function ProjectCalendar({ tasks, stages }: { tasks: Task[]; stages: StageRow[] }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [stage, setStage] = useState("");
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const list = tasks.filter((t) => t.due_at && (!stage || t.stage === stage));
  const byDay: Record<number, Task[]> = {};
  list.forEach((t) => {
    const d = new Date(t.due_at!);
    if (d.getFullYear() === y && d.getMonth() === m - 1) (byDay[d.getDate()] ||= []).push(t);
  });
  return (
    <div>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input type="month" className="input max-w-[180px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select className="input max-w-[180px]" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {stages.map((s) => <option key={s.id} value={s.name}>{cap(s.name)}</option>)}
        </select>
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
    </div>
  );
}
