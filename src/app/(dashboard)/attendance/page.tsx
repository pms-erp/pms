// app/(dashboard)/attendance/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AttendanceClient } from "./_components/attendance-client";

export default async function AttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { role } = session.user;

  // ── Access matrix ──────────────────────────────────────────────────────────
  // ADMIN              → see all staff + edit records
  // ATTENDANCE_MANAGER → see all staff + edit records  (hardcoded .env user)
  // TEAM_LEADER        → own + team (no edit)
  // PROJECT_MANAGER    → own only (no edit, no all staff)
  // Others             → own only
  // ──────────────────────────────────────────────────────────────────────────

  const canManage = role === "ADMIN" || role === "ATTENDANCE_MANAGER";

  const canSeeAll = role === "ADMIN" || role === "ATTENDANCE_MANAGER";

  const canSeeTeam = role === "TEAM_LEADER";

  return (
    <div>
      <AttendanceClient
        userId={session.user.id}
        userName={session.user.name ?? "User"}
        userRole={role}
        canManage={canManage}
        canSeeAll={canSeeAll}
        canSeeTeam={canSeeTeam}
      />
    </div>
  );
}
