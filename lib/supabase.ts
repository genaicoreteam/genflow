"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key";

let _client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!_client) _client = createClient(url, key);
  return _client;
}

export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const attUrl = process.env.NEXT_PUBLIC_ATTENDANCE_SUPABASE_URL;
const attKey = process.env.NEXT_PUBLIC_ATTENDANCE_SUPABASE_ANON_KEY;
let _att: SupabaseClient | null = null;
export function attendanceDb(): SupabaseClient {
  if (attUrl && attKey) {
    if (!_att) _att = createClient(attUrl, attKey);
    return _att;
  }
  return supabase();
}
