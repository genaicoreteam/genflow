"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase, attendanceDb } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { downloadCSV } from "@/lib/csv";
import { displayName } from "@/lib/types";

/* Clockify: office in/out times read from the separate attendance database.
   Each person sees only their own rows, matched through the identity mapping
   set in Admin → Attendance mapping (change #7). */
export default function Clockify() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [identifier, setIdentifier] = useState<string>("");
  const [range, setRange] = useState<"week" | "month" | "custom">("week");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("");

  useEffect(() => {
    const d = new Date();
    if (range === "week") { const s = new Date(); s.setDate(d.getDate() - 7); setFrom(s.toISOString().slice(0, 10)); setTo(d.toISOString().slice(0, 10)); }
    if (range === "month") { const s = new Date(d.getFullYear(), d.getMonth(), 1); setFrom(s.toISOString().slice(0, 10)); setTo(d.toISOString().slice(0, 10)); }
  }, [range]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setStatus("Loading…");
      // 1. resolve this person's identifier in the attendance DB
      const { data: map } = await supabase().from("attendance_map").select("att_identifier").eq("profile_id", profile.id).maybeSingle();
      const ident = map?.att_identifier || profile.email;
      setIdentifier(ident);

      const adb = attendanceDb();
      let list: any[] = [];
      try {
        const { data, error } = await adb.from("office_punches").select("*").eq("email", ident).gte("day", from).lte("day", to).order("day");
        if (error) throw error;
        list = data || [];
        if (list.length === 0) {
          // fallback: some attendance systems key rows by name instead of email
          const { data: byName } = await adb.from("office_punches").select("*").eq("name", ident).gte("day", from).lte("day", to).order("day");
          list = byName || [];
        }
      } catch {
        try {
          const { data } = await adb.from("office_punches").select("*").eq("email", ident).gte("day", from).lte("day", to).order("day");
          list = data || [];
        } catch { list = []; }
      }
      setRows(list);
      setStatus(list.length ? "" : "No punches found for this range. If this looks wrong, ask your admin to check your identifier in Admin → Attendance mapping.");
    })();
  }, [profile, from, to]);

  const hours = (r: any) => {
    if (!r.in_time || !r.out_time) return 0;
    const [ih, im] = String(r.in_time).split(":").map(Number);
    const [oh, om] = String(r.out_time).split(":").map(Number);
    return Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60);
  };
  const total = useMemo(() => rows.reduce((s, r) => s + hours(r), 0), [rows]);

  function exportCSV() {
    downloadCSV(`my-office-hours-${from}-to-${to}`, [
      ["Name", "Email", "Date", "In", "Out", "Hours"],
      ...rows.map((r) => [displayName(profile), profile?.email || "", r.day, r.in_time || "", r.out_time || "", hours(r).toFixed(2)]),
      ["", "", "", "", "Total", total.toFixed(2)],
    ]);
  }

  return (
    <Shell title="Clockify">
      <PageHead title="Clockify" sub="Your office in and out times, pulled from the attendance system. Only you can see your own record." />
      <div className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <div><label className="label">Range</label>
          <select className="input max-w-[160px]" value={range} onChange={(e) => setRange(e.target.value as any)}>
            <option value="week">This week</option><option value="month">This month</option><option value="custom">Custom</option>
          </select></div>
        <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => { setRange("custom"); setFrom(e.target.value); }} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => { setRange("custom"); setTo(e.target.value); }} /></div>
        <span className="ml-auto flex items-center gap-2">
          <span className="badge bg-brand-100 text-brand-700">Total {total.toFixed(2)} h</span>
          <button className="btn-ghost !py-1" onClick={exportCSV} disabled={!rows.length}>Export CSV</button>
        </span>
      </div>
      {identifier && <p className="mb-2 text-xs text-slate-400">Matching attendance records for: <b>{identifier}</b></p>}
      {rows.length === 0 ? <Empty text={status || "No punches in this range."} /> : (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase text-slate-400">
              <th className="p-2">Date</th><th className="p-2">In</th><th className="p-2">Out</th><th className="p-2">Hours</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-50">
                  <td className="p-2 font-semibold">{r.day}</td>
                  <td className="p-2">{r.in_time || "—"}</td>
                  <td className="p-2">{r.out_time || "—"}</td>
                  <td className="p-2">{hours(r).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
