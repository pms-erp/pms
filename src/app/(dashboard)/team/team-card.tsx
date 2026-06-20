"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  IconUsers,
  IconUserStar,
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconAlertTriangle,
} from "@tabler/icons-react";

interface TeamMember {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
}

interface TeamCardProps {
  team: {
    team_type: string; // slug e.g. "DEVELOPER"
    team_name: string; // display name e.g. "Developer Team"
    leader: TeamMember | null;
    members: TeamMember[];
    totalMembers: number;
  };
  canManage: boolean; // ✅ Added this prop to fix the TypeScript error
}

const TEAM_COLORS: Record<string, string> = {
  DEVELOPER: "bg-blue-100 text-blue-700 border-blue-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-orange-100 text-orange-700 border-orange-200",
  QA: "bg-purple-100 text-purple-700 border-purple-200",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TeamCard({ team, canManage }: TeamCardProps) {
  const router = useRouter();

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(team.team_name);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete state
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const badgeClass =
    TEAM_COLORS[team.team_type] ?? "bg-gray-100 text-gray-700 border-gray-200";

  const displayMembers = team.members.slice(0, 3);
  const remainingCount = team.members.length - 3;

  // ── Edit ──────────────────────────────────────────────────────────────────
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");

    if (editName.trim().length < 2) {
      setEditError("Name must be at least 2 characters");
      return;
    }

    setEditLoading(true);
    try {
      const res = await fetch(`/api/teams/${team.team_type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update team");
      }

      toast.success("Team renamed successfully");
      setShowEdit(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setEditError(msg);
      toast.error(msg);
    } finally {
      setEditLoading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/teams/${team.team_type}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete team");
      }

      toast.success(`"${team.team_name}" deleted`);
      setShowDelete(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow duration-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              {team.team_name}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={badgeClass}>
                {team.totalMembers}{" "}
                {team.totalMembers === 1 ? "Member" : "Members"}
              </Badge>

              {/* ✅ Only show actions menu if canManage is true */}
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <IconDotsVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditName(team.team_name);
                        setEditError("");
                        setShowEdit(true);
                      }}
                    >
                      <IconPencil size={15} className="mr-2" />
                      Rename Team
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDelete(true)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <IconTrash size={15} className="mr-2" />
                      Delete Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Leader */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconUserStar size={16} className="text-yellow-500" />
              <span>Team Leader</span>
            </div>
            {team.leader ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar>
                  <AvatarImage src={team.leader.avatar ?? undefined} />
                  <AvatarFallback className="bg-blue-600 text-white text-sm">
                    {getInitials(team.leader.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {team.leader.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    @{team.leader.username}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/25">
                <p className="text-sm text-muted-foreground text-center">
                  No leader assigned
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Members */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconUsers size={16} />
              <span>Members</span>
            </div>
            {team.members.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {displayMembers.map((member) => (
                  <Avatar
                    key={member.id}
                    className="h-9 w-9 border-2 border-background shadow-sm"
                    title={member.name}
                  >
                    <AvatarImage src={member.avatar ?? undefined} />
                    <AvatarFallback className="bg-blue-600 text-white text-xs">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {remainingCount > 0 && (
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center border-2 border-background shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      +{remainingCount}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No members yet</p>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button className="w-full" variant="outline" asChild>
            <Link href={`/team/${team.team_type.toLowerCase()}`}>
              View Team
            </Link>
          </Button>
        </CardFooter>
      </Card>

      {/* ✅ Only render Edit Dialog if canManage is true */}
      {canManage && (
        <Dialog
          open={showEdit}
          onOpenChange={(v) => {
            setShowEdit(v);
            if (!v) setEditError("");
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Team</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError("");
                  }}
                  placeholder="e.g. Frontend"
                  autoFocus
                />
                {editName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Internal key stays:{" "}
                    <span className="font-mono font-medium">
                      {team.team_type}
                    </span>
                  </p>
                )}
              </div>
              {editError && (
                <p className="text-sm text-destructive">{editError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEdit(false)}
                  disabled={editLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editLoading || !editName.trim()}
                >
                  {editLoading ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ✅ Only render Delete Dialog if canManage is true */}
      {canManage && (
        <Dialog open={showDelete} onOpenChange={setShowDelete}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <IconAlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <DialogTitle>Delete Team</DialogTitle>
              </div>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  {team.team_name}
                </span>
                ?{" "}
                {team.totalMembers > 0 && (
                  <span className="text-destructive font-medium">
                    {team.totalMembers} member{team.totalMembers > 1 ? "s" : ""}{" "}
                    will become unassigned.{" "}
                  </span>
                )}
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setShowDelete(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <IconTrash size={15} className="mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
