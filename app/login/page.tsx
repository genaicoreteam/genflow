"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { MemphisTeam } from "@/components/Memphis";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    else router.replace("/dashboard");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-brand-50 p-4">
      <div className="card grid w-full max-w-3xl overflow-hidden sm:grid-cols-2">
        <div className="hidden bg-brand-100 p-6 sm:block">
          <MemphisTeam className="h-full w-full" />
        </div>
        <form onSubmit={submit} className="p-8">
          <div className="mb-6">
            <div className="font-display text-lg font-bold">GenFlow</div>
            <div className="text-xs text-brand-600">GenAi Social Media Team</div>
          </div>
          <h1 className="text-xl font-bold">Sign in</h1>
          <p className="mb-4 text-sm text-brand-600">Your role decides your dashboard.</p>
          <label className="label">Work email</label>
          <input className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label">Password</label>
          <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="mt-4 text-sm text-brand-600">New here? <Link className="font-semibold text-brand-600 underline" href="/signup">Create an account</Link></p>
        </form>
      </div>
    </div>
  );
}
