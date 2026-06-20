// app/(dashboard)/projects/_components/project-viewers-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconEye,
  IconLoader,
  IconSearch,
  IconX,
  IconUserPlus,
} from "@tabler/icons-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectViewer {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  role?: string;
}

interface AllUser {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  role?: string;
  team_type?: string | null; // add this
}

interface ProjectViewersDialogProps {
  projectId: string;
  projectName: string;
  currentViewers: ProjectViewer[];
  onViewersChanged: (viewers: ProjectViewer[]) => void;
  canManage: boolean;
  trigger?: React.ReactNode;
  currentUserRole?: string;
  currentUserTeamType?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "PM",
  TEAM_LEADER: "Leader",
  DEVELOPER: "Dev",
  DESIGNER: "Designer",
  PROGRAMMER: "Programmer",
  QA: "QA",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectViewersDialog({
  projectId,
  projectName,
  currentViewers,
  onViewersChanged,
  canManage,
  trigger,
  currentUserRole,
  currentUserTeamType,
}: ProjectViewersDialogProps) {
  const [open, setOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentViewers.map((v) => v.id)));
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = (await res.json()) as
        | AllUser[]
        | { data?: AllUser[]; users?: AllUser[] };
      const list = Array.isArray(data) ? data : (data.data ?? data.users ?? []);
      setAllUsers(list);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentIds = new Set(currentViewers.map((v) => v.id));
      const toAdd = [...selected].filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !selected.has(id));

      if (toAdd.length > 0) {
        const res = await fetch(`/api/projects/${projectId}/viewers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: toAdd }),
        });
        if (!res.ok) throw new Error("Failed to add viewers");
      }

      for (const userId of toRemove) {
        await fetch(`/api/projects/${projectId}/viewers?userId=${userId}`, {
          method: "DELETE",
        });
      }

      const updated = allUsers
        .filter((u) => selected.has(u.id))
        .map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          role: u.role,
        }));

      onViewersChanged(updated);
      toast.success("Project viewers updated");
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update viewers",
      );
    } finally {
      setSaving(false);
    }
  };

  const filtered = allUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());

    // Team leaders can only add viewers from their own team
    const matchesTeam =
      currentUserRole !== "TEAM_LEADER" ||
      !currentUserTeamType ||
      u.team_type === currentUserTeamType;

    return matchesSearch && matchesTeam;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 px-3 text-xs text-muted-foreground"
          >
            <IconEye className="h-3.5 w-3.5" />
            {canManage ? "Manage viewers" : "View viewers"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconEye className="h-5 w-5 text-blue-500" />
            Project Viewers
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">
            {projectName}
          </p>
          {!canManage ? null : (
            <p className="text-xs text-muted-foreground">
              Viewers can see this project and all its tasks.
            </p>
          )}
        </DialogHeader>

        {!canManage ? (
          // ── Read-only ──────────────────────────────────────────────────────
          <div className="space-y-2 py-2">
            {currentViewers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No viewers added yet
              </p>
            ) : (
              currentViewers.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-2 rounded-lg border bg-muted/20"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={v.avatar ?? undefined} />
                    <AvatarFallback className="bg-blue-600 text-white text-xs">
                      {getInitials(v.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      @{v.username}
                    </p>
                  </div>
                  {v.role && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 shrink-0"
                    >
                      {ROLE_LABELS[v.role] ?? v.role}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          // ── Manage view ────────────────────────────────────────────────────
          <>
            {/* Selected preview chips */}
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/40 border min-h-[40px]">
                {allUsers
                  .filter((u) => selected.has(u.id))
                  .map((u) => (
                    <Badge
                      key={u.id}
                      variant="secondary"
                      className="gap-1.5 pr-1 h-6"
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={u.avatar ?? undefined} />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{u.name}</span>
                      <button
                        type="button"
                        className="hover:text-destructive transition-colors ml-0.5"
                        onClick={() => toggle(u.id)}
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* User list */}
            <div className="max-h-60 overflow-y-auto space-y-0.5 rounded-lg border p-1">
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <IconLoader className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-6">
                  No users found
                </p>
              ) : (
                filtered.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => toggle(user.id)}
                  >
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggle(user.id)}
                    />
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={user.avatar ?? undefined} />
                      <AvatarFallback className="bg-blue-600 text-white text-xs">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{user.username}
                      </p>
                    </div>
                    {user.role && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 shrink-0"
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    )}
                    {selected.has(user.id) && (
                      <span className="text-xs text-primary font-medium shrink-0">
                        Viewer
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            {canManage ? "Cancel" : "Close"}
          </Button>
          {canManage && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <IconEye className="h-4 w-4" />
                  Save viewers
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compact viewer count badge ────────────────────────────────────────────────

export function ProjectViewersBadge({
  viewers,
  onClick,
}: {
  viewers: ProjectViewer[];
  onClick?: () => void;
}) {
  if (viewers.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={`${viewers.length} viewer${viewers.length !== 1 ? "s" : ""}: ${viewers.map((v) => v.name).join(", ")}`}
    >
      <IconEye className="h-3.5 w-3.5" />
      <span>
        {viewers.length} viewer{viewers.length !== 1 ? "s" : ""}
      </span>
      <div className="flex -space-x-1">
        {viewers.slice(0, 3).map((v) => (
          <Avatar key={v.id} className="h-5 w-5 border border-background">
            <AvatarImage src={v.avatar ?? undefined} />
            <AvatarFallback className="text-[8px] bg-blue-100 text-blue-700">
              {getInitials(v.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {viewers.length > 3 && (
          <div className="h-5 w-5 rounded-full bg-muted border border-background flex items-center justify-center">
            <span className="text-[8px] text-muted-foreground font-medium">
              +{viewers.length - 3}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
