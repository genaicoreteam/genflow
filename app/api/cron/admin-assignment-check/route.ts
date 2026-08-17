import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Vercel Cron (daily 18:45 IST = 13:15 UTC): admins who did not assign any task today for tomorrow get warned.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "service-key"
  );
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  for (const a of admins || []) {
    const { count } = await db.from("tasks").select("*", { count: "exact", head: true })
      .eq("created_by", a.id).gte("created_at", start.toISOString());
    if (!count) {
      await fetch(`${base}/api/warnings/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: a.id, kind: "admin_assignment", note: "No tasks were assigned today before 6:45 PM for tomorrow." }),
      }).catch(() => {});
    }
  }
  return NextResponse.json({ checked: (admins || []).length });
}
