import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUser } from "@/lib/serverAuth";

export async function GET(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  const { data } = await db.from("saved_filters").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, filters, is_private = true } = body as any;
  if (!name || !filters) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  const { data } = await db.from("saved_filters").insert({ user_id: user.id, name, filters, is_private }).select().maybeSingle();
  return NextResponse.json({ row: data || null });
}

export async function DELETE(req: Request) {
  const user = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const urlObj = new URL(req.url);
  const id = urlObj.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  await db.from("saved_filters").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
