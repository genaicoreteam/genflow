"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Portfolio, Project } from "@/lib/types";

/* Goals: members keep private personal goals; everyone above member can also
   set organizational goals scoped to a portfolio, a project, or the workspace. */
export default function Goals() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [f, setF] = useState({ title: "", target_date: "", scope: "personal", portfolio_id: "", project_id: "" });
  const isMember = profile?.role === "member";

  async function load() {
    const db = supabase();
    const [{ data: g }, { data: pf }, { data: pj }] = await Promise.all([
      db.from("goals").select("*").order("target_date", { ascending: true, nullsFirst: false }),
      db.from("portfolios").select("*").order("sort"),
      db.from("projects").select("*").order("sort"),
    ]);
    setRows(g || []); setPortfolios((pf as Portfolio[]) || []); setProjects((pj as Project[]) || []);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isMember) setF((s) => ({ ...s, scope: "personal" })); }, [isMember]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !profile) return;
    await supabase().from("goals").insert({
      title: f.title.trim(), target_date: f.target_date || null, done: false, created_by: profile.id,
      scope: f.scope, portfolio_id: f.scope === "org" ? f.portfolio_id || null : null,
      project_id: f.scope === "org" ? f.project_id || null : null,
    });
    setF({ title: "", target_date: "", scope: isMember ? "personal" : f.scope, portfolio_id: "", project_id: "" });
    load();
  }
  async function toggle(g: any) { await supabase().from("goals").update({ done: !g.done }).eq("id", g.id); load(); }
  async function remove(g: any) { if (confirm(`Delete goal "${g.title}"?`)) { await supabase().from("goals").delete().eq("id", g.id); load(); } }

  const personal = rows.filter((g) => g.scope === "personal" && g.created_by === profile?.id);
  const org = rows.filter((g) => g.scope !== "personal");
  const scopeLabel = (g: any) => {
    if (g.project_id) return projects.find((p) => p.id === g.project_id)?.name || "Project";
    if (g.portfolio_id) return portfolios.find((p) => p.id === g.portfolio_id)?.name || "Portfolio";
    return "Workspace";
  };

  return (
    <Shell title="Goals">
      <PageHead title="Goals" sub={isMember ? "Your personal goals — visible only to you." : "Personal goals stay private; organizational goals can be scoped to a portfolio, a project, or the whole workspace."} />
      <form onSubmit={add} className="card mb-6 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[220px] flex-1"><label className="label">Goal</label>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">Target date</label>
          <input type="date" className="input" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} /></div>
        {!isMember && (
          <div><label className="label">Type</label>
            <select className="input" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
              <option value="personal">Personal</option><option value="org">Organizational</option>
            </select></div>
        )}
        {!isMember && f.scope === "org" && (
          <>
            <div><label className="label">Portfolio (optional)</label>
              <select className="input" value={f.portfolio_id} onChange={(e) => setF({ ...f, portfolio_id: e.target.value, project_id: "" })}>
                <option value="">Whole workspace</option>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="label">Project (optional)</label>
              <select className="input" value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.filter((p) => !f.portfolio_id || p.portfolio_id === f.portfolio_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          </>
        )}
        <button className="btn-primary">Add goal</button>
      </form>

      <h2 className="mb-2 text-lg font-extrabold">My personal goals</h2>
      {personal.length === 0 ? <Empty text="No personal goals yet — a clean slate is an invitation to aim somewhere." /> : (
        <div className="mb-6 space-y-2">
          {personal.map((g) => <GoalRow key={g.id} g={g} onToggle={() => toggle(g)} onRemove={() => remove(g)} canEdit tag="Personal" />)}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-lg font-extrabold">Organizational goals</h2>
      {org.length === 0 ? <Empty text="No organizational goals yet." /> : (
        <div className="space-y-2">
          {org.map((g) => <GoalRow key={g.id} g={g} onToggle={() => toggle(g)} onRemove={() => remove(g)} canEdit={!isMember} tag={scopeLabel(g)} />)}
        </div>
      )}
    </Shell>
  );
}

function GoalRow({ g, onToggle, onRemove, canEdit, tag }: any) {
  return (
    <div className="card flex items-center gap-3 p-3 text-sm">
      <input type="checkbox" className="accent-brand-500" checked={g.done} onChange={onToggle} disabled={!canEdit} />
      <span className={`font-semibold ${g.done ? "text-slate-400 line-through" : ""}`}>{g.title}</span>
      <span className="badge bg-brand-100 text-brand-700">{tag}</span>
      <span className="ml-auto flex items-center gap-2">
        {g.target_date && <span className="badge bg-slate-100 text-slate-600">{g.target_date}</span>}
        {canEdit && <button className="text-red-400 hover:text-red-600" onClick={onRemove}>✕</button>}
      </span>
    </div>
  );
}
