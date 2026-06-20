// app/(dashboard)/team/team-section.tsx
"use client";

import { UserCard, TeamUser } from "./user-card";

export type TeamMember = TeamUser;

interface TeamSectionProps {
  team: {
    team_type: string;
    leader: TeamMember | null;
    members: TeamMember[];
    totalMembers: number;
  };
  canManage: boolean; // ✅ Changed from isAdmin to canManage
}

// Utility to supply fallback role in case backend drops role field
function withDefaultRole<T extends Partial<TeamMember>>(
  member: T,
  fallbackRole = "DEVELOPER",
) {
  return {
    ...member,
    role: member.role ?? fallbackRole,
  } as TeamMember;
}

export function TeamSection({ team, canManage }: TeamSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold capitalize">
            {team.team_type.toLowerCase()} Team
          </h2>
          <span className="px-3 py-1 bg-muted rounded-full text-sm font-medium">
            {team.totalMembers} {team.totalMembers === 1 ? "member" : "members"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Team Leader Card - Show first if exists */}
        {team.leader && (
          <UserCard
            user={withDefaultRole(team.leader, "TEAM_LEADER")}
            isLeader={true}
            teamType={team.team_type}
            canManage={canManage} // ✅ Pass canManage
          />
        )}

        {/* Team Members */}
        {team.members.map((member) => (
          <UserCard
            key={member.id}
            user={withDefaultRole(member)}
            isLeader={false}
            teamType={team.team_type}
            canManage={canManage} // ✅ Pass canManage
          />
        ))}

        {/* Empty state */}
        {team.totalMembers === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">No members in this team yet</p>
          </div>
        )}
      </div>
    </section>
  );
}
