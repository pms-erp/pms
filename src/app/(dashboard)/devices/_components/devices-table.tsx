// app/(dashboard)/devices/_components/devices-table.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IconDotsVertical,
  IconEye,
  IconUserPlus,
  IconUserMinus,
  IconTrash,
  IconEdit,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceLaptop,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
} from "@tabler/icons-react";
import type { Device } from "./devices-client";
import { AssignDeviceDialog } from "./assign-device-dialog";
import { EditDeviceDialog } from "./edit-device-dialog";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ASSIGNED: "bg-amber-100   text-amber-700   border-amber-200",
  MAINTENANCE: "bg-orange-100  text-orange-700  border-orange-200",
  RETIRED: "bg-gray-100    text-gray-500    border-gray-200",
};

const CONDITION_STYLE: Record<string, string> = {
  NEW: "bg-blue-100  text-blue-700  border-blue-200",
  GOOD: "bg-green-100 text-green-700 border-green-200",
  FAIR: "bg-yellow-100 text-yellow-700 border-yellow-200",
  POOR: "bg-red-100   text-red-700   border-red-200",
};

function DeviceIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  devices: Device[];
  loading: boolean;
  total: number;
  page: number;
  totalPages: number;
  canManage: boolean;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
}

export function DevicesTable({
  devices,
  loading,
  total,
  page,
  totalPages,
  canManage,
  onPageChange,
  onRefresh,
}: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unassignId, setUnassignId] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [assignDevice, setAssignDevice] = useState<Device | null>(null);
  const [editDevice, setEditDevice] = useState<Device | null>(null);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/devices/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Device deleted");
      setDeleteId(null);
      onRefresh();
    } catch {
      toast.error("Failed to delete device");
    } finally {
      setDeleting(false);
    }
  }

  async function handleUnassign() {
    if (!unassignId) return;
    setUnassigning(true);
    try {
      const res = await fetch(`/api/devices/${unassignId}/unassign`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Device unassigned");
      setUnassignId(null);
      onRefresh();
    } catch {
      toast.error("Failed to unassign device");
    } finally {
      setUnassigning(false);
    }
  }

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
          Loading devices…
        </div>
      </div>
    );
  }

  if (!devices.length) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <IconDevices className="h-10 w-10 opacity-30" />
          <p className="text-sm">No devices found</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Serial No.</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => (
              <TableRow key={device.id} className="hover:bg-muted/30">
                {/* Name */}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <DeviceIcon type={device.type} />
                    </div>
                    <div>
                      <Link
                        href={`/devices/${device.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {device.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {device.brand} · {device.model}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* Type */}
                <TableCell>
                  <span className="text-sm text-muted-foreground capitalize">
                    {device.type.charAt(0) + device.type.slice(1).toLowerCase()}
                  </span>
                </TableCell>

                {/* Serial */}
                <TableCell>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {device.serial_no}
                  </span>
                </TableCell>

                {/* Condition */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${CONDITION_STYLE[device.condition] ?? ""}`}
                  >
                    {device.condition}
                  </Badge>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${STATUS_STYLE[device.status] ?? ""}`}
                  >
                    {device.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>

                {/* Assigned To */}
                <TableCell>
                  {device.assignedUserName ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[9px] bg-blue-600 text-white">
                          {initials(device.assignedUserName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{device.assignedUserName}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      —
                    </span>
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <IconDotsVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem asChild>
                        <Link href={`/devices/${device.id}`}>
                          <IconEye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>

                      {/* ✅ Only show management actions to ADMIN */}
                      {canManage && (
                        <>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setEditDevice(device);
                            }}
                          >
                            <IconEdit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>

                          {device.status === "AVAILABLE" && (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setAssignDevice(device);
                              }}
                            >
                              <IconUserPlus className="mr-2 h-4 w-4" />
                              Assign
                            </DropdownMenuItem>
                          )}

                          {device.status === "ASSIGNED" && (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setUnassignId(device.id);
                              }}
                            >
                              <IconUserMinus className="mr-2 h-4 w-4" />
                              Unassign
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setDeleteId(device.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <IconTrash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} device{total !== 1 ? "s" : ""} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <IconChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              <IconChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Assign Dialog */}
      {assignDevice && (
        <AssignDeviceDialog
          device={assignDevice}
          onClose={() => setAssignDevice(null)}
          onAssigned={() => {
            setAssignDevice(null);
            onRefresh();
          }}
        />
      )}

      {/* Edit Dialog */}
      {editDevice && (
        <EditDeviceDialog
          device={editDevice}
          onClose={() => setEditDevice(null)}
          onSaved={() => {
            setEditDevice(null);
            onRefresh();
          }}
        />
      )}

      {/* Unassign Confirm */}
      <Dialog open={!!unassignId} onOpenChange={() => setUnassignId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Device</DialogTitle>
            <DialogDescription>
              This will mark the device as returned and set its status back to
              Available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnassignId(null)}
              disabled={unassigning}
            >
              Cancel
            </Button>
            <Button onClick={handleUnassign} disabled={unassigning}>
              {unassigning ? "Unassigning…" : "Unassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconTrash className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Device</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              This will permanently delete the device and all its assignment
              history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
