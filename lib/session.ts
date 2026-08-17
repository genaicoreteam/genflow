"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Profile, Role, FULL_ACCESS } from "./types";

async function ensureProfileForUser(user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null }) {
  const db = supabase();

  const { data: existing } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing as Profile;

  const email = (user.email || "").toLowerCase();
  const { data: roleRow } = await db
    .from("role_assignments")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  const fallbackFullName = (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (email ? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

  const fallback = {
    id: user.id,
    email,
    full_name: fallbackFullName,
    role: (roleRow?.role as Role) || "member",
    reports_to: null,
  };

  const { data: inserted, error } = await db.from("profiles").upsert(fallback, { onConflict: "id" }).select().single();
  if (error) throw error;
  return inserted as Profile;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase().auth.getUser();
        if (user && mounted) {
          const data = await ensureProfileForUser(user);
          if (mounted) setProfile(data as Profile);
        } else if (mounted) {
          setProfile(null);
        }
      } catch {
        if (mounted) setProfile(null);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);
  return { profile, loading };
}

export function hasFullAccess(role?: Role | null) {
  return !!role && FULL_ACCESS.includes(role);
}

/** Current session's access token, for attaching Authorization headers to API routes. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token || null;
}
