"use client";
import { supabase } from "./supabase";

/* Every request/approval/assignment/mention event notifies the person
   twice: an in-app notification (Inbox + bell) and an email. */

export function notifyEmail(to: string | string[], subject: string, html: string) {
  try {
    fetch("/api/notify/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    }).catch(() => {});
  } catch {}
}

export async function pushNotification(profileId: string, email: string | null | undefined, title: string, body: string, link?: string) {
  try {
    await supabase().from("notifications").insert({ profile_id: profileId, title, body, link: link || null });
  } catch {}
  if (email) notifyEmail(email, `GenFlow: ${title}`, `<p>${body}</p>${link ? `<p><a href="${link}">Open in GenFlow</a></p>` : ""}`);
}
