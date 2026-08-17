"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { MemphisMic } from "@/components/Memphis";
import Recorder from "@/components/Recorder";
import { supabase } from "@/lib/supabase";
import { useFeaturePerms, featureAllowed } from "@/lib/permissions";
import { useProfile } from "@/lib/session";
import { Profile, displayName } from "@/lib/types";
import { downloadCSV, downloadDoc, downloadText } from "@/lib/csv";

/* RecordUs — visible only to Core Team, Manager, Team Lead, Process Coordinator.
   Records conference-room meetings with live transcription, and tracks daily
   attendance for Standups (10:00–10:15) and Learning Hours (6:30–7:00). */

export default function RecordUs() {
  const { profile, loading } = useProfile();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [att, setAtt] = useState<any[]>([]);
  const [attDay, setAttDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [attType, setAttType] = useState<"standup" | "learning_hour">("standup");
  const [checked, setChecked] = useState<string[]>([]);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const perms = useFeaturePerms();
  const allowed = profile && featureAllowed(perms, "recordus", profile.role);
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  async function load() {
    const db = supabase();
    const [{ data: m }, { data: pp }, { data: a }] = await Promise.all([
      db.from("recordus_meetings").select("*").gte("day", from).lte("day", to).order("day", { ascending: false }),
      db.from("profiles").select("*").order("full_name"),
      db.from("meeting_attendance").select("*").gte("day", from).lte("day", to),
    ]);
    setMeetings(m || []); setPeople((pp as Profile[]) || []); setAtt(a || []);
  }
  useEffect(() => { if (allowed) load(); }, [allowed, from, to]);

  useEffect(() => {
    const existing = att.filter((a) => a.day === attDay && a.meeting_type === attType).map((a) => a.profile_id);
    setChecked(existing);
  }, [attDay, attType, att]);

  async function saveAttendance() {
    const db = supabase();
    await db.from("meeting_attendance").delete().eq("day", attDay).eq("meeting_type", attType);
    if (checked.length)
      await db.from("meeting_attendance").insert(checked.map((pid) => ({ day: attDay, meeting_type: attType, profile_id: pid, marked_by: profile?.id })));
    load();
  }

  function exportAttendance(kind: "csv" | "doc") {
    const rows = att.map((a) => [a.day, a.meeting_type, displayName(byId[a.profile_id] || { email: a.profile_id, full_name: "" })]);
    if (kind === "csv") downloadCSV(`attendance-${from}-to-${to}`, [["Date", "Meeting", "Person"], ...rows]);
    else downloadDoc(`attendance-${from}-to-${to}`, "Meeting attendance",
      `<h2>Meeting attendance ${from} → ${to}</h2><table border="1" cellpadding="6"><tr><th>Date</th><th>Meeting</th><th>Person</th></tr>` +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("") + "</table>");
  }

  function exportTranscripts(kind: "csv" | "doc") {
    if (kind === "csv") downloadCSV(`transcripts-${from}-to-${to}`, [["Date", "Title", "Transcript"], ...meetings.map((m) => [m.day, m.title, m.transcript])]);
    else downloadDoc(`transcripts-${from}-to-${to}`, "Meeting transcripts",
      meetings.map((m) => `<h3>${m.day} — ${m.title}</h3><p>${(m.transcript || "").replace(/\n/g, "<br>")}</p>`).join("<hr>"));
  }

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

  if (!loading && !allowed) return (
    <Shell title="RecordUs"><Empty text="RecordUs is available to Core Team, Manager, Team Lead and Process Coordinator dashboards only." /></Shell>
  );

  return (
    <Shell title="RecordUs">
      <PageHead title="RecordUs" sub="Record conference-room meetings with a live transcript, keep audio by date, and mark daily Standup (10:00–10:15 AM) and Learning Hour (6:30–7:00 PM) attendance." art={<MemphisMic className="w-full" />} />
      <Recorder table="recordus_meetings" meetingType="conference" onSaved={load} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-display font-semibold">Daily meeting attendance</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input type="date" className="input max-w-[160px]" value={attDay} onChange={(e) => setAttDay(e.target.value)} />
            <select className="input max-w-[200px]" value={attType} onChange={(e) => setAttType(e.target.value as any)}>
              <option value="standup">Standup (10:00–10:15 AM)</option>
              <option value="learning_hour">Learning Hour (6:30–7:00 PM)</option>
            </select>
            <button className="btn-primary ml-auto" onClick={saveAttendance}>Save attendance</button>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-brand-50">
                <input type="checkbox" className="accent-brand-500" checked={checked.includes(p.id)}
                  onChange={(e) => setChecked((c) => e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id))} />
                {displayName(p)}
              </label>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-display font-semibold">Reports & exports</h2>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => exportAttendance("csv")}>Attendance CSV</button>
            <button className="btn-ghost" onClick={() => exportAttendance("doc")}>Attendance Doc</button>
            <button className="btn-ghost" onClick={() => exportTranscripts("csv")}>Transcripts CSV</button>
            <button className="btn-ghost" onClick={() => exportTranscripts("doc")}>Transcripts Doc</button>
          </div>
        </div>
      </div>

      <h2 className="mb-2 mt-6 font-display font-semibold">Recorded meetings ({from} → {to})</h2>
      <div className="space-y-2">
        {meetings.length === 0 && <Empty text="No recordings in this range yet." />}
        {meetings.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <b>{m.day}</b><span>{m.title}</span>
            <span className="ml-auto flex gap-2">
              {m.audio_path && <button className="btn-ghost !py-1" onClick={() => playAudio(m.audio_path)}>▶ Play</button>}
              {m.audio_path && <button className="btn-ghost !py-1" onClick={() => downloadAudio(m.audio_path, m.title)}>⇩ Audio</button>}
              {m.transcript && <button className="btn-ghost !py-1" onClick={() => downloadText(`${m.title}.txt`, m.transcript)}>Transcript .txt</button>}
            </span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
