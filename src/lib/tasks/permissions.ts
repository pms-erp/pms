import { UserRoleType } from "@/db/schema";

export function canCreateTask(role: UserRoleType): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "TEAM_LEADER"
  );
}

export function canAssignTask(role: UserRoleType): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "TEAM_LEADER"
  );
}

export function canViewAllTasks(role: UserRoleType): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

export function canManageTasks(role: string): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "TEAM_LEADER"
  );
}

export function canDeleteTasks(role: string): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "TEAM_LEADER"
  );
}
