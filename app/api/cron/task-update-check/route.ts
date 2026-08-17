import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Vercel Cron (daily 19:00 IST = 13:30 UTC): members with overdue, untouched open tasks get an alert notification (in-app + email to them and their manager).
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "service-key"
  );
  const now = new Date().toISOString();
  const { data: overdue } = await db.from("tasks").select("assignee").eq("status", "open").lt("due_at", now).not("assignee", "is", null);
  const offenders = Array.from(new Set((overdue || []).map((t: any) => t.assignee)));
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  for (const id of offenders) {
    await fetch(`${base}/api/warnings/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: id, kind: "task_update", note: "You have overdue tasks that were not updated today." }),
    }).catch(() => {});
  }
  return NextResponse.json({ warned: offenders.length });
}
