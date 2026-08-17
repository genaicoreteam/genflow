"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Role } from "./types";

/* Feature-access matrix. Built-in defaults below; rows in the
   feature_permissions table override them (edited in Admin → Permissions). */

export const FEATURES: { key: string; label: string; defaults: Role[] }[] = [
  { key: "automations", label: "Automations", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "recordus", label: "RecordUs", defaults: ["core_team", "manager", "team_lead", "process_coordinator"] },
  { key: "midday", label: "Mid-day Records", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "cumulative", label: "Cumulative Report", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "reporting", label: "Reporting", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "alerts_manage", label: "Send alerts manually", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "exports", label: "Team exports", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
  { key: "admin_area", label: "Admin area", defaults: ["core_team", "manager", "team_lead", "process_coordinator", "admin"] },
];

export interface PermRow { feature: string; role: string; allowed: boolean; }

let cache: PermRow[] | null = null;
export function useFeaturePerms() {
  const [rows, setRows] = useState<PermRow[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    supabase().from("feature_permissions").select("*").then(({ data }) => {
      cache = (data as PermRow[]) || [];
      setRows(cache);
    });
  }, []);
  return rows || [];
}
export function clearPermCache() { cache = null; }

export function featureAllowed(rows: PermRow[], feature: string, role?: Role | null): boolean {
  if (!role) return false;
  const overrides = rows.filter((r) => r.feature === feature);
  const f = FEATURES.find((x) => x.key === feature);
  const base = f ? f.defaults.includes(role) : true;
  const o = overrides.find((r) => r.role === role);
  return o ? o.allowed : base;
}
