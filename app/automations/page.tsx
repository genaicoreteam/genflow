"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { AutomationRule, Project, Profile, LogicRule, LogicAction, TRIGGER_LABELS, LogicTrigger, StageRow, cap, displayName } from "@/lib/types";

export default function Automations() {
  const { profile, loading } = useProfile();
  const perms = useFeaturePerms();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logicRules, setLogicRules] = useState<LogicRule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [f, setF] = useState({ project_id: "", from_stage: "scripting", to_stage: "thumbnail", new_assignee: "", due_offset_hours: 24 });
  const [lf, setLf] = useState<{ project_id: string; trigger: LogicTrigger; trigger_stage: string; actions: LogicAction[] }>({
    project_id: "", trigger: "task_created", trigger_stage: "", actions: [{ type: "notify", value: "assignee", extra: "" }],
  });

  const allowed = profile && featureAllowed(perms, "automations", profile.role);

  async function load() {
    const db = supabase();
    const [{ data: r }, { data: l }, { data: pj }, { data: pp }, { data: st }] = await Promise.all([
      db.from("automation_rules").select("*").order("created_at"),
      db.from("logic_rules").select("*").order("created_at"),
      db.from("projects").select("*").order("name"),
      db.from("profiles").select("*").order("full_name"),
      db.from("stages").select("*").order("sort"),
    ]);
    setRules((r as AutomationRule[]) || []); setLogicRules((l as LogicRule[]) || []);
    setProjects((pj as Project[]) || []); setPeople((pp as Profile[]) || []); setStages((st as StageRow[]) || []);
  }
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const stageOptions = (projectId: string) => {
    const relevant = projectId ? stages.filter((s) => s.project_id === projectId) : stages;
    return Array.from(new Set(relevant.map((s) => s.name)));
  };
  const name = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p ? displayName(p) : "Keep same assignee";
  };
  const pname = (id: string | null) => projects.find((p) => p.id === id)?.name || "All projects";

  async function addHandOff(e: React.FormEvent) {
    e.preventDefault();
    await supabase().from("automation_rules").insert({
      project_id: f.project_id || null, from_stage: f.from_stage, to_stage: f.to_stage,
      new_assignee: f.new_assignee || null, due_offset_hours: Number(f.due_offset_hours) || 24, active: true,
    });
    load();
  }
  async function toggleR(r: AutomationRule) { await supabase().from("automation_rules").update({ active: !r.active }).eq("id", r.id); load(); }
  async function removeR(r: AutomationRule) { if (confirm("Delete this rule?")) { await supabase().from("automation_rules").delete().eq("id", r.id); load(); } }

  function setAction(i: number, patch: Partial<LogicAction>) {
    setLf((s) => ({ ...s, actions: s.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  }
  async function addLogic(e: React.FormEvent) {
    e.preventDefault();
    await supabase().from("logic_rules").insert({
      project_id: lf.project_id || null, trigger: lf.trigger,
      trigger_stage: lf.trigger === "moved_to_stage" ? lf.trigger_stage || null : null,
      actions: lf.actions, active: true,
    });
    setLf({ project_id: "", trigger: "task_created", trigger_stage: "", actions: [{ type: "notify", value: "assignee", extra: "" }] });
    load();
  }
  async function toggleL(r: LogicRule) { await supabase().from("logic_rules").update({ active: !r.active }).eq("id", r.id); load(); }
  async function removeL(r: LogicRule) { if (confirm("Delete this rule?")) { await supabase().from("logic_rules").delete().eq("id", r.id); load(); } }

  const actionText = (a: LogicAction) => {
    if (a.type === "assign") return `assign to ${name(a.value || null)}`;
    if (a.type === "move") return `move to ${cap(a.value || "")}`;
    if (a.type === "shift_due") return `due +${a.value || 24}h`;
    if (a.type === "set_content") return `content = ${a.value}`;
    if (a.type === "notify") return `notify ${a.value === "assignee" ? "the assignee" : name(a.value || null)}`;
    if (a.type === "prefix") return `prefix title "${a.value}"`;
    if (a.type === "followup") return `create follow-up in ${cap(a.value || "")}${a.extra ? ` for ${name(a.extra)}` : ""}`;
    return a.type;
  };

  if (!loading && !allowed) return <Shell title="Automations"><Empty text="Automations is not available on your dashboard." /></Shell>;

  return (
    <Shell title="Automations">
      <PageHead title="Automations"
        sub="Two layers of automation: stage hand-offs (the completed card stays behind while the live card moves forward), plus Nifty-style logic rules — When something happens → Then do these actions." />

      {/* Layer 1: stage hand-offs */}
      <h2 className="mb-2 text-lg font-extrabold">1 · Stage hand-offs</h2>
      <p className="mb-2 text-sm text-slate-500">
        Add more than one rule with the same "When completed in" stage to fan a task out to several stages at
        once on completion — e.g. Scripting → Thumbnail <em>and</em> Scripting → Editing, each with its own
        assignee. This only applies when a task is marked complete directly; dragging a card to a specific
        column always moves it to just that one column.
      </p>
      <form onSubmit={addHandOff} className="card mb-4 grid gap-3 p-4 sm:grid-cols-6">
        <div><label className="label">Project</label>
          <select className="input" value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div><label className="label">When completed in</label>
          <select className="input" value={f.from_stage} onChange={(e) => setF({ ...f, from_stage: e.target.value })}>
            {stageOptions(f.project_id).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
          </select></div>
        <div><label className="label">Card moves to</label>
          <select className="input" value={f.to_stage} onChange={(e) => setF({ ...f, to_stage: e.target.value })}>
            {stageOptions(f.project_id).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
          </select></div>
        <div><label className="label">New assignee</label>
          <select className="input" value={f.new_assignee} onChange={(e) => setF({ ...f, new_assignee: e.target.value })}>
            <option value="">Keep same</option>
            {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
          </select></div>
        <div><label className="label">Due after (hours)</label>
          <input type="number" min={1} className="input" value={f.due_offset_hours} onChange={(e) => setF({ ...f, due_offset_hours: Number(e.target.value) })} /></div>
        <div className="flex items-end"><button className="btn-primary w-full justify-center">Add rule</button></div>
      </form>
      <div className="mb-8 space-y-2">
        {rules.length === 0 && <Empty text="No hand-off rules yet." />}
        {rules.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="badge bg-brand-100 text-brand-700">{pname(r.project_id)}</span>
            <span className="font-bold">{cap(r.from_stage)}</span> ✓ → <span className="font-bold">{cap(r.to_stage)}</span>
            <span className="text-slate-500">assignee: {name(r.new_assignee)}</span>
            <span className="text-slate-500">due +{r.due_offset_hours}h</span>
            <span className={`badge ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "Active" : "Paused"}</span>
            <span className="ml-auto flex gap-2">
              <button className="btn-ghost !px-3 !py-1" onClick={() => toggleR(r)}>{r.active ? "Pause" : "Resume"}</button>
              <button className="btn-danger !px-3 !py-1" onClick={() => removeR(r)}>Delete</button>
            </span>
          </div>
        ))}
      </div>

      {/* Layer 2: logic rules */}
      <h2 className="mb-2 text-lg font-extrabold">2 · Logic rules (When → Then)</h2>
      <form onSubmit={addLogic} className="card mb-4 space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Scope</label>
            <select className="input" value={lf.project_id} onChange={(e) => setLf({ ...lf, project_id: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label className="label">When…</label>
            <select className="input" value={lf.trigger} onChange={(e) => setLf({ ...lf, trigger: e.target.value as LogicTrigger })}>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          {lf.trigger === "moved_to_stage" && (
            <div><label className="label">…which stage</label>
              <select className="input" value={lf.trigger_stage} onChange={(e) => setLf({ ...lf, trigger_stage: e.target.value })}>
                <option value="">Any stage</option>
                {stageOptions(lf.project_id).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
              </select></div>
          )}
        </div>
        <div className="space-y-2">
          <label className="label">Then…</label>
          {lf.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="input !w-44" value={a.type} onChange={(e) => setAction(i, { type: e.target.value as any, value: "", extra: "" })}>
                <option value="notify">Notify</option><option value="assign">Change assignee</option>
                <option value="move">Move to stage</option><option value="shift_due">Shift due date</option>
                <option value="set_content">Set content type</option><option value="prefix">Prefix title</option>
                <option value="followup">Create follow-up task</option>
              </select>
              {a.type === "assign" && (
                <select className="input !w-48" value={a.value || ""} onChange={(e) => setAction(i, { value: e.target.value })}>
                  <option value="">Choose person…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
                </select>
              )}
              {a.type === "notify" && (
                <>
                  <select className="input !w-48" value={a.value || "assignee"} onChange={(e) => setAction(i, { value: e.target.value })}>
                    <option value="assignee">The assignee</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
                  </select>
                  <input className="input !w-64" placeholder="Message (optional)" value={a.extra || ""} onChange={(e) => setAction(i, { extra: e.target.value })} />
                </>
              )}
              {(a.type === "move" || a.type === "followup") && (
                <select className="input !w-40" value={a.value || ""} onChange={(e) => setAction(i, { value: e.target.value })}>
                  <option value="">Stage…</option>
                  {stageOptions(lf.project_id).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              )}
              {a.type === "followup" && (
                <select className="input !w-48" value={a.extra || ""} onChange={(e) => setAction(i, { extra: e.target.value })}>
                  <option value="">Same assignee</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
                </select>
              )}
              {a.type === "shift_due" && <input type="number" className="input !w-28" placeholder="hours" value={a.value || ""} onChange={(e) => setAction(i, { value: e.target.value })} />}
              {a.type === "set_content" && (
                <select className="input !w-40" value={a.value || ""} onChange={(e) => setAction(i, { value: e.target.value })}>
                  <option value="">Type…</option><option value="reel">Reel</option>
                  <option value="full length">Full length</option><option value="short">Short</option><option value="poster">Poster</option>
                </select>
              )}
              {a.type === "prefix" && <input className="input !w-48" placeholder='e.g. "[URGENT]"' value={a.value || ""} onChange={(e) => setAction(i, { value: e.target.value })} />}
              {lf.actions.length > 1 && <button type="button" className="text-red-500" onClick={() => setLf((s) => ({ ...s, actions: s.actions.filter((_, j) => j !== i) }))}>✕</button>}
            </div>
          ))}
          {lf.actions.length < 4 && (
            <button type="button" className="btn-ghost !py-1" onClick={() => setLf((s) => ({ ...s, actions: [...s.actions, { type: "notify", value: "assignee" }] }))}>+ Add action</button>
          )}
        </div>
        <button className="btn-primary">Add logic rule</button>
      </form>
      <div className="space-y-2">
        {logicRules.length === 0 && <Empty text="No logic rules yet — e.g. When a task becomes overdue → Notify the assignee and their admin." />}
        {logicRules.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="badge bg-brand-100 text-brand-700">{pname(r.project_id)}</span>
            <span className="font-bold">When:</span> {TRIGGER_LABELS[r.trigger]}{r.trigger_stage ? ` (${cap(r.trigger_stage)})` : ""}
            <span className="font-bold">→ Then:</span>
            {(r.actions || []).map((a, i) => <span key={i} className="badge bg-slate-100 text-slate-600">{actionText(a)}</span>)}
            <span className={`badge ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.active ? "Active" : "Paused"}</span>
            <span className="ml-auto flex gap-2">
              <button className="btn-ghost !px-3 !py-1" onClick={() => toggleL(r)}>{r.active ? "Pause" : "Resume"}</button>
              <button className="btn-danger !px-3 !py-1" onClick={() => removeL(r)}>Delete</button>
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
