"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChecklistItem } from "@/lib/types";

/* Subtask checklist for a task — a simple ordered list of {text, done} rows. */
export default function TaskChecklist({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [text, setText] = useState("");

  async function load() {
    const { data } = await supabase().from("task_checklist_items").select("*").eq("task_id", taskId).order("sort");
    setItems((data as ChecklistItem[]) || []);
  }
  useEffect(() => { load(); }, [taskId]);

  async function add() {
    const v = text.trim();
    if (!v) return;
    setText("");
    await supabase().from("task_checklist_items").insert({ task_id: taskId, text: v, sort: items.length });
    load();
  }
  async function toggle(item: ChecklistItem) {
    await supabase().from("task_checklist_items").update({ done: !item.done }).eq("id", item.id);
    load();
  }
  async function remove(item: ChecklistItem) {
    await supabase().from("task_checklist_items").delete().eq("id", item.id);
    load();
  }

  const done = items.filter((i) => i.done).length;

  return (
    <div className="mt-3">
      <label className="label">Checklist{items.length > 0 ? ` — ${done}/${items.length} done` : ""}</label>
      <div className="space-y-1">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.done} disabled={!canEdit} onChange={() => toggle(item)} className="accent-brand-500" />
            <span className={item.done ? "flex-1 text-slate-400 line-through" : "flex-1"}>{item.text}</span>
            {canEdit && <button className="text-slate-400 hover:text-red-600" onClick={() => remove(item)}>✕</button>}
          </label>
        ))}
        {items.length === 0 && <div className="text-xs text-slate-400">No checklist items yet.</div>}
      </div>
      {canEdit && (
        <input
          className="input mt-1 !py-1 text-xs" placeholder="+ Add checklist item"
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={add}
        />
      )}
    </div>
  );
}
