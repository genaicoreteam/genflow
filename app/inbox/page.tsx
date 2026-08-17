"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, StatusBadge, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Notification, Profile } from "@/lib/types";
import { pushNotification } from "@/lib/notify";

/* Inbox = in-app notifications (assignments, mentions, approvals, alerts)
   plus the ad-hoc requests routed to me for a decision. */
export default function Inbox() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"notifications" | "requests">("notifications");
  const [notes, setNotes] = useState<Notification[]>([]);
  const [adhoc, setAdhoc] = useState<any[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  async function load() {
    if (!profile) return;
    const db = supabase();
    const [{ data: n }, { data: a }, { data: pp }] = await Promise.all([
      db.from("notifications").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(100),
      db.from("adhoc_requests").select("*").eq("routed_to", profile.id).order("created_at", { ascending: false }),
      db.from("profiles").select("*"),
    ]);
    setNotes((n as Notification[]) || []); setAdhoc(a || []); setPeople((pp as Profile[]) || []);
  }
  useEffect(() => { load(); }, [profile]);

  async function markAllRead() {
    if (!profile) return;
    await supabase().from("notifications").update({ read: true }).eq("profile_id", profile.id).eq("read", false);
    load();
  }
  async function markRead(n: Notification) {
    if (n.read) return;
    await supabase().from("notifications").update({ read: true }).eq("id", n.id);
    load();
  }
  async function decide(r: any, status: "approved" | "rejected") {
    await supabase().from("adhoc_requests").update({ status }).eq("id", r.id);
    const req = byId[r.requester];
    if (req) await pushNotification(req.id, req.email, `Your ad-hoc request was ${status}`,
      `"${r.message}" — decided by ${profile?.full_name}.`, "/warnings");
    load();
  }

  const unread = notes.filter((n) => !n.read).length;
  const openReqs = adhoc.filter((a) => a.status === "open").length;

  return (
    <Shell title="Inbox">
      <PageHead title="Inbox" sub="Everything addressed to you: task assignments, @mentions, approvals, and alerts." />
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <button className={`tab ${tab === "notifications" ? "tab-active" : ""}`} onClick={() => setTab("notifications")}>
          Notifications {unread > 0 && <span className="badge ml-1 bg-red-500 text-white">{unread}</span>}
        </button>
        <button className={`tab ${tab === "requests" ? "tab-active" : ""}`} onClick={() => setTab("requests")}>
          Requests for me {openReqs > 0 && <span className="badge ml-1 bg-red-500 text-white">{openReqs}</span>}
        </button>
        {tab === "notifications" && unread > 0 && <button className="btn-ghost ml-auto !py-1" onClick={markAllRead}>Mark all read</button>}
      </div>

      {tab === "notifications" && (
        <div className="space-y-2">
          {notes.length === 0 && <Empty text="Nothing is waiting on you 🎉" />}
          {notes.map((n) => {
            const inner = (
              <div className={`card flex flex-wrap items-start gap-2 p-3 text-sm ${n.read ? "" : "border-l-4 border-l-brand-500"}`}>
                <div className="flex-1">
                  <div className="font-bold">{n.title}</div>
                  <div className="text-slate-500">{n.body}</div>
                </div>
                <span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            );
            return n.link
              ? <Link key={n.id} href={n.link} onClick={() => markRead(n)} className="block">{inner}</Link>
              : <div key={n.id} onClick={() => markRead(n)} className="cursor-pointer">{inner}</div>;
          })}
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-2">
          {adhoc.length === 0 && <Empty text="No requests routed to you." />}
          {adhoc.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
              <b>{byId[r.requester]?.full_name || "Member"}</b>
              <span className="text-slate-500">{r.message}</span>
              <span className="ml-auto flex items-center gap-2">
                <StatusBadge s={r.status} />
                {r.status === "open" && (
                  <>
                    <button className="btn-primary !px-3 !py-1" onClick={() => decide(r, "approved")}>Approve</button>
                    <button className="btn-danger !px-3 !py-1" onClick={() => decide(r, "rejected")}>Reject</button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
