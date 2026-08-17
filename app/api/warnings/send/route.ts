import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/types";

/* Sends an alert notification (change #9 — no WhatsApp):
   - records the warning with its monthly level,
   - in-app notification + email to the person AND their manager,
   - at 3+ alerts this month, escalates to the Team Lead and Manager
     and marks the person Inefficient. */
export async function POST(req: Request) {
  const { profile_id, kind = "manual", note = "" } = await req.json();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  const { data: person } = await db.from("profiles").select("*").eq("id", profile_id).maybeSingle();
  if (!person) return NextResponse.json({ error: "profile not found" }, { status: 404 });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count } = await db.from("warnings").select("*", { count: "exact", head: true })
    .eq("profile_id", profile_id).gte("created_at", monthStart);
  const level = (count || 0) + 1;

  await db.from("warnings").insert({ profile_id, kind, level, note, sent_via: "in-app+email" });

  const { data: manager } = person.reports_to
    ? await db.from("profiles").select("*").eq("id", person.reports_to).maybeSingle()
    : { data: null as any };

  const title = level >= 3 ? `Final alert #${level} — marked Inefficient this month` : `Alert #${level} this month`;
  const body = note || "Work is overdue — please update your tasks.";
  const inserts = [{ profile_id, title, body, link: "/warnings" }];
  if (manager) inserts.push({ profile_id: manager.id, title: `${displayName(person)}: ${title}`, body, link: "/warnings" });

  if (level >= 3) {
    const { data: seniors } = await db.from("profiles").select("*").in("role", ["team_lead", "manager"]);
    for (const s of seniors || []) {
      if (s.id !== manager?.id && s.id !== profile_id)
        inserts.push({ profile_id: s.id, title: `Escalation: ${displayName(person)} is Inefficient (${level} alerts)`, body, link: "/warnings" });
    }
  }
  await db.from("notifications").insert(inserts);

  // Email everyone notified (Resend)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const ids = inserts.map((i) => i.profile_id);
    const { data: profs } = await db.from("profiles").select("email").in("id", ids);
    const emails = (profs || []).map((p: any) => p.email).filter(Boolean);
    if (emails.length) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "GenFlow <onboarding@resend.dev>",
          to: emails, subject: `GenFlow alert: ${displayName(person)} — ${title}`,
          html: `<p><b>${displayName(person)}</b>: ${title}</p><p>${body}</p><p>Open GenFlow → Alert Notifications.</p>`,
        }),
      }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, level });
}
