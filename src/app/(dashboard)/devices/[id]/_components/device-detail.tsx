// app/(dashboard)/devices/[id]/_components/device-detail.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconDeviceLaptop,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconUser,
  IconCalendar,
  IconHash,
  IconUserPlus,
  IconUserMinus,
  IconEdit,
  IconTrash,
  IconHistory,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKeyboard,
  IconMouse,
  IconPlug,
  IconLock,
  IconScreenShare,
} from "@tabler/icons-react";
import { AssignDeviceDialog } from "../../_components/assign-device-dialog";
import { EditDeviceDialog } from "../../_components/edit-device-dialog";
import type { Device } from "../../_components/devices-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
  userName: string | null;
  userUsername: string | null;
  userAvatar: string | null;
}

interface Props {
  device: Device;
  history: Assignment[];
  current: Assignment | null;
  canManage: boolean;
  canSeePassword: boolean;
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ASSIGNED: "bg-amber-100   text-amber-700   border-amber-200",
  MAINTENANCE: "bg-orange-100  text-orange-700  border-orange-200",
  RETIRED: "bg-gray-100    text-gray-500    border-gray-200",
};

const CONDITION_STYLE: Record<string, string> = {
  NEW: "bg-blue-100   text-blue-700   border-blue-200",
  GOOD: "bg-green-100  text-green-700  border-green-200",
  FAIR: "bg-yellow-100 text-yellow-700 border-yellow-200",
  POOR: "bg-red-100    text-red-700    border-red-200",
};

function DeviceIcon({ type, size = 5 }: { type: string; size?: number }) {
  const cls = `h-${size} w-${size}`;
  switch (type) {
    case "LAPTOP":
      return <IconDeviceLaptop className={cls} />;
    case "DESKTOP":
      return <IconDeviceDesktop className={cls} />;
    case "PHONE":
      return <IconDeviceMobile className={cls} />;
    case "TABLET":
      return <IconDeviceTablet className={cls} />;
    default:
      return <IconDevices className={cls} />;
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DeviceDetail({
  device: initialDevice,
  history,
  current,
  canManage,
  canSeePassword,
}: Props) {
  const router = useRouter();

  const [device, setDevice] = useState<Device>(initialDevice);
  const [showAssign, setShowAssign] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [showDevicePassword, setShowDevicePassword] = useState(false);

  async function handleUnassign() {
    setUnassigning(true);
    try {
      const res = await fetch(`/api/devices/${device.id}/unassign`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Device unassigned");
      setUnassignOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to unassign");
    } finally {
      setUnassigning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Device deleted");
      router.push("/devices");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="md:p-6 p-3.5 space-y-6 mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <IconArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <DeviceIcon type={device.type} size={6} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {device.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {device.brand} · {device.model}
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {device.status === "AVAILABLE" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowAssign(true)}
              >
                <IconUserPlus className="h-4 w-4" /> Assign
              </Button>
            )}
            {device.status === "ASSIGNED" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setUnassignOpen(true)}
              >
                <IconUserMinus className="h-4 w-4" /> Unassign
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowEdit(true)}
            >
              <IconEdit className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrash className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* ── Badges ── */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className={STATUS_STYLE[device.status] ?? ""}>
          {device.status.replace(/_/g, " ")}
        </Badge>
        <Badge
          variant="outline"
          className={CONDITION_STYLE[device.condition] ?? ""}
        >
          {device.condition}
        </Badge>
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          {device.type}
        </Badge>
        {device.has_keyboard && (
          <Badge
            variant="outline"
            className="bg-sky-100 text-sky-700 border-sky-200 gap-1"
          >
            <IconKeyboard className="h-3 w-3" /> Keyboard
          </Badge>
        )}
        {device.has_mouse && (
          <Badge
            variant="outline"
            className="bg-sky-100 text-sky-700 border-sky-200 gap-1"
          >
            <IconMouse className="h-3 w-3" /> Mouse
          </Badge>
        )}
        {device.has_charger && (
          <Badge
            variant="outline"
            className="bg-sky-100 text-sky-700 border-sky-200 gap-1"
          >
            <IconPlug className="h-3 w-3" /> Charger
          </Badge>
        )}
        {device.has_extended_screen && (
          <Badge
            variant="outline"
            className="bg-sky-100 text-sky-700 border-sky-200 gap-1"
          >
            <IconScreenShare className="h-3 w-3" /> Extended Screen
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left: Device Info + History ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Device Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ── Basic info rows ── */}
              {[
                {
                  icon: <IconDevices className="h-4 w-4" />,
                  label: "Name",
                  value: device.name,
                  mono: false,
                },
                {
                  icon: <IconDevices className="h-4 w-4" />,
                  label: "Brand",
                  value: device.brand,
                  mono: false,
                },
                {
                  icon: <IconDevices className="h-4 w-4" />,
                  label: "Model",
                  value: device.model,
                  mono: false,
                },
                {
                  icon: <IconHash className="h-4 w-4" />,
                  label: "Serial No",
                  value: device.serial_no,
                  mono: true,
                },
                {
                  icon: <IconCalendar className="h-4 w-4" />,
                  label: "Added",
                  value: formatDate(device.created_at),
                  mono: false,
                },
              ].map(({ icon, label, value, mono }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="text-muted-foreground mt-0.5 shrink-0">
                    {icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p
                      className={`text-sm font-medium mt-0.5 ${mono ? "font-mono" : ""}`}
                    >
                      {value}
                    </p>
                  </div>
                </div>
              ))}

              {/* ── Accessories ── */}
              <Separator />
              <div className="flex items-start gap-3">
                <div className="text-muted-foreground mt-0.5 shrink-0">
                  <IconKeyboard className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Accessories
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Keyboard",
                        value: device.has_keyboard,
                        icon: <IconKeyboard className="h-3 w-3" />,
                      },
                      {
                        label: "Mouse",
                        value: device.has_mouse,
                        icon: <IconMouse className="h-3 w-3" />,
                      },
                      {
                        label: "Charger",
                        value: device.has_charger,
                        icon: <IconPlug className="h-3 w-3" />,
                      },
                      {
                        label: "Extended Screen",
                        value: device.has_extended_screen,
                        icon: <IconScreenShare className="h-3 w-3" />,
                      },
                    ].map(({ label, value, icon }) => (
                      <div
                        key={label}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium
                          ${
                            value
                              ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
                              : "bg-muted/50 text-muted-foreground border-border"
                          }`}
                      >
                        {icon}
                        <span>{label}</span>
                        <span className="ml-auto">{value ? "✓" : "✗"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── System Password — visible to canSeePassword roles ── */}
              {canSeePassword && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <div className="text-muted-foreground mt-0.5 shrink-0">
                      <IconLock className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">
                        System Password
                      </p>
                      {device.password ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p
                            className={`text-sm font-medium font-mono ${showDevicePassword ? "" : "tracking-widest"}`}
                          >
                            {showDevicePassword ? device.password : "••••••••"}
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowDevicePassword((v) => !v)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showDevicePassword ? (
                              <IconEyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <IconEye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic mt-0.5">
                          Not set
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Notes ── */}
              {device.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{device.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Assignment History ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IconHistory className="h-4 w-4 text-muted-foreground" />
                Assignment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Never assigned
                </p>
              ) : (
                <div className="relative space-y-0">
                  {history.map((h, i) => {
                    const isCurrent = !h.returned_at;
                    return (
                      <div key={h.id} className="flex gap-4 pb-6 last:pb-0">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2
                            ${
                              isCurrent
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-muted border-border"
                            }`}
                          >
                            {isCurrent ? (
                              <IconCheck className="h-4 w-4" />
                            ) : (
                              <IconUser className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          {i < history.length - 1 && (
                            <div className="w-px flex-1 bg-border mt-1" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={h.userAvatar ?? undefined} />
                              <AvatarFallback className="text-[9px] bg-blue-600 text-white">
                                {h.userName ? initials(h.userName) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">
                              {h.userName ?? "Unknown"}
                            </span>
                            {isCurrent && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-primary/10 text-primary border-primary/30"
                              >
                                Current
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Assigned {formatDate(h.assigned_at)}
                            {h.returned_at &&
                              ` · Returned ${formatDate(h.returned_at)}`}
                          </p>
                          {h.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              `{h.notes}`
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Current Assignment ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IconUser className="h-4 w-4 text-muted-foreground" />
                Currently Assigned To
              </CardTitle>
            </CardHeader>
            <CardContent>
              {current ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={current.userAvatar ?? undefined} />
                      <AvatarFallback className="bg-blue-600 text-white text-sm">
                        {current.userName ? initials(current.userName) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{current.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        @{current.userUsername}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Since {formatDate(current.assigned_at)}
                  </p>
                  {current.notes && (
                    <p className="text-xs text-muted-foreground italic bg-muted/40 px-2 py-1.5 rounded">
                      `{current.notes}`
                    </p>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 mt-1"
                      onClick={() => setUnassignOpen(true)}
                    >
                      <IconUserMinus className="h-4 w-4" /> Unassign
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-muted-foreground italic">
                    Not assigned
                  </p>
                  {canManage && device.status === "AVAILABLE" && (
                    <Button
                      size="sm"
                      className="gap-2 w-full"
                      onClick={() => setShowAssign(true)}
                    >
                      <IconUserPlus className="h-4 w-4" /> Assign Now
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Dialogs ── */}
      {showAssign && (
        <AssignDeviceDialog
          device={device}
          onClose={() => setShowAssign(false)}
          onAssigned={() => {
            setShowAssign(false);
            router.refresh();
          }}
        />
      )}

      {showEdit && (
        <EditDeviceDialog
          device={device}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      )}

      <Dialog open={unassignOpen} onOpenChange={setUnassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Device</DialogTitle>
            <DialogDescription>
              Mark device as returned from <strong>{current?.userName}</strong>.
              Status will change to Available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnassignOpen(false)}
              disabled={unassigning}
            >
              Cancel
            </Button>
            <Button onClick={handleUnassign} disabled={unassigning}>
              {unassigning ? "Unassigning…" : "Confirm Unassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconTrash className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Device</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              This will permanently delete <strong>{device.name}</strong> and
              all its assignment history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
