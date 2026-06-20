"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/rich-text-editor";
import {
  IconCamera,
  IconUser,
  IconMail,
  IconAt,
  IconShield,
  IconUsers,
  IconLoader2,
  IconTrash,
  IconBuildingBank,
  IconCash,
  IconCalendar,
  IconEye,
  IconEyeOff,
  IconClock,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceDesktop,
  IconQuestionMark,
  IconPlus,
  IconEdit,
  IconFileText,
  IconTargetArrow,
  IconChecklist,
  IconChevronDown,
  IconChevronUp,
  IconUsersGroup,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconUserPlus,
  IconSearch,
} from "@tabler/icons-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  serial_no: string | null;
  status: string;
  condition: string;
  has_keyboard: boolean;
  has_extended_screen: boolean;
  has_mouse: boolean;
  has_charger: boolean;
  password: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}
interface SopItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  assignedUserIds: string[];
}
interface KpiItem {
  id: string;
  title: string;
  body: string;
  level: "SENIOR" | "JUNIOR";
  created_at: string;
  updated_at: string;
  assignedUserIds: string[];
  assignedTeamTypes: string[];
}
interface ChecklistItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  assignedUserIds: string[];
  assignedTeamTypes: string[];
}
interface MyAssignedItem {
  id: string;
  title: string;
  body: string;
  assigned_at: string;
}
interface MyAssignedKpi extends MyAssignedItem {
  level: "SENIOR" | "JUNIOR";
}
interface AssignableUser {
  id: string;
  name: string;
  role: string;
  team_type: string | null;
  level: string | null;
}
interface Props {
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: string;
    team_type: string | null;
    level: string | null;
    avatar: string | null;
    base_salary: string | null;
    join_date: string | null;
    per_minute_rate: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_title: string | null;
  };
  assignedDevices?: Device[];
  canManage: boolean;
  assignableUsers: AssignableUser[];
  allSops: SopItem[];
  allKpis: KpiItem[];
  allChecklists: ChecklistItem[];
  myAssignedSops: MyAssignedItem[];
  myAssignedKpis: MyAssignedKpi[];
  myAssignedChecklists: MyAssignedItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
function fmt(n: string | null) {
  if (!n) return null;
  return parseFloat(n).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function getDeviceIcon(type: string) {
  switch (type.toUpperCase()) {
    case "LAPTOP":
      return <IconDeviceLaptop className="h-5 w-5 text-blue-500" />;
    case "DESKTOP":
      return <IconDeviceDesktop className="h-5 w-5 text-indigo-500" />;
    case "PHONE":
    case "TABLET":
      return <IconDeviceMobile className="h-5 w-5 text-green-500" />;
    default:
      return <IconQuestionMark className="h-5 w-5 text-gray-500" />;
  }
}
function teamLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}
function isBodyEmpty(html: string) {
  return stripHtml(html).length === 0;
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700 border-red-200",
  PROJECT_MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  TEAM_LEADER: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DEVELOPER: "bg-emerald-100 text-emerald-700 border-emerald-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  QA: "bg-purple-100 text-purple-700 border-purple-200",
};

const TEAM_COLOR_POOL = [
  {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    bg: "bg-pink-50",
    text: "text-pink-700",
    border: "border-pink-200",
    dot: "bg-pink-500",
  },
  {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
  },
  {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    dot: "bg-cyan-500",
  },
];
function teamColors(team: string, allTeams: string[]) {
  const idx = allTeams.indexOf(team);
  return TEAM_COLOR_POOL[idx % TEAM_COLOR_POOL.length] ?? TEAM_COLOR_POOL[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamBadge
// ─────────────────────────────────────────────────────────────────────────────
function TeamBadge({ team, allTeams }: { team: string; allTeams: string[] }) {
  const c = teamColors(team, allTeams);
  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-1 ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {teamLabel(team)}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DeleteConfirm
// ─────────────────────────────────────────────────────────────────────────────
function DeleteConfirm({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 animate-in slide-in-from-right-2 duration-150">
      <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <p className="text-xs text-destructive font-medium flex-1">
        Delete permanently?
      </p>
      <button
        onClick={onConfirm}
        disabled={loading}
        className="flex items-center gap-1 text-xs font-semibold bg-destructive text-white px-2.5 py-1 rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-60"
      >
        {loading ? (
          <IconLoader2 className="h-3 w-3 animate-spin" />
        ) : (
          <IconCheck className="h-3 w-3" />
        )}{" "}
        Yes
      </button>
      <button
        onClick={onCancel}
        disabled={loading}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border hover:bg-muted transition-colors"
      >
        <IconX className="h-3 w-3" /> No
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineForm
// ─────────────────────────────────────────────────────────────────────────────
interface InlineFormProps {
  type: "sop" | "kpi" | "checklist";
  initial?: {
    id?: string;
    title: string;
    body: string;
    level?: "SENIOR" | "JUNIOR";
  };
  onClose: () => void;
  onSaved: (updated: {
    id: string;
    title: string;
    body: string;
    level?: "SENIOR" | "JUNIOR";
  }) => void;
}
function InlineForm({ type, initial, onClose, onSaved }: InlineFormProps) {
  const isEdit = !!initial?.id;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [level, setLevel] = useState<"SENIOR" | "JUNIOR">(
    initial?.level ?? "JUNIOR",
  );
  const [saving, setSaving] = useState(false);

  const endpoint =
    type === "sop"
      ? "/api/sops"
      : type === "kpi"
        ? "/api/kpis"
        : "/api/checklists";
  const typeLabel =
    type === "sop" ? "SOP" : type === "kpi" ? "KPI" : "Checklist";

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (isBodyEmpty(body)) {
      toast.error("Body is required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { title: title.trim(), body };
      if (type === "kpi") payload.level = level;
      if (isEdit) payload.id = initial!.id;
      const res = await fetch(endpoint, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`${typeLabel} ${isEdit ? "updated" : "created"}`);
      onSaved({
        id: isEdit ? initial!.id! : data.id,
        title: title.trim(),
        body,
        level,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isEdit ? `Edit ${typeLabel}` : `New ${typeLabel}`}
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${typeLabel} title`}
          className="text-sm h-8"
          autoFocus
        />
      </div>
      {type === "kpi" && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            Level <span className="text-destructive">*</span>
          </Label>
          <Select
            value={level}
            onValueChange={(v) => setLevel(v as "SENIOR" | "JUNIOR")}
          >
            <SelectTrigger className="text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SENIOR">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" />{" "}
                  Senior
                </span>
              </SelectItem>
              <SelectItem value="JUNIOR">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400 inline-block" />{" "}
                  Junior
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">
          Body <span className="text-destructive">*</span>
        </Label>
        <RichTextEditor content={body} onChange={setBody} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-7 text-xs gap-1.5"
        >
          {saving ? (
            <>
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <IconCheck className="h-3.5 w-3.5" />{" "}
              {isEdit ? "Save changes" : `Create ${typeLabel}`}
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UserAssignPanel — select individual users (single or multiple)
// ─────────────────────────────────────────────────────────────────────────────
function UserAssignPanel({
  itemId,
  endpoint,
  currentAssignedIds,
  assignableUsers,
  onClose,
  onSaved,
}: {
  itemId: string;
  endpoint: string;
  currentAssignedIds: string[];
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onSaved: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(currentAssignedIds),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return assignableUsers;
    return assignableUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.team_type ?? "").toLowerCase().includes(q),
    );
  }, [assignableUsers, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((u) => u.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    setSaving(true);
    try {
      const prev = new Set(currentAssignedIds);
      const toAssign = [...selected].filter((id) => !prev.has(id));
      const toUnassign = [...prev].filter((id) => !selected.has(id));

      if (toAssign.length === 0 && toUnassign.length === 0) {
        onClose();
        return;
      }

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          assignUserIds: toAssign,
          unassignUserIds: toUnassign,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        `Updated: ${toAssign.length} assigned, ${toUnassign.length} unassigned`,
      );
      onSaved([...selected]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (assignableUsers.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assign to Users
        </p>
        <p className="text-sm text-muted-foreground">No users available.</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-7 text-xs"
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assign to Users
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-[10px] text-primary hover:underline font-medium"
          >
            Select all
          </button>
          <span className="text-muted-foreground text-[10px]">·</span>
          <button
            onClick={clearAll}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="h-8 text-xs pl-8"
        />
      </div>

      {/* User list */}
      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No users match your search
          </p>
        ) : (
          filtered.map((u) => {
            const checked = selected.has(u.id);
            const roleClass =
              ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-700 border-gray-200";
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  checked
                    ? "bg-primary/5 border-primary/30"
                    : "bg-card border-border hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(u.id)}
                />
                <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {getInitials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">
                    {u.name}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-4 ${roleClass}`}
                    >
                      {u.role}
                    </Badge>
                    {u.team_type && (
                      <span className="text-[10px] text-muted-foreground">
                        {teamLabel(u.team_type)}
                      </span>
                    )}
                    {u.level && (
                      <span
                        className={`text-[9px] font-medium ${u.level === "SENIOR" ? "text-violet-600" : "text-blue-500"}`}
                      >
                        {u.level}
                      </span>
                    )}
                  </div>
                </div>
                {checked && (
                  <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </label>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "No users selected"
          : `${selected.size} user${selected.size !== 1 ? "s" : ""} selected`}
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-7 text-xs gap-1.5"
        >
          {saving ? (
            <>
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <IconCheck className="h-3.5 w-3.5" /> Save
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SopAssignPanel — assign to all users (existing)
// ─────────────────────────────────────────────────────────────────────────────
function SopAssignPanel({
  item,
  totalUserCount,
  onClose,
  onSaved,
}: {
  item: SopItem;
  totalUserCount: number;
  onClose: () => void;
  onSaved: (ids: string[]) => void;
}) {
  const isAll =
    item.assignedUserIds.length >= totalUserCount && totalUserCount > 0;
  const [saving, setSaving] = useState(false);

  async function handle() {
    setSaving(true);
    try {
      const usersRes = await fetch("/api/users?active=true");
      if (!usersRes.ok) throw new Error("Failed to fetch users");
      const usersData = await usersRes.json();
      const allIds: string[] = (usersData.users ?? []).map(
        (u: { id: string }) => u.id,
      );

      const res = await fetch("/api/sops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          assignUserIds: isAll ? [] : allIds,
          unassignUserIds: isAll ? allIds : [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(
        isAll
          ? "SOP unassigned from all users"
          : `SOP assigned to all ${allIds.length} users`,
      );
      onSaved(isAll ? [] : allIds);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Assign to All Users
      </p>
      <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card">
        <div className="flex items-center gap-3">
          <IconUsersGroup className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">All active users</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAll
                ? `Assigned to all ${item.assignedUserIds.length} users`
                : item.assignedUserIds.length > 0
                  ? `Assigned to ${item.assignedUserIds.length} of ${totalUserCount} users`
                  : "Not assigned to anyone yet"}
            </p>
          </div>
        </div>
        <div
          className={`h-2.5 w-2.5 rounded-full ${isAll ? "bg-green-500" : "bg-muted-foreground/30"}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={isAll ? "destructive" : "default"}
          onClick={handle}
          disabled={saving}
          className="h-7 text-xs gap-1.5"
        >
          {saving ? (
            <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isAll ? (
            <IconX className="h-3.5 w-3.5" />
          ) : (
            <IconUsersGroup className="h-3.5 w-3.5" />
          )}
          {isAll ? "Unassign from all" : "Assign to all users"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamAssignPanel
// ─────────────────────────────────────────────────────────────────────────────
function TeamAssignPanel({
  itemId,
  endpoint,
  currentTeamTypes,
  kpiLevel,
  assignableUsers,
  onClose,
  onSaved,
}: {
  itemId: string;
  endpoint: string;
  currentTeamTypes: string[];
  kpiLevel?: "SENIOR" | "JUNIOR";
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onSaved: (teamTypes: string[]) => void;
}) {
  const availableTeams = useMemo(() => {
    const seen = new Set<string>();
    for (const u of assignableUsers) {
      if (u.team_type) seen.add(u.team_type);
    }
    return [...seen].sort();
  }, [assignableUsers]);

  const [selected, setSelected] = useState<Set<string>>(
    new Set(currentTeamTypes),
  );
  const [saving, setSaving] = useState(false);

  const teamCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const team of availableTeams) {
      map[team] = assignableUsers.filter((u) => {
        if (u.team_type !== team) return false;
        if (kpiLevel && u.level !== kpiLevel) return false;
        return true;
      }).length;
    }
    return map;
  }, [availableTeams, assignableUsers, kpiLevel]);

  function toggle(t: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const prev = new Set(currentTeamTypes);
      const toAssign = [...selected].filter((t) => !prev.has(t));
      const toUnassign = [...prev].filter((t) => !selected.has(t));
      if (toAssign.length === 0 && toUnassign.length === 0) {
        onClose();
        return;
      }
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          assignTeamTypes: toAssign,
          unassignTeamTypes: toUnassign,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Team assignments updated");
      onSaved([...selected]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const totalUsers = [...selected].reduce(
    (s, t) => s + (teamCounts[t] ?? 0),
    0,
  );

  if (availableTeams.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assign to Teams
        </p>
        <p className="text-sm text-muted-foreground">
          No team members available.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-7 text-xs"
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Assign to Teams
        {kpiLevel && (
          <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">
            · {kpiLevel} members only
          </span>
        )}
      </p>
      <div className="space-y-2">
        {availableTeams.map((team) => {
          const c = teamColors(team, availableTeams);
          const count = teamCounts[team] ?? 0;
          const checked = selected.has(team);
          return (
            <label
              key={team}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${checked ? `${c.bg} ${c.border}` : "bg-card border-border hover:bg-muted/30"}`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(team)}
              />
              <span className={`h-2 w-2 rounded-full ${c.dot} shrink-0`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${checked ? c.text : ""}`}>
                  {teamLabel(team)} Team
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {count === 0
                    ? kpiLevel
                      ? `No ${kpiLevel.toLowerCase()} members`
                      : "No members"
                    : `${count} ${kpiLevel ? kpiLevel.toLowerCase() + " " : ""}member${count !== 1 ? "s" : ""}`}
                </p>
              </div>
              {checked && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${c.bg} ${c.text} ${c.border}`}
                >
                  Selected
                </Badge>
              )}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "No teams selected"
          : `${totalUsers} user${totalUsers !== 1 ? "s" : ""} across ${selected.size} team${selected.size !== 1 ? "s" : ""}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-7 text-xs gap-1.5"
        >
          {saving ? (
            <>
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <IconCheck className="h-3.5 w-3.5" /> Save
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemCard — expandable card with inline actions
// Now has TWO assign buttons:
//   • IconUsersGroup → team/all-users assign (existing)
//   • IconUserPlus   → individual user selection (new)
// ─────────────────────────────────────────────────────────────────────────────
type PanelType = "edit" | "assign-bulk" | "assign-users" | "delete" | null;

interface ItemCardProps {
  type: "sop" | "kpi" | "checklist";
  item: SopItem | KpiItem | ChecklistItem;
  assignableUsers: AssignableUser[];
  availableTeams: string[];
  totalUserCount?: number;
  onUpdated: (updated: Partial<SopItem & KpiItem & ChecklistItem>) => void;
  onDeleted: (id: string) => void;
}

function ItemCard({
  type,
  item,
  assignableUsers,
  availableTeams,
  totalUserCount = 0,
  onUpdated,
  onDeleted,
}: ItemCardProps) {
  const [panel, setPanel] = useState<PanelType>(null);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isKpi = type === "kpi";
  const kpi = isKpi ? (item as KpiItem) : null;
  const hasTeams = "assignedTeamTypes" in item;
  const assignedTeams = hasTeams
    ? (item as KpiItem | ChecklistItem).assignedTeamTypes
    : [];
  const plainBody = stripHtml(item.body);
  const isLongBody = plainBody.length > 220;
  const endpoint =
    type === "sop"
      ? "/api/sops"
      : type === "kpi"
        ? "/api/kpis"
        : "/api/checklists";

  function togglePanel(p: PanelType) {
    setPanel((prev) => (prev === p ? null : p));
  }

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`${endpoint}?id=${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(
        `${type === "sop" ? "SOP" : type === "kpi" ? "KPI" : "Checklist"} deleted`,
      );
      onDeleted(item.id);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden hover:shadow-sm transition-shadow">
      <div className="px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold leading-tight">
                {item.title}
              </p>
              {isKpi && kpi && (
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${kpi.level === "SENIOR" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                >
                  {kpi.level}
                </Badge>
              )}
              {assignedTeams.map((t) => (
                <TeamBadge key={t} team={t} allTeams={availableTeams} />
              ))}
              {/* Individual user count badge */}
              {item.assignedUserIds.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 bg-slate-50 text-slate-600 border-slate-200"
                >
                  <IconUser className="h-2.5 w-2.5" />
                  {item.assignedUserIds.length}
                </Badge>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Bulk assign (all users for SOP, teams for KPI/Checklist) */}
            <button
              onClick={() => togglePanel("assign-bulk")}
              className={`p-1.5 rounded-md transition-colors ${panel === "assign-bulk" ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
              title={type === "sop" ? "Assign to all users" : "Assign to teams"}
            >
              <IconUsersGroup className="h-3.5 w-3.5" />
            </button>
            {/* Individual user assign */}
            <button
              onClick={() => togglePanel("assign-users")}
              className={`p-1.5 rounded-md transition-colors ${panel === "assign-users" ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
              title="Assign to specific users"
            >
              <IconUserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => togglePanel("edit")}
              className={`p-1.5 rounded-md transition-colors ${panel === "edit" ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              <IconEdit className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => togglePanel("delete")}
              className={`p-1.5 rounded-md transition-colors ${panel === "delete" ? "bg-destructive/10 text-destructive" : "hover:bg-muted text-muted-foreground hover:text-destructive"}`}
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {panel !== "edit" && (
          <>
            <div
              className={`mt-2.5 text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert ${!bodyExpanded && isLongBody ? "line-clamp-3" : ""}`}
              dangerouslySetInnerHTML={{ __html: item.body }}
            />
            {isLongBody && (
              <button
                onClick={() => setBodyExpanded((v) => !v)}
                className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline"
              >
                {bodyExpanded ? (
                  <>
                    <IconChevronUp className="h-3 w-3" /> Show less
                  </>
                ) : (
                  <>
                    <IconChevronDown className="h-3 w-3" /> Read more
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Inline panels */}
      {panel === "delete" && (
        <div className="px-4 pb-4">
          <DeleteConfirm
            onConfirm={doDelete}
            onCancel={() => setPanel(null)}
            loading={deleting}
          />
        </div>
      )}
      {panel === "edit" && (
        <div className="px-4 pb-4">
          <InlineForm
            type={type}
            initial={{
              id: item.id,
              title: item.title,
              body: item.body,
              level: kpi?.level,
            }}
            onClose={() => setPanel(null)}
            onSaved={(updated) => {
              onUpdated({
                title: updated.title,
                body: updated.body,
                level: updated.level,
              });
              setPanel(null);
            }}
          />
        </div>
      )}

      {/* Bulk assign panel */}
      {panel === "assign-bulk" && type === "sop" && (
        <div className="px-4 pb-4">
          <SopAssignPanel
            item={item as SopItem}
            totalUserCount={totalUserCount}
            onClose={() => setPanel(null)}
            onSaved={(ids) => {
              onUpdated({ assignedUserIds: ids });
              setPanel(null);
            }}
          />
        </div>
      )}
      {panel === "assign-bulk" && (type === "kpi" || type === "checklist") && (
        <div className="px-4 pb-4">
          <TeamAssignPanel
            itemId={item.id}
            endpoint={endpoint}
            currentTeamTypes={assignedTeams}
            kpiLevel={type === "kpi" ? kpi?.level : undefined}
            assignableUsers={assignableUsers}
            onClose={() => setPanel(null)}
            onSaved={(teams) => {
              onUpdated({ assignedTeamTypes: teams });
              setPanel(null);
            }}
          />
        </div>
      )}

      {/* Individual user assign panel — works for all 3 types */}
      {panel === "assign-users" && (
        <div className="px-4 pb-4">
          <UserAssignPanel
            itemId={item.id}
            endpoint={endpoint}
            currentAssignedIds={item.assignedUserIds}
            assignableUsers={assignableUsers}
            onClose={() => setPanel(null)}
            onSaved={(ids) => {
              onUpdated({ assignedUserIds: ids });
              setPanel(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReadCard
// ─────────────────────────────────────────────────────────────────────────────
function ReadCard({
  title,
  body,
  meta,
  badge,
}: {
  title: string;
  body: string;
  meta?: string;
  badge?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = stripHtml(body).length > 220;
  return (
    <div className="border rounded-lg bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2 flex-wrap">
        <p className="text-sm font-semibold flex-1">{title}</p>
        {badge}
      </div>
      {meta && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{meta}</p>
      )}
      <div
        className={`mt-2.5 text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert ${!expanded && isLong ? "line-clamp-3" : ""}`}
        dangerouslySetInnerHTML={{ __html: body }}
      />
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline"
        >
          {expanded ? (
            <>
              <IconChevronUp className="h-3 w-3" /> Show less
            </>
          ) : (
            <>
              <IconChevronDown className="h-3 w-3" /> Read more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2 border-2 border-dashed rounded-lg">
      <div className="opacity-25">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AccountClient
// ─────────────────────────────────────────────────────────────────────────────
export function AccountClient({
  user,
  assignedDevices = [],
  canManage,
  assignableUsers,
  allSops: initialSops,
  allKpis: initialKpis,
  allChecklists: initialChecklists,
  myAssignedSops,
  myAssignedKpis,
  myAssignedChecklists,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showSalary, setShowSalary] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const [sops, setSops] = useState<SopItem[]>(initialSops);
  const [kpis, setKpis] = useState<KpiItem[]>(initialKpis);
  const [checklists, setChecklists] =
    useState<ChecklistItem[]>(initialChecklists);

  const [newSopOpen, setNewSopOpen] = useState(false);
  const [newKpiOpen, setNewKpiOpen] = useState(false);
  const [newChecklistOpen, setNewChecklistOpen] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<"ALL" | "SENIOR" | "JUNIOR">(
    "ALL",
  );

  const totalUserCount = assignableUsers.length;
  const roleClass =
    ROLE_BADGE[user.role] ?? "bg-gray-100 text-gray-700 border-gray-200";
  const hasSalaryInfo =
    user.base_salary || user.per_minute_rate || user.join_date;
  const hasBankInfo =
    user.bank_name || user.bank_account_number || user.bank_account_title;

  const availableTeams = useMemo(() => {
    const seen = new Set<string>();
    for (const u of assignableUsers) {
      if (u.team_type) seen.add(u.team_type);
    }
    return [...seen].sort();
  }, [assignableUsers]);

  // ── Avatar handlers ───────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Upload failed");
      }
      const { url } = await res.json();
      setAvatar(url);
      toast.success("Profile photo updated!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAvatar(null);
      toast.success("Profile photo removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setRemoving(false);
    }
  }

  // ── Optimistic list patchers ──────────────────────────────────────────────
  const patchSop = useCallback(
    (id: string, patch: Partial<SopItem>) =>
      setSops((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      ),
    [],
  );
  const patchKpi = useCallback(
    (id: string, patch: Partial<KpiItem>) =>
      setKpis((prev) =>
        prev.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      ),
    [],
  );
  const patchChecklist = useCallback(
    (id: string, patch: Partial<ChecklistItem>) =>
      setChecklists((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      ),
    [],
  );

  const filteredKpis =
    kpiFilter === "ALL" ? kpis : kpis.filter((k) => k.level === kpiFilter);
  const myKpisFiltered = user.level
    ? myAssignedKpis.filter((k) => k.level === user.level)
    : myAssignedKpis;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Account</h1>
        <p className="text-muted-foreground mt-1">
          View your profile, assigned SOPs, KPIs and checklists
          {canManage && " — and manage them for your team"}
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="h-10">
          <TabsTrigger value="profile" className="gap-2">
            <IconUser className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="sops" className="gap-2">
            <IconFileText className="h-4 w-4" /> SOPs
            {canManage && sops.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {sops.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-2">
            <IconTargetArrow className="h-4 w-4" /> KPIs
            {canManage && kpis.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {kpis.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checklists" className="gap-2">
            <IconChecklist className="h-4 w-4" /> Checklists
            {canManage && checklists.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {checklists.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── PROFILE ── */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconCamera className="h-4 w-4" /> Profile Photo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <Avatar className="h-24 w-24 ring-4 ring-muted">
                    <AvatarImage src={avatar ?? undefined} alt={user.name} />
                    <AvatarFallback className="text-2xl font-semibold bg-blue-600 text-white">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {uploading ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconCamera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Upload a new photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      JPG, PNG, GIF or WebP · max 5 MB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <IconLoader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{" "}
                          Uploading…
                        </>
                      ) : (
                        <>
                          <IconCamera className="mr-2 h-3.5 w-3.5" /> Change
                          Photo
                        </>
                      )}
                    </Button>
                    {avatar && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRemove}
                        disabled={removing}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        {removing ? (
                          <IconLoader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <IconTrash className="mr-2 h-3.5 w-3.5" />
                        )}{" "}
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconUser className="h-4 w-4" /> Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  icon: <IconUser className="h-4 w-4 text-muted-foreground" />,
                  label: "Full Name",
                  value: user.name,
                },
                {
                  icon: <IconAt className="h-4 w-4 text-muted-foreground" />,
                  label: "Username",
                  value: `@${user.username}`,
                },
                {
                  icon: <IconMail className="h-4 w-4 text-muted-foreground" />,
                  label: "Email",
                  value: user.email,
                },
              ].map(({ icon, label, value }) => (
                <div key={label}>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{icon}</div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium">
                        {value ?? (
                          <span className="text-muted-foreground italic">
                            Not set
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <IconShield className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Role</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${roleClass}`}>
                      {user.role}
                    </Badge>
                    {user.level && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${user.level === "SENIOR" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                      >
                        {user.level}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {user.team_type && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <IconUsers className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Team</p>
                      <p className="text-sm font-medium">
                        {teamLabel(user.team_type)} Team
                      </p>
                    </div>
                  </div>
                </>
              )}
              {user.join_date && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <IconCalendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Join Date</p>
                      <p className="text-sm font-medium">
                        {fmtDate(user.join_date)}
                      </p>
                    </div>
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                Contact an admin to update your profile information.
              </p>
            </CardContent>
          </Card>

          {assignedDevices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconDeviceLaptop className="h-4 w-4" /> Assigned Devices (
                  {assignedDevices.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {assignedDevices.map((device, idx) => (
                  <div key={device.id}>
                    <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/10">
                      <div className="h-12 w-12 rounded-lg bg-background border flex items-center justify-center shrink-0">
                        {getDeviceIcon(device.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-base font-semibold">
                            {device.name}
                          </p>
                          <div className="flex gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {device.status.toLowerCase()}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {device.condition.toLowerCase()}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {device.brand} {device.model}
                        </p>
                        {device.serial_no && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            S/N: {device.serial_no}
                          </p>
                        )}
                      </div>
                    </div>
                    {idx < assignedDevices.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {hasSalaryInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <IconCash className="h-4 w-4" /> Salary Information
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSalary((v) => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSalary ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    icon: (
                      <IconCash className="h-4 w-4 text-muted-foreground" />
                    ),
                    label: "Base Salary",
                    value: user.base_salary
                      ? showSalary
                        ? `PKR ${fmt(user.base_salary)}`
                        : "PKR ••••••"
                      : null,
                  },
                  {
                    icon: (
                      <IconClock className="h-4 w-4 text-muted-foreground" />
                    ),
                    label: "Per Minute Rate",
                    value: user.per_minute_rate
                      ? showSalary
                        ? `PKR ${parseFloat(user.per_minute_rate).toFixed(4)}`
                        : "PKR ••••"
                      : null,
                  },
                ]
                  .filter((r) => r.value !== null)
                  .map(({ icon, label, value }, i, arr) => (
                    <div key={label}>
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">{icon}</div>
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">
                            {label}
                          </p>
                          <p className="text-sm font-medium font-mono">
                            {value}
                          </p>
                        </div>
                      </div>
                      {i < arr.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}
                {!showSalary && (
                  <p className="text-xs text-muted-foreground">
                    Click the eye icon to reveal your salary details.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {hasBankInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <IconBuildingBank className="h-4 w-4" /> Bank Information
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAccount((v) => !v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAccount ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    label: "Bank Name",
                    value: user.bank_name,
                    mono: false,
                    sensitive: false,
                  },
                  {
                    label: "Account Number",
                    value: user.bank_account_number,
                    mono: true,
                    sensitive: true,
                  },
                  {
                    label: "Account Title",
                    value: user.bank_account_title,
                    mono: false,
                    sensitive: false,
                  },
                ]
                  .filter((r) => r.value)
                  .map(({ label, value, mono, sensitive }, i, arr) => (
                    <div key={label}>
                      <div className="flex items-center gap-3">
                        <IconBuildingBank className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">
                            {label}
                          </p>
                          <p
                            className={`text-sm font-medium ${mono ? "font-mono" : ""}`}
                          >
                            {sensitive && !showAccount ? "••••••••" : value}
                          </p>
                        </div>
                      </div>
                      {i < arr.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}
                {!showAccount && (
                  <p className="text-xs text-muted-foreground">
                    Click the eye icon to reveal your account details.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── SOPs ── */}
        <TabsContent value="sops" className="space-y-3">
          {canManage ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Standard Operating Procedures
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Assign to <span className="font-medium">all users</span> at
                    once, or pick{" "}
                    <span className="font-medium">specific users</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => setNewSopOpen((v) => !v)}
                >
                  {newSopOpen ? (
                    <>
                      <IconX className="h-3.5 w-3.5" /> Cancel
                    </>
                  ) : (
                    <>
                      <IconPlus className="h-3.5 w-3.5" /> New SOP
                    </>
                  )}
                </Button>
              </div>
              {newSopOpen && (
                <InlineForm
                  type="sop"
                  onClose={() => setNewSopOpen(false)}
                  onSaved={(s) => {
                    setSops((prev) => [
                      {
                        id: s.id,
                        title: s.title,
                        body: s.body,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        assignedUserIds: [],
                      },
                      ...prev,
                    ]);
                    setNewSopOpen(false);
                  }}
                />
              )}
              {sops.length === 0 && !newSopOpen ? (
                <EmptyState
                  icon={<IconFileText className="h-10 w-10" />}
                  text="No SOPs yet. Create your first one."
                />
              ) : (
                <div className="space-y-2">
                  {sops.map((sop) => (
                    <ItemCard
                      key={sop.id}
                      type="sop"
                      item={sop}
                      assignableUsers={assignableUsers}
                      availableTeams={availableTeams}
                      totalUserCount={totalUserCount}
                      onUpdated={(p) => patchSop(sop.id, p as Partial<SopItem>)}
                      onDeleted={(id) =>
                        setSops((prev) => prev.filter((s) => s.id !== id))
                      }
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">My Assigned SOPs</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Standard operating procedures for all staff
                </p>
              </div>
              {myAssignedSops.length === 0 ? (
                <EmptyState
                  icon={<IconFileText className="h-10 w-10" />}
                  text="No SOPs assigned to you yet."
                />
              ) : (
                <div className="space-y-2">
                  {myAssignedSops.map((s) => (
                    <ReadCard
                      key={s.id}
                      title={s.title}
                      body={s.body}
                      meta={`Assigned ${new Date(s.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── KPIs ── */}
        <TabsContent value="kpis" className="space-y-3">
          {canManage ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Key Performance Indicators
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Assign to <span className="font-medium">teams</span> by
                    level, or pick{" "}
                    <span className="font-medium">specific users</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => setNewKpiOpen((v) => !v)}
                >
                  {newKpiOpen ? (
                    <>
                      <IconX className="h-3.5 w-3.5" /> Cancel
                    </>
                  ) : (
                    <>
                      <IconPlus className="h-3.5 w-3.5" /> New KPI
                    </>
                  )}
                </Button>
              </div>
              {newKpiOpen && (
                <InlineForm
                  type="kpi"
                  onClose={() => setNewKpiOpen(false)}
                  onSaved={(k) => {
                    setKpis((prev) => [
                      {
                        id: k.id,
                        title: k.title,
                        body: k.body,
                        level: k.level ?? "JUNIOR",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        assignedUserIds: [],
                        assignedTeamTypes: [],
                      },
                      ...prev,
                    ]);
                    setNewKpiOpen(false);
                  }}
                />
              )}
              <div className="flex gap-1.5">
                {(["ALL", "SENIOR", "JUNIOR"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setKpiFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${kpiFilter === f ? (f === "SENIOR" ? "bg-violet-100 text-violet-700 border-violet-300" : f === "JUNIOR" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-primary text-primary-foreground border-transparent") : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"}`}
                  >
                    {f === "ALL"
                      ? `All (${kpis.length})`
                      : f === "SENIOR"
                        ? `Senior (${kpis.filter((k) => k.level === "SENIOR").length})`
                        : `Junior (${kpis.filter((k) => k.level === "JUNIOR").length})`}
                  </button>
                ))}
              </div>
              {filteredKpis.length === 0 && !newKpiOpen ? (
                <EmptyState
                  icon={<IconTargetArrow className="h-10 w-10" />}
                  text="No KPIs yet. Create your first one."
                />
              ) : (
                <div className="space-y-2">
                  {filteredKpis.map((kpi) => (
                    <ItemCard
                      key={kpi.id}
                      type="kpi"
                      item={kpi}
                      assignableUsers={assignableUsers}
                      availableTeams={availableTeams}
                      onUpdated={(p) => patchKpi(kpi.id, p as Partial<KpiItem>)}
                      onDeleted={(id) =>
                        setKpis((prev) => prev.filter((k) => k.id !== id))
                      }
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">My KPIs</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Performance targets for{" "}
                  {user.level ? (
                    <span className="font-medium">
                      {user.level.toLowerCase()} staff
                    </span>
                  ) : (
                    "your role"
                  )}
                </p>
              </div>
              {myKpisFiltered.length === 0 ? (
                <EmptyState
                  icon={<IconTargetArrow className="h-10 w-10" />}
                  text="No KPIs assigned to you yet."
                />
              ) : (
                <div className="space-y-2">
                  {myKpisFiltered.map((k) => (
                    <ReadCard
                      key={k.id}
                      title={k.title}
                      body={k.body}
                      meta={`Assigned ${new Date(k.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                      badge={
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${k.level === "SENIOR" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                        >
                          {k.level}
                        </Badge>
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── CHECKLISTS ── */}
        <TabsContent value="checklists" className="space-y-3">
          {canManage ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Checklists</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Assign to entire <span className="font-medium">teams</span>,
                    or pick <span className="font-medium">specific users</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => setNewChecklistOpen((v) => !v)}
                >
                  {newChecklistOpen ? (
                    <>
                      <IconX className="h-3.5 w-3.5" /> Cancel
                    </>
                  ) : (
                    <>
                      <IconPlus className="h-3.5 w-3.5" /> New Checklist
                    </>
                  )}
                </Button>
              </div>
              {newChecklistOpen && (
                <InlineForm
                  type="checklist"
                  onClose={() => setNewChecklistOpen(false)}
                  onSaved={(c) => {
                    setChecklists((prev) => [
                      {
                        id: c.id,
                        title: c.title,
                        body: c.body,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        assignedUserIds: [],
                        assignedTeamTypes: [],
                      },
                      ...prev,
                    ]);
                    setNewChecklistOpen(false);
                  }}
                />
              )}
              {checklists.length === 0 && !newChecklistOpen ? (
                <EmptyState
                  icon={<IconChecklist className="h-10 w-10" />}
                  text="No checklists yet. Create your first one."
                />
              ) : (
                <div className="space-y-2">
                  {checklists.map((cl) => (
                    <ItemCard
                      key={cl.id}
                      type="checklist"
                      item={cl}
                      assignableUsers={assignableUsers}
                      availableTeams={availableTeams}
                      onUpdated={(p) =>
                        patchChecklist(cl.id, p as Partial<ChecklistItem>)
                      }
                      onDeleted={(id) =>
                        setChecklists((prev) => prev.filter((c) => c.id !== id))
                      }
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">My Checklists</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Checklists assigned to your team
                </p>
              </div>
              {myAssignedChecklists.length === 0 ? (
                <EmptyState
                  icon={<IconChecklist className="h-10 w-10" />}
                  text="No checklists assigned to you yet."
                />
              ) : (
                <div className="space-y-2">
                  {myAssignedChecklists.map((c) => (
                    <ReadCard
                      key={c.id}
                      title={c.title}
                      body={c.body}
                      meta={`Assigned ${new Date(c.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
