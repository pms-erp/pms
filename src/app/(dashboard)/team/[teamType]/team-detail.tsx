"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  IconArrowLeft,
  IconDotsVertical,
  IconUserX,
  IconCrown,
  IconStar,
  IconAlertTriangle,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react";

interface TeamMember {
  id: string;
  name: string;
  username: string;
  role: string;
  avatar?: string | null;
}

interface Team {
  team_type: string;
  team_name?: string;
  leader: TeamMember | null;
  members: TeamMember[];
  total: number;
}

interface TeamOption {
  id: string;
  name: string;
  slug: string;
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

export function TeamDetail({
  team,
  teamType,
}: {
  team: Team;
  teamType: string;
}) {
  const router = useRouter();
  const allTeams = useTeams();
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState<string | false>(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showChangeTeamDialog, setShowChangeTeamDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newTeamType, setNewTeamType] = useState("");

  const handleAssignLeader = async (userId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/teams/${teamType}/leader`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leader_id: userId === "none" ? null : userId }),
      });
      if (!res.ok) throw new Error("Failed to assign leader");
      toast.success("Team leader updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveFromTeam = async () => {
    if (!selectedMember) return;
    setLoading(selectedMember.id);
    try {
      const res = await fetch(`/api/users/${selectedMember.id}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_type: null }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      toast.success(`${selectedMember.name} removed from team`);
      router.refresh();
      setShowRemoveDialog(false);
      setSelectedMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeTeam = async () => {
    if (!selectedMember || !newTeamType) return;
    setLoading(selectedMember.id);
    try {
      const res = await fetch(`/api/users/${selectedMember.id}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_type: newTeamType }),
      });
      if (!res.ok) throw new Error("Failed to change team");
      const teamName =
        allTeams.find((t) => t.slug === newTeamType)?.name ?? newTeamType;
      toast.success(`${selectedMember.name} moved to ${teamName}`);
      router.refresh();
      setShowChangeTeamDialog(false);
      setSelectedMember(null);
      setNewTeamType("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // All members sorted: leader first
  const allMembers: TeamMember[] = team.leader
    ? [team.leader, ...team.members.filter((m) => m.id !== team.leader!.id)]
    : team.members;

  const otherTeams = allTeams.filter((t) => t.slug !== teamType.toUpperCase());

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/team">
              <IconArrowLeft size={20} />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {team.team_name ?? `${teamType} Team`}
            </h1>
            <p className="text-muted-foreground mt-1">
              {team.total} {team.total === 1 ? "member" : "members"}
            </p>
          </div>
        </div>

        {/* Stats + assign leader bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted w-fit">
            <IconUsers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {team.total} {team.total === 1 ? "Member" : "Members"}
            </span>
          </div>

          {/* Assign leader dropdown */}
          <Select
            value={team.leader?.id || "none"}
            onValueChange={handleAssignLeader}
            disabled={assigning}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Assign team leader" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Leader</SelectItem>
              {allMembers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* All members grid — same centered card layout as team leader view */}
        {allMembers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allMembers.map((member) => {
              const isLeader = team.leader?.id === member.id;
              return (
                <Card
                  key={member.id}
                  className={`relative group hover:shadow-lg transition-all duration-200 ${isLeader ? "ring-2 ring-yellow-400/60" : ""}`}
                >
                  <CardContent className="p-6">
                    {/* Actions menu — hover only */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={!!loading && loading === member.id}
                        >
                          <IconDotsVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {isLeader ? (
                          <DropdownMenuItem
                            onClick={() => handleAssignLeader("none")}
                            disabled={assigning}
                            className="text-yellow-600 focus:text-yellow-600 focus:bg-yellow-50"
                          >
                            <IconStar size={14} className="mr-2" />
                            Remove as Leader
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleAssignLeader(member.id)}
                            disabled={assigning}
                          >
                            <IconCrown size={14} className="mr-2" />
                            Make Team Leader
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedMember({
                              id: member.id,
                              name: member.name,
                            });
                            setNewTeamType("");
                            setShowChangeTeamDialog(true);
                          }}
                          disabled={!!loading && loading === member.id}
                        >
                          <IconRefresh size={14} className="mr-2" />
                          Change Team
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedMember({
                              id: member.id,
                              name: member.name,
                            });
                            setShowRemoveDialog(true);
                          }}
                          disabled={!!loading && loading === member.id}
                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                        >
                          <IconUserX size={14} className="mr-2" />
                          Remove from Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Centered avatar */}
                    <div className="flex justify-center mb-4">
                      <div className="relative">
                        <Avatar
                          className={`h-24 w-24 ${isLeader ? "ring-2 ring-yellow-500 ring-offset-2" : ""}`}
                        >
                          <AvatarImage src={member.avatar ?? undefined} />
                          <AvatarFallback
                            className={`${ROLE_COLORS[member.role] ?? "bg-gray-500"} text-white text-2xl`}
                          >
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        {isLeader && (
                          <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-1">
                            <IconCrown size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Name + username + role */}
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-1.5">
                        <h3 className="font-semibold text-lg">{member.name}</h3>
                        {isLeader && (
                          <IconStar size={14} className="text-yellow-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{member.username}
                      </p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {isLeader
                          ? "Team Leader"
                          : member.role.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {/* Team name footer */}
                    <div className="mt-4 pt-4 border-t text-center">
                      <p className="text-xs text-muted-foreground">
                        {team.team_name ?? teamType}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">
              No members in this team yet.
            </p>
          </div>
        )}
      </div>

      {/* Remove Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Remove from Team</DialogTitle>
            </div>
            <DialogDescription>
              Remove{" "}
              <span className="font-semibold text-foreground">
                {selectedMember?.name}
              </span>{" "}
              from {team.team_name ?? teamType}? They will become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRemoveDialog(false);
                setSelectedMember(null);
              }}
              disabled={!!loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveFromTeam}
              disabled={!!loading}
            >
              {loading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Removing...
                </>
              ) : (
                <>
                  <IconUserX className="mr-2" size={16} />
                  Remove
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Team Dialog */}
      <Dialog
        open={showChangeTeamDialog}
        onOpenChange={setShowChangeTeamDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <IconRefresh className="h-5 w-5 text-blue-600" />
              </div>
              <DialogTitle>Change Team</DialogTitle>
            </div>
            <DialogDescription>
              Move{" "}
              <span className="font-semibold text-foreground">
                {selectedMember?.name}
              </span>{" "}
              to a different team.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={newTeamType}
              onValueChange={setNewTeamType}
              disabled={!!loading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    otherTeams.length ? "Select a team" : "No other teams"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {otherTeams.map((t) => (
                  <SelectItem key={t.id} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowChangeTeamDialog(false);
                setSelectedMember(null);
                setNewTeamType("");
              }}
              disabled={!!loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangeTeam}
              disabled={!!loading || !newTeamType}
            >
              {loading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Moving...
                </>
              ) : (
                <>
                  <IconRefresh className="mr-2" size={16} />
                  Move to Team
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
