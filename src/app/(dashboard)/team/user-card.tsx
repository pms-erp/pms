// components/user-card.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  IconDotsVertical,
  IconStar,
  IconCrown,
  IconUserX,
  IconAlertTriangle,
  IconPencil,
  IconUserOff,
} from "@tabler/icons-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamOption = { id: string; name: string; slug: string };

export interface TeamUser {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  avatar?: string | null;
  role: string;
  is_active: boolean;
}

interface UserCardProps {
  user: TeamUser;
  isLeader: boolean;
  teamType: string | null;
  canManage: boolean; // ✅ Changed from isAdmin to canManage
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700 border-red-200",
  PROJECT_MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  TEAM_LEADER: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DEVELOPER: "bg-green-100 text-green-700 border-green-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  QA: "bg-purple-100 text-purple-700 border-purple-200",
};

const AVATAR_COLORS: Record<string, string> = {
  ADMIN: "bg-red-600",
  PROJECT_MANAGER: "bg-blue-600",
  TEAM_LEADER: "bg-yellow-500",
  DEVELOPER: "bg-green-600",
  DESIGNER: "bg-pink-600",
  PROGRAMMER: "bg-indigo-600",
  QA: "bg-purple-600",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UserCard({
  user,
  isLeader,
  teamType,
  canManage,
}: UserCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);

  useEffect(() => {
    if (canManage) {
      fetch("/api/teams")
        .then((r) => r.json())
        .then((data) => setTeamOptions(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [canManage]);

  const handleAssignLeader = async () => {
    if (!teamType) {
      toast.error("User must be in a team first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamType}/leader`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leader_id: user.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(`${user.name} is now the team leader`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to assign leader",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLeader = async () => {
    if (!teamType) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamType}/leader`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leader_id: null }),
      });
      if (!res.ok) throw new Error("Failed to remove leader");
      toast.success("Team leader removed");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove leader",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangeTeam = async (newTeamType: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_type: newTeamType === "none" ? null : newTeamType,
        }),
      });
      if (!res.ok) throw new Error("Failed to change team");
      const teamName =
        teamOptions.find((t) => t.slug === newTeamType)?.name ?? newTeamType;
      toast.success(
        newTeamType === "none"
          ? "User removed from team"
          : `Moved to ${teamName}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change team");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/team`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_type: null }),
      });
      if (!res.ok) throw new Error("Failed to remove from team");
      toast.success(`${user.name} removed from team`);
      router.refresh();
      setShowRemoveDialog(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove from team",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success(user.is_active ? "User deactivated" : "User activated");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = isLeader ? "Team Leader" : user.role;
  const avatarClass =
    AVATAR_COLORS[isLeader ? "TEAM_LEADER" : user.role] ?? "bg-gray-500";
  const teamDisplayName =
    teamOptions.find((t) => t.slug === teamType)?.name ?? teamType ?? "No team";

  return (
    <>
      <Card
        className={`relative group hover:shadow-lg transition-all duration-200 ${isLeader ? "ring-2 ring-yellow-400/60" : ""}`}
      >
        {/* Actions menu — visible if canManage (Admin OR PM) */}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                disabled={loading}
              >
                <IconDotsVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Edit User Button */}
              <DropdownMenuItem
                onClick={() => setShowEditDialog(true)}
                disabled={loading}
              >
                <IconPencil size={14} className="mr-2" />
                Edit Details
              </DropdownMenuItem>

              {/* Deactivate/Activate Button */}
              <DropdownMenuItem
                onClick={handleToggleStatus}
                disabled={loading}
                className={
                  user.is_active
                    ? "text-orange-600 focus:text-orange-600"
                    : "text-green-600"
                }
              >
                <IconUserOff size={14} className="mr-2" />
                {user.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Team Management (Only if user is in a team) */}
              {teamType && (
                <>
                  {isLeader ? (
                    <DropdownMenuItem
                      onClick={handleRemoveLeader}
                      disabled={loading}
                      className="text-yellow-600 focus:text-yellow-600 focus:bg-yellow-50"
                    >
                      <IconStar size={14} className="mr-2" />
                      Remove as Leader
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={handleAssignLeader}
                      disabled={loading}
                    >
                      <IconCrown size={14} className="mr-2" />
                      Make Team Leader
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Remove from Team */}
              <DropdownMenuItem
                onClick={() => setShowRemoveDialog(true)}
                disabled={loading}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <IconUserX size={14} className="mr-2" />
                Remove from Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <CardContent className="p-6">
          {/* Centered big avatar */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Avatar
                className={`h-24 w-24 ${isLeader ? "ring-2 ring-yellow-500 ring-offset-2" : ""}`}
              >
                <AvatarImage src={user.avatar ?? undefined} />
                <AvatarFallback
                  className={`${avatarClass} text-white text-2xl`}
                >
                  {getInitials(user.name)}
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
              <h3 className="font-semibold text-lg">{user.name}</h3>
              {isLeader && <IconStar size={14} className="text-yellow-500" />}
            </div>
            <p className="text-xs text-muted-foreground">@{user.username}</p>
            <p className="text-sm font-medium text-muted-foreground capitalize">
              {roleLabel.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>

          {/* Change team select — canManage only */}
          {canManage && teamType && (
            <div className="mt-4 pt-4 border-t">
              <Select
                value={teamType}
                onValueChange={handleChangeTeam}
                disabled={loading}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Change team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Team</SelectItem>
                  {teamOptions.map((t) => (
                    <SelectItem key={t.id} value={t.slug}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Team name — read only for non-managers */}
          {!canManage && (
            <div className="mt-4 pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground">{teamDisplayName}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove from Team Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Remove from Team</DialogTitle>
            </div>
            <DialogDescription>
              Remove{" "}
              <span className="font-semibold text-foreground">{user.name}</span>{" "}
              from the {teamDisplayName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRemoveDialog(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveFromTeam}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Removing...
                </>
              ) : (
                <>
                  <IconUserX size={14} className="mr-2" />
                  Remove
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog (Inline) */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <EditUserForm
            user={user}
            onSuccess={() => {
              setShowEditDialog(false);
              router.refresh();
              toast.success("User updated successfully");
            }}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Inline Edit Form Component ────────────────────────────────────────────────

interface EditUserFormProps {
  user: TeamUser;
  onSuccess: () => void;
  onCancel: () => void;
}

function EditUserForm({ user, onSuccess, onCancel }: EditUserFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: user.name,
    username: user.username,
    email: user.email ?? "",
    password: "",
    role: user.role,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name || !form.username || !form.role) {
      setError("All required fields must be filled");
      return;
    }

    if (form.password && form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name</label>
        <input
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Username</label>
        <input
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Email (optional)</label>
        <input
          type="email"
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="user@example.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Password (leave empty to keep)
        </label>
        <input
          type="password"
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Role</label>
        <select
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="DEVELOPER">Developer</option>
          <option value="DESIGNER">Designer</option>
          <option value="PROGRAMMER">Programmer</option>
          <option value="QA">QA</option>
          <option value="TEAM_LEADER">Team Leader</option>
          <option value="PROJECT_MANAGER">Project Manager</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
