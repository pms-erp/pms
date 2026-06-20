// lib/projects/permissions.ts

export function applyProjectRBAC(
  role: string,
  userId: string,
): {
  type: "ALL" | "CREATED" | "ASSIGNED";
} {
  if (role === "ADMIN") {
    return { type: "ALL" };
  }

  if (role === "PROJECT_MANAGER") {
    return { type: "CREATED" };
  }

  return { type: "ASSIGNED" };
}

// lib/projects/permissions.ts

export function canCreateProject(role: string): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}
