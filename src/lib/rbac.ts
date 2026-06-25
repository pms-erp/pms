// src/lib/rbac.ts
// role is now a plain string — supports dynamic team-based roles

type Permission =
  | "VIEW_DASHBOARD"
  | "VIEW_ANALYTICS"
  | "VIEW_PROJECTS"
  | "CREATE_PROJECT"
  | "EDIT_PROJECT"
  | "DELETE_PROJECT"
  | "VIEW_TEAM"
  | "MANAGE_TEAM"
  | "VIEW_TASKS"
  | "CREATE_TASK"
  | "EDIT_TASK"
  | "DELETE_TASK"
  | "VIEW_ASSIGNED_TASKS"
  | "VIEW_QA_TASKS"
  | "REVIEW_QA"
  | "VIEW_USERS"
  | "CREATE_USER"
  | "EDIT_USER"
  | "DELETE_USER"
  | "MANAGE_PROJECT_VIEWERS"
  | "VIEW_ATTENDANCE"
  | "EDIT_ATTENDANCE"
  | "VIEW_LEADS"
  | "VIEW_BILLING"
  | "VIEW_PORTFOLIO"
  | "CREATE_PORTFOLIO"
  | "EDIT_PORTFOLIO"
  | "DELETE_PORTFOLIO"
  | "ALL";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: ["ALL"],

  ATTENDANCE_MANAGER: ["VIEW_ATTENDANCE", "EDIT_ATTENDANCE"],

  PROJECT_MANAGER: [
    "VIEW_DASHBOARD",
    "VIEW_ANALYTICS",
    "VIEW_PROJECTS",
    "CREATE_PROJECT",
    "EDIT_PROJECT",
    "DELETE_PROJECT",
    "VIEW_TEAM",
    "MANAGE_TEAM",
    "VIEW_TASKS",
    "CREATE_TASK",
    "EDIT_TASK",
    "DELETE_TASK",
    "VIEW_USERS",
    "CREATE_USER",
    "EDIT_USER",
    "DELETE_USER",
    "MANAGE_PROJECT_VIEWERS",
    "VIEW_LEADS",
    "VIEW_PORTFOLIO",
    "CREATE_PORTFOLIO", // ✅ NEW — can add portfolio items
    "EDIT_PORTFOLIO", // ✅ NEW — can edit portfolio items + add to favorites
    "DELETE_PORTFOLIO", // ✅ NEW — can delete portfolio items
  ],
  TEAM_LEADER: [
    "VIEW_DASHBOARD",
    "VIEW_ANALYTICS",
    "VIEW_PROJECTS",
    "VIEW_TEAM",
    "MANAGE_TEAM",
    "VIEW_TASKS",
    "CREATE_TASK",
    "EDIT_TASK",
    "DELETE_TASK",
    "VIEW_ASSIGNED_TASKS",
    "MANAGE_PROJECT_VIEWERS",
  ],
  QA: [
    "VIEW_DASHBOARD",
    "VIEW_ANALYTICS",
    "VIEW_PROJECTS",
    "VIEW_TASKS",
    "VIEW_QA_TASKS",
    "REVIEW_QA",
  ],
};

const MEMBER_PERMISSIONS: Permission[] = [
  "VIEW_DASHBOARD",
  "VIEW_ANALYTICS",
  "VIEW_PROJECTS",
  "VIEW_TASKS",
  "VIEW_ASSIGNED_TASKS",
];

const MARKETING_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  "VIEW_LEADS",
];

// ── Marketing check helper ────────────────────────────────────────────────────
// Returns true if the role or team_type indicates a marketing context.
// Covers:
//   - Dynamic member roles like "DIGITAL_MARKETING", "MARKETING_SEO", etc.
//   - TEAM_LEADER whose team_type contains "MARKETING"
export function isMarketingContext(
  role: string,
  team_type?: string | null,
): boolean {
  if (role.toUpperCase().includes("MARKETING")) return true;
  if (team_type?.toUpperCase().includes("MARKETING")) return true;
  return false;
}

export function hasPermission(
  role: string,
  permission: string,
  team_type?: string | null,
): boolean {
  if (!role) return false;

  // ADMIN has all permissions
  if (role === "ADMIN") return true;

  // Marketing context (role name OR team_type) → marketing permission set
  if (isMarketingContext(role, team_type)) {
    return MARKETING_PERMISSIONS.includes(permission as Permission);
  }

  const perms: Permission[] = ROLE_PERMISSIONS[role] ?? MEMBER_PERMISSIONS;

  if (perms.includes("ALL")) return true;

  return perms.includes(permission as Permission);
}

// ── Project RBAC ──────────────────────────────────────────────────────────────

export type ProjectRBACResult =
  | { type: "ALL" }
  | { type: "CREATED"; userId: string }
  | { type: "ASSIGNED"; userId: string };

export function applyProjectRBAC(
  role: string,
  userId: string,
): ProjectRBACResult {
  if (role === "ADMIN" || role === "PROJECT_MANAGER") {
    return { type: "ALL" };
  }
  if (role === "TEAM_LEADER") {
    return { type: "CREATED", userId };
  }
  return { type: "ASSIGNED", userId };
}

// ── Viewer helpers ────────────────────────────────────────────────────────────

export function canManageProjectViewers(role: string): boolean {
  return hasPermission(role, "MANAGE_PROJECT_VIEWERS");
}

export function hasFullProjectAccess(role: string): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

// ── Attendance helpers ────────────────────────────────────────────────────────

export function canViewAttendance(role: string): boolean {
  return (
    role === "ADMIN" ||
    role === "ATTENDANCE_MANAGER" ||
    hasPermission(role, "VIEW_ATTENDANCE")
  );
}

export function canEditAttendance(role: string): boolean {
  return role === "ADMIN" || role === "ATTENDANCE_MANAGER";
}

// ── Leads helpers ─────────────────────────────────────────────────────────────

export function canViewLeads(role: string, team_type?: string | null): boolean {
  return hasPermission(role, "VIEW_LEADS", team_type);
}

export function canManageLeads(role: string): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

// ── Portfolio helpers ─────────────────────────────────────────────────────────

export function canViewPortfolio(role: string): boolean {
  return hasPermission(role, "VIEW_PORTFOLIO");
}

export function canCreatePortfolio(role: string): boolean {
  return hasPermission(role, "CREATE_PORTFOLIO");
}

export function canEditPortfolio(role: string): boolean {
  return hasPermission(role, "EDIT_PORTFOLIO");
}

export function canDeletePortfolio(role: string): boolean {
  return hasPermission(role, "DELETE_PORTFOLIO");
}
