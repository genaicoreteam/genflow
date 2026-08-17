"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { Profile, displayName } from "@/lib/types";
import { pushNotification } from "@/lib/notify";

/* Task-level comments, threaded by task code, with @mention notifications. */
export default function TaskComments({ taskCode, people, projectId }: { taskCode: string; people: Profile[]; projectId: string }) {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await supabase().from("discussions").select("*, profiles(full_name)").eq("task_code", taskCode).order("created_at");
    setRows(data || []);
  }
  useEffect(() => { load(); }, [taskCode]);

  const word = msg.split(/\s/).pop() || "";
  const picking = word.startsWith("@") && !word.includes("]");
  const matches = picking ? people.filter((p) => displayName(p).toLowerCase().includes(word.slice(1).toLowerCase())).slice(0, 6) : [];

  function pick(p: Profile) {
    const parts = msg.split(/\s/); parts.pop();
    setMsg([...parts, `@[${displayName(p)}]`].join(" ") + " ");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || !profile) return;
    await supabase().from("discussions").insert({ project_id: projectId, author: profile.id, body: msg.trim(), task_code: taskCode });
    const mentioned = Array.from(msg.matchAll(/@\[([^\]]+)\]/g)).map((m) => m[1]);
    for (const name of mentioned) {
      const p = people.find((x) => displayName(x) === name);
      if (p && p.id !== profile.id)
        await pushNotification(p.id, p.email, `${displayName(profile)} mentioned you`, `In project discussion: "${msg.trim().slice(0, 140)}"`, `/project/${projectId}`);
    }
    setMsg(""); load();
  }

  const render = (body: string) => {
    const parts = body.split(/(@\[[^\]]+\])/g);
    return parts.map((p, i) => p.startsWith("@[")
      ? <span key={i} className="badge bg-brand-100 text-brand-700">@{p.slice(2, -1)}</span>
      : <span key={i}>{p}</span>);
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
      <div className="max-h-40 overflow-y-auto space-y-2 mb-2">
        {rows.length === 0 && <div className="text-slate-500">No comments yet — mention people with @ to notify them.</div>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-2">
            <div className="flex items-center gap-2 text-xs text-slate-500"><b className="text-brand-ink">{displayName(r.profiles || { email: "", full_name: "" })}</b><span>{new Date(r.created_at).toLocaleString()}</span></div>
            <div className="mt-1 text-sm">{render(r.body)}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="relative flex gap-2">
        {picking && matches.length > 0 && (
          <div className="absolute bottom-12 left-0 z-20 w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
            {matches.map((p) => (
              <button type="button" key={p.id} onClick={() => pick(p)} className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50">@{displayName(p)}</button>
            ))}
          </div>
        )}
        <input className="input" placeholder="Write a comment… @mention people" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="btn-primary">Post</button>
      </form>
    </div>
  );
}
