import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  const user = new URL(req.url).searchParams.get("user_id");
  if (!user) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { data } = await db.from("saved_filters").select("*").eq("user_id", user).order("created_at", { ascending: false });
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { user_id, name, filters, is_private = true } = body as any;
  if (!user_id || !name || !filters) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  const { data } = await db.from("saved_filters").insert({ user_id, name, filters: filters, is_private }).select().maybeSingle();
  return NextResponse.json({ row: data || null });
}

export async function DELETE(req: Request) {
  const urlObj = new URL(req.url);
  const id = urlObj.searchParams.get("id");
  const user = urlObj.searchParams.get("user_id");
  if (!id || !user) return NextResponse.json({ error: "id and user_id required" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  const db = createClient(url, key);

  await db.from("saved_filters").delete().eq("id", id).eq("user_id", user);
  return NextResponse.json({ ok: true });
}
