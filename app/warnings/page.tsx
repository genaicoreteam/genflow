"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, StatusBadge, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { Warning, Profile, ApprovalRoute, resolveApprover, displayName } from "@/lib/types";
import { downloadCSV } from "@/lib/csv";
import { pushNotification } from "@/lib/notify";

/* Alert Notifications (change #9): overdue-work alerts go in-app + email to the
   person AND their manager. 3 alerts in a month auto-escalates with an
   "Inefficient" marker. WhatsApp has been removed entirely. */
export default function Alerts() {
  const { profile } = useProfile();
  const perms = useFeaturePerms();
  const [rows, setRows] = useState<Warning[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [adhoc, setAdhoc] = useState<any[]>([]);
  const [pick, setPick] = useState("");
  const [manual, setManual] = useState({ profile_id: "", note: "" });
  const [adhocMsg, setAdhocMsg] = useState("");
  const [status, setStatus] = useState("");

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const full = hasFullAccess(profile?.role);
  const canManage = profile && featureAllowed(perms, "alerts_manage", profile.role);

  async function load() {
    const db = supabase();
    const [{ data: w }, { data: pp }, { data: rt }, { data: ah }] = await Promise.all([
      db.from("warnings").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("*").order("full_name"),
      db.from("approval_routes").select("*"),
      db.from("adhoc_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setRows((w as Warning[]) || []); setPeople((pp as Profile[]) || []);
    setRoutes((rt as ApprovalRoute[]) || []); setAdhoc(ah || []);
  }
  useEffect(() => { load(); }, []);

  const myReports = people.filter((p) => p.reports_to === profile?.id).map((p) => p.id);
  const visiblePeople = full ? people
    : myReports.length ? people.filter((p) => myReports.includes(p.id) || p.id === profile?.id)
    : people.filter((p) => p.id === profile?.id);

  const visible = rows.filter((r) => {
    if (!profile) return false;
    const ok = full ? true : myReports.length ? (myReports.includes(r.profile_id) || r.profile_id === profile.id) : r.profile_id === profile.id;
    if (!ok) return false;
    if (pick && r.profile_id !== pick) return false;
    return true;
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const monthCount = (pid: string) => rows.filter((r) => r.profile_id === pid && r.created_at >= monthStart).length;

  async function sendManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.profile_id) return;
    setStatus("Sending…");
    const res = await fetch("/api/warnings/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: manual.profile_id, kind: "manual", note: manual.note || "Alert from " + displayName(profile) }),
    });
    setStatus(res.ok ? "Alert sent — the person and their manager have been notified." : "Failed to send (check SUPABASE_SERVICE_ROLE_KEY).");
    setManual({ profile_id: "", note: "" }); load();
  }

  async function sendAdhoc(e: React.FormEvent) {
    e.preventDefault();
    if (!adhocMsg.trim() || !profile) return;
    const routeKey = profile.role === "admin" ? "adhoc_admin" : "adhoc_member";
    const target = resolveApprover(routes.find((r) => r.request_type === routeKey), profile, people)
      || people.find((p) => p.role === "team_lead") || null;
    await supabase().from("adhoc_requests").insert({ requester: profile.id, routed_to: target?.id || null, message: adhocMsg.trim() });
    if (target) await pushNotification(target.id, target.email, `Ad-hoc request from ${displayName(profile)}`, adhocMsg.trim(), "/inbox");
    setAdhocMsg(""); load();
  }

  function exportCSV() {
    downloadCSV("alerts-report", [
      ["Person", "Kind", "Level", "Note", "Channel", "When"],
      ...visible.map((r) => [displayName(byId[r.profile_id]), r.kind, r.level, r.note, r.sent_via, new Date(r.created_at).toLocaleString()]),
    ]);
  }

  return (
    <Shell title="Alert Notifications">
      <PageHead title="Alert Notifications"
        sub="When work is overdue, the person and their manager get an in-app + email alert. Three alerts in a month marks the person Inefficient and escalates to the Team Lead and Manager." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {canManage && (
            <form onSubmit={sendManual} className="card space-y-3 p-4">
              <h2 className="font-display font-bold">Send an alert manually</h2>
              <select className="input" value={manual.profile_id} onChange={(e) => setManual({ ...manual, profile_id: e.target.value })}>
                <option value="">Choose person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{displayName(p)} ({monthCount(p.id)} this month)</option>)}
              </select>
              <textarea className="input" rows={2} placeholder="Reason / note" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} />
              <button className="btn-primary w-full justify-center">Send alert</button>
              {status && <p className="text-xs font-semibold text-slate-500">{status}</p>}
            </form>
          )}
          <form onSubmit={sendAdhoc} className="card space-y-3 p-4">
            <h2 className="font-display font-bold">Ad-hoc / emergency request</h2>
            <p className="text-xs text-slate-500">Goes straight to your configured approver for a quick yes/no.</p>
            <textarea className="input" rows={2} placeholder="e.g. Need to step out 3–4 PM for bank work" value={adhocMsg} onChange={(e) => setAdhocMsg(e.target.value)} />
            <button className="btn-dark w-full justify-center">Send request</button>
          </form>
          <div className="card p-4">
            <h2 className="mb-2 font-display font-bold">My ad-hoc requests</h2>
            <div className="space-y-2 text-sm">
              {adhoc.filter((a) => a.requester === profile?.id).slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                  <span className="flex-1">{a.message}</span><StatusBadge s={a.status} />
                </div>
              ))}
              {adhoc.filter((a) => a.requester === profile?.id).length === 0 && <p className="text-slate-500">None yet.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="card flex flex-wrap items-center gap-2 p-3">
            <select className="input max-w-[240px]" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{full || myReports.length ? "Everyone I can see" : "My alerts"}</option>
              {visiblePeople.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
            </select>
            {(full || myReports.length > 0) && <button className="btn-ghost ml-auto !py-1" onClick={exportCSV}>Export CSV</button>}
          </div>

          {/* Inefficiency banner */}
          {visiblePeople.filter((p) => monthCount(p.id) >= 3).map((p) => (
            <div key={p.id} className="card border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              🚩 {displayName(p)} has {monthCount(p.id)} alerts this month — marked <b>Inefficient</b>; Team Lead & Manager notified.
            </div>
          ))}

          {visible.length === 0 && <Empty text="No alerts — everything is moving on time 🎉" />}
          {visible.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
              <b>{displayName(byId[r.profile_id])}</b>
              <span className="badge bg-slate-100 capitalize text-slate-600">{r.kind.replace("_", " ")}</span>
              <span className={`badge ${r.level >= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>Alert #{r.level} this month</span>
              <span className="text-slate-500">{r.note}</span>
              <span className="ml-auto text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
