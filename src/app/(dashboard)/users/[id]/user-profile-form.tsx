"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  IconMail,
  IconUser,
  IconBriefcase,
  IconCalendar,
  IconCurrencyDollar,
  IconBuildingBank,
  IconHash,
  IconId,
  IconUserCheck,
  IconSettings,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconMapPin,
  IconStars,
} from "@tabler/icons-react";

type UserProfile = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  level?: string | null;
  team_type: string | null;
  team_leader_id: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  base_salary: string | null;
  join_date: Date | string | null;
  per_minute_rate: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_title: string | null;
  location_id?: string | null;
  avatar?: string | null;
};

type AssignedDevice = {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  serial_no: string;
  status: string;
  condition: string;
  assigned_at: string | Date;
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "CLIENT", label: "Client" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "TEAM_LEADER", label: "Team Leader" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "DESIGNER", label: "Designer" },
  { value: "PROGRAMMER", label: "Programmer" },
  { value: "QA", label: "QA" },
];

const LEVEL_OPTIONS = [
  { value: "JUNIOR", label: "Junior" },
  { value: "SENIOR", label: "Senior" },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700 border-red-200",
  PROJECT_MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  TEAM_LEADER: "bg-purple-100 text-purple-700 border-purple-200",
  DEVELOPER: "bg-green-100 text-green-700 border-green-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  QA: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const DEVICE_TYPE_ICONS: Record<string, React.ElementType> = {
  LAPTOP: IconDeviceLaptop,
  DESKTOP: IconDeviceDesktop,
  PHONE: IconDeviceMobile,
  TABLET: IconDeviceTablet,
  OTHER: IconDeviceDesktop,
};

const CONDITION_COLORS: Record<string, string> = {
  NEW: "bg-green-100 text-green-700 border-green-200",
  GOOD: "bg-blue-100 text-blue-700 border-blue-200",
  FAIR: "bg-yellow-100 text-yellow-700 border-yellow-200",
  POOR: "bg-red-100 text-red-700 border-red-200",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function InlineTextField({
  label,
  value,
  onSave,
  placeholder = "Click to edit",
  type = "text",
  icon: Icon,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  type?: "text" | "email" | "date" | "number";
  icon?: React.ElementType;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue !== value && editValue.trim()) {
      setIsSaving(true);
      try {
        await onSave(editValue.trim());
        setIsEditing(false);
      } catch {
        setEditValue(value);
      } finally {
        setIsSaving(false);
      }
    } else {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {Icon && <Icon size={16} className="text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        {isEditing ? (
          <Input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="h-8 text-sm"
          />
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="text-sm font-medium cursor-pointer hover:text-primary transition-colors truncate"
          >
            {value || (
              <span className="text-muted-foreground italic">
                {placeholder}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineSelectField({
  label,
  value,
  options,
  onSave,
  icon: Icon,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<void>;
  icon?: React.ElementType;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && triggerRef.current) {
      triggerRef.current.click();
    }
  }, [isEditing]);

  const handleSave = async (newValue: string) => {
    if (newValue !== value) {
      setIsSaving(true);
      try {
        await onSave(newValue);
        setIsEditing(false);
      } catch {
        setEditValue(value);
      } finally {
        setIsSaving(false);
      }
    } else {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {Icon && <Icon size={16} className="text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        {isEditing ? (
          <Select
            value={editValue}
            onValueChange={async (val) => {
              setEditValue(val);
              await handleSave(val);
            }}
            onOpenChange={(open) => {
              if (!open) setIsEditing(false);
            }}
          >
            <SelectTrigger ref={triggerRef} className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="text-sm font-medium cursor-pointer hover:text-primary transition-colors truncate"
          >
            {value || (
              <span className="text-muted-foreground italic">Select</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function UserProfileForm({
  initialUser,
  currentUserRole,
}: {
  initialUser: UserProfile;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<UserProfile>(initialUser);
  const [devices, setDevices] = useState<AssignedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [locationOptions, setLocationOptions] = React.useState<
    { id: string; name: string }[]
  >([]);

  const canManageLocations =
    currentUserRole === "ADMIN" || currentUserRole === "PROJECT_MANAGER";
  const isAdmin = currentUserRole === "ADMIN";

  useEffect(() => {
    async function fetchData() {
      if (!canManageLocations) return;

      try {
        setDevicesLoading(true);

        if (isAdmin) {
          const devicesRes = await fetch(
            `/api/users/${initialUser.id}/devices`,
          );
          if (devicesRes.ok) {
            const devicesData = await devicesRes.json();
            setDevices(devicesData.devices ?? []);
          }
        }

        const locRes = await fetch("/api/attendance/locations");
        if (locRes.ok) {
          const locData = await locRes.json();
          setLocationOptions(locData.locations ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setDevicesLoading(false);
      }
    }
    fetchData();
  }, [initialUser.id, canManageLocations, isAdmin]);

  const handleUpdateField = async (
    field: keyof UserProfile,
    value: string | number | boolean | null | undefined,
  ) => {
    try {
      const updatePayload: Record<
        string,
        string | number | boolean | null | undefined
      > = {
        name: formData.name,
        username: formData.username,
        role: formData.role,
        [field]: value,
      };

      if (formData.email !== undefined) updatePayload.email = formData.email;
      if (formData.level !== undefined) updatePayload.level = formData.level;
      if (formData.team_type !== undefined)
        updatePayload.team_type = formData.team_type;
      if (formData.base_salary !== undefined)
        updatePayload.base_salary = formData.base_salary;
      if (formData.join_date !== undefined) {
        updatePayload.join_date = formData.join_date
          ? new Date(formData.join_date).toISOString().split("T")[0]
          : null;
      }
      if (formData.per_minute_rate !== undefined)
        updatePayload.per_minute_rate = formData.per_minute_rate;
      if (formData.bank_name !== undefined)
        updatePayload.bank_name = formData.bank_name;
      if (formData.bank_account_number !== undefined)
        updatePayload.bank_account_number = formData.bank_account_number;
      if (formData.bank_account_title !== undefined)
        updatePayload.bank_account_title = formData.bank_account_title;

      // Override with the new value last
      updatePayload[field] = value;

      const response = await fetch(`/api/users/${initialUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update");
      }

      if (data.user) {
        setFormData(data.user);
      } else {
        setFormData((prev) => ({ ...prev, [field]: value }));
      }

      toast.success(`${String(field).replace(/_/g, " ")} updated`);
      router.refresh();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update";
      console.error("Update failed:", error);
      toast.error(errorMessage);
      setFormData(initialUser);
      throw error;
    }
  };

  const roleColor =
    ROLE_COLORS[formData.role] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Card>
      <CardContent className="p-6">
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <Avatar className="h-24 w-24 ring-2 ring-border">
            <AvatarImage src={formData.avatar ?? undefined} />
            <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
              {getInitials(formData.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <InlineTextField
                  label="Full Name"
                  value={formData.name}
                  onSave={(value) => handleUpdateField("name", value)}
                  placeholder="Enter name"
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <InlineTextField
                    label=""
                    value={formData.username}
                    onSave={(value) => handleUpdateField("username", value)}
                    placeholder="username"
                    icon={IconHash}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <InlineSelectField
                  label=""
                  value={formData.role}
                  options={ROLE_OPTIONS}
                  onSave={(value) => handleUpdateField("role", value)}
                  icon={IconBriefcase}
                />
                <Badge variant="outline" className={roleColor}>
                  {formData.role}
                </Badge>
                {formData.level && (
                  <Badge
                    variant="outline"
                    className={
                      formData.level === "SENIOR"
                        ? "bg-violet-100 text-violet-700 border-violet-200"
                        : "bg-sky-100 text-sky-700 border-sky-200"
                    }
                  >
                    {formData.level}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    formData.is_active
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-red-100 text-red-700 border-red-200"
                  }
                >
                  {formData.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <IconMail size={14} />
                <InlineTextField
                  label=""
                  value={formData.email || ""}
                  onSave={(value) => handleUpdateField("email", value)}
                  placeholder="email@example.com"
                  type="email"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <IconCalendar size={14} />
                <span>Joined {formatDate(formData.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - VISIBLE TO ALL */}
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground" />
                Personal Information
              </h3>
              <div className="space-y-4">
                <InlineTextField
                  label="Email Address"
                  value={formData.email || ""}
                  onSave={(value) => handleUpdateField("email", value)}
                  placeholder="email@example.com"
                  type="email"
                  icon={IconMail}
                />
                <InlineSelectField
                  label="Role"
                  value={formData.role}
                  options={ROLE_OPTIONS}
                  onSave={(value) => handleUpdateField("role", value)}
                  icon={IconBriefcase}
                />
                {/* Level field */}
                <div className="flex items-center gap-3">
                  <IconStars
                    size={16}
                    className="text-muted-foreground shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">
                      Level
                    </div>
                    <Select
                      value={formData.level ?? "none"}
                      onValueChange={(v) =>
                        handleUpdateField("level", v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="No level set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No level set</SelectItem>
                        {LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <IconCalendar size={16} className="text-muted-foreground" />
                Employment Details
              </h3>
              <div className="space-y-4">
                <InlineTextField
                  label="Join Date"
                  value={
                    formData.join_date
                      ? new Date(formData.join_date).toISOString().split("T")[0]
                      : ""
                  }
                  onSave={(value) =>
                    handleUpdateField("join_date", value || null)
                  }
                  type="date"
                  placeholder="Select date"
                  icon={IconCalendar}
                />
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-0.5">
                    Account Created
                  </div>
                  <div className="text-sm font-medium">
                    {formatDate(formData.created_at)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-0.5">
                    Last Updated
                  </div>
                  <div className="text-sm font-medium">
                    {formatDate(formData.updated_at)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <IconId size={12} />
                    User ID
                  </div>
                  <div className="text-sm font-medium font-mono text-xs truncate">
                    {formData.id}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - ONLY SHOW TO ADMIN & PROJECT MANAGER */}
          {canManageLocations && (
            <div className="space-y-6">
              {/* Assigned Check-in Location */}
              <div>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <IconMapPin size={16} className="text-muted-foreground" />
                  Assigned Check-in Location
                </h3>
                <Select
                  value={formData.location_id ?? "none"}
                  onValueChange={(v) =>
                    handleUpdateField("location_id", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
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
                <p className="text-[10px] text-muted-foreground mt-1">
                  User can only check in/out from this location. If none set,
                  any active location is allowed.
                </p>
              </div>

              {/* Compensation & Banking - ADMIN ONLY */}
              {isAdmin && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <IconCurrencyDollar
                        size={16}
                        className="text-muted-foreground"
                      />
                      Compensation
                    </h3>
                    <div className="space-y-4">
                      <InlineTextField
                        label="Base Salary"
                        value={formData.base_salary || ""}
                        onSave={(value) =>
                          handleUpdateField("base_salary", value)
                        }
                        type="number"
                        placeholder="0.00"
                        icon={IconCurrencyDollar}
                      />
                      <InlineTextField
                        label="Per Minute Rate"
                        value={formData.per_minute_rate || ""}
                        onSave={(value) =>
                          handleUpdateField("per_minute_rate", value)
                        }
                        type="number"
                        placeholder="0.00"
                        icon={IconCurrencyDollar}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <IconBuildingBank
                        size={16}
                        className="text-muted-foreground"
                      />
                      Banking Information
                    </h3>
                    <div className="space-y-4">
                      <InlineTextField
                        label="Bank Name"
                        value={formData.bank_name || ""}
                        onSave={(value) =>
                          handleUpdateField("bank_name", value)
                        }
                        placeholder="Enter bank name"
                        icon={IconBuildingBank}
                      />
                      <InlineTextField
                        label="Account Number"
                        value={formData.bank_account_number || ""}
                        onSave={(value) =>
                          handleUpdateField("bank_account_number", value)
                        }
                        placeholder="Enter account number"
                        icon={IconHash}
                      />
                      <InlineTextField
                        label="Account Title"
                        value={formData.bank_account_title || ""}
                        onSave={(value) =>
                          handleUpdateField("bank_account_title", value)
                        }
                        placeholder="Enter account title"
                        icon={IconUser}
                      />
                    </div>
                  </div>

                  {/* Assigned Devices - ADMIN ONLY */}
                  <div>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <IconDeviceDesktop
                        size={16}
                        className="text-muted-foreground"
                      />
                      Assigned Devices
                    </h3>
                    {devicesLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-14 bg-muted/50 rounded-lg animate-pulse"
                          />
                        ))}
                      </div>
                    ) : devices.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic p-3 bg-muted/50 rounded-lg text-center">
                        No devices currently assigned
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {devices.map((device) => {
                          const DeviceIcon =
                            DEVICE_TYPE_ICONS[device.type] ?? IconDeviceDesktop;
                          return (
                            <div
                              key={device.id}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <DeviceIcon
                                  size={16}
                                  className="text-muted-foreground shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {device.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {device.brand} {device.model} ·{" "}
                                    {device.serial_no}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Since {formatDate(device.assigned_at)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-slate-100 text-slate-700 border-slate-200"
                                >
                                  {device.type}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${CONDITION_COLORS[device.condition] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
                                >
                                  {device.condition}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Account Status - ADMIN ONLY */}
              {isAdmin && (
                <div>
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <IconSettings size={16} className="text-muted-foreground" />
                    Account Status
                  </h3>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <IconUserCheck
                        size={16}
                        className="text-muted-foreground"
                      />
                      <span className="text-sm font-medium">
                        Account Status
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        formData.is_active
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-red-100 text-red-700 border-red-200"
                      }
                    >
                      {formData.is_active ? "● Active" : "○ Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formData.is_active
                      ? "This user can log in and access assigned tasks."
                      : "This user cannot log in. Reactivate to restore access."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
