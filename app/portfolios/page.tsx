"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Portfolio, Project } from "@/lib/types";

/* Members only see the portfolios/projects they were granted (change #10). */
export default function Portfolios() {
  const { profile } = useProfile();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [grants, setGrants] = useState<{ pf: string[]; pj: string[] } | null>(null);
  const [newPf, setNewPf] = useState("");
  const [newPj, setNewPj] = useState({ portfolio_id: "", name: "", prefix: "" });
  const [msg, setMsg] = useState("");
  const canManage = profile && profile.role !== "member";

  async function load() {
    if (!profile) return;
    const db = supabase();
    const [{ data: pf }, { data: pj }] = await Promise.all([
      db.from("portfolios").select("*").order("sort"),
      db.from("projects").select("*").order("sort"),
    ]);
    setPortfolios((pf as Portfolio[]) || []); setProjects((pj as Project[]) || []);
    if (profile.role === "member") {
      const [{ data: pm }, { data: pjm }] = await Promise.all([
        db.from("portfolio_members").select("portfolio_id").eq("profile_id", profile.id),
        db.from("project_members").select("project_id").eq("profile_id", profile.id),
      ]);
      setGrants({ pf: (pm || []).map((r: any) => r.portfolio_id), pj: (pjm || []).map((r: any) => r.project_id) });
    } else setGrants(null);
  }
  useEffect(() => { load(); }, [profile]);

  const visibleProjects = useMemo(() => projects.filter((p) => {
    if (!grants) return true;
    return grants.pf.includes(p.portfolio_id) || grants.pj.includes(p.id);
  }), [projects, grants]);

  const visiblePortfolios = useMemo(() => portfolios.filter((pf) => {
    if (!grants) return true;
    return visibleProjects.some((p) => p.portfolio_id === pf.id) || grants.pf.includes(pf.id);
  }), [portfolios, grants, visibleProjects]);

  async function addPortfolio(e: React.FormEvent) {
    e.preventDefault();
    if (!newPf.trim()) return;
    const { error } = await supabase().from("portfolios").insert({ name: newPf.trim().toUpperCase(), sort: portfolios.length });
    setMsg(error ? "That portfolio already exists." : "Portfolio added.");
    setNewPf(""); load();
  }
  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newPj.portfolio_id || !newPj.name.trim()) return;
    const { error } = await supabase().from("projects").insert({
      portfolio_id: newPj.portfolio_id, name: newPj.name.trim(),
      prefix: (newPj.prefix || newPj.name.slice(0, 3)).toUpperCase(),
      sort: projects.filter((p) => p.portfolio_id === newPj.portfolio_id).length,
    });
    setMsg(error ? "A project with that name already exists in this portfolio." : "Project added.");
    setNewPj({ portfolio_id: "", name: "", prefix: "" }); load();
  }
  async function removeProject(p: Project) {
    if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return;
    await supabase().from("projects").delete().eq("id", p.id); load();
  }

  return (
    <Shell title="Portfolios & Projects">
      <PageHead title="Portfolios & Projects" sub={grants ? "The projects you've been granted access to." : "Every portfolio and the projects inside it. Open a project to run its board."} />
      {canManage && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          <form onSubmit={addPortfolio} className="card flex items-end gap-2 p-4">
            <div className="flex-1"><label className="label">New portfolio</label>
              <input className="input" placeholder="e.g. HINDI" value={newPf} onChange={(e) => setNewPf(e.target.value)} /></div>
            <button className="btn-primary">Add</button>
          </form>
          <form onSubmit={addProject} className="card flex flex-wrap items-end gap-2 p-4">
            <div className="min-w-[140px] flex-1"><label className="label">Portfolio</label>
              <select className="input" value={newPj.portfolio_id} onChange={(e) => setNewPj({ ...newPj, portfolio_id: e.target.value })}>
                <option value="">Choose…</option>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="min-w-[140px] flex-1"><label className="label">Project name</label>
              <input className="input" value={newPj.name} onChange={(e) => setNewPj({ ...newPj, name: e.target.value })} /></div>
            <div className="w-24"><label className="label">Prefix</label>
              <input className="input" placeholder="ABC" value={newPj.prefix} onChange={(e) => setNewPj({ ...newPj, prefix: e.target.value })} /></div>
            <button className="btn-primary">Add</button>
          </form>
          {msg && <p className="text-sm font-semibold text-slate-500 lg:col-span-2">{msg}</p>}
        </div>
      )}

      {visiblePortfolios.length === 0 && <Empty text="No portfolios visible to you yet — ask your admin for access in Admin → Access." />}
      <div className="space-y-6">
        {visiblePortfolios.map((pf) => (
          <div key={pf.id}>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">
              <span className="h-3 w-3 rounded-full" style={{ background: pf.color }} />{pf.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleProjects.filter((p) => p.portfolio_id === pf.id).map((p) => (
                <div key={p.id} className="card p-4">
                  <Link href={`/project/${p.id}`} className="block">
                    <span className="grid h-10 w-10 place-items-center rounded-xl font-display text-xs font-bold text-white" style={{ background: p.color }}>{p.prefix}</span>
                    <div className="mt-2 font-bold">{p.name}</div>
                    <div className="text-xs text-slate-500">Task IDs: {p.prefix}1-01, {p.prefix}1-02…</div>
                  </Link>
                  {canManage && <button className="btn-danger mt-3 !px-3 !py-1 text-xs" onClick={() => removeProject(p)}>Delete</button>}
                </div>
              ))}
              {visibleProjects.filter((p) => p.portfolio_id === pf.id).length === 0 && (
                <p className="text-sm text-slate-500">No projects here yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
