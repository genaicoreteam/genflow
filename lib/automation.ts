"use client";
import { supabase } from "./supabase";
import { pushNotification } from "./notify";
import { LogicRule, LogicTrigger, Profile, Task, cap } from "./types";

/* Executes Nifty-style logic rules: When <trigger> → Then <actions>.
   Called after task events in the board. Returns true if the task row
   was mutated (caller should reload). */
export async function runLogicRules(opts: {
  rules: LogicRule[];
  trigger: LogicTrigger;
  task: Task;
  stageMoved?: string;
  people: Profile[];
  projectPrefix: string;
  taskCount: number;
  actorName: string;
}): Promise<boolean> {
  const { rules, trigger, task, stageMoved, people, projectPrefix, taskCount, actorName } = opts;
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const db = supabase();
  let mutated = false;
  const applicable = rules.filter((r) =>
    r.active && r.trigger === trigger &&
    (r.project_id === null || r.project_id === task.project_id) &&
    (trigger !== "moved_to_stage" || !r.trigger_stage || r.trigger_stage === stageMoved)
  );
  let n = 0;
  for (const rule of applicable) {
    const patch: Record<string, any> = {};
    for (const a of rule.actions || []) {
      if (a.type === "assign" && a.value) patch.assignee = a.value;
      if (a.type === "move" && a.value) patch.stage = a.value;
      if (a.type === "shift_due") {
        const base = task.due_at ? new Date(task.due_at) : new Date();
        patch.due_at = new Date(base.getTime() + (Number(a.value) || 24) * 3600000).toISOString();
      }
      if (a.type === "set_content" && a.value) patch.content_type = a.value;
      if (a.type === "prefix" && a.value) patch.title = `${a.value} ${task.title}`;
      if (a.type === "notify") {
        const target = a.value === "assignee" ? (patch.assignee || task.assignee) : a.value;
        const p = target ? byId[target] : null;
        if (p) await pushNotification(p.id, p.email, `Automation: ${task.code}`, a.extra || `Rule triggered on "${task.title}" (${cap(trigger).replace(/_/g, " ")}).`, `/project/${task.project_id}`);
      }
      if (a.type === "followup" && a.value) {
        n++;
        const assignee = a.extra || task.assignee;
        await db.from("tasks").insert({
          project_id: task.project_id, code: `${projectPrefix}1-${String(taskCount + n).padStart(2, "0")}`,
          title: task.title, stage: a.value, status: "open", assignee,
          origin_task: task.id, content_type: task.content_type,
        });
        const p = assignee ? byId[assignee] : null;
        if (p) await pushNotification(p.id, p.email, "New task assigned to you", `${actorName} triggered a follow-up "${task.title}" in ${cap(a.value)}.`, `/project/${task.project_id}`);
        mutated = true;
      }
    }
    if (Object.keys(patch).length) {
      await db.from("tasks").update(patch).eq("id", task.id);
      if (patch.assignee && patch.assignee !== task.assignee) {
        const p = byId[patch.assignee];
        if (p) await pushNotification(p.id, p.email, "Task assigned to you", `Automation assigned "${task.title}" (${task.code}) to you.`, `/project/${task.project_id}`);
      }
      mutated = true;
    }
  }
  return mutated;
}
