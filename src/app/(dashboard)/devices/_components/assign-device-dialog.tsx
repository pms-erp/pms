// app/(dashboard)/devices/_components/assign-device-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  IconSearch,
  IconCheck,
  IconLoader,
  IconX,
  IconUser,
} from "@tabler/icons-react";
import type { Device } from "./devices-client";

interface User {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  role?: string;
}

interface Props {
  device: Device;
  onClose: () => void;
  onAssigned: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AssignDeviceDialog({ device, onClose, onAssigned }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) =>
        setUsers(Array.isArray(data) ? data : (data.data ?? data.users ?? [])),
      )
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = users.find((u) => u.id === selectedId);

  async function handleAssign() {
    if (!selectedId) {
      toast.error("Select a user first");
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch(`/api/devices/${device.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedId, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Device assigned to ${selected?.name}`);
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconUser className="h-5 w-5 text-primary" />
            Assign Device
          </DialogTitle>
          <DialogDescription>
            Assigning:{" "}
            <span className="font-medium text-foreground">{device.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Selected user chip */}
          {selected && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 border">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={selected.avatar} />
                <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                  {initials(selected.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{selected.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  @{selected.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId("")}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* User list */}
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="h-48">
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <IconLoader className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-8">
                  No users found
                </p>
              ) : (
                filtered.map((user) => {
                  const isSelected = user.id === selectedId;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? "" : user.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2
                        ${isSelected ? "bg-primary/5 border-l-primary" : "hover:bg-muted/40 border-l-transparent"}`}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                          {initials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          @{user.username}
                        </p>
                      </div>
                      {isSelected && (
                        <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Notes <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this assignment…"
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={assigning}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={assigning || !selectedId}
            className="gap-2"
          >
            {assigning ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" /> Assigning…
              </>
            ) : (
              "Assign Device"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
