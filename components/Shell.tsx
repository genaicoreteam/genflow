"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, displayName } from "@/lib/types";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";

export type AppItem = { href: string; label: string; icon: string; feature?: string; memberHidden?: boolean };

export const APPS: AppItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/portfolios", label: "Portfolios & Projects", icon: "🗂️" },
  { href: "/my-work", label: "My Work", icon: "✅" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/reporting", label: "Reporting", icon: "📊", feature: "reporting" },
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/automations", label: "Automations", icon: "⚙️", feature: "automations" },
  { href: "/time-permissions", label: "Early Leave / Late Coming", icon: "⏱️" },
  { href: "/leaves", label: "Leaves Approval", icon: "🌴" },
  { href: "/clockify", label: "Clockify", icon: "🕑" },
  { href: "/recordus", label: "RecordUs", icon: "🎙️", feature: "recordus" },
  { href: "/midday-records", label: "Mid-day Records", icon: "📼", feature: "midday" },
  { href: "/cumulative-report", label: "Cumulative Report", icon: "📈", feature: "cumulative" },
  { href: "/warnings", label: "Alert Notifications", icon: "🔔" },
  { href: "/feedback", label: "Feedback Box", icon: "💬" },
  { href: "/admin", label: "Admin", icon: "🛠️", feature: "admin_area" },
];

const RAIL = ["/dashboard", "/portfolios", "/my-work", "/calendar", "/inbox", "/warnings"];

export default function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const perms = useFeaturePerms();

  useEffect(() => { setOpen(false); setQ(""); }, [pathname]);
  useEffect(() => { if (!loading && !profile) router.replace("/login"); }, [loading, profile, router]);
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const db = supabase();
      const [{ count: n1 }, { count: n2 }] = await Promise.all([
        db.from("notifications").select("*", { count: "exact", head: true }).eq("profile_id", profile.id).eq("read", false),
        db.from("adhoc_requests").select("*", { count: "exact", head: true }).eq("routed_to", profile.id).eq("status", "open"),
      ]);
      setUnread((n1 || 0) + (n2 || 0));
    })();
  }, [profile, pathname]);

  const visibleApps = useMemo(() => APPS.filter((a) => {
    if (!a.feature) return true;
    return featureAllowed(perms, a.feature, profile?.role);
  }), [perms, profile]);

  const results = q ? visibleApps.filter((a) => a.label.toLowerCase().includes(q.toLowerCase())) : [];

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      {/* Dark icon rail */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-16 flex-col items-center gap-1 bg-brand-rail py-3 sm:flex">
        <button aria-label="All apps" onClick={() => setOpen(true)}
          className="mb-2 grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-white/10">
          <span className="flex flex-col gap-1"><i className="h-0.5 w-5 rounded bg-current" /><i className="h-0.5 w-5 rounded bg-current" /><i className="h-0.5 w-5 rounded bg-current" /></span>
        </button>
        {RAIL.map((href) => {
          const a = APPS.find((x) => x.href === href)!;
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} title={a.label}
              className={`grid h-11 w-11 place-items-center rounded-xl text-lg ${active ? "bg-brand-500 text-white" : "text-slate-300 hover:bg-white/10"}`}>
              {a.icon}
            </Link>
          );
        })}
        <button onClick={signOut} title="Sign out" className="mt-auto grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-white/10">⎋</button>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:pl-20">
        <button aria-label="All apps" onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 sm:hidden">
          <span className="flex flex-col gap-1"><i className="h-0.5 w-5 rounded bg-brand-ink" /><i className="h-0.5 w-5 rounded bg-brand-ink" /><i className="h-0.5 w-5 rounded bg-brand-ink" /></span>
        </button>
        <Link href="/dashboard" className="leading-tight">
          <div className="font-display text-lg font-extrabold tracking-tight">GenFlow</div>
          <div className="-mt-0.5 text-[11px] font-semibold text-slate-400">GenAi Social Media Team</div>
        </Link>
        <div className="relative mx-auto w-full max-w-xl">
          <input className="input !rounded-full !bg-slate-50 !py-2.5 pl-10" placeholder="Search features…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="pointer-events-none absolute left-3.5 top-2.5 text-slate-400">🔍</span>
          {q && (
            <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
              {results.length === 0 && <div className="p-3 text-sm text-slate-500">No matches.</div>}
              {results.map((r) => (
                <Link key={r.href} href={r.href} className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
                  <span>{r.icon}</span>{r.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link href="/inbox" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" title="Inbox">
          <span className="text-lg">🔔</span>
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
        </Link>
        {profile && (
          <div className="flex items-center gap-2">
            <span className="hidden badge bg-slate-100 text-slate-600 md:inline-flex">{ROLE_LABELS[profile.role]}</span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white" title={displayName(profile)}>
              {(displayName(profile) || "?").slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </header>

      {/* Dark all-apps panel */}
      {open && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />}
      <aside className={`fixed left-0 top-0 z-50 h-full w-[340px] transform bg-brand-rail text-white shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 p-4">
          <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 hover:bg-white/10">←</button>
          <span className="font-display font-bold">All Apps</span>
        </div>
        <div className="grid max-h-[calc(100%-140px)] grid-cols-3 gap-1 overflow-y-auto p-3">
          {visibleApps.map((a) => (
            <Link key={a.href} href={a.href}
              className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-center ${pathname.startsWith(a.href) ? "bg-white/15" : "hover:bg-white/10"}`}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-xl">{a.icon}</span>
              <span className="text-[11px] font-semibold leading-tight text-slate-200">{a.label}</span>
            </Link>
          ))}
        </div>
        <div className="absolute bottom-0 w-full space-y-2 p-4">
          <Link href="/download-app" className="btn-primary w-full justify-center">⇩ Download App</Link>
          <button onClick={signOut} className="btn w-full justify-center bg-white/10 text-slate-200 hover:bg-white/20">Sign out</button>
        </div>
      </aside>

      <main className="mx-auto max-w-7xl p-4 sm:p-6 sm:pl-[88px]">{children}</main>
    </div>
  );
}
