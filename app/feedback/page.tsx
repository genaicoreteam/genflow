"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { PageHead, Empty } from "@/components/Ui";
import { supabase } from "@/lib/supabase";
import { useProfile, hasFullAccess } from "@/lib/session";
import { Profile } from "@/lib/types";
import { notifyEmail } from "@/lib/notify";

/* Feedback Box — anyone can write feedback or a complaint. It is visible only to the
   sender's reporting chain; Core Team, PC, Manager and Team Lead see everything. */

export default function Feedback() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const full = hasFullAccess(profile?.role);

  async function load() {
    const db = supabase();
    const [{ data: f }, { data: pp }] = await Promise.all([
      db.from("feedback").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("*"),
    ]);
    setRows(f || []); setPeople((pp as Profile[]) || []);
  }
  useEffect(() => { load(); }, []);

  const visible = rows.filter((r) => {
    if (!profile) return false;
    if (full) return true;
    if (r.sender === profile.id) return true;
    // visible to anyone the sender reports to (their upward chain)
    let cur = byId[r.sender];
    while (cur?.reports_to) {
      if (cur.reports_to === profile.id) return true;
      cur = byId[cur.reports_to];
    }
    return false;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !body.trim()) return;
    await supabase().from("feedback").insert({ sender: profile.id, body: body.trim() });
    const mgr = byId[profile.reports_to || ""];
    if (mgr?.email) notifyEmail(mgr.email, "GenFlow: new feedback in your box", `<p>${profile.full_name} left feedback. Open GenFlow → Feedback Box to read it.</p>`);
    setBody(""); setMsg("Thanks — your feedback is with the right people."); load();
  }

  return (
    <Shell title="Feedback Box">
      <PageHead title="Feedback Box" sub="Feedback, problems, complaints — anything. Only the people you report to (and senior roles) can read what you write." />
      <form onSubmit={submit} className="card mb-6 p-4">
        <label className="label">Your feedback or complaint</label>
        <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write freely — this goes only up your reporting line." />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-primary">Submit</button>
          {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        </div>
      </form>
      <h2 className="mb-2 font-display font-semibold">{full ? "All feedback" : "Feedback visible to you"}</h2>
      {visible.length === 0 ? <Empty text="Nothing here yet." /> : (
        <div className="space-y-2">
          {visible.map((r) => (
            <div key={r.id} className="card p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-brand-600">
                <b>{byId[r.sender]?.full_name || "Member"}</b>
                <span className="badge bg-brand-100 text-brand-700">{byId[r.sender]?.role}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {r.body}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
