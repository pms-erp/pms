"use client";

import * as React from "react";
import { z } from "zod";
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
  IconStars,
} from "@tabler/icons-react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.string().min(1, "Role is required"),
  team_type: z.string().optional(),
});

type TeamOption = { id: string; name: string; slug: string };
type LocationOption = { id: string; name: string };

const INITIAL_FORM = {
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

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "CLIENT", label: "Client" },
  // { value: "PROJECT_MANAGER", label: "Project Manager" },
  // { value: "TEAM_LEADER", label: "Team Leader" },
  // { value: "DEVELOPER", label: "Developer" },
  // { value: "DESIGNER", label: "Designer" },
  // { value: "PROGRAMMER", label: "Programmer" },
  // { value: "QA", label: "QA" },
];

export function CreateUserDialog({
  currentUserRole,
}: {
  currentUserRole: string;
}) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [teamOptions, setTeamOptions] = React.useState<TeamOption[]>([]);
  const [locationOptions, setLocationOptions] = React.useState<
    LocationOption[]
  >([]);
  const [form, setForm] = React.useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = React.useState(false);

  const canManageLocations =
    currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";
  const isAdmin = currentUserRole === "ADMIN";

  React.useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/teams")
          .then((r) => r.json())
          .catch(() => []),
        canManageLocations
          ? fetch("/api/attendance/locations")
              .then((r) => r.json())
              .catch(() => [])
          : Promise.resolve({ locations: [] }),
      ]).then(([teamsData, locData]) => {
        setTeamOptions(Array.isArray(teamsData) ? teamsData : []);
        setLocationOptions(
          Array.isArray(locData.locations) ? locData.locations : [],
        );
      });
    }
  }, [open, canManageLocations]);

  function resetForm() {
    setForm(INITIAL_FORM);
    setError("");
    setShowPassword(false);
  }

  const isTeamLeader = form.role === "TEAM_LEADER";
  const showTeamSelect = !!form.role;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    if (isTeamLeader && !form.team_type) {
      setError("Team Leader must be assigned to a team");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim() || null,
          level: form.level || null,
          location_id: canManageLocations
            ? form.location_id === "none"
              ? null
              : form.location_id
            : null,
          base_salary: isAdmin ? form.base_salary || null : null,
          join_date: form.join_date || null,
          per_minute_rate: isAdmin ? form.per_minute_rate || null : null,
          bank_name: isAdmin ? form.bank_name.trim() || null : null,
          bank_account_number: isAdmin
            ? form.bank_account_number.trim() || null
            : null,
          bank_account_title: isAdmin
            ? form.bank_account_title.trim() || null
            : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }

      toast.success(
        isTeamLeader
          ? `${form.name} created and set as team leader`
          : "User created successfully",
      );
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>Create User</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <form
            id="create-user-form"
            onSubmit={handleSubmit}
            className="px-6 py-4 space-y-6"
          >
            {/* Profile Header */}
            <div className="flex items-center gap-4 pb-4 border-b border-border/40">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconUser className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">New User Profile</h3>
                <p className="text-sm text-muted-foreground">
                  Fill in the details below to create a new team member
                </p>
              </div>
            </div>

            {/* Basic Info Section */}
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
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                <Label>
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="h-9 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </button>
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

            {/* Role & Team Section */}
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
                    const matchingTeam = teamOptions.find(
                      (t) => t.slug === value,
                    );
                    setForm({
                      ...form,
                      role: value,
                      team_type: matchingTeam ? matchingTeam.slug : "",
                    });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
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

              {showTeamSelect && (
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
                    value={form.team_type}
                    onValueChange={(v) => setForm({ ...form, team_type: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          teamOptions.length
                            ? "Select a team"
                            : "Loading teams…"
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
                      <IconCrown size={13} />
                      Will be automatically set as leader of this team
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Admin & Project Manager Sections */}
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
                      User can only check in/out from this location. If none
                      set, any active location is allowed.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Admin Only Sections */}
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
                          setForm({ ...form, per_minute_rate: e.target.value })
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

        <div className="px-6 py-4 border-t border-border/40 bg-muted/10">
          <Button
            type="submit"
            form="create-user-form"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Creating..." : "Create User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
