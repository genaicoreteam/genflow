import { createClient } from "@supabase/supabase-js";

/** Verifies the bearer token on an API request against Supabase Auth.
    Returns the authenticated user's id, or null if the token is missing/invalid. */
export async function verifyUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const db = createClient(url, key);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
