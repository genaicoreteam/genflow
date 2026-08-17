"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { MemphisApproval } from "@/components/Memphis";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function Signup() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (name.length < 2) { setErr("Enter your full name."); return; }
    if (!EMAIL_RE.test(email)) { setErr("Enter a valid email address."); return; }
    if (!PASSWORD_RE.test(password)) { setErr("Password must be at least 8 characters and include a letter and a number."); return; }

    setBusy(true);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { data, error } = await supabase().auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: `${siteUrl}/dashboard` },
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    if (!data.user) { setBusy(false); setErr("Sign up failed. Please try again."); return; }
    if (data.user.identities && data.user.identities.length === 0) {
      // Supabase returns an obfuscated user (no identities) when the email is already registered.
      setBusy(false);
      setErr("An account with this email already exists. Please sign in instead.");
      return;
    }

    // Role comes from the email allow-list (role_assignments); default = member.
    const { data: ra } = await supabase().from("role_assignments").select("role").eq("email", email).maybeSingle();
    await supabase().from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: name,
      role: ra?.role || "member",
    });

    setBusy(false);
    router.replace("/dashboard");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-brand-50 p-4">
      <div className="card grid w-full max-w-3xl overflow-hidden sm:grid-cols-2">
        <div className="hidden bg-brand-100 p-6 sm:block"><MemphisApproval className="h-full w-full" /></div>
        <div className="p-8">
          <h1 className="text-xl font-bold">Create your account</h1>
          <p className="mb-4 text-sm text-slate-500">Just your name, email and a password.</p>
          <form onSubmit={submit}>
            <label className="label">Full name</label>
            <input className="input mb-3" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            <label className="label">Work email</label>
            <input className="input mb-3" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            <label className="label">Password</label>
            <input className="input mb-4" type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} required />
            {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
            <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
          </form>
          <p className="mt-4 text-sm text-brand-600">Already registered? <Link className="font-semibold underline" href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
