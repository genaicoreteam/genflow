"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Task, Profile, Priority, PRIORITY_LABELS, PRIORITY_COLORS, cap, displayName } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import TaskComments from "./TaskComments";
import TaskChecklist from "./TaskChecklist";
import TaskFiles from "./TaskFiles";

/* Advanced task view opened by clicking a task anywhere in the app.
   Automation-aware callers (the project board) pass their own handlers so
   stage-advance/duplicate automation keeps working; other callers (Reporting,
   My Work) fall back to plain field updates below. */
export default function TaskDetailModal({
  task, people, canEdit, onClose, onChanged,
  onComplete, onReopen, onDelete, onDuplicate, onAssign, onDue, onContent,
}: {
  task: Task; people: Profile[]; canEdit: boolean; onClose: () => void; onChanged?: () => void;
  onComplete?: () => void; onReopen?: () => void; onDelete?: () => void; onDuplicate?: () => void;
  onAssign?: (pid: string) => void; onDue?: (v: string) => void; onContent?: (v: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState<Priority | "">(task.priority || "");
  const [labels, setLabels] = useState<string[]>(task.labels || []);
  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    setTitle(task.title); setDescription(task.description || "");
    setPriority(task.priority || ""); setLabels(task.labels || []);
  }, [task.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function directUpdate(patch: Record<string, any>) {
    await supabase().from("tasks").update(patch).eq("id", task.id);
    onChanged?.();
  }

  function saveTitle() {
    if (!title.trim() || title === task.title) { setTitle(task.title); return; }
    directUpdate({ title: title.trim() });
  }
  function saveDescription() {
    if (description === (task.description || "")) return;
    directUpdate({ description });
  }
  function savePriority(v: Priority | "") {
    setPriority(v);
    directUpdate({ priority: v || null });
  }
  function addLabel() {
    const v = labelInput.trim();
    if (!v || labels.includes(v)) { setLabelInput(""); return; }
    const next = [...labels, v];
    setLabels(next); setLabelInput("");
    directUpdate({ labels: next });
  }
  function removeLabel(v: string) {
    const next = labels.filter((l) => l !== v);
    setLabels(next);
    directUpdate({ labels: next });
  }

  function toggleStatus() {
    if (task.status === "open") (onComplete ? onComplete() : directUpdate({ status: "completed", completed_at: new Date().toISOString() }));
    else (onReopen ? onReopen() : directUpdate({ status: "open", completed_at: null }));
  }
  function assign(pid: string) { onAssign ? onAssign(pid) : directUpdate({ assignee: pid || null }); }
  function due(v: string) { onDue ? onDue(v) : directUpdate({ due_at: v ? new Date(v).toISOString() : null }); }
  function content(v: string) { onContent ? onContent(v) : directUpdate({ content_type: v || null }); }

  function remove() {
    if (!confirm(`Delete ${task.code} — "${task.title}"?`)) return;
    if (onDelete) onDelete();
    else supabase().from("tasks").delete().eq("id", task.id).then(() => onChanged?.());
    onClose();
  }
  function duplicate() {
    if (onDuplicate) onDuplicate();
    else supabase().from("tasks").insert({
      project_id: task.project_id, code: task.code + "-copy", title: task.title, stage: task.stage,
      status: "open", assignee: task.assignee, content_type: task.content_type,
    }).then(() => onChanged?.());
  }

  const editable = canEdit;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-brand-500">{task.code}</span>
            <button title="Copy task ID" className="text-slate-400 hover:text-slate-600" onClick={() => copyText(task.code)}>📋</button>
          </div>
          <button className="rounded px-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>✕</button>
        </div>

        <input
          className="input mb-2 !text-base font-semibold disabled:bg-transparent disabled:px-0"
          value={title} disabled={!editable}
          onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
        />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={task.status === "completed"} disabled={!editable} onChange={toggleStatus} className="accent-brand-500" />
          <span>{task.status === "completed" ? "Completed" : "Mark complete"}</span>
          <span className="badge ml-auto bg-slate-100 text-slate-600">{cap(task.stage)}</span>
        </label>

        <label className="label mt-3">Description</label>
        <textarea
          className="input min-h-24 disabled:bg-transparent disabled:px-0"
          value={description} disabled={!editable}
          placeholder="Add more detail…"
          onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label">Priority</label>
            <select className="input" disabled={!editable} value={priority} onChange={(e) => savePriority(e.target.value as Priority | "")}>
              <option value="">No priority</option>
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
            {priority && <span className="badge mt-1 text-white" style={{ background: PRIORITY_COLORS[priority] }}>{PRIORITY_LABELS[priority]}</span>}
          </div>
          <div>
            <label className="label">Content type</label>
            <select className="input" disabled={!editable} value={task.content_type || ""} onChange={(e) => content(e.target.value)}>
              <option value="">Content type…</option>
              <option value="reel">Reel</option><option value="full length">Full length</option>
              <option value="short">Short</option><option value="poster">Poster</option><option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label">Assignee</label>
            <select className="input" disabled={!editable} value={task.assignee || ""} onChange={(e) => assign(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due</label>
            <input type="datetime-local" className="input" disabled={!editable}
              value={task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : ""} onChange={(e) => due(e.target.value)} />
          </div>
        </div>

        <label className="label mt-3">Labels</label>
        <div className="flex flex-wrap items-center gap-1">
          {labels.map((l) => (
            <span key={l} className="badge bg-brand-100 text-brand-700">
              {l}
              {editable && <button className="ml-1 text-brand-500 hover:text-brand-700" onClick={() => removeLabel(l)}>✕</button>}
            </span>
          ))}
          {editable && (
            <input
              className="input !w-32 !py-1 text-xs" placeholder="+ label"
              value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
              onBlur={addLabel}
            />
          )}
        </div>

        <TaskChecklist taskId={task.id} canEdit={editable} />
        <TaskFiles taskId={task.id} canEdit={editable} />

        {editable && (
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
            <button className="btn-ghost" onClick={duplicate}>⧉ Duplicate</button>
            <button className="btn-danger ml-auto" onClick={remove}>🗑 Delete</button>
          </div>
        )}

        <TaskComments taskCode={task.code} people={people} projectId={task.project_id} />
      </div>
    </div>
  );
}
