// app/(dashboard)/team/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TeamCard } from "./team-card";
import { UnassignedUserCard } from "./unassigned-users-section";
import { CreateTeamDialog } from "./[teamType]/create-team-dialog";
import { UserCard } from "./user-card";
import { IconUsers } from "@tabler/icons-react";

export default async function TeamsPage() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/");
  const role = session.user.role;

  // Allow Admin, PM, and Team Leader to view this page
  if (
    role !== "ADMIN" &&
    role !== "PROJECT_MANAGER" &&
    role !== "TEAM_LEADER"
  ) {
    redirect("/");
  }

  // ✅ Determine if user can manage (Admin or PM)
  const canManage = role === "ADMIN" || role === "PROJECT_MANAGER";
  const isTeamLeader = role === "TEAM_LEADER";

  const allTeams = await db.select().from(teams).orderBy(teams.created_at);
  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.is_active, true));

  // ── Admin/PM: build team cards ────────────────────────────────────────────
  const allTeamCards = allTeams.map((team) => {
    const members = allUsers.filter((u) => u.team_type === team.slug);
    const leaderId = members.find((m) =>
      members.some((other) => other.team_leader_id === m.id),
    )?.id;
    return {
      team_type: team.slug,
      team_name: team.name,
      leader: members.find((m) => m.id === leaderId) ?? null,
      members: members.filter((m) => m.id !== leaderId),
      totalMembers: members.length,
    };
  });

  const unassignedUsers = canManage
    ? allUsers.filter(
        (u) =>
          !u.team_type &&
          u.role !== "ADMIN" &&
          u.role !== "PROJECT_MANAGER" &&
          u.role !== "TEAM_LEADER",
      )
    : [];

  // ── Team Leader: find own team members ────────────────────────────────────
  const leaderTeamType = session.user.team_type ?? null;
  const leaderTeam = leaderTeamType
    ? (allTeams.find((t) => t.slug === leaderTeamType) ?? null)
    : null;
  const myTeamMembersRaw = leaderTeamType
    ? allUsers.filter((u) => u.team_type === leaderTeamType)
    : [];

  // Sort: team leader always first, rest alphabetically
  const myTeamMembers = [...myTeamMembersRaw].sort((a, b) => {
    const aIsLeader = myTeamMembersRaw.some(
      (other) => other.team_leader_id === a.id,
    );
    const bIsLeader = myTeamMembersRaw.some(
      (other) => other.team_leader_id === b.id,
    );
    if (aIsLeader && !bIsLeader) return -1;
    if (!aIsLeader && bIsLeader) return 1;
    return a.name.localeCompare(b.name);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEAM LEADER VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (isTeamLeader) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
          <p className="text-muted-foreground mt-1">
            {leaderTeam ? leaderTeam.name : "Your team members"}
          </p>
        </div>

        {myTeamMembers.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed rounded-lg">
            <IconUsers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No team members found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted w-fit">
              <IconUsers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {myTeamMembers.length}{" "}
                {myTeamMembers.length === 1 ? "Member" : "Members"}
              </span>
            </div>

            {/* Member cards — centered avatar layout matching team detail page */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {myTeamMembers.map((member) => {
                const isLeaderMember = myTeamMembers.some(
                  (other) => other.team_leader_id === member.id,
                );
                return (
                  <UserCard
                    key={member.id}
                    user={{
                      id: member.id,
                      name: member.name,
                      username: member.username,
                      avatar: member.avatar,
                      role: member.role,
                      email: member.email,
                      is_active: member.is_active,
                    }}
                    isLeader={isLeaderMember}
                    teamType={member.team_type}
                    canManage={false} // Team Leaders cannot edit/remove others via this card
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN / PM VIEW
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground mt-1">
            Manage your teams and team members
          </p>
        </div>
        <CreateTeamDialog />
      </div>

      {allTeamCards.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {allTeamCards.map((team) => (
            <TeamCard
              key={team.team_type}
              team={team}
              canManage={canManage} // ✅ Pass canManage to TeamCard
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">
            No teams yet. Create your first team above.
          </p>
        </div>
      )}

      {unassignedUsers.length > 0 && (
        <div className="space-y-4 pt-6 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Unassigned Users</h2>
            <span className="px-3 py-1 bg-muted rounded-full text-sm font-medium">
              {unassignedUsers.length}{" "}
              {unassignedUsers.length === 1 ? "user" : "users"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Assign these users to a team
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {unassignedUsers.map((user) => (
              <UnassignedUserCard
                key={user.id}
                user={user}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}

      {unassignedUsers.length === 0 && allTeamCards.length > 0 && (
        <div className="pt-6 border-t">
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">
              All users are assigned to teams ✓
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
