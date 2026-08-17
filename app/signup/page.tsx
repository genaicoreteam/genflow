"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { MemphisApproval } from "@/components/Memphis";

export default function Signup() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const res = await fetch("/api/otp/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: form.phone }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(j.error || "Could not send OTP"); return; }
    setInfo(j.demo ? "MSG91 is not configured yet — demo code is 123456." : "OTP sent to your phone.");
    setStep(2);
  }

  async function verifyAndCreate(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const v = await fetch("/api/otp/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: form.phone, otp }),
    });
    const vj = await v.json();
    if (!v.ok || !vj.verified) { setBusy(false); setErr(vj.error || "Incorrect OTP"); return; }

    const { data, error } = await supabase().auth.signUp({ email: form.email, password: form.password });
    if (error || !data.user) { setBusy(false); setErr(error?.message || "Sign up failed"); return; }

    // Role comes from the email allow-list (role_assignments); default = member.
    const { data: ra } = await supabase().from("role_assignments").select("role").eq("email", form.email.toLowerCase()).maybeSingle();
    await supabase().from("profiles").upsert({
      id: data.user.id,
      email: form.email.toLowerCase(),
      full_name: form.name,
      phone: form.phone,
      phone_verified: true,
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
          <p className="mb-4 text-sm text-slate-500">Phone is verified by OTP for account security.</p>
          {step === 1 ? (
            <form onSubmit={sendOtp}>
              <label className="label">Full name</label>
              <input className="input mb-3" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              <label className="label">Work email</label>
              <input className="input mb-3" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              <label className="label">Password</label>
              <input className="input mb-3" type="password" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} required />
              <label className="label">Phone (with country code, e.g. 91XXXXXXXXXX)</label>
              <input className="input mb-4" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} required />
              {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
            </form>
          ) : (
            <form onSubmit={verifyAndCreate}>
              {info && <p className="mb-3 rounded-lg bg-brand-100 p-2 text-sm text-brand-700">{info}</p>}
              <label className="label">Enter OTP</label>
              <input className="input mb-4 text-center text-lg tracking-[0.5em]" value={otp} onChange={(e) => setOtp(e.target.value)} required />
              {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? "Verifying…" : "Verify & create account"}</button>
              <button type="button" className="btn-ghost mt-2 w-full justify-center" onClick={() => setStep(1)}>Back</button>
            </form>
          )}
          <p className="mt-4 text-sm text-brand-600">Already registered? <Link className="font-semibold underline" href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
