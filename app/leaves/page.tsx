"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, StatusBadge } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { LeaveRequest, Profile, ApprovalRoute, resolveApprover } from "@/lib/types";
import { downloadCSV, downloadDoc } from "@/lib/csv";
import { pushNotification } from "@/lib/notify";

/* Dual approval with configurable routing (Admin lane + Team Lead lane).
   Half-day leaves supported (change #13); half days count 0.5 in totals. */
export default function Leaves() {
  const { profile } = useProfile();
  const perms = useFeaturePerms();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [f, setF] = useState({ from_date: "", to_date: "", reason: "", proof_url: "", leave_type: "full", half_which: "first" });
  const [msg, setMsg] = useState("");
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const full = hasFullAccess(profile?.role);
  const canExport = profile && featureAllowed(perms, "exports", profile.role);

  async function load() {
    const db = supabase();
    const [{ data: r }, { data: pp }, { data: rt }] = await Promise.all([
      db.from("leave_requests").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("*").order("full_name"),
      db.from("approval_routes").select("*"),
    ]);
    setRows((r as LeaveRequest[]) || []); setPeople((pp as Profile[]) || []); setRoutes((rt as ApprovalRoute[]) || []);
  }
  useEffect(() => { load(); }, []);

  const myReports = people.filter((p) => p.reports_to === profile?.id).map((p) => p.id);
  const visible = rows.filter((r) => {
    if (!profile) return false;
    if (full) return true;
    if (profile.role === "admin") return r.requester === profile.id || myReports.includes(r.requester);
    return r.requester === profile.id;
  });

  const days = (r: LeaveRequest) => {
    const d = Math.round((new Date(r.to_date).getTime() - new Date(r.from_date).getTime()) / 86400000) + 1;
    return r.leave_type === "half" ? 0.5 : d;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const half = f.leave_type === "half";
    await supabase().from("leave_requests").insert({
      requester: profile.id, from_date: f.from_date, to_date: half ? f.from_date : f.to_date || f.from_date,
      reason: f.reason, proof_url: f.proof_url || null,
      leave_type: f.leave_type, half_which: half ? f.half_which : null,
      admin_status: profile.role === "member" ? "open" : "approved",
      team_lead_status: ["team_lead", "manager", "core_team", "process_coordinator"].includes(profile.role) ? "approved" : "open",
    });
    const routeAdmin = routes.find((x) => x.request_type === "leave_admin");
    const routeLead = routes.find((x) => x.request_type === "leave_team_lead");
    const targets: Profile[] = [];
    if (profile.role === "member") { const a = resolveApprover(routeAdmin, profile, people); if (a) targets.push(a); }
    if (["member", "admin"].includes(profile.role)) { const l = resolveApprover(routeLead, profile, people); if (l) targets.push(l); }
    if (profile.role === "team_lead") { const m = people.find((p) => p.role === "manager"); if (m) targets.push(m); }
    for (const t of targets)
      await pushNotification(t.id, t.email, `Leave request from ${profile.full_name}`,
        `${f.from_date} → ${half ? f.from_date : f.to_date}${half ? ` (half day, ${f.half_which} half)` : ""}. Reason: ${f.reason}`, "/leaves");
    setF({ from_date: "", to_date: "", reason: "", proof_url: "", leave_type: "full", half_which: "first" });
    setMsg("Request submitted — approvers have been notified."); load();
  }

  function myLane(r: LeaveRequest): "admin" | "team_lead" | null {
    const req = byId[r.requester]; if (!req || !profile) return null;
    if (req.role === "member" && req.reports_to === profile.id && profile.role === "admin") return "admin";
    if (profile.role === "team_lead" && ["member", "admin"].includes(req.role)) return "team_lead";
    if (profile.role === "manager" && req.role === "team_lead") return "team_lead";
    return null;
  }

  async function decide(r: LeaveRequest, lane: "admin" | "team_lead", status: "approved" | "rejected") {
    const patch: any = lane === "admin" ? { admin_status: status } : { team_lead_status: status };
    await supabase().from("leave_requests").update(patch).eq("id", r.id);
    const req = byId[r.requester];
    if (req) await pushNotification(req.id, req.email, `Leave ${status} (${lane.replace("_", " ")} sign-off)`,
      `Your leave ${r.from_date} → ${r.to_date} was ${status} by ${profile?.full_name}.`, "/leaves");
    load();
  }

  function exportAll(kind: "csv" | "doc") {
    const data = visible;
    const typeStr = (r: LeaveRequest) => r.leave_type === "half" ? `Half (${r.half_which})` : "Full";
    if (kind === "csv") {
      downloadCSV("leaves-report", [
        ["Person", "From", "To", "Type", "Days", "Reason", "Admin", "Team Lead", "Requested"],
        ...data.map((r) => [byId[r.requester]?.full_name, r.from_date, r.to_date, typeStr(r), days(r), r.reason, r.admin_status, r.team_lead_status, new Date(r.created_at).toLocaleDateString()]),
      ]);
    } else {
      downloadDoc("leaves-report", "Leaves report",
        `<h2>Leaves report</h2><table border="1" cellpadding="6"><tr><th>Person</th><th>From</th><th>To</th><th>Type</th><th>Days</th><th>Admin</th><th>Team Lead</th></tr>` +
        data.map((r) => `<tr><td>${byId[r.requester]?.full_name || ""}</td><td>${r.from_date}</td><td>${r.to_date}</td><td>${typeStr(r)}</td><td>${days(r)}</td><td>${r.admin_status}</td><td>${r.team_lead_status}</td></tr>`).join("") + "</table>");
    }
  }

  return (
    <Shell title="Leaves Approval">
      <PageHead title="Leaves Approval" sub="Every member's leave needs two signatures — their Admin and the Team Lead. Half-day leaves count as 0.5 in all reports." />
      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={submit} className="card space-y-3 p-4">
          <h2 className="font-display font-bold">Request leave</h2>
          <div><label className="label">Leave type</label>
            <select className="input" value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
              <option value="full">Full day(s)</option><option value="half">Half day</option>
            </select></div>
          {f.leave_type === "half" && (
            <div><label className="label">Which half</label>
              <select className="input" value={f.half_which} onChange={(e) => setF({ ...f, half_which: e.target.value })}>
                <option value="first">First half (morning)</option><option value="second">Second half (evening)</option>
              </select></div>
          )}
          <div><label className="label">{f.leave_type === "half" ? "Date" : "From"}</label>
            <input type="date" className="input" required value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} /></div>
          {f.leave_type === "full" && (
            <div><label className="label">To</label>
              <input type="date" className="input" required value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} /></div>
          )}
          <div><label className="label">Reason</label>
            <textarea className="input" rows={2} required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <div><label className="label">Proof link (optional)</label>
            <input className="input" placeholder="https://…" value={f.proof_url} onChange={(e) => setF({ ...f, proof_url: e.target.value })} /></div>
          <button className="btn-primary w-full justify-center">Submit for approval</button>
          {msg && <p className="text-xs font-semibold text-emerald-700">{msg}</p>}
        </form>

        <div className="space-y-3 lg:col-span-2">
          {(canExport || profile?.role === "admin") && (
            <div className="card flex gap-2 p-3">
              <span className="text-sm font-bold">Exports</span>
              <button className="btn-ghost ml-auto !py-1" onClick={() => exportAll("csv")}>CSV</button>
              <button className="btn-ghost !py-1" onClick={() => exportAll("doc")}>Doc</button>
            </div>
          )}
          {visible.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No leave requests visible to you.</div>}
          {visible.map((r) => {
            const lane = myLane(r);
            return (
              <div key={r.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
                <b>{byId[r.requester]?.full_name}</b>
                <span>{r.from_date}{r.to_date !== r.from_date ? ` → ${r.to_date}` : ""}</span>
                <span className={`badge ${r.leave_type === "half" ? "bg-pastel-yellow text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                  {r.leave_type === "half" ? `½ day · ${r.half_which} half` : `${days(r)} day(s)`}
                </span>
                <span className="text-slate-500">{r.reason}</span>
                {r.proof_url && <a href={r.proof_url} target="_blank" className="font-semibold text-brand-600 underline">proof</a>}
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs">Admin: <StatusBadge s={r.admin_status} /></span>
                  <span className="text-xs">Lead: <StatusBadge s={r.team_lead_status} /></span>
                  {lane && ((lane === "admin" && r.admin_status === "open") || (lane === "team_lead" && r.team_lead_status === "open")) && (
                    <>
                      <button className="btn-primary !px-3 !py-1" onClick={() => decide(r, lane, "approved")}>Approve</button>
                      <button className="btn-danger !px-3 !py-1" onClick={() => decide(r, lane, "rejected")}>Reject</button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
