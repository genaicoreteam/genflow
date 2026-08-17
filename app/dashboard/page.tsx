"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shell, { APPS } from "@/components/Shell";
import { MemphisTeam } from "@/components/Memphis";
import { useProfile, hasFullAccess } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { Task, LeaveRequest, cap, displayName } from "@/lib/types";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";

export default function Dashboard() {
  const { profile } = useProfile();
  const perms = useFeaturePerms();
  const [due, setDue] = useState<Task[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"deadlines" | "leave">("deadlines");

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const db = supabase();
      let tq = db.from("tasks").select("*").eq("status", "open").not("due_at", "is", null).order("due_at").limit(6);
      if (!hasFullAccess(profile.role)) tq = tq.eq("assignee", profile.id);
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: t }, { data: l }, { data: pp }] = await Promise.all([
        tq,
        db.from("leave_requests").select("*").gte("to_date", today).eq("admin_status", "approved").eq("team_lead_status", "approved").order("from_date").limit(6),
        db.from("profiles").select("id, full_name"),
      ]);
      setDue((t as Task[]) || []);
      setLeaves((l as LeaveRequest[]) || []);
      setNames(Object.fromEntries((pp || []).map((p: any) => [p.id, displayName(p)])));
    })();
  }, [profile]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "long" });

  const apps = useMemo(() => APPS.filter((a) => a.href !== "/dashboard" && (!a.feature || featureAllowed(perms, a.feature, profile?.role))), [perms, profile]);

  const quick = [
    { href: "/leaves", label: "Apply Leave", icon: "🌴", bg: "bg-pastel-pink" },
    { href: "/time-permissions", label: "Time Permission", icon: "⏱️", bg: "bg-pastel-blue" },
    { href: "/warnings", label: "Ad-hoc / Emergency", icon: "⚡", bg: "bg-pastel-yellow" },
    { href: "/feedback", label: "Feedback", icon: "💬", bg: "bg-pastel-violet" },
  ];

  return (
    <Shell title="Dashboard">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Greeting hero */}
          <div className="card flex items-center justify-between overflow-hidden p-8">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">{greeting}, {displayName(profile).split(" ")[0] || "there"} 💥</h1>
              <p className="mt-2 max-w-md text-sm text-slate-500">Start bright, think big, and let your enthusiasm power the day!</p>
            </div>
            <MemphisTeam className="hidden w-56 shrink-0 sm:block" />
          </div>

          {/* App grid */}
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Your Apps</h2>
            </div>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5">
              {apps.map((a) => (
                <Link key={a.href} href={a.href} className="tile">
                  <span className="tile-icon">{a.icon}</span>
                  <span className="text-xs font-semibold leading-tight text-brand-ink">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right widget column */}
        <div className="space-y-4">
          <div className="card border-2 border-brand-200 p-6">
            <h2 className="text-lg font-extrabold">Let's Get to Work</h2>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-500">{dateStr}</span>
              <span className="font-display text-xl font-extrabold">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Office: 10:00M – 7:00 PM</span>
            
            </div>
            <Link href="/clockify" className="btn-dark mt-4 w-full justify-center">🕑 My Timings</Link>
          </div>

          <div className="card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Requests</h2>
              <Link href="/inbox" className="text-sm font-semibold text-brand-600">View All</Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {quick.map((c) => (
                <Link key={c.href} href={c.href} className={`rounded-2xl p-4 transition hover:opacity-90 ${c.bg}`}>
                  <div className="text-xl">{c.icon}</div>
                  <div className="mt-2 text-sm font-bold leading-tight">{c.label}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-2 text-lg font-extrabold">Events</h2>
            <div className="mb-3 flex gap-1 border-b border-slate-100 pb-2">
              <button className={`tab !py-1.5 ${tab === "deadlines" ? "tab-active" : ""}`} onClick={() => setTab("deadlines")}>Deadlines</button>
              <button className={`tab !py-1.5 ${tab === "leave" ? "tab-active" : ""}`} onClick={() => setTab("leave")}>Leave</button>
            </div>
            {tab === "deadlines" && (
              <div className="space-y-2">
                {due.length === 0 && <p className="text-sm text-slate-500">No upcoming deadlines 🎉</p>}
                {due.map((t) => (
                  <Link key={t.id} href={`/project/${t.project_id}`} className="flex items-center gap-2 rounded-xl p-2 text-sm hover:bg-slate-50">
                    <span className="badge bg-brand-100 text-brand-700">{t.code}</span>
                    <span className="truncate font-semibold">{t.title}</span>
                    <span className={`ml-auto shrink-0 text-xs ${new Date(t.due_at!) < new Date() ? "font-bold text-red-600" : "text-slate-500"}`}>
                      {new Date(t.due_at!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {tab === "leave" && (
              <div className="space-y-2">
                {leaves.length === 0 && <p className="text-sm text-slate-500">No approved upcoming leaves.</p>}
                {leaves.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-xl p-2 text-sm">
                    <span className="font-semibold">{names[l.requester] || "Member"}</span>
                    <span className="ml-auto text-xs text-slate-500">{l.from_date} → {l.to_date}{l.leave_type === "half" ? ` (½ ${l.half_which})` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
