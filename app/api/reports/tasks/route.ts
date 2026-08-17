import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUser } from "@/lib/serverAuth";

// Server-side reporting endpoint: accepts filters and returns paginated tasks
export async function POST(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
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
  const myReports = peopleList.filter((p) => p.reports_to === user.id).map((p) => p.id);
  const fullRoles = ["core_team", "manager", "team_lead", "process_coordinator", "admin"];
  const meRow = peopleList.find((p) => p.id === user.id);
  const hasFull = meRow && fullRoles.includes(meRow.role);
  let allowedIds: string[] | null = null;
  if (!hasFull) {
    allowedIds = myReports.length ? [...myReports, user.id] : [user.id];
  }

  // If portfolio filter provided, translate to projects up front so both queries below share it
  let portfolioProjectIds: string[] | null = null;
  if (portfolio_ids && portfolio_ids.length) {
    const { data: pj } = await db.from("projects").select("id").in("portfolio_id", portfolio_ids);
    portfolioProjectIds = (pj || []).map((x: any) => x.id);
    if (portfolioProjectIds.length === 0) return NextResponse.json({ rows: [], total: 0 });
  }

  // Same filters applied to two independent builders — the count option must be set
  // on the initial select() call, so it can't share a builder with the data query.
  function applyFilters<T extends { in: any; ilike: any; or: any }>(qb: T): T {
    if (allowedIds) qb = qb.in("assignee", allowedIds);
    if (project_ids && project_ids.length) qb = qb.in("project_id", project_ids);
    if (sections && sections.length) qb = qb.in("stage", sections);
    if (people && people.length) qb = qb.in("assignee", people);
    if (portfolioProjectIds) qb = qb.in("project_id", portfolioProjectIds);
    if (q && q.trim()) {
      const ql = q.trim();
      qb = qb.ilike("title", `%${ql}%`).or(`code.ilike.%${ql}%`);
    }
    return qb;
  }

  // Count total (head: true means no rows come back, just the count)
  const countRes = await applyFilters(db.from("tasks").select("id", { count: "exact", head: true }));
  const total = (countRes.count as number) || 0;

  const from = Number(offset) || 0;
  const to = Math.min(from + (Number(limit) || 100) - 1, from + 1000);
  const dataQuery = applyFilters(db.from("tasks").select(`*, projects(name, portfolio_id)`));
  const { data: rows } = await dataQuery.order("created_at", { ascending: false }).range(from, to);

  return NextResponse.json({ rows: rows || [], total });
}
