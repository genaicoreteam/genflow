export type Role = "core_team" | "manager" | "team_lead" | "process_coordinator" | "admin" | "member";

export const ROLE_LABELS: Record<Role, string> = {
  core_team: "Core Team",
  manager: "Manager",
  team_lead: "Team Lead",
  process_coordinator: "Process Coordinator",
  admin: "Admin",
  member: "Member",
};
export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export const FULL_ACCESS: Role[] = ["core_team", "manager", "team_lead", "process_coordinator"];

export interface Profile {
  id: string; email: string; full_name: string; phone: string;
  phone_verified: boolean; role: Role; reports_to: string | null; created_at?: string;
}

export interface Portfolio { id: string; name: string; color: string; sort: number; }
export interface Project { id: string; portfolio_id: string; name: string; prefix: string; color: string; sort: number; }
export interface StageRow { id: string; project_id: string; name: string; color: string; sort: number; }

// Fallback pipeline used before a project's stages load
export const DEFAULT_STAGES = [
  { name: "scripting", color: "#D97706" },
  { name: "thumbnail", color: "#059669" },
  { name: "editing", color: "#7C3AED" },
  { name: "posting", color: "#DB2777" },
];
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface Task {
  id: string; project_id: string; code: string; title: string; stage: string;
  status: "open" | "completed"; due_at: string | null; assignee: string | null;
  origin_task: string | null; content_type: string | null; completed_at: string | null; created_at?: string;
}

export interface AutomationRule {
  id: string; project_id: string | null; from_stage: string; to_stage: string;
  new_assignee: string | null; due_offset_hours: number; active: boolean;
}

export type LogicTrigger = "task_created" | "task_completed" | "moved_to_stage" | "task_overdue" | "assignee_changed" | "task_unassigned";
export interface LogicAction { type: "assign" | "move" | "shift_due" | "set_content" | "notify" | "prefix" | "followup"; value?: string; extra?: string; }
export interface LogicRule {
  id: string; project_id: string | null; trigger: LogicTrigger; trigger_stage: string | null;
  actions: LogicAction[]; active: boolean;
}
export const TRIGGER_LABELS: Record<LogicTrigger, string> = {
  task_created: "Task is created",
  task_completed: "Task is completed",
  moved_to_stage: "Task moves to stage…",
  task_overdue: "Task becomes overdue (daily check)",
  assignee_changed: "Assignee is changed",
  task_unassigned: "Task is unassigned",
};

export type PermKind = "early_leave" | "late_coming";
export interface TimePermission {
  id: string; requester: string; kind: PermKind; for_date: string; at_time: string;
  reason: string; status: "open" | "approved" | "rejected";
  flag_late: boolean; flag_over_limit: boolean;
  decided_by: string | null; lead_decided_by: string | null; created_at: string;
}

export interface LeaveRequest {
  id: string; requester: string; from_date: string; to_date: string; reason: string;
  proof_url: string | null; leave_type: "full" | "half"; half_which: "first" | "second" | null;
  admin_status: "open" | "approved" | "rejected";
  team_lead_status: "open" | "approved" | "rejected";
  created_at: string;
}

export interface Warning {
  id: string; profile_id: string; kind: "task_update" | "admin_assignment" | "manual";
  level: number; note: string; sent_via: string; created_at: string;
}

export interface Notification {
  id: string; profile_id: string; title: string; body: string; link: string | null;
  read: boolean; created_at: string;
}

export interface ApprovalRoute {
  request_type: string; mode: "reports_to" | "role" | "person";
  role_target: string | null; person_target: string | null;
}

/** Resolve who approves a request according to the configurable route. */
export function resolveApprover(route: ApprovalRoute | undefined, requester: Profile, people: Profile[]): Profile | null {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  if (!route || route.mode === "reports_to") return requester.reports_to ? byId[requester.reports_to] || null : null;
  if (route.mode === "role") return people.find((p) => p.role === route.role_target) || null;
  if (route.mode === "person") return route.person_target ? byId[route.person_target] || null : null;
  return null;
}
