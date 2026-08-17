"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { downloadText } from "@/lib/csv";

/* Live meeting recorder: captures microphone audio (MediaRecorder) and transcribes
   live in the browser (Web Speech API, Chrome/Edge/Android). Saves the audio to
   Supabase Storage and the transcript to the given table. */

export default function Recorder({ table, folder, meetingType, onSaved }:
  { table: "recordus_meetings" | "midday_meetings"; folder?: string | null; meetingType?: string; onSaved?: () => void }) {
  const [recording, setRecording] = useState(false);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recogRef = useRef<any>(null);

  useEffect(() => () => { stopAll(); }, []);

  function stopAll() {
    try { mediaRef.current?.state !== "inactive" && mediaRef.current?.stop(); } catch {}
    try { recogRef.current?.stop(); } catch {}
  }

  async function start() {
    setStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.start(1000);
      mediaRef.current = mr;

      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true; rec.interimResults = true; rec.lang = "en-IN";
        rec.onresult = (ev: any) => {
          let fin = "", int = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) fin += r[0].transcript + " ";
            else int += r[0].transcript;
          }
          if (fin) setTranscript((t) => t + fin);
          setInterim(int);
        };
        rec.onend = () => { if (mediaRef.current?.state === "recording") { try { rec.start(); } catch {} } };
        rec.start();
        recogRef.current = rec;
      } else {
        setStatus("Live transcription needs Chrome/Edge — audio is still being recorded.");
      }
      setRecording(true);
    } catch {
      setStatus("Microphone permission was denied. Allow the mic and try again.");
    }
  }

  async function stopAndSave() {
    const mr = mediaRef.current;
    if (!mr) return;
    setStatus("Saving…");
    await new Promise<void>((res) => { mr.onstop = () => res(); mr.stop(); });
    try { recogRef.current?.stop(); } catch {}
    mr.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const day = new Date().toISOString().slice(0, 10);
    const name = `${day}/${Date.now()}-${(title || "meeting").replace(/[^\w-]/g, "_")}.webm`;
    let audio_path: string | null = null;
    let uploadErr = "";
    try {
      const { error } = await supabase().storage.from("recordings").upload(name, blob, { contentType: "audio/webm" });
      if (error) uploadErr = error.message; else audio_path = name;
    } catch (e: any) { uploadErr = e?.message || "upload failed"; }

    const { data: { user } } = await supabase().auth.getUser();
    await supabase().from(table).insert({
      title: title || `${meetingType || "Meeting"} — ${day}`,
      day, transcript: transcript.trim(), audio_path,
      folder: folder || null, meeting_type: meetingType || null,
      created_by: user?.id || null,
    });
    setStatus(audio_path
      ? "Saved — audio + transcript stored. Use the ⇩ buttons in the list below to download."
      : `Transcript saved, but the audio could not be stored (${uploadErr}). Create a private Storage bucket named "recordings" in Supabase and record again.`);
    setTitle(""); setTranscript(""); setInterim("");
    onSaved && onSaved();
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {!recording
          ? <button className="btn-primary" onClick={start}>● Start recording</button>
          : <button className="btn-danger" onClick={stopAndSave}>■ Stop & save</button>}
        {recording && <span className="badge animate-pulse bg-red-100 text-red-600">REC</span>}
        {transcript && <button className="btn-ghost" onClick={() => downloadText(`${title || "transcript"}.txt`, transcript)}>Download .txt</button>}
      </div>
      <div className="min-h-24 rounded-lg bg-slate-50 p-3 text-sm">
        {transcript || interim
          ? <>{transcript}<span className="text-brand-400">{interim}</span></>
          : <span className="text-slate-400">Live transcript appears here while you record…</span>}
      </div>
      {status && <p className="mt-2 text-xs text-brand-600">{status}</p>}
    </div>
  );
}
