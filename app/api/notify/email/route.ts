import { NextResponse } from "next/server";

// Transparent email notifications for every request/approval event (via Resend).
export async function POST(req: Request) {
  const { to, subject, html } = await req.json();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL || "GenFlow <onboarding@resend.dev>";
  if (!key) return NextResponse.json({ ok: true, demo: true }); // silently skip until configured
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  return NextResponse.json({ ok: r.ok });
}
