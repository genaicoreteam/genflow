import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side reporting endpoint: accepts filters and returns paginated tasks
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    profile_id,
    portfolio_ids = [],
    project_ids = [],
    sections = [],
    people = [],
    q = "",
    limit = 100,
    offset = 0,
  } = body as any;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  // Determine visibility based on hierarchy: match behaviour elsewhere in the app
  const { data: allPeople } = await db.from("profiles").select("*").order("full_name");
  const peopleList = (allPeople || []) as any[];
  const myReports = peopleList.filter((p) => p.reports_to === profile_id).map((p) => p.id);
  const fullRoles = ["core_team", "manager", "team_lead", "process_coordinator", "admin"];
  const meRow = peopleList.find((p) => p.id === profile_id);
  const hasFull = meRow && fullRoles.includes(meRow.role);
  let allowedIds: string[] | null = null;
  if (!hasFull) {
    allowedIds = myReports.length ? [...myReports, profile_id] : [profile_id];
  }

  // Build query
  let qBuilder = db.from("tasks").select(`*, projects(name, portfolio_id)`);

  if (allowedIds) qBuilder = qBuilder.in("assignee", allowedIds);
  if (project_ids && project_ids.length) qBuilder = qBuilder.in("project_id", project_ids);
  if (sections && sections.length) qBuilder = qBuilder.in("stage", sections);
  if (people && people.length) qBuilder = qBuilder.in("assignee", people);

  // If portfolio filter provided, translate to projects
  if (portfolio_ids && portfolio_ids.length) {
    const { data: pj } = await db.from("projects").select("id").in("portfolio_id", portfolio_ids);
    const pids = (pj || []).map((x: any) => x.id);
    if (pids.length) qBuilder = qBuilder.in("project_id", pids);
    else return NextResponse.json({ rows: [], total: 0 });
  }

  if (q && q.trim()) {
    const ql = q.trim();
    // Simple text search on title or code
    qBuilder = qBuilder.ilike("title", `%${ql}%`).or(`code.ilike.%${ql}%`);
  }

  // Count total
  const countRes = await qBuilder.range(0, 0).select("id", { count: "exact", head: true });
  const total = (countRes.count as number) || 0;

  const from = Number(offset) || 0;
  const to = Math.min(from + (Number(limit) || 100) - 1, from + 1000);
  const { data: rows } = await qBuilder.order("created_at", { ascending: false }).range(from, to);

  return NextResponse.json({ rows: rows || [], total });
}
