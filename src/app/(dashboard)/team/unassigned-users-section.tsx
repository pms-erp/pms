// app/(dashboard)/team/unassigned-users-section.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { IconBriefcase, IconCrown, IconUserPlus } from "@tabler/icons-react";

export interface UnassignedUser {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  avatar?: string | null;
  is_active: boolean;
}

type TeamOption = { id: string; name: string; slug: string };

function useTeams() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data: TeamOption[]) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  return teams;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-500",
  PROJECT_MANAGER: "bg-blue-500",
  TEAM_LEADER: "bg-purple-500",
  DEVELOPER: "bg-green-500",
  DESIGNER: "bg-pink-500",
  PROGRAMMER: "bg-indigo-500",
  QA: "bg-yellow-500",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface UnassignedUserCardProps {
  user: UnassignedUser;
  canManage: boolean; // ✅ Added this prop to fix the TypeScript error
}

export function UnassignedUserCard({
  user,
  canManage,
}: UnassignedUserCardProps) {
  const router = useRouter();
  const teams = useTeams();
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [makeLeader, setMakeLeader] = useState(false);

  const handleAssign = async () => {
    if (!selectedTeam) {
      toast.error("Please select a team");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_type: selectedTeam,
          is_leader: makeLeader,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error || "Failed to assign");
      }

      const teamName =
        teams.find((t) => t.slug === selectedTeam)?.name ?? selectedTeam;
      toast.success(
        `${user.name} assigned to ${teamName}${makeLeader ? " as Team Leader" : ""}`,
      );
      router.refresh();
      setSelectedTeam("");
      setMakeLeader(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign user");
    } finally {
      setLoading(false);
    }
  };

  const roleColor = ROLE_COLORS[user.role] ?? "bg-gray-500";

  // If user cannot manage, show read-only view
  if (!canManage) {
    return (
      <Card className="hover:shadow-md transition-shadow opacity-75">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatar ?? undefined} />
              <AvatarFallback className={`${roleColor} text-white text-sm`}>
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                @{user.username}
              </p>
            </div>
          </div>

          <Badge className={`${roleColor} w-fit`}>{user.role}</Badge>

          <Separator />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconBriefcase size={16} />
            <span>Not assigned to any team</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Manager view with assign controls
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar ?? undefined} />
            <AvatarFallback className={`${roleColor} text-white text-sm`}>
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              @{user.username}
            </p>
          </div>
        </div>

        <Badge className={`${roleColor} w-fit`}>{user.role}</Badge>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconBriefcase size={16} />
            <span>No team assigned</span>
          </div>

          <Select
            value={selectedTeam}
            onValueChange={setSelectedTeam}
            disabled={loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={teams.length ? "Select a team" : "Loading teams…"}
              />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.slug}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTeam && (
            <div className="flex items-center space-x-2 p-2 bg-muted/50 rounded-lg">
              <Switch
                id={`leader-${user.id}`}
                checked={makeLeader}
                onCheckedChange={setMakeLeader}
                disabled={loading}
              />
              <Label
                htmlFor={`leader-${user.id}`}
                className="text-sm font-medium cursor-pointer flex items-center gap-1"
              >
                <IconCrown size={14} className="text-yellow-500" />
                Make Team Leader
              </Label>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleAssign}
          disabled={loading || !selectedTeam}
          className="w-full"
          size="sm"
        >
          <IconUserPlus size={16} className="mr-2" />
          {loading ? "Assigning..." : "Assign to Team"}
        </Button>
      </CardFooter>
    </Card>
  );
}
