"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import Recorder from "@/components/Recorder";
import { supabase } from "@/lib/supabase";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { useProfile } from "@/lib/session";

import { downloadCSV, downloadText } from "@/lib/csv";

/* Mid-day Records — like RecordUs but organised into team folders; Admins also have access. */

export default function MiddayRecords() {
  const { profile, loading } = useProfile();
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [nf, setNf] = useState("");
  const [meetings, setMeetings] = useState<any[]>([]);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const perms = useFeaturePerms();
  const allowed = profile && featureAllowed(perms, "midday", profile.role);

  async function load() {
    const db = supabase();
    const { data } = await db.from("midday_meetings").select("*").gte("day", from).lte("day", to).order("day", { ascending: false });
    setMeetings(data || []);
    const fs = Array.from(new Set((data || []).map((m: any) => m.folder).filter(Boolean))) as string[];
    setFolders(fs);
    if (!folder && fs[0]) setFolder(fs[0]);
  }
  useEffect(() => { if (allowed) load(); }, [allowed, from, to]);

  async function downloadAudio(path: string, title: string) {
    const { data } = await supabase().storage.from("recordings").createSignedUrl(path, 3600);
    if (!data?.signedUrl) { alert("Audio not available — storage bucket missing?"); return; }
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w-]/g, "_")}.webm`;
    a.click(); URL.revokeObjectURL(a.href);
  }
  async function playAudio(path: string) {
    const { data } = await supabase().storage.from("recordings").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const inFolder = meetings.filter((m) => !folder || m.folder === folder);

  if (!loading && !allowed) return (
    <Shell title="Mid-day Records"><Empty text="Mid-day Records is available to Core Team, Manager, Team Lead, Process Coordinator and Admin dashboards." /></Shell>
  );

  return (
    <Shell title="Mid-day Records">
      <PageHead title="Mid-day Records" sub="Every team's mid-day meeting, recorded and transcribed in one place. Create a folder per team, then record into it." />
      <div className="card mb-4 flex flex-wrap items-end gap-2 p-4">
        <div><label className="label">Team folder</label>
          <select className="input min-w-[180px]" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">All folders</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select></div>
        <div><label className="label">New folder</label>
          <input className="input" placeholder="e.g. Telugu Editing Team" value={nf} onChange={(e) => setNf(e.target.value)} /></div>
        <button className="btn-ghost" onClick={() => { if (nf.trim()) { setFolders((f) => [...new Set([...f, nf.trim()])]); setFolder(nf.trim()); setNf(""); } }}>Create folder</button>
        <div className="ml-auto flex items-end gap-2">
          <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn-ghost" onClick={() => downloadCSV(`midday-${from}-${to}`, [["Date", "Folder", "Title", "Transcript"], ...inFolder.map((m) => [m.day, m.folder, m.title, m.transcript])])}>CSV</button>
        </div>
      </div>

      <Recorder table="midday_meetings" folder={folder || "General"} meetingType="midday" onSaved={load} />

      <h2 className="mb-2 mt-6 font-display font-semibold">{folder || "All"} recordings</h2>
      <div className="space-y-2">
        {inFolder.length === 0 && <Empty text="No recordings here yet. Pick a folder above and hit Start recording." />}
        {inFolder.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <b>{m.day}</b><span className="badge bg-brand-100 text-brand-700">{m.folder}</span><span>{m.title}</span>
            <span className="ml-auto flex gap-2">
              {m.audio_path && <button className="btn-ghost !py-1" onClick={() => playAudio(m.audio_path)}>▶ Play</button>}
              {m.audio_path && <button className="btn-ghost !py-1" onClick={() => downloadAudio(m.audio_path, m.title)}>⇩ Audio</button>}
              {m.transcript && <button className="btn-ghost !py-1" onClick={() => downloadText(`${m.title}.txt`, m.transcript)}>.txt</button>}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
