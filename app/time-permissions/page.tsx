"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, StatusBadge } from "@/components/Ui";
import { MemphisClock } from "@/components/Memphis";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { TimePermission, Profile, ApprovalRoute, resolveApprover, displayName } from "@/lib/types";
import { downloadCSV, downloadDoc } from "@/lib/csv";
import { pushNotification } from "@/lib/notify";

/* Rules: late coming = arriving after 10:15 AM; early leave = leaving before 7:00 PM.
   Cut-off window & monthly limit are soft ("flag and escalate, never hard-block"). */

export default function TimePermissions() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<TimePermission[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [rules, setRules] = useState({ cutoff_hours: 2, monthly_limit: 3 });
  const [f, setF] = useState({ kind: "early_leave", for_date: "", at_time: "", reason: "" });
  const [filterPerson, setFilterPerson] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [fFrom, setFFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [fTo, setFTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const full = hasFullAccess(profile?.role);

  async function load() {
    const db = supabase();
    const [{ data: r }, { data: pp }, { data: rr }, { data: rt }] = await Promise.all([
      db.from("time_permissions").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("*").order("full_name"),
      db.from("org_rules").select("*").maybeSingle(),
      db.from("approval_routes").select("*"),
    ]);
    setRows((r as TimePermission[]) || []); setPeople((pp as Profile[]) || []);
    setRoutes((rt as ApprovalRoute[]) || []);
    if (rr) setRules({ cutoff_hours: rr.cutoff_hours, monthly_limit: rr.monthly_limit });
  }
  useEffect(() => { load(); }, []);

  const myReports = people.filter((p) => p.reports_to === profile?.id).map((p) => p.id);
  const visible = rows.filter((r) => {
    if (!profile) return false;
    let ok: boolean;
    if (full) ok = !filterPerson || r.requester === filterPerson;
    else if (profile.role === "admin") ok = r.requester === profile.id || myReports.includes(r.requester);
    else ok = r.requester === profile.id;
    if (!ok) return false;
    const d = r.created_at.slice(0, 10);
    if (fFrom && d < fFrom) return false;
    if (fTo && d > fTo) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (flaggedOnly && !r.flag_late && !r.flag_over_limit) return false;
    return true;
  });

  const metrics = {
    total: visible.length,
    approved: visible.filter((r) => r.status === "approved").length,
    open: visible.filter((r) => r.status === "open").length,
    late: visible.filter((r) => r.flag_late).length,
    over: visible.filter((r) => r.flag_over_limit).length,
  };

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const myThisMonth = rows.filter((r) => r.requester === profile?.id && new Date(r.created_at) >= monthStart).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const when = new Date(`${f.for_date}T${f.at_time || "18:00"}`);
    const flag_late = (when.getTime() - Date.now()) / 3600000 < rules.cutoff_hours;
    const flag_over_limit = myThisMonth >= rules.monthly_limit;
    await supabase().from("time_permissions").insert({
      requester: profile.id, kind: f.kind, for_date: f.for_date, at_time: f.at_time,
      reason: f.reason, status: "open", flag_late, flag_over_limit,
    });
    const route = routes.find((x) => x.request_type === "time_permission");
    const approver = resolveApprover(route, profile, people);
    if (approver) await pushNotification(approver.id, approver.email,
      `${f.kind.replace("_", " ")} permission from ${displayName(profile)}`,
      `${f.for_date} at ${f.at_time}. Reason: ${f.reason}${flag_late ? " · flagged LATE (inside cut-off)" : ""}${flag_over_limit ? " · OVER monthly limit — needs Team Lead second signature" : ""}`,
      "/time-permissions");
    if (flag_over_limit) {
      const lead = people.find((p) => p.role === "team_lead");
      if (lead && lead.id !== approver?.id) await pushNotification(lead.id, lead.email,
        `Escalation: ${displayName(profile)} is over the monthly limit`,
        `Their ${f.kind.replace("_", " ")} request for ${f.for_date} needs your second signature.`, "/time-permissions");
    }
    setF({ kind: "early_leave", for_date: "", at_time: "", reason: "" });
    setMsg("Request submitted — your approver has been notified."); load();
  }

  const iAmApproverFor = (r: TimePermission) => {
    const req = byId[r.requester];
    if (!req || !profile) return false;
    const route = routes.find((x) => x.request_type === "time_permission");
    const approver = resolveApprover(route, req, people);
    if (approver?.id === profile.id) return true;
    if (req.reports_to === profile.id) return true;
    if (r.flag_over_limit && profile.role === "team_lead") return true; // escalation second signature
    return false;
  };

  async function decide(r: TimePermission, status: "approved" | "rejected") {
    const patch: any = { status, decided_by: profile?.id };
    if (r.flag_over_limit && profile?.role === "team_lead") patch.lead_decided_by = profile.id;
    await supabase().from("time_permissions").update(patch).eq("id", r.id);
    const req = byId[r.requester];
    if (req) await pushNotification(req.id, req.email, `Your ${r.kind.replace("_", " ")} request was ${status}`,
      `${r.for_date} at ${r.at_time} — decided by ${displayName(profile)}.`, "/time-permissions");
    load();
  }

  function exportCSV() {
    downloadCSV(`time-permissions-${new Date().toISOString().slice(0, 10)}`, [
      ["Person", "Type", "Date", "Time", "Reason", "Status", "Late flag", "Over limit", "Requested at"],
      ...visible.map((r) => [displayName(byId[r.requester]), r.kind, r.for_date, r.at_time, r.reason, r.status,
        r.flag_late ? "LATE" : "", r.flag_over_limit ? "OVER LIMIT" : "", new Date(r.created_at).toLocaleString()]),
    ]);
  }
  function exportDocWeekly(range: "week" | "month") {
    const from = new Date(); from.setDate(from.getDate() - (range === "week" ? 7 : 30));
    const list = visible.filter((r) => new Date(r.created_at) >= from);
    downloadDoc(`time-permissions-${range}`, `Time permissions — last ${range}`,
      `<h2>Time permissions — last ${range}</h2><table border="1" cellpadding="6"><tr><th>Person</th><th>Type</th><th>Date</th><th>Time</th><th>Status</th></tr>` +
      list.map((r) => `<tr><td>${displayName(byId[r.requester])}</td><td>${r.kind}</td><td>${r.for_date}</td><td>${r.at_time}</td><td>${r.status}</td></tr>`).join("") + "</table>");
  }

  return (
    <Shell title="Early Leave / Late Coming">
      <PageHead title="Early Leave / Late Coming"
        sub={`Late coming = after 10:15 AM · Early leave = before 7:00 PM. Requests inside the ${rules.cutoff_hours}h cut-off are flagged Late; beyond ${rules.monthly_limit}/month they escalate to the Team Lead for a second signature.`}
        art={<MemphisClock className="w-full" />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="font-display font-semibold">Raise a request</h2>
          <p className="mb-3 text-xs text-brand-600">This month: <b>{myThisMonth} / {rules.monthly_limit}</b></p>
          {profile && !profile.reports_to && <p className="mb-3 rounded-lg bg-brand-100 p-2 text-xs text-brand-700">You have no approver above you — use the queues on the right to manage others.</p>}
          <form onSubmit={submit} className="space-y-3">
            <div><label className="label">Type</label>
              <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="early_leave">Early leave (before 7:00 PM)</option>
                <option value="late_coming">Late coming (after 10:15 AM)</option>
              </select></div>
            <div><label className="label">Date</label><input type="date" className="input" required value={f.for_date} onChange={(e) => setF({ ...f, for_date: e.target.value })} /></div>
            <div><label className="label">Time</label><input type="time" className="input" required value={f.at_time} onChange={(e) => setF({ ...f, at_time: e.target.value })} /></div>
            <div><label className="label">Reason</label><textarea className="input" rows={2} required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <button className="btn-primary w-full justify-center">Submit request</button>
            {msg && <p className="text-xs text-emerald-700">{msg}</p>}
          </form>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric n={metrics.total} label="Requests" />
            <Metric n={metrics.approved} label="Approved" />
            <Metric n={metrics.open} label="Open" />
            <Metric n={metrics.late} label="Late" warn />
            <Metric n={metrics.over} label="Over limit" warn />
          </div>
          <div className="card flex flex-wrap items-end gap-2 p-3">
            {full && (
              <div><label className="label">Person</label>
                <select className="input max-w-[200px]" value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
                  <option value="">Everyone</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
                </select></div>
            )}
            <div><label className="label">Status</label>
              <select className="input max-w-[140px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Any</option><option value="open">Open</option>
                <option value="approved">Approved</option><option value="rejected">Rejected</option>
              </select></div>
            <div><label className="label">From</label><input type="date" className="input" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
            <div><label className="label">To</label><input type="date" className="input" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-500" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />Flagged only
            </label>
            <span className="ml-auto flex gap-2">
              <button className="btn-ghost" onClick={exportCSV}>Export filtered CSV</button>
              <button className="btn-ghost" onClick={() => exportDocWeekly("week")}>Weekly Doc</button>
              <button className="btn-ghost" onClick={() => exportDocWeekly("month")}>Monthly Doc</button>
            </span>
          </div>
          {visible.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">Nothing is waiting on you 🎉</div>}
          <div className="space-y-2">
            {visible.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
                <b>{displayName(byId[r.requester])}</b>
                <span className="capitalize text-brand-600">{r.kind.replace("_", " ")}</span>
                <span>{r.for_date} · {r.at_time}</span>
                <span className="text-brand-600">{r.reason}</span>
                {r.flag_late && <span className="badge bg-amber-100 text-amber-700">Late</span>}
                {r.flag_over_limit && <span className="badge bg-orange-100 text-orange-700">Over limit → dual approval</span>}
                <span className="ml-auto flex items-center gap-2">
                  <StatusBadge s={r.status} />
                  {r.status === "open" && iAmApproverFor(r) && (
                    <>
                      <button className="btn-primary !px-3 !py-1" onClick={() => decide(r, "approved")}>Approve</button>
                      <button className="btn-danger !px-3 !py-1" onClick={() => decide(r, "rejected")}>Reject</button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Metric({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="card p-3">
      <div className={`font-display text-xl font-bold ${warn ? "text-orange-600" : "text-brand-600"}`}>{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
