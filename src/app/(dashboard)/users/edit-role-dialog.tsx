"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  IconCrown,
  IconBuildingBank,
  IconEye,
  IconEyeOff,
  IconUser,
  IconMail,
  IconBriefcase,
  IconCalendar,
  IconCurrencyDollar,
  IconMapPin,
  IconLoader,
  IconKey,
  IconCopy,
  IconStars,
} from "@tabler/icons-react";

type TeamOption = { id: string; name: string; slug: string };
type LocationOption = { id: string; name: string };
type Role = string;
type TeamType = string | null;

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: Role;
  level?: string | null;
  team_type: TeamType;
  team_leader_id?: string | null;
  is_active?: boolean;
  base_salary?: string | number | null;
  join_date?: string | Date | null;
  per_minute_rate?: string | number | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_title?: string | null;
  location_id?: string | null;
  password_plain?: string | null;
}

interface FormState {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  level: string;
  team_type: string;
  base_salary: string;
  join_date: string;
  per_minute_rate: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_title: string;
  location_id: string;
}

const EMPTY: FormState = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "",
  level: "",
  team_type: "",
  base_salary: "",
  join_date: "",
  per_minute_rate: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_title: "",
  location_id: "",
};

function toDateInputStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val);
  return s.includes("T") ? s.split("T")[0] : s;
}

function userToForm(u: User): FormState {
  return {
    name: u.name ?? "",
    username: u.username ?? "",
    email: u.email ?? "",
    password: "",
    role: u.role ?? "",
    level: u.level ?? "",
    team_type: u.team_type ?? "",
    base_salary: u.base_salary?.toString() ?? "",
    join_date: toDateInputStr(u.join_date),
    per_minute_rate: u.per_minute_rate?.toString() ?? "",
    bank_name: u.bank_name ?? "",
    bank_account_number: u.bank_account_number ?? "",
    bank_account_title: u.bank_account_title ?? "",
    location_id: u.location_id ?? "",
  };
}

export function EditUserDialog({
  user,
  currentUserRole,
}: {
  user: User;
  currentUserRole: string;
}) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [formLoading, setFormLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [teamOptions, setTeamOptions] = React.useState<TeamOption[]>([]);
  const [locationOptions, setLocationOptions] = React.useState<
    LocationOption[]
  >([]);
  const [showPassword, setShowPassword] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const [currentPasswordPlain, setCurrentPasswordPlain] = React.useState<
    string | null
  >(null);
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);

  const canManageLocations =
    currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";
  const isAdmin = currentUserRole === "ADMIN";
  const canViewPassword =
    currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";

  React.useEffect(() => {
    if (!open) return;

    setError("");
    setShowPassword(false);
    setShowCurrentPassword(false);
    setCurrentPasswordPlain(null);
    setFormLoading(true);

    setForm(userToForm(user));

    Promise.all([
      fetch(`/api/users/${user.id}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/teams")
        .then((r) => r.json())
        .catch(() => []),
      canManageLocations
        ? fetch("/api/attendance/locations")
            .then((r) => r.json())
            .catch(() => ({ locations: [] }))
        : Promise.resolve({ locations: [] }),
    ])
      .then(([profileData, teamsData, locData]) => {
        const fullUser: User | null = profileData?.user ?? null;
        if (fullUser) {
          setForm(userToForm(fullUser));
          setCurrentPasswordPlain(fullUser.password_plain ?? null);
        }

        setTeamOptions(Array.isArray(teamsData) ? teamsData : []);
        setLocationOptions(
          Array.isArray(locData?.locations) ? locData.locations : [],
        );
      })
      .finally(() => {
        setFormLoading(false);
      });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setForm(EMPTY);
    setError("");
    setShowPassword(false);
    setShowCurrentPassword(false);
    setCurrentPasswordPlain(null);
  }

  async function copyPassword() {
    if (!currentPasswordPlain) return;
    try {
      await navigator.clipboard.writeText(currentPasswordPlain);
      toast.success("Password copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  const isTeamLeader = form.role === "TEAM_LEADER";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || form.name.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (!form.username.trim() || form.username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (!form.role) {
      setError("Role is required");
      return;
    }
    if (form.password && form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (isTeamLeader && !form.team_type) {
      setError("Team Leader must be assigned to a team");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Invalid email address");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim() || null,
      role: form.role,
      level: form.level || null,
      team_type: form.team_type || null,
      join_date: form.join_date || null,
    };

    if (form.password) payload.password = form.password;

    if (canManageLocations) {
      payload.location_id =
        !form.location_id || form.location_id === "none"
          ? null
          : form.location_id;
    }

    if (isAdmin) {
      payload.base_salary = form.base_salary || null;
      payload.per_minute_rate = form.per_minute_rate || null;
      payload.bank_name = form.bank_name.trim() || null;
      payload.bank_account_number = form.bank_account_number.trim() || null;
      payload.bank_account_title = form.bank_account_title.trim() || null;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update user");
      }

      toast.success("User updated successfully");
      setOpen(false);
      reset();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        {formLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <IconLoader className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading user details…</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-140px)]">
            <form
              id="edit-user-form"
              onSubmit={handleSubmit}
              className="px-6 py-4 space-y-6"
            >
              {/* Profile header */}
              <div className="flex items-center gap-4 pb-4 border-b border-border/40">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconUser className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{user.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    @{user.username} · {user.role}
                  </p>
                </div>
              </div>

              {/* Basic info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <IconUser size={16} className="text-muted-foreground" />
                  Basic Information
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="John Smith"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Username <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.username}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                      placeholder="johnsmith"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="flex items-center gap-2">
                    <IconMail size={14} className="text-muted-foreground" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="john@example.com"
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Join Date</Label>
                  <div className="flex items-center gap-2">
                    <IconCalendar size={14} className="text-muted-foreground" />
                    <Input
                      type="date"
                      value={form.join_date}
                      onChange={(e) =>
                        setForm({ ...form, join_date: e.target.value })
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Password section */}
              {canViewPassword ? (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <IconKey size={16} className="text-muted-foreground" />
                        Password
                      </h4>
                      {currentPasswordPlain && (
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword((v) => !v)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={
                            showCurrentPassword
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {showCurrentPassword ? (
                            <IconEyeOff className="h-4 w-4" />
                          ) : (
                            <IconEye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Current Password
                      </Label>
                      {currentPasswordPlain ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPasswordPlain}
                            readOnly
                            className="h-9 font-mono"
                            onFocus={(e) => e.target.select()}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={copyPassword}
                            title="Copy password"
                          >
                            <IconCopy className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic bg-muted/40 rounded px-3 py-2">
                          Password not viewable — this user&apos;s password was
                          set before plaintext storage was enabled, or has not
                          been changed since. Set a new one below to make it
                          viewable here.
                        </p>
                      )}
                      {currentPasswordPlain && !showCurrentPassword && (
                        <p className="text-xs text-muted-foreground">
                          Click the eye icon to reveal the password.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Change Password{" "}
                        <span className="font-normal">
                          (leave empty to keep current)
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(e) =>
                            setForm({ ...form, password: e.target.value })
                          }
                          className="h-9 pr-10"
                          placeholder="••••••••"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <IconEyeOff className="h-4 w-4" />
                          ) : (
                            <IconEye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <Separator />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>
                      Password{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (leave empty to keep current)
                      </span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        className="h-9 pr-10"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <IconEyeOff className="h-4 w-4" />
                        ) : (
                          <IconEye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Role & team */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <IconBriefcase size={16} className="text-muted-foreground" />
                  Role & Team Assignment
                </h4>

                <div className="space-y-2">
                  <Label>
                    Role <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => {
                      const match = teamOptions.find((t) => t.slug === value);
                      setForm({
                        ...form,
                        role: value,
                        team_type: match ? match.slug : "",
                      });
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROJECT_MANAGER">
                        Project Manager
                      </SelectItem>
                      <SelectItem value="TEAM_LEADER">Team Leader</SelectItem>
                      <SelectItem value="QA">QA</SelectItem>
                      {teamOptions.map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>
                          {t.name.replace(" Team", "").trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Level */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <IconStars size={14} className="text-muted-foreground" />
                    Level{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Select
                    value={form.level || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, level: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No level</SelectItem>
                      <SelectItem value="JUNIOR">Junior</SelectItem>
                      <SelectItem value="SENIOR">Senior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.role && (
                  <div className="space-y-2">
                    <Label>
                      Assign to Team{" "}
                      {isTeamLeader ? (
                        <span className="text-destructive">*</span>
                      ) : (
                        <span className="text-xs font-normal text-muted-foreground">
                          (optional)
                        </span>
                      )}
                    </Label>
                    <Select
                      value={form.team_type || ""}
                      onValueChange={(v) => setForm({ ...form, team_type: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue
                          placeholder={
                            teamOptions.length ? "Select a team" : "Loading…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {teamOptions.map((t) => (
                          <SelectItem key={t.id} value={t.slug}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isTeamLeader && form.team_type && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <IconCrown size={13} /> Will be set as leader of this
                        team
                      </div>
                    )}
                  </div>
                )}
              </div>

              {canManageLocations && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <IconMapPin size={16} className="text-muted-foreground" />
                      Assigned Check-in Location
                    </h4>
                    <div className="space-y-2">
                      <Label>Location Restriction</Label>
                      <Select
                        value={form.location_id || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, location_id: v })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="No location assigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            No location assigned (any active)
                          </SelectItem>
                          {locationOptions.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        If none set, any active location is allowed for
                        check-in.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {isAdmin && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <IconCurrencyDollar
                        size={16}
                        className="text-muted-foreground"
                      />
                      Compensation
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Base Salary (PKR)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.base_salary}
                          onChange={(e) =>
                            setForm({ ...form, base_salary: e.target.value })
                          }
                          placeholder="e.g. 50000"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Per Minute Rate (PKR)</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={form.per_minute_rate}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              per_minute_rate: e.target.value,
                            })
                          }
                          placeholder="Auto if blank"
                          className="h-9"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Leave blank to auto-compute
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <IconBuildingBank
                        size={16}
                        className="text-muted-foreground"
                      />
                      Banking Information
                    </h4>
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Input
                        value={form.bank_name}
                        onChange={(e) =>
                          setForm({ ...form, bank_name: e.target.value })
                        }
                        placeholder="e.g. HBL, Meezan Bank"
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Account Number</Label>
                        <Input
                          value={form.bank_account_number}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              bank_account_number: e.target.value,
                            })
                          }
                          placeholder="0123456789"
                          className="h-9 font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account Title</Label>
                        <Input
                          value={form.bank_account_title}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              bank_account_title: e.target.value,
                            })
                          }
                          placeholder="e.g. John Smith"
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                  {error}
                </div>
              )}
            </form>
          </ScrollArea>
        )}

        <div className="px-6 py-4 border-t border-border/40 bg-muted/10">
          <Button
            type="submit"
            form="edit-user-form"
            disabled={saving || formLoading}
            className="w-full"
          >
            {saving ? "Updating…" : formLoading ? "Loading…" : "Update User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
