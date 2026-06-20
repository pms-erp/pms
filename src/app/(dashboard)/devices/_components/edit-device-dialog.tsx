// app/(dashboard)/devices/_components/edit-device-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { IconLoader, IconEye, IconEyeOff } from "@tabler/icons-react";
import type { Device } from "./devices-client";

interface Props {
  device: Device;
  onClose: () => void;
  onSaved: () => void;
}

function deviceToForm(d: Device) {
  return {
    name: d.name,
    type: d.type,
    brand: d.brand,
    model: d.model,
    serial_no: d.serial_no,
    status: d.status,
    condition: d.condition,
    has_keyboard: d.has_keyboard ?? false,
    has_mouse: d.has_mouse ?? false,
    has_charger: d.has_charger ?? false,
    has_extended_screen: d.has_extended_screen ?? false,
    password: d.password ?? "",
    notes: d.notes ?? "",
  };
}

export function EditDeviceDialog({ device, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(() => deviceToForm(device));

  useEffect(() => {
    setForm(deviceToForm(device));
  }, [device]);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Device updated");
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update device",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle>Edit Device</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <form
            id="edit-device-form"
            onSubmit={handleSubmit}
            className="px-6 py-4 space-y-4"
          >
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Device Name</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            {/* Type + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["LAPTOP", "DESKTOP", "PHONE", "TABLET", "OTHER"].map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0) + t.slice(1).toLowerCase()}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select
                  value={form.condition}
                  onValueChange={(v) => set("condition", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["NEW", "GOOD", "FAIR", "POOR"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Brand + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => set("brand", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                />
              </div>
            </div>

            {/* Serial Number */}
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input
                value={form.serial_no}
                onChange={(e) => set("serial_no", e.target.value)}
                className="font-mono"
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="ASSIGNED">Assigned</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="RETIRED">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Accessories */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Accessories
              </Label>
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
                {(
                  [
                    { key: "has_keyboard", label: "Keyboard" },
                    { key: "has_mouse", label: "Mouse" },
                    { key: "has_charger", label: "Charger" },
                    { key: "has_extended_screen", label: "Extended Screen" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-${key}`}
                      checked={form[key]}
                      onCheckedChange={(v) => set(key, v === true)}
                    />
                    <Label
                      htmlFor={`edit-${key}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* System Password */}
            <div className="space-y-1.5">
              <Label>
                System Password{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              </Label>
              <div className="relative">
                <Input
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Device login password…"
                  className="pr-10 font-mono"
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

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/10">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-device-form"
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
