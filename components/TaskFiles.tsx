"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/session";
import { TaskFile } from "@/lib/types";

/* Task-level attachments — same "recordings" storage bucket used by Project > Files,
   scoped to a task instead of a whole project. */
export default function TaskFiles({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const { profile } = useProfile();
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [status, setStatus] = useState("");

  async function load() {
    const { data } = await supabase().from("task_files").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
    setFiles((data as TaskFile[]) || []);
  }
  useEffect(() => { load(); }, [taskId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("Uploading…");
    const path = `task-files/${taskId}/${Date.now()}-${f.name}`;
    const { error } = await supabase().storage.from("recordings").upload(path, f);
    if (error) { setStatus("Upload failed — is the 'recordings' storage bucket created?"); return; }
    await supabase().from("task_files").insert({ task_id: taskId, name: f.name, path, uploaded_by: profile?.id });
    setStatus(""); load();
  }
  async function open(path: string) {
    const { data } = await supabase().storage.from("recordings").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  async function remove(f: TaskFile) {
    if (!confirm(`Delete "${f.name}"?`)) return;
    await supabase().from("task_files").delete().eq("id", f.id);
    load();
  }

  return (
    <div className="mt-3">
      <label className="label">Attachments</label>
      <div className="space-y-1">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1 text-sm">
            <span className="flex-1 truncate">📎 {f.name}</span>
            <button className="text-brand-500 hover:text-brand-700" onClick={() => open(f.path)}>Open</button>
            {canEdit && <button className="text-slate-400 hover:text-red-600" onClick={() => remove(f)}>✕</button>}
          </div>
        ))}
        {files.length === 0 && <div className="text-xs text-slate-400">No attachments yet.</div>}
      </div>
      {canEdit && (
        <label className="btn-ghost mt-1 inline-block cursor-pointer !py-1 text-xs">
          + Upload file<input type="file" className="hidden" onChange={upload} />
        </label>
      )}
      {status && <span className="ml-2 text-xs text-slate-500">{status}</span>}
    </div>
  );
}
