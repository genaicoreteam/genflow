"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { useFeaturePerms, featureAllowed, FEATURES, clearPermCache } from "@/lib/permissions";
import { Profile, Portfolio, Project, Role, ROLE_LABELS, ALL_ROLES, ApprovalRoute } from "@/lib/types";

const TABS = ["People", "Role allow-list", "Access", "Routing", "Permissions", "Attendance mapping", "Org rules"] as const;
const REQUEST_TYPES: { key: string; label: string }[] = [
  { key: "time_permission", label: "Early leave / Late coming" },
  { key: "leave_admin", label: "Leave — Admin signature" },
  { key: "leave_team_lead", label: "Leave — Team Lead signature" },
  { key: "adhoc_member", label: "Ad-hoc request (from a member)" },
  { key: "adhoc_admin", label: "Ad-hoc request (from an admin)" },
];

export default function Admin() {
  const { profile, loading } = useProfile();
  const perms = useFeaturePerms();
  const [tab, setTab] = useState<(typeof TABS)[number]>("People");
  const [people, setPeople] = useState<Profile[]>([]);
  const [allow, setAllow] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pfMembers, setPfMembers] = useState<any[]>([]);
  const [pjMembers, setPjMembers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [permRows, setPermRows] = useState<any[]>([]);
  const [attMap, setAttMap] = useState<any[]>([]);
  const [rules, setRules] = useState({ id: "", cutoff_hours: 2, monthly_limit: 3 });
  const [newAllow, setNewAllow] = useState({ email: "", role: "member" });
  const [msg, setMsg] = useState("");
  const [pickPerson, setPickPerson] = useState("");

  const allowed = profile && featureAllowed(perms, "admin_area", profile.role);

  async function load() {
    const db = supabase();
    const [{ data: pp }, { data: ra }, { data: pf }, { data: pj }, { data: pm }, { data: pjm }, { data: rt }, { data: fp }, { data: am }, { data: or_ }] = await Promise.all([
      db.from("profiles").select("*").order("full_name"),
      db.from("role_assignments").select("*").order("email"),
      db.from("portfolios").select("*").order("sort"),
      db.from("projects").select("*").order("sort"),
      db.from("portfolio_members").select("*"),
      db.from("project_members").select("*"),
      db.from("approval_routes").select("*"),
      db.from("feature_permissions").select("*"),
      db.from("attendance_map").select("*"),
      db.from("org_rules").select("*").maybeSingle(),
    ]);
    setPeople((pp as Profile[]) || []); setAllow(ra || []);
    setPortfolios((pf as Portfolio[]) || []); setProjects((pj as Project[]) || []);
    setPfMembers(pm || []); setPjMembers(pjm || []); setRoutes((rt as ApprovalRoute[]) || []);
    setPermRows(fp || []); setAttMap(am || []);
    if (or_) setRules({ id: or_.id, cutoff_hours: or_.cutoff_hours, monthly_limit: or_.monthly_limit });
  }
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const reporteeCount = (id: string) => people.filter((p) => p.reports_to === id).length;

  async function setRole(p: Profile, role: Role) { await supabase().from("profiles").update({ role }).eq("id", p.id); load(); }
  async function setReportsTo(p: Profile, v: string) { await supabase().from("profiles").update({ reports_to: v || null }).eq("id", p.id); load(); }
  async function addAllow(e: React.FormEvent) {
    e.preventDefault();
    if (!newAllow.email.trim()) return;
    await supabase().from("role_assignments").upsert({ email: newAllow.email.trim().toLowerCase(), role: newAllow.role });
    setNewAllow({ email: "", role: "member" }); setMsg("Allow-list updated."); load();
  }
  async function removeAllow(email: string) {
    if (!confirm(`Remove ${email} from the allow-list?`)) return;
    await supabase().from("role_assignments").delete().eq("email", email); load();
  }

  async function togglePf(pfId: string, personId: string, on: boolean) {
    const db = supabase();
    if (on) await db.from("portfolio_members").insert({ portfolio_id: pfId, profile_id: personId });
    else await db.from("portfolio_members").delete().eq("portfolio_id", pfId).eq("profile_id", personId);
    load();
  }
  async function togglePj(pjId: string, personId: string, on: boolean) {
    const db = supabase();
    if (on) await db.from("project_members").insert({ project_id: pjId, profile_id: personId });
    else await db.from("project_members").delete().eq("project_id", pjId).eq("profile_id", personId);
    load();
  }

  async function saveRoute(rt: string, patch: Partial<ApprovalRoute>) {
    const cur = routes.find((r) => r.request_type === rt) || { request_type: rt, mode: "reports_to", role_target: null, person_target: null } as ApprovalRoute;
    const next = { ...cur, ...patch };
    await supabase().from("approval_routes").upsert({
      request_type: rt, mode: next.mode,
      role_target: next.mode === "role" ? next.role_target : null,
      person_target: next.mode === "person" ? next.person_target : null,
    });
    load();
  }

  async function togglePerm(feature: string, role: string, allowedNow: boolean) {
    await supabase().from("feature_permissions").upsert({ feature, role, allowed: !allowedNow });
    clearPermCache(); load();
    setMsg("Permission saved — reload the page to see menus update.");
  }
  const permValue = (feature: string, role: string) => {
    const row = permRows.find((r) => r.feature === feature && r.role === role);
    if (row) return row.allowed;
    return FEATURES.find((f) => f.key === feature)?.defaults.includes(role as Role) ?? true;
  };

  async function saveAtt(personId: string, identifier: string) {
    await supabase().from("attendance_map").upsert({ profile_id: personId, att_identifier: identifier });
    setMsg("Attendance identifier saved."); load();
  }
  async function saveRules(e: React.FormEvent) {
    e.preventDefault();
    if (rules.id) await supabase().from("org_rules").update({ cutoff_hours: rules.cutoff_hours, monthly_limit: rules.monthly_limit }).eq("id", rules.id);
    else await supabase().from("org_rules").insert({ cutoff_hours: rules.cutoff_hours, monthly_limit: rules.monthly_limit });
    setMsg("Rules saved."); load();
  }

  if (!loading && !allowed) return <Shell title="Admin"><Empty text="The Admin area isn't available on your dashboard." /></Shell>;

  return (
    <Shell title="Admin">
      <PageHead title="Admin" sub="People, access grants, who approves what, which role sees which feature, and the attendance identity mapping." />
      <div className="card mb-4 flex flex-wrap gap-1 p-2">
        {TABS.map((t) => <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {msg && <p className="mb-3 text-sm font-semibold text-emerald-700">{msg}</p>}

      {tab === "People" && (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase text-slate-400">
              <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Reports to</th><th className="p-2">Reportees</th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-slate-50">
                  <td className="p-2 font-semibold">{p.full_name || "—"}</td>
                  <td className="p-2 text-slate-500">{p.email}</td>
                  <td className="p-2">
                    <select className="input !py-1" value={p.role} onChange={(e) => setRole(p, e.target.value as Role)}>
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select className="input !py-1" value={p.reports_to || ""} onChange={(e) => setReportsTo(p, e.target.value)}>
                      <option value="">—</option>
                      {people.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                    </select>
                  </td>
                  <td className="p-2 text-center font-bold text-brand-600">{reporteeCount(p.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Role allow-list" && (
        <>
          <form onSubmit={addAllow} className="card mb-4 flex flex-wrap items-end gap-2 p-4">
            <div className="min-w-[240px] flex-1"><label className="label">Email</label>
              <input className="input" placeholder="person@company.com" value={newAllow.email} onChange={(e) => setNewAllow({ ...newAllow, email: e.target.value })} /></div>
            <div><label className="label">Role at signup</label>
              <select className="input" value={newAllow.role} onChange={(e) => setNewAllow({ ...newAllow, role: e.target.value })}>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select></div>
            <button className="btn-primary">Save</button>
          </form>
          <div className="card p-4">
            {allow.length === 0 && <p className="text-sm text-slate-500">No entries — anyone signing up becomes a Member by default.</p>}
            {allow.map((a) => (
              <div key={a.email} className="flex items-center gap-2 border-b border-slate-50 py-2 text-sm last:border-0">
                <span className="font-semibold">{a.email}</span>
                <span className="badge bg-brand-100 text-brand-700">{ROLE_LABELS[a.role as Role]}</span>
                <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => removeAllow(a.email)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Access" && (
        <>
          <div className="card mb-4 p-4">
            <label className="label">Choose a person to grant access for</label>
            <select className="input max-w-md" value={pickPerson} onChange={(e) => setPickPerson(e.target.value)}>
              <option value="">Choose person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {ROLE_LABELS[p.role]}</option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">Works for Admins and Members alike. A portfolio grant covers every project inside it; project grants are for finer control.</p>
          </div>
          {pickPerson && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-2 font-display font-bold">Portfolios</h3>
                {portfolios.map((pf) => {
                  const on = pfMembers.some((m) => m.portfolio_id === pf.id && m.profile_id === pickPerson);
                  return (
                    <label key={pf.id} className="flex items-center gap-2 border-b border-slate-50 py-2 text-sm last:border-0">
                      <input type="checkbox" className="accent-brand-500" checked={on} onChange={() => togglePf(pf.id, pickPerson, !on)} />
                      <span className="font-semibold">{pf.name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="card p-4">
                <h3 className="mb-2 font-display font-bold">Individual projects</h3>
                {projects.map((pj) => {
                  const on = pjMembers.some((m) => m.project_id === pj.id && m.profile_id === pickPerson);
                  const viaPf = pfMembers.some((m) => m.portfolio_id === pj.portfolio_id && m.profile_id === pickPerson);
                  return (
                    <label key={pj.id} className="flex items-center gap-2 border-b border-slate-50 py-2 text-sm last:border-0">
                      <input type="checkbox" className="accent-brand-500" checked={on || viaPf} disabled={viaPf} onChange={() => togglePj(pj.id, pickPerson, !on)} />
                      <span className={`font-semibold ${viaPf ? "text-slate-400" : ""}`}>{pj.name}</span>
                      {viaPf && <span className="badge bg-slate-100 text-slate-500">via portfolio</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "Routing" && (
        <div className="card space-y-4 p-4">
          <p className="text-sm text-slate-500">Decide who receives each kind of request. "Reporting manager" follows the hierarchy; or pin it to a role or a specific person.</p>
          {REQUEST_TYPES.map((rt) => {
            const r = routes.find((x) => x.request_type === rt.key);
            const mode = r?.mode || "reports_to";
            return (
              <div key={rt.key} className="flex flex-wrap items-end gap-2 border-b border-slate-50 pb-3 last:border-0">
                <div className="min-w-[220px] flex-1"><label className="label">{rt.label}</label>
                  <select className="input" value={mode} onChange={(e) => saveRoute(rt.key, { mode: e.target.value as any })}>
                    <option value="reports_to">Their reporting manager</option>
                    <option value="role">A role</option>
                    <option value="person">A specific person</option>
                  </select></div>
                {mode === "role" && (
                  <select className="input max-w-[220px]" value={r?.role_target || ""} onChange={(e) => saveRoute(rt.key, { mode: "role", role_target: e.target.value })}>
                    <option value="">Choose role…</option>
                    {ALL_ROLES.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}
                  </select>
                )}
                {mode === "person" && (
                  <select className="input max-w-[240px]" value={r?.person_target || ""} onChange={(e) => saveRoute(rt.key, { mode: "person", person_target: e.target.value })}>
                    <option value="">Choose person…</option>
                    {people.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "Permissions" && (
        <div className="card overflow-x-auto p-4">
          <p className="mb-3 text-sm text-slate-500">Tick to give a role access to a feature. These override the built-in defaults.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase text-slate-400">
              <th className="p-2">Feature</th>
              {ALL_ROLES.map((r) => <th key={r} className="p-2 text-center">{ROLE_LABELS[r]}</th>)}
            </tr></thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.key} className="border-t border-slate-50">
                  <td className="p-2 font-semibold">{f.label}</td>
                  {ALL_ROLES.map((r) => {
                    const v = permValue(f.key, r);
                    return (
                      <td key={r} className="p-2 text-center">
                        <input type="checkbox" className="accent-brand-500" checked={v} onChange={() => togglePerm(f.key, r, v)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Attendance mapping" && (
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-500">Clockify reads a separate attendance database. Map each person to the email or name used there, so everyone sees only their own punches.</p>
          {people.map((p) => {
            const cur = attMap.find((m) => m.profile_id === p.id)?.att_identifier || "";
            return <AttRow key={p.id} person={p} current={cur} onSave={(v) => saveAtt(p.id, v)} />;
          })}
        </div>
      )}

      {tab === "Org rules" && (
        <form onSubmit={saveRules} className="card flex flex-wrap items-end gap-3 p-4">
          <div><label className="label">Cut-off window (hours)</label>
            <input type="number" min={0} className="input" value={rules.cutoff_hours} onChange={(e) => setRules({ ...rules, cutoff_hours: Number(e.target.value) })} /></div>
          <div><label className="label">Monthly permission limit</label>
            <input type="number" min={1} className="input" value={rules.monthly_limit} onChange={(e) => setRules({ ...rules, monthly_limit: Number(e.target.value) })} /></div>
          <button className="btn-primary">Save rules</button>
          <p className="w-full text-xs text-slate-500">Requests inside the cut-off are flagged Late; beyond the monthly limit they escalate for a second signature. Nothing is ever hard-blocked.</p>
        </form>
      )}
    </Shell>
  );
}

function AttRow({ person, current, onSave }: { person: Profile; current: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(current);
  useEffect(() => setV(current), [current]);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="min-w-[180px] font-semibold">{person.full_name}</span>
      <span className="min-w-[200px] text-slate-500">{person.email}</span>
      <input className="input max-w-xs" placeholder="email or name in attendance DB" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn-ghost !py-1" onClick={() => onSave(v)}>Save</button>
    </div>
  );
}
